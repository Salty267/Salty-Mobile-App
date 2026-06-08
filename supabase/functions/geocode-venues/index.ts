import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const HEADERS = { 'Content-Type': 'application/json' };

const STOPWORDS = new Set(['the', 'of', 'and', 'at', 'in', 'on', 'a', 'an', '&', 'inc', 'llc']);
function significantWords(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOPWORDS.has(w));
}

// A Nominatim hit is only useful if it's actually the place we searched for — not just
// the globally "most important" place that happens to share zero relation to it. Require
// the candidate's own name/address to contain at least one significant word from the
// query. This rejects e.g. "Main Hall" → a Cairo sports hall indexed only under its
// Arabic name "الحجرة الرئيسية" (no shared words at all), while accepting "Main Hall" →
// the actual London venue (whose indexed name is literally "Main Hall").
function resultLooksRelated(queryName: string, result: { name?: string; display_name?: string }): boolean {
  const queryWords = significantWords(queryName);
  if (!queryWords.length) return false;
  const target = `${result.name ?? ''} ${result.display_name ?? ''}`.toLowerCase();
  return queryWords.some(w => target.includes(w));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { ...HEADERS, 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: HEADERS });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: HEADERS });
  }

  let ticketIds: string[] = [];
  try {
    const body = await req.json();
    ticketIds = body.ticketIds ?? [];
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid body' }), { status: 400, headers: HEADERS });
  }

  if (!ticketIds.length) {
    return new Response(JSON.stringify({ updated: 0, failed: [] }), { status: 200, headers: HEADERS });
  }

  // Fetch tickets that still need geocoding
  const { data: tickets, error: fetchErr } = await supabaseAdmin
    .from('tickets')
    .select('id, venue_name, title')
    .in('id', ticketIds.slice(0, 20))
    .is('venue_lat', null)
    .not('venue_name', 'is', null);

  if (fetchErr || !tickets?.length) {
    return new Response(JSON.stringify({ updated: 0, failed: [] }), { status: 200, headers: HEADERS });
  }

  let updated = 0;
  const failed: string[] = [];

  for (const ticket of tickets) {
    const venueName = (ticket.venue_name as string | null)?.trim();
    if (!venueName || venueName.length < 5 || venueName.toLowerCase() === 'tbd') {
      failed.push(ticket.id);
      continue;
    }

    try {
      // Ask for a few candidates, not just one — generic venue names ("Main Hall",
      // "The Venue", "Backstage") collide with random places worldwide, and Nominatim
      // ranks by global "importance" rather than relevance to the query. We saw "Main
      // Hall" resolve to a sports hall in Cairo (whose indexed name is in Arabic) simply
      // because it had a higher importance score than the actual London venue further
      // down the list. Fetching a few candidates lets us pick the first one that
      // actually looks like the place we searched for.
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(venueName)}&format=json&limit=5`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'SaltyApp/1.0 contact@getsalty.app' },
      });

      if (!res.ok) { failed.push(ticket.id); continue; }

      const results: { lat: string; lon: string; name?: string; display_name?: string }[] = await res.json();
      if (!results?.length) { failed.push(ticket.id); continue; }

      const match = results.find(r => resultLooksRelated(venueName, r));
      if (!match) {
        console.log(`Geocode rejected for "${venueName}" — no candidate's name matched the query (top result: "${results[0]?.display_name}")`);
        failed.push(ticket.id);
        continue;
      }

      await supabaseAdmin
        .from('tickets')
        .update({ venue_lat: parseFloat(match.lat), venue_lng: parseFloat(match.lon) })
        .eq('id', ticket.id);

      updated++;
    } catch {
      failed.push(ticket.id);
    }

    // Nominatim rate limit: max 1 request/second
    await new Promise(r => setTimeout(r, 1100));
  }

  return new Response(JSON.stringify({ updated, failed }), { status: 200, headers: HEADERS });
});
