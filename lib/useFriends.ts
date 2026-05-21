import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabase/client';

export type FriendProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  username: string | null;
};

export type AcceptedFriend = FriendProfile & {
  friendship_id: string;
  mutual_events: number;
};

export type PendingRequest = {
  friendship_id: string;
  requester: FriendProfile;
  created_at: string;
};

export type SentRequest = {
  friendship_id: string;
  addressee: FriendProfile;
  created_at: string;
};

type UseFriendsReturn = {
  friends: AcceptedFriend[];
  pendingRequests: PendingRequest[];
  sentRequests: SentRequest[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  sendRequest: (addresseeId: string) => Promise<void>;
  acceptRequest: (friendshipId: string) => Promise<void>;
  declineRequest: (friendshipId: string) => Promise<void>;
  withdrawRequest: (friendshipId: string, addresseeId: string) => Promise<void>;
  removeFriend: (friendshipId: string) => Promise<void>;
};

export function useFriends(): UseFriendsReturn {
  const [friends, setFriends] = useState<AcceptedFriend[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<SentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr || !user) {
        if (!cancelled) { setError('Not authenticated'); setLoading(false); }
        return;
      }

      const uid = user.id;

      const { data: rows, error: rowErr } = await supabase
        .from('friendships')
        .select(`
          id,
          requester_id,
          addressee_id,
          status,
          created_at,
          requester:users!friendships_requester_id_fkey (id, display_name, avatar_url, username),
          addressee:users!friendships_addressee_id_fkey (id, display_name, avatar_url, username)
        `)
        .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`)
        .order('created_at', { ascending: false });

      if (rowErr || !rows) {
        if (!cancelled) { setError(rowErr?.message ?? 'Failed to load friendships'); setLoading(false); }
        return;
      }

      const acceptedList: AcceptedFriend[] = [];
      const pendingList: PendingRequest[] = [];
      const sentList: SentRequest[] = [];

      for (const row of rows) {
        const requester = row.requester as unknown as FriendProfile;
        const addressee = row.addressee as unknown as FriendProfile;

        if (row.status === 'accepted') {
          const other = row.requester_id === uid ? addressee : requester;
          acceptedList.push({
            id: other.id,
            display_name: other.display_name,
            avatar_url: other.avatar_url,
            username: other.username,
            friendship_id: row.id,
            mutual_events: 0,
          });
        } else if (row.status === 'pending') {
          if (row.addressee_id === uid) {
            pendingList.push({ friendship_id: row.id, requester, created_at: row.created_at });
          } else {
            sentList.push({ friendship_id: row.id, addressee, created_at: row.created_at });
          }
        }
      }

      // Compute mutual events for accepted friends via shared ticket event_ids
      if (acceptedList.length > 0) {
        const friendIds = acceptedList.map(f => f.id);

        const { data: myTickets } = await supabase
          .from('tickets')
          .select('event_id')
          .eq('user_id', uid)
          .not('event_id', 'is', null);

        const myEventIds = new Set((myTickets ?? []).map(t => t.event_id as string));

        if (myEventIds.size > 0) {
          const { data: friendTickets } = await supabase
            .from('tickets')
            .select('user_id, event_id')
            .in('user_id', friendIds)
            .in('event_id', [...myEventIds]);

          const mutualCountByFriend: Record<string, number> = {};
          for (const t of friendTickets ?? []) {
            mutualCountByFriend[t.user_id] = (mutualCountByFriend[t.user_id] ?? 0) + 1;
          }

          for (const friend of acceptedList) {
            friend.mutual_events = mutualCountByFriend[friend.id] ?? 0;
          }
        }
      }

      if (!cancelled) {
        setFriends(acceptedList);
        setPendingRequests(pendingList);
        setSentRequests(sentList);
        setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [tick]);

  // Unique channel name per hook instance — prevents collisions when multiple
  // screens mount useFriends simultaneously (Supabase reuses channels by name).
  const channelName = useRef(`friendships_${Math.random().toString(36).slice(2)}`).current;

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled || !user) return;
      const uid = user.id;
      channel = supabase
        .channel(channelName)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships', filter: `addressee_id=eq.${uid}` }, () => refresh())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships', filter: `requester_id=eq.${uid}` }, () => refresh())
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [refresh, channelName]);

  const sendRequest = useCallback(async (addresseeId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Delete any stale row where we are the requester — upsert would trigger an
    // UPDATE which the RLS policy blocks for the requester side.
    await supabase
      .from('friendships')
      .delete()
      .eq('requester_id', user.id)
      .eq('addressee_id', addresseeId);

    const { error } = await supabase
      .from('friendships')
      .insert({ requester_id: user.id, addressee_id: addresseeId, status: 'pending' });
    if (error) throw new Error(error.message);

    const senderName = (user.user_metadata?.full_name as string | undefined)
      ?? user.email
      ?? 'Someone';
    supabase.functions.invoke('send-notification', {
      body: {
        userId: addresseeId,
        title: 'New Friend Request',
        body: `${senderName} wants to connect with you`,
        data: { screen: 'friends', prefKey: 'friend_activity', requesterId: user.id },
      },
    }).catch(() => {});

    refresh();
  }, [refresh]);

  const acceptRequest = useCallback(async (friendshipId: string) => {
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', friendshipId);
    if (error) throw new Error(error.message);
    refresh();
  }, [refresh]);

  const declineRequest = useCallback(async (friendshipId: string) => {
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'declined' })
      .eq('id', friendshipId);
    if (error) throw new Error(error.message);
    refresh();
  }, [refresh]);

  const withdrawRequest = useCallback(async (friendshipId: string, addresseeId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('id', friendshipId);
    if (error) throw new Error(error.message);

    // Remove the notification that was sent when the request was made
    if (user) {
      supabase.functions.invoke('send-notification', {
        body: { action: 'delete', userId: addresseeId, requesterId: user.id },
      }).catch(() => {});
    }

    refresh();
  }, [refresh]);

  const removeFriend = useCallback(async (friendshipId: string) => {
    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('id', friendshipId);
    if (error) throw new Error(error.message);
    refresh();
  }, [refresh]);

  return {
    friends, pendingRequests, sentRequests,
    loading, error, refresh,
    sendRequest, acceptRequest, declineRequest, withdrawRequest, removeFriend,
  };
}
