import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';

export type FollowedArtist = {
  id: string;
  artist_name: string;
  artist_id: string | null;
  type: string;
  created_at: string;
};

export function useFollowedArtists() {
  const [followed, setFollowed] = useState<FollowedArtist[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFollowed = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from('followed_artists')
      .select('id, artist_name, artist_id, type, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setFollowed(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchFollowed(); }, [fetchFollowed]);

  const followArtist = useCallback(async (name: string, artistId?: string, type = 'artist') => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('followed_artists')
      .upsert({ user_id: user.id, artist_name: name, artist_id: artistId ?? null, type }, { onConflict: 'user_id,artist_name' })
      .select('id, artist_name, artist_id, type, created_at')
      .single();
    if (data) setFollowed(prev => {
      const without = prev.filter(f => f.artist_name !== name);
      return [data, ...without];
    });
  }, []);

  const unfollowArtist = useCallback(async (name: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('followed_artists').delete()
      .eq('user_id', user.id)
      .eq('artist_name', name);
    setFollowed(prev => prev.filter(f => f.artist_name !== name));
  }, []);

  const isFollowing = useCallback((name: string) => {
    return followed.some(f => f.artist_name === name);
  }, [followed]);

  return { followed, loading, followArtist, unfollowArtist, isFollowing, refetch: fetchFollowed };
}
