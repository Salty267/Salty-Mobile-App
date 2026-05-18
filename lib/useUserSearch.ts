import { useState, useEffect, useRef } from 'react';
import { supabase } from './supabase/client';
import type { AcceptedFriend, PendingRequest, SentRequest } from './useFriends';

export type FriendshipStatus = 'none' | 'pending_sent' | 'pending_received' | 'friends';

export type SearchResult = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  status: FriendshipStatus;
  friendship_id: string | null;
};

type UseUserSearchReturn = {
  query: string;
  setQuery: (q: string) => void;
  results: SearchResult[];
  loading: boolean;
  error: string | null;
};

export function useUserSearch(
  existingFriends: AcceptedFriend[],
  existingSentRequests: SentRequest[],
  existingPendingRequests: PendingRequest[],
): UseUserSearchReturn {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setError('Not authenticated'); setLoading(false); return; }

        const { data: users, error: searchErr } = await supabase
          .from('users')
          .select('id, display_name, avatar_url')
          .ilike('display_name', `%${trimmed}%`)
          .neq('id', user.id)
          .limit(20);

        if (searchErr || !users) {
          setError(searchErr?.message ?? 'Search failed');
          setLoading(false);
          return;
        }

        const friendIds = new Set(existingFriends.map(f => f.id));
        const friendshipIdByFriendId = Object.fromEntries(existingFriends.map(f => [f.id, f.friendship_id]));
        const sentToIds = new Set(existingSentRequests.map(r => r.addressee.id));
        const sentFidByAddresseeId = Object.fromEntries(existingSentRequests.map(r => [r.addressee.id, r.friendship_id]));
        const receivedFromIds = new Set(existingPendingRequests.map(r => r.requester.id));
        const receivedFidByRequesterId = Object.fromEntries(existingPendingRequests.map(r => [r.requester.id, r.friendship_id]));

        const enriched: SearchResult[] = users.map(u => {
          let status: FriendshipStatus = 'none';
          let friendship_id: string | null = null;

          if (friendIds.has(u.id)) {
            status = 'friends';
            friendship_id = friendshipIdByFriendId[u.id] ?? null;
          } else if (sentToIds.has(u.id)) {
            status = 'pending_sent';
            friendship_id = sentFidByAddresseeId[u.id] ?? null;
          } else if (receivedFromIds.has(u.id)) {
            status = 'pending_received';
            friendship_id = receivedFidByRequesterId[u.id] ?? null;
          }

          return { id: u.id, display_name: u.display_name, avatar_url: u.avatar_url, status, friendship_id };
        });

        setResults(enriched);
        setError(null);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query, existingFriends, existingSentRequests, existingPendingRequests]);

  return { query, setQuery, results, loading, error };
}
