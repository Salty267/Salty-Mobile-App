import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';

export type SavedEvent = {
  id: string;
  title: string;
  subtitle?: string;
  venue: string;
  date: string;
  time: string;
  category: string;
  image: string;
  tint?: string;
  seat?: string;
  daysAway?: number;
};

type SavedEventsCtx = {
  savedEvents: SavedEvent[];
  saveEvent: (event: SavedEvent) => void;
  unsaveEvent: (id: string) => void;
  isSaved: (id: string) => boolean;
  loading: boolean;
};

const Ctx = createContext<SavedEventsCtx>({
  savedEvents: [],
  saveEvent: () => {},
  unsaveEvent: () => {},
  isSaved: () => false,
  loading: false,
});

export function SavedEventsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [savedEvents, setSavedEvents] = useState<SavedEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || !active) { setLoading(false); return; }
      supabase
        .from('saved_events')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .then(({ data }) => {
          if (!active) return;
          if (data) {
            setSavedEvents(data.map(row => ({
              id: row.event_id,
              title: row.title,
              subtitle: row.subtitle ?? undefined,
              venue: row.venue,
              date: row.date_str,
              time: row.time_str,
              category: row.category,
              image: row.image_url,
              tint: row.tint ?? undefined,
              seat: row.seat ?? undefined,
              daysAway: row.days_away ?? undefined,
            })));
          }
          setLoading(false);
        });
    });
    return () => { active = false; };
  }, []);

  const saveEvent = useCallback((event: SavedEvent) => {
    setSavedEvents(prev => prev.some(e => e.id === event.id) ? prev : [event, ...prev]);
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('saved_events').upsert({
        user_id: user.id,
        event_id: event.id,
        title: event.title,
        subtitle: event.subtitle ?? null,
        venue: event.venue,
        date_str: event.date,
        time_str: event.time,
        category: event.category,
        image_url: event.image,
        tint: event.tint ?? null,
        seat: event.seat ?? null,
        days_away: event.daysAway ?? null,
      }, { onConflict: 'user_id,event_id' });
    });
  }, []);

  const unsaveEvent = useCallback((id: string) => {
    setSavedEvents(prev => prev.filter(e => e.id !== id));
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('saved_events').delete().eq('user_id', user.id).eq('event_id', id);
    });
  }, []);

  const isSaved = useCallback((id: string) => {
    return savedEvents.some(e => e.id === id);
  }, [savedEvents]);

  return (
    <Ctx.Provider value={{ savedEvents, saveEvent, unsaveEvent, isSaved, loading }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSavedEvents(): SavedEventsCtx {
  return useContext(Ctx);
}
