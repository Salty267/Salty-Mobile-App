import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TICKETMASTER_BASE = 'https://app.ticketmaster.com/discovery/v2/events.json';
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const tmKey = Deno.env.get('TICKETMASTER_API_KEY');
  if (!tmKey) return new Response('Missing TICKETMASTER_API_KEY', { status: 500 });

  // Scope to calling user when invoked from the app (user JWT provided)
  const authHeader = req.headers.get('Authorization') ?? '';
  const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  const scopedUserId = user?.id ?? null;

  let followQuery = supabase
    .from('followed_artists')
    .select('user_id, artist_name, artist_id');
  if (scopedUserId) followQuery = (followQuery as any).eq('user_id', scopedUserId);

  const { data: follows, error: followErr } = await followQuery;
  if (followErr || !follows || follows.length === 0) {
    return new Response(JSON.stringify({ alertsSent: 0 }), { status: 200 });
  }

  const userIds = [...new Set((follows as any[]).map((f) => f.user_id))];
  const { data: userRows } = await supabase
    .from('users')
    .select('id, zip_code')
    .in('id', userIds);

  const zipByUser: Record<string, string | null> = {};
  for (const u of (userRows ?? [])) zipByUser[u.id] = u.zip_code ?? null;

  let alertsSent = 0;
  const errors: string[] = [];

  for (const follow of follows as Array<{ user_id: string; artist_name: string; artist_id: string | null }>) {
    try {
      const zip = zipByUser[follow.user_id];
      const params = new URLSearchParams({
        apikey: tmKey,
        keyword: follow.artist_name,
        size: '5',
        sort: 'date,asc',
      });
      if (zip) params.set('postalCode', zip);

      const resp = await fetch(`${TICKETMASTER_BASE}?${params}`);
      if (!resp.ok) continue;

      const json = await resp.json();
      const events: any[] = json._embedded?.events ?? [];

      for (const event of events) {
        const eventId: string = event.id;
        const eventName: string = event.name ?? follow.artist_name;
        const venueName: string = event._embedded?.venues?.[0]?.name ?? '';
        const dateStr: string = event.dates?.start?.localDate ?? '';

        // Dedup check
        const { data: existing } = await supabase
          .from('sent_artist_alerts')
          .select('id')
          .eq('user_id', follow.user_id)
          .eq('event_id', eventId)
          .maybeSingle();
        if (existing) continue;

        // Record before sending to prevent duplicate alerts under concurrent runs
        const { error: insertErr } = await supabase
          .from('sent_artist_alerts')
          .insert({ user_id: follow.user_id, event_id: eventId, artist_name: follow.artist_name });
        if (insertErr) continue; // unique constraint = another run already sent it

        const title = `${follow.artist_name} has a new show!`;
        const body = [eventName, venueName, dateStr].filter(Boolean).join(' · ');
        const data = { screen: '/following' };

        // Write to in-app notifications inbox
        await supabase.from('notifications').insert({
          user_id: follow.user_id, title, body, data,
        });

        // Respect artist_alerts preference before firing push
        const { data: prefs } = await supabase
          .from('notification_preferences')
          .select('artist_alerts')
          .eq('user_id', follow.user_id)
          .single();
        if (prefs && !prefs.artist_alerts) continue;

        // Send push notification via Expo
        const { data: tokenRow } = await supabase
          .from('notification_tokens')
          .select('token')
          .eq('user_id', follow.user_id)
          .single();
        if (!tokenRow) continue;

        await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: tokenRow.token, title, body, data }),
        });

        alertsSent++;
      }
    } catch (e) {
      errors.push(String(e));
    }
  }

  return new Response(
    JSON.stringify({ alertsSent, errors: errors.slice(0, 10) }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
