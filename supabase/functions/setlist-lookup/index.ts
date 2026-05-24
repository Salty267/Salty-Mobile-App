import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SF_BASE = 'https://api.setlist.fm/rest/1.0';
const HEADERS = { 'Content-Type': 'application/json' };
const empty   = () => new Response(JSON.stringify({ songs: [] }), { status: 200, headers: HEADERS });

Deno.serve(async (req) => {
  const sfKey = Deno.env.get('SETLISTFM_API_KEY');
  if (!sfKey) return empty();

  let body: { ticketId?: string; artistName?: string; dateStr?: string } = {};
  try { body = await req.json(); } catch {}

  const { ticketId, artistName, dateStr } = body;
  if (!artistName?.trim()) return empty();

  const qs = new URLSearchParams({ artistName: artistName.trim(), p: '1' });
  if (dateStr) {
    const [y, m, d] = dateStr.split('-');
    if (y && m && d) qs.set('date', `${d}-${m}-${y}`);
  }

  try {
    const resp = await fetch(`${SF_BASE}/search/setlists?${qs}`, {
      headers: { 'x-api-key': sfKey, 'Accept': 'application/json' },
    });
    if (!resp.ok) return empty();

    const json = await resp.json();
    const setlists: any[] = json.setlist ?? [];

    let songs: Array<{ song: string }> = [];
    for (const sl of setlists) {
      const names: string[] = [];
      for (const set of sl.sets?.set ?? []) {
        for (const s of set.song ?? []) {
          if (s.name && !s.tape) names.push(s.name);
        }
      }
      if (names.length > 0) {
        songs = names.map(name => ({ song: name }));
        break;
      }
    }

    if (ticketId && songs.length > 0) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      await supabase.from('setlists').upsert(
        { ticket_id: ticketId, songs },
        { onConflict: 'ticket_id' },
      );
    }

    return new Response(JSON.stringify({ songs }), { status: 200, headers: HEADERS });
  } catch {
    return empty();
  }
});
