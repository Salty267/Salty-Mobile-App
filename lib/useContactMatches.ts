import { useState } from 'react';
import * as Contacts from 'expo-contacts';
import { supabase } from './supabase/client';
import type { AcceptedFriend, PendingRequest, SentRequest } from './useFriends';
import type { FriendshipStatus, SearchResult } from './useUserSearch';

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length > 7) return `+${digits}`;
  return null;
}

type UseContactMatchesReturn = {
  results: SearchResult[];
  loading: boolean;
  error: string | null;
  permissionDenied: boolean;
  load: () => Promise<void>;
  optimisticSend: (userId: string) => void;
};

export function useContactMatches(
  existingFriends: AcceptedFriend[],
  existingSentRequests: SentRequest[],
  existingPendingRequests: PendingRequest[],
): UseContactMatchesReturn {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    setPermissionDenied(false);

    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        setPermissionDenied(true);
        setLoading(false);
        return;
      }

      const { data: contacts } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers],
      });

      const phoneSet = new Set<string>();
      for (const contact of contacts ?? []) {
        for (const p of contact.phoneNumbers ?? []) {
          const normalized = normalizePhone(p.number ?? '');
          if (normalized) phoneSet.add(normalized);
        }
      }

      if (phoneSet.size === 0) {
        setResults([]);
        setLoading(false);
        return;
      }

      const { data: matched, error: rpcErr } = await supabase.rpc('find_users_by_phones', {
        phone_numbers: Array.from(phoneSet),
      });

      if (rpcErr || !matched) {
        setError(rpcErr?.message ?? 'Lookup failed');
        setLoading(false);
        return;
      }

      const friendIds = new Set(existingFriends.map(f => f.id));
      const friendshipIdByFriendId = Object.fromEntries(existingFriends.map(f => [f.id, f.friendship_id]));
      const sentToIds = new Set(existingSentRequests.map(r => r.addressee.id));
      const sentFidByAddresseeId = Object.fromEntries(existingSentRequests.map(r => [r.addressee.id, r.friendship_id]));
      const receivedFromIds = new Set(existingPendingRequests.map(r => r.requester.id));
      const receivedFidByRequesterId = Object.fromEntries(existingPendingRequests.map(r => [r.requester.id, r.friendship_id]));

      const enriched: SearchResult[] = (matched as { id: string; username: string | null; display_name: string | null; avatar_url: string | null }[]).map(u => {
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

        return { id: u.id, display_name: u.display_name, avatar_url: u.avatar_url, username: u.username, status, friendship_id };
      });

      setResults(enriched);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const optimisticSend = (userId: string) => {
    setResults(prev =>
      prev.map(r => r.id === userId ? { ...r, status: 'pending_sent' as const } : r),
    );
  };

  return { results, loading, error, permissionDenied, load, optimisticSend };
}
