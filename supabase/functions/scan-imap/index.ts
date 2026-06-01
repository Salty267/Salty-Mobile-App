import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @deno-types="npm:@types/node"
import { ImapFlow } from 'npm:imapflow@1';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImapConnection {
  id: string;
  user_id: string;
  email: string;
  provider: string;
  imap_host: string;
  imap_port: number;
  password: string;
  last_uid: number | null;
}

interface ParsedTicket {
  title: string | null;
  venue: string | null;
  date: string | null;
  time: string | null;
  seat: string | null;
  category: 'concert' | 'sports' | 'theater' | 'dining' | 'festival' | 'trip' | 'other';
  tint: string;
  image_url: string;
  confidence: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const MAX_MESSAGES = 200;

const TICKET_KEYWORDS = [
  'ticket', 'e-ticket', 'booking confirmation', 'reservation confirmed',
  'your order', 'event', 'itinerary', 'boarding pass', 'hotel confirmation',
  'flight confirmation', 'admission', 'your tickets',
];

const NEGATIVE_KEYWORDS = [
  'parking', 'toll', 'shipment', 'delivered', 'tracking',
  'subscription renewal', 'password reset', 'privacy policy',
];

const TRUSTED_SENDERS = [
  'ticketmaster', 'axs.com', 'livenation', 'stubhub', 'seatgeek', 'eventbrite',
  'telecharge', 'opentable', 'resy.com', 'sevenrooms', 'tock.com',
  'delta.com', 'united.com', 'aa.com', 'southwest.com', 'jetblue', 'alaskaair',
  'marriott', 'hilton', 'ihg.com', 'hyatt', 'airbnb', 'booking.com', 'hotels.com',
  'expedia', 'vrbo', 'enterprise', 'hertz', 'avis',
];

const CATEGORY_TINTS: Record<string, string> = {
  concert: '#FAC775', sports: '#E8581A', festival: '#FFCBA4',
  trip: '#A8E6D3',   theater: '#C8B8FF', dining: '#b0b8e0', other: '#b0b8e0',
};

const CATEGORY_IMAGES: Record<string, string> = {
  concert:  'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400&q=85',
  sports:   'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=400&q=85',
  festival: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=400&q=85',
  trip:     'https://images.unsplash.com/photo-1488085061387-422e29b40080?w=400&q=85',
  theater:  'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=400&q=85',
  dining:   'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&q=85',
  other:    'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400&q=85',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function passesKeywordFilter(subject: string, from: string): boolean {
  const lowerSubject = subject.toLowerCase();
  const lowerFrom    = from.toLowerCase();

  if (TRUSTED_SENDERS.some(s => lowerFrom.includes(s))) return true;
  if (NEGATIVE_KEYWORDS.some(k => lowerSubject.includes(k))) return false;
  return TICKET_KEYWORDS.some(k => lowerSubject.includes(k));
}

function detectCategory(text: string): ParsedTicket['category'] {
  const t = text.toLowerCase();
  if (/festival|fest\b|coachella|lollapalooza|bonnaroo|wristband/.test(t)) return 'festival';
  if (/flight|airline|itinerary|boarding pass|airbnb|hotel confirmation|your stay|expedia|vrbo|car rental/.test(t)) return 'trip';
  if (/concert|gig|tour\b|live music|amphitheater|ticketmaster|seatgeek|stubhub|axs\.com|livenation/.test(t)) return 'concert';
  if (/sports?|game\b|match\b|nfl|nba|mlb|nhl|soccer|football|basketball|baseball|hockey/.test(t)) return 'sports';
  if (/theater|theatre|broadway|opera|ballet|musical\b|telecharge/.test(t)) return 'theater';
  if (/restaurant|opentable|resy\.com|dining reservation|your table/.test(t)) return 'dining';
  return 'other';
}

function orNull(s: string | undefined): string | null {
  if (!s || !s.trim()) return null;
  const v = s.trim();
  if (/^<?(unknown|n\/a|none|tbd|not\s+available)>?$/i.test(v)) return null;
  return v;
}

// ─── Claude AI Parser ─────────────────────────────────────────────────────────

async function parseTicketWithAI(subject: string, body: string): Promise<Omit<ParsedTicket, 'tint' | 'image_url' | 'confidence'> | null> {
  const truncated = body.slice(0, 6000);
  const prompt = `You are a ticket extraction assistant. Extract event/ticket info from the email below.

Rules:
- Only extract if this is clearly a ticket, booking, reservation, or event confirmation
- title: The event or destination name. NEVER start with "for/your/tickets for/re:/fwd:"
- venue: Named venue, street address, or "City, STATE". Never leave blank if location info exists.
- date: Format "Mon DD, YYYY" (e.g. "Feb 07, 2025")
- time: Format "H:MM AM/PM" (e.g. "8:00 PM")
- seat: Row/seat/confirmation number

Subject: ${subject}
Body: ${truncated}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        tools: [{
          name: 'extract_ticket',
          description: 'Extract event/ticket info from an email',
          input_schema: {
            type: 'object',
            properties: {
              is_ticket: { type: 'boolean' },
              title:     { type: 'string' },
              venue:     { type: 'string' },
              date:      { type: 'string' },
              time:      { type: 'string' },
              seat:      { type: 'string' },
              category:  { type: 'string', enum: ['concert', 'sports', 'theater', 'festival', 'trip', 'dining', 'other'] },
            },
            required: ['is_ticket', 'category'],
          },
        }],
        tool_choice: { type: 'any' },
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) return null;
    const json = await res.json();
    const toolUse = json.content?.find((b: { type: string }) => b.type === 'tool_use') as
      { input: { is_ticket: boolean; title?: string; venue?: string; date?: string; time?: string; seat?: string; category?: string } } | undefined;
    if (!toolUse || !toolUse.input.is_ticket) return null;

    const p = toolUse.input;
    return {
      title:    orNull(p.title),
      venue:    orNull(p.venue),
      date:     orNull(p.date),
      time:     orNull(p.time),
      seat:     orNull(p.seat),
      category: (p.category as ParsedTicket['category']) ?? detectCategory(subject + ' ' + body),
    };
  } catch {
    return null;
  }
}

async function parseTicket(subject: string, body: string): Promise<ParsedTicket> {
  const fields = await parseTicketWithAI(subject, body);
  const category = fields?.category ?? detectCategory(subject + ' ' + body);
  const { title, venue, date, time, seat } = fields ?? { title: null, venue: null, date: null, time: null, seat: null };

  const confidence =
    (title ? 0.30 : 0) + (date  ? 0.25 : 0) +
    (venue ? 0.20 : 0) + (time  ? 0.15 : 0) + (seat  ? 0.10 : 0);

  return {
    title, venue, date, time, seat, category,
    tint:      CATEGORY_TINTS[category]  ?? '#b0b8e0',
    image_url: CATEGORY_IMAGES[category] ?? CATEGORY_IMAGES.other,
    confidence,
  };
}

// ─── IMAP Scanner ─────────────────────────────────────────────────────────────

async function fetchNewMessages(conn: ImapConnection): Promise<{ uid: number; subject: string; from: string; body: string }[]> {
  const client = new ImapFlow({
    host:   conn.imap_host,
    port:   conn.imap_port,
    secure: true,
    auth:   { user: conn.email, pass: conn.password },
    logger: false,
  });

  await client.connect();
  const messages: { uid: number; subject: string; from: string; body: string }[] = [];

  try {
    await client.mailboxOpen('INBOX');

    // Fetch messages from last 90 days (or since last seen UID)
    const since = new Date(Date.now() - 90 * 24 * 3600 * 1000);

    // Build search: keyword in subject OR from trusted sender, since date
    const searchResults = await client.search(
      { since, or: [{ subject: 'ticket' }, { subject: 'booking' }] },
      { uid: true },
    );

    // Also search for more keywords separately and merge
    const extra1 = await client.search({ since, or: [{ subject: 'reservation' }, { subject: 'itinerary' }] }, { uid: true });
    const extra2 = await client.search({ since, or: [{ subject: 'confirmation' }, { subject: 'e-ticket' }] }, { uid: true });
    const extra3 = await client.search({ since, subject: 'admission' }, { uid: true });

    const allUids = [...new Set([...searchResults, ...extra1, ...extra2, ...extra3])];

    // Filter to only UIDs newer than last sync
    const newUids = conn.last_uid
      ? allUids.filter(uid => uid > conn.last_uid!)
      : allUids;

    const toFetch = newUids.slice(-MAX_MESSAGES);
    if (toFetch.length === 0) return [];

    for await (const msg of client.fetch(toFetch, { uid: true, envelope: true, bodyStructure: true, source: true })) {
      const subject = msg.envelope?.subject ?? '';
      const from    = msg.envelope?.from?.[0]?.address ?? '';
      if (!passesKeywordFilter(subject, from)) continue;

      // Get plain text from source
      const source = msg.source?.toString() ?? '';
      const body = source
        .replace(/<[^>]+>/g, ' ')   // strip HTML tags
        .replace(/\s{2,}/g, ' ')
        .slice(0, 8000);

      messages.push({ uid: msg.uid, subject, from, body });
    }
  } finally {
    await client.logout();
  }

  return messages;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  // Use service role to read password
  const { data: conn, error: connError } = await supabaseAdmin
    .from('imap_connections')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (connError || !conn) {
    return new Response(JSON.stringify({ error: 'No IMAP connection found' }), { status: 404 });
  }

  let messages: Awaited<ReturnType<typeof fetchNewMessages>>;
  try {
    messages = await fetchNewMessages(conn as ImapConnection);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[scan-imap] IMAP error:', msg);
    return new Response(JSON.stringify({ error: `IMAP connection failed: ${msg}` }), { status: 500 });
  }

  if (messages.length === 0) {
    await supabaseAdmin
      .from('imap_connections')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('user_id', user.id);
    return new Response(JSON.stringify({ inserted: 0, pending: 0, skipped: 0 }), { status: 200 });
  }

  // Load existing tickets + pending imports for dedup
  const [{ data: existingTickets }, { data: existingPending }] = await Promise.all([
    supabaseAdmin.from('tickets').select('title, venue_name, date_str').eq('user_id', user.id).eq('status', 'active'),
    supabaseAdmin.from('pending_imports').select('title, venue_name, date_str').eq('user_id', user.id),
  ]);

  const dedupKey = (title: string | null, venue: string | null, date: string | null) =>
    `${(title ?? '').toLowerCase().trim()}|${(venue ?? '').toLowerCase().trim()}|${(date ?? '').toLowerCase().trim()}`;

  const existingKeys = new Set([
    ...(existingTickets ?? []).map(r => dedupKey(r.title, r.venue_name, r.date_str)),
    ...(existingPending ?? []).map(r => dedupKey(r.title, r.venue_name, r.date_str)),
  ]);

  let inserted = 0;
  let skipped  = 0;
  let maxUid   = conn.last_uid ?? 0;

  for (const msg of messages) {
    if (msg.uid > maxUid) maxUid = msg.uid;

    const ticket = await parseTicket(msg.subject, msg.body);
    if (ticket.confidence < 0.3) { skipped++; continue; }

    const key = dedupKey(ticket.title, ticket.venue, ticket.date);
    if (existingKeys.has(key)) { skipped++; continue; }
    existingKeys.add(key);

    const { error } = await supabaseAdmin.from('pending_imports').insert({
      user_id:    user.id,
      title:      ticket.title,
      venue_name: ticket.venue,
      date_str:   ticket.date,
      time_str:   ticket.time,
      seat:       ticket.seat,
      category:   ticket.category,
      tint:       ticket.tint,
      image_url:  ticket.image_url,
      confidence: ticket.confidence,
      source:     'imap',
      raw_from:   msg.from,
      raw_subject: msg.subject,
    });

    if (!error) inserted++;
  }

  await supabaseAdmin
    .from('imap_connections')
    .update({ last_synced_at: new Date().toISOString(), last_uid: maxUid })
    .eq('user_id', user.id);

  return new Response(
    JSON.stringify({ inserted, pending: inserted, skipped }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
