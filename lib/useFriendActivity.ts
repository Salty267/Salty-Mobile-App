import { useState, useEffect } from 'react';
import { supabase } from './supabase/client';
import type { AcceptedFriend } from './useFriends';

type TicketActivity = {
  type: 'ticket';
  friendName: string | null;
  friendAvatar: string | null;
  title: string;
  venue: string | null;
  date: string | null;
  createdAt: string;
};

type ArtistActivity = {
  type: 'artist_follow';
  friendName: string | null;
  friendAvatar: string | null;
  artistName: string;
  createdAt: string;
};

export type ActivityItem = TicketActivity | ArtistActivity;

export function useFriendActivity(friends: AcceptedFriend[]) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (friends.length === 0) {
      setItems([]);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const friendIds = friends.map(f => f.id);
      const friendMap = new Map(friends.map(f => [f.id, f]));

      const [ticketsRes, artistsRes] = await Promise.all([
        supabase
          .from('tickets')
          .select('user_id, title, venue_name, date_str, created_at')
          .in('user_id', friendIds)
          .neq('status', 'archived')
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('followed_artists')
          .select('user_id, artist_name, created_at')
          .in('user_id', friendIds)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      if (cancelled) return;

      const ticketItems: ActivityItem[] = (ticketsRes.data ?? []).map(t => ({
        type: 'ticket' as const,
        friendName: friendMap.get(t.user_id)?.display_name ?? null,
        friendAvatar: friendMap.get(t.user_id)?.avatar_url ?? null,
        title: t.title ?? 'Event',
        venue: t.venue_name ?? null,
        date: t.date_str ?? null,
        createdAt: t.created_at,
      }));

      const artistItems: ActivityItem[] = (artistsRes.data ?? []).map(a => ({
        type: 'artist_follow' as const,
        friendName: friendMap.get(a.user_id)?.display_name ?? null,
        friendAvatar: friendMap.get(a.user_id)?.avatar_url ?? null,
        artistName: a.artist_name,
        createdAt: a.created_at,
      }));

      const merged = [...ticketItems, ...artistItems]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 10);

      setItems(merged);
      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [friends]);

  return { items, loading };
}
