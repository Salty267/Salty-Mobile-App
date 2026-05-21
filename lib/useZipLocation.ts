import { useState, useEffect } from 'react';
import { supabase } from './supabase/client';

export function useZipLocation() {
  const [zipCode, setZipCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || cancelled) { setLoading(false); return; }

      supabase
        .from('users')
        .select('zip_code')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (cancelled) return;
          // Prefer the DB column; fall back to auth metadata for users
          // whose zip_code hasn't been synced to public.users yet
          const zip =
            data?.zip_code ||
            (user.user_metadata?.zip_code as string | undefined) ||
            null;
          setZipCode(zip);
          setLoading(false);
        });
    });

    return () => { cancelled = true; };
  }, []);

  return { zipCode, loading };
}
