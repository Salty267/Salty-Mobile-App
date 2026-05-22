import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GmailConnection {
  id: string;
  user_id: string;
  email: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  gmail_history_id: string | null;
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

interface ScanResult {
  inserted: number;
  pending: number;
  skipped: number;
  historyId: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TICKET_KEYWORDS = [
  'ticket', 'confirmation', 'booking', 'e-ticket', 'reservation',
  'your order', 'event', 'admit', 'venue', 'seat', 'row', 'section',
];

const STRONG_KEYWORDS = ['ticket', 'e-ticket', 'confirmation', 'your order'];

const CATEGORY_TINTS: Record<string, string> = {
  concert:  '#FAC775',
  sports:   '#E8581A',
  festival: '#FFCBA4',
  trip:     '#A8E6D3',
  theater:  '#C8B8FF',
  dining:   '#b0b8e0',
  other:    '#b0b8e0',
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

const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400&q=85';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GEMINI_KEY = Deno.env.get('GOOGLE_AI_STUDIO_KEY') ?? '';
const MAX_MESSAGES = 500;
const CONCURRENCY = 20;

// ─── Token Refresh ────────────────────────────────────────────────────────────

async function refreshGoogleToken(conn: GmailConnection): Promise<string> {
  if (!conn.refresh_token) throw new Error('No refresh token stored');

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
      refresh_token: conn.refresh_token,
      grant_type:    'refresh_token',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed: ${body}`);
  }

  const json = await res.json();
  return json.access_token as string;
}

async function getValidToken(
  conn: GmailConnection,
  supabase: ReturnType<typeof createClient>,
): Promise<string> {
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  const needsRefresh = expiresAt <= Date.now() + 60_000;

  if (!needsRefresh) return conn.access_token;

  const newToken = await refreshGoogleToken(conn);
  const newExpiry = new Date(Date.now() + 3600 * 1000).toISOString();

  await supabase
    .from('gmail_connections')
    .update({ access_token: newToken, token_expires_at: newExpiry })
    .eq('user_id', conn.user_id);

  return newToken;
}

// ─── Gmail API Helpers ────────────────────────────────────────────────────────

async function gmailGet(path: string, token: string): Promise<Response> {
  return fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function getProfile(token: string): Promise<{ historyId: string }> {
  const res = await gmailGet('/profile', token);
  if (!res.ok) throw new Error(`Gmail profile failed: ${res.status}`);
  return res.json();
}

async function listMessages(token: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  const QUERY = 'subject:(ticket OR confirmation OR booking OR "your order" OR "e-ticket")';

  do {
    const params = new URLSearchParams({
      q: QUERY,
      maxResults: '100',
      ...(pageToken ? { pageToken } : {}),
    });
    const res = await gmailGet(`/messages?${params}`, token);
    if (!res.ok) break;
    const json = await res.json();
    const msgs: Array<{ id: string }> = json.messages ?? [];
    ids.push(...msgs.map((m) => m.id));
    pageToken = json.nextPageToken;
  } while (pageToken && ids.length < MAX_MESSAGES);

  return ids;
}

async function listHistory(
  token: string,
  startHistoryId: string,
): Promise<{ messageIds: string[]; latestHistoryId: string | null }> {
  const messageIds: string[] = [];
  let latestHistoryId: string | null = null;
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      startHistoryId,
      historyTypes: 'messageAdded',
      ...(pageToken ? { pageToken } : {}),
    });
    const res = await gmailGet(`/history?${params}`, token);

    if (res.status === 404) {
      // historyId too old — signal caller to reset
      throw new Error('HISTORY_STALE');
    }

    if (!res.ok) break;
    const json = await res.json();
    latestHistoryId = json.historyId ?? latestHistoryId;

    const records: Array<{ messagesAdded?: Array<{ message: { id: string } }> }> =
      json.history ?? [];

    for (const record of records) {
      for (const added of record.messagesAdded ?? []) {
        messageIds.push(added.message.id);
      }
    }

    pageToken = json.nextPageToken;
  } while (pageToken);

  return { messageIds, latestHistoryId };
}

async function fetchMessageDetails(
  id: string,
  token: string,
): Promise<{ subject: string; body: string } | null> {
  const res = await gmailGet(`/messages/${id}?format=full`, token);
  if (!res.ok) return null;
  const msg = await res.json();

  const headers: Array<{ name: string; value: string }> = msg.payload?.headers ?? [];
  const subject = headers.find((h) => h.name.toLowerCase() === 'subject')?.value ?? '';

  const body = extractBody(msg.payload);
  return { subject, body };
}

function extractBody(payload: {
  mimeType?: string;
  body?: { data?: string };
  parts?: unknown[];
}): string {
  if (!payload) return '';

  if (payload.body?.data) {
    try {
      return atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
    } catch {
      return '';
    }
  }

  if (Array.isArray(payload.parts)) {
    for (const part of payload.parts as typeof payload[]) {
      const text = extractBody(part);
      if (text) return text;
    }
  }

  return '';
}

// ─── Filter ───────────────────────────────────────────────────────────────────

function passesKeywordFilter(subject: string, body: string): boolean {
  const subjectLower = subject.toLowerCase();
  const combinedLower = (subject + ' ' + body).toLowerCase();

  const hasStrongKeyword = STRONG_KEYWORDS.some((kw) => subjectLower.includes(kw));
  if (hasStrongKeyword) return true;

  const hitCount = TICKET_KEYWORDS.filter((kw) => combinedLower.includes(kw)).length;
  return hitCount >= 2;
}

// ─── AI Parser ────────────────────────────────────────────────────────────────

type TicketFields = Omit<ParsedTicket, 'confidence' | 'tint' | 'image_url'>;

async function parseTicketWithAI(subject: string, body: string, apiKey: string): Promise<TicketFields | null> {
  const truncated = body.slice(0, 4000);
  const prompt = `Extract event ticket info from this email. Return JSON with:
- is_ticket: true only if this is an event ticket or booking confirmation
- title: event or show name (empty string if unknown)
- venue: venue or location name (empty string if unknown)
- date: date like "Aug 15, 2026" (empty string if unknown)
- time: time like "8:00 PM" (empty string if unknown)
- seat: seat, section, or ticket number (empty string if unknown)
- category: one of concert|sports|theater|festival|trip|dining|other

Subject: ${subject}
Body: ${truncated}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                is_ticket: { type: 'BOOLEAN' },
                title:     { type: 'STRING' },
                venue:     { type: 'STRING' },
                date:      { type: 'STRING' },
                time:      { type: 'STRING' },
                seat:      { type: 'STRING' },
                category:  { type: 'STRING', enum: ['concert', 'sports', 'theater', 'festival', 'trip', 'dining', 'other'] },
              },
              required: ['is_ticket', 'category'],
            },
            temperature: 0,
          },
        }),
      },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    const p = JSON.parse(text);
    if (!p.is_ticket) return null;
    const orNull = (s: string | undefined) => (s && s.trim() ? s.trim() : null);
    return {
      title:    orNull(p.title),
      venue:    orNull(p.venue),
      date:     orNull(p.date),
      time:     orNull(p.time),
      seat:     orNull(p.seat),
      category: p.category ?? 'other',
    };
  } catch {
    return null;
  }
}

async function parseTicket(subject: string, body: string): Promise<ParsedTicket> {
  let fields: TicketFields | null = null;

  if (GEMINI_KEY) {
    fields = await parseTicketWithAI(subject, body, GEMINI_KEY);
  }
  if (!fields) {
    const r = parseTicketRegex(subject, body);
    fields = { title: r.title, venue: r.venue, date: r.date, time: r.time, seat: r.seat, category: r.category };
  }

  const { title, venue, date, time, seat, category } = fields;
  const confidence =
    (title  ? 0.30 : 0) +
    (date   ? 0.25 : 0) +
    (venue  ? 0.20 : 0) +
    (time   ? 0.15 : 0) +
    (seat   ? 0.10 : 0);

  return {
    title, venue, date, time, seat, category,
    tint:      CATEGORY_TINTS[category]  ?? '#b0b8e0',
    image_url: CATEGORY_IMAGES[category] ?? DEFAULT_IMAGE,
    confidence,
  };
}

// ─── Regex Parser (fallback) ──────────────────────────────────────────────────

function parseTicketRegex(subject: string, body: string): ParsedTicket {
  console.log('SUBJECT:', subject);
  console.log('BODY_SAMPLE:', body.substring(0, 1000));
  const text = subject + '\n' + body;

  // Title & venue — for flights, match each "City, US (XXX)" independently
  // to handle \r\n, HTML remnants, or irregular whitespace between the two lines
  const allCityMatches = [...body.matchAll(/([A-Za-z][A-Za-z ]{2,28}),\s*US\s*\(([A-Z]{3})\)/g)];

  let title: string | null = null;
  let venue: string | null = null;

  const stripMonthPrefix = (s: string) =>
    s.replace(/^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+/i, '').trim();

  if (allCityMatches.length >= 2) {
    const origin = stripMonthPrefix(allCityMatches[0][1].trim());
    const originCode = allCityMatches[0][2];
    const dest = stripMonthPrefix(allCityMatches[1][1].trim());
    const destCode = allCityMatches[1][2];
    title = `${origin} → ${dest}`;
    venue = `${origin} (${originCode}) → ${dest} (${destCode})`;
  }

  if (!title) {
    // Prefer labeled "Event:" line in body over the (often generic) subject
    const eventLabelMatch = body.match(/^Event:\s*(.+)/im);
    title = (eventLabelMatch ? eventLabelMatch[1].trim() : null) || cleanSubject(subject) || null;
  }

  // Venue — for non-flights, try labeled "Venue:" line first (captures commas), then keyword fallback
  if (!venue) {
    const venueLabelMatch = text.match(/^Venue:\s*(.+)/im);
    const venueKeywordMatch = text.match(
      /(?:arena|stadium|theater|theatre|hall|center|centre|club|garden|field|park)[:\s]+([A-Z][^\n]{3,60})/i,
    );
    venue = venueLabelMatch
      ? venueLabelMatch[1].trim()
      : venueKeywordMatch ? venueKeywordMatch[1].trim() : null;
  }

  // Date — labeled "Date:" line wins; skip forwarded-header dates (they end with " at HH:MM")
  let date: string | null = null;
  for (const m of [...body.matchAll(/^Date:\s*(.+)/gim)]) {
    const val = m[1].trim();
    if (/ at \d{1,2}:\d{2}/.test(val)) continue; // forwarded email header, not an event date
    date = val.replace(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s+/i, '').trim() || null;
    break;
  }
  if (!date) {
    // Fallback: itinerary-style dates (e.g. "Tue, 09 Jun") — skip any match that sits on a
    // forwarded-header "Date:" line (check up to 20 chars of context before the match)
    const itinMatches = [...body.matchAll(
      /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s+(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*)/gi,
    )];
    const itinMatch = itinMatches.find(m => {
      const before = body.slice(Math.max(0, m.index! - 20), m.index!);
      return !/date:\s*$/i.test(before);
    });
    const genericDateMatch = text.match(
      /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b/i,
    ) ?? text.match(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/);
    date = itinMatch
      ? itinMatch[1].trim()
      : genericDateMatch ? genericDateMatch[0].trim() : null;
  }

  // If the date has no 4-digit year (e.g. itinerary "09 Jun"), pull the year from anywhere in the email
  if (date && !/\b\d{4}\b/.test(date)) {
    const yearMatch = text.match(/\b(202[5-9]|203\d)\b/);
    if (yearMatch) date = `${date} ${yearMatch[1]}`;
  }

  // Time — first time in body (departure time)
  const timeMatch = body.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM))\b/i);
  const time = timeMatch ? timeMatch[1].trim() : null;

  // Seat — labeled "Seat:" line wins; fall back to ticket number
  const seatLabelMatch = text.match(/^Seat:\s*(.+)/im);
  const ticketNoMatch = body.match(/(?:ticket\s*no\.?|ticket\s*number)[:\s]*([0-9]{10,13})/i) ?? body.match(/\b(027\d{10})\b/);
  const seat = seatLabelMatch
    ? seatLabelMatch[1].trim()
    : ticketNoMatch ? `Ticket: ${ticketNoMatch[1]}` : null;

  // Category
  const category = detectCategory(text);

  // Confidence
  const confidence =
    (title  ? 0.30 : 0) +
    (date   ? 0.25 : 0) +
    (venue  ? 0.20 : 0) +
    (time   ? 0.15 : 0) +
    (seat   ? 0.10 : 0);

  return {
    title,
    venue,
    date,
    time,
    seat,
    category,
    tint: CATEGORY_TINTS[category] ?? '#b0b8e0',
    image_url: CATEGORY_IMAGES[category] ?? DEFAULT_IMAGE,
    confidence,
  };
}

function cleanSubject(subject: string): string {
  return subject
    .replace(/^(?:fwd?|re|fw):\s*/i, '')
    .replace(/\[.*?\]/g, '')
    .replace(/#\s*\d+/g, '')
    .replace(/(?:confirmation|booking|order|ticket|receipt)\s*(?:number|no\.?)?\s*[\w-]*/gi, '')
    .replace(/^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function detectCategory(
  text: string,
): 'concert' | 'sports' | 'theater' | 'dining' | 'festival' | 'trip' | 'other' {
  const lower = text.toLowerCase();
  // Festival check before concert — "music festival" and named festivals (Coachella, etc.) would
  // otherwise match the concert pattern first because they contain words like "music" or "show"
  if (/festival|fest|coachella|glastonbury|lollapalooza|bonnaroo|outside lands/.test(lower)) return 'festival';
  if (/concert|gig|tour\b|live music|show/.test(lower)) return 'concert';
  if (/sports?|game|match|nfl|nba|mlb|nhl|mls|soccer|football|basketball|baseball|hockey|tennis|golf|lakers|celtics|knicks|bulls|warriors|heat|nets|sixers|bucks|nuggets|suns|clippers|mavericks|spurs|rockets|pacers|raptors/.test(lower)) return 'sports';
  if (/theater|theatre|broadway|opera|ballet|musical|play/.test(lower)) return 'theater';
  if (/flight|hotel|airline|reservation|check-in|check in|airbnb|trip/.test(lower)) return 'trip';
  if (/restaurant|dining|dinner|reservation|table|chef|cuisine/.test(lower)) return 'dining';
  return 'other';
}

// ─── Concurrency Helper ───────────────────────────────────────────────────────

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Auth
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

  // Fetch gmail connection
  const { data: conn, error: connError } = await supabase
    .from('gmail_connections')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (connError || !conn) {
    return new Response(JSON.stringify({ error: 'Gmail not connected' }), { status: 400 });
  }

  // Get valid token (refresh if needed)
  let token: string;
  try {
    token = await getValidToken(conn as GmailConnection, supabase);
  } catch (e) {
    return new Response(JSON.stringify({ error: `Token error: ${(e as Error).message}` }), { status: 400 });
  }

  const isFirstScan = conn.gmail_history_id === null;
  const result: ScanResult = { inserted: 0, pending: 0, skipped: 0, historyId: null };

  let messageIds: string[] = [];
  let newHistoryId: string | null = null;

  try {
    if (isFirstScan) {
      // Capture historyId BEFORE reading messages
      const profile = await getProfile(token);
      newHistoryId = profile.historyId;
      messageIds = await listMessages(token);
    } else {
      const historyResult = await listHistory(token, conn.gmail_history_id!);
      messageIds = historyResult.messageIds;
      newHistoryId = historyResult.latestHistoryId ?? conn.gmail_history_id;
    }
  } catch (e) {
    const msg = (e as Error).message;

    if (msg === 'HISTORY_STALE') {
      // Reset historyId and re-run as first scan
      await supabase
        .from('gmail_connections')
        .update({ gmail_history_id: null })
        .eq('user_id', user.id);

      // Re-run as first scan
      const profile = await getProfile(token);
      newHistoryId = profile.historyId;
      messageIds = await listMessages(token);
    } else {
      return new Response(JSON.stringify({ error: msg }), { status: 500 });
    }
  }

  if (messageIds.length === 0) {
    // Nothing new — update sync timestamp and return
    await supabase
      .from('gmail_connections')
      .update({ last_synced_at: new Date().toISOString(), gmail_history_id: newHistoryId })
      .eq('user_id', user.id);

    return new Response(JSON.stringify({ ...result, historyId: newHistoryId }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Fetch message details with concurrency limit
  const details = await mapConcurrent(
    messageIds,
    CONCURRENCY,
    (id) => fetchMessageDetails(id, token),
  );

  // Load existing gmail tickets + pending imports for deduplication
  const [{ data: existingTickets }, { data: existingPending }] = await Promise.all([
    supabaseAdmin
      .from('tickets')
      .select('title, date_str')
      .eq('user_id', user.id)
      .eq('source', 'gmail'),
    supabaseAdmin
      .from('pending_imports')
      .select('raw_data')
      .eq('user_id', user.id)
      .eq('status', 'pending'),
  ]);

  const existingKeys = new Set(
    (existingTickets ?? []).map((t) => `${(t.title ?? '').toLowerCase()}|${t.date_str ?? ''}`),
  );
  (existingPending ?? []).forEach((p) => {
    const rd = p.raw_data as { title?: string; date?: string };
    existingKeys.add(`${(rd.title ?? '').toLowerCase()}|${rd.date ?? ''}`);
  });

  // Process each message — all go to pending_imports for user review
  for (const detail of details) {
    if (!detail) { result.skipped++; continue; }

    const { subject, body } = detail;

    // Filter
    if (!passesKeywordFilter(subject, body)) { result.skipped++; continue; }

    // Parse (throttle AI calls to stay under Gemini's 15 RPM free-tier limit)
    const parsed = await parseTicket(subject, body);
    if (GEMINI_KEY) await new Promise(r => setTimeout(r, 200));

    // Deduplicate
    const dedupeKey = `${(parsed.title ?? '').toLowerCase()}|${parsed.date ?? ''}`;
    if (existingKeys.has(dedupeKey)) { result.skipped++; continue; }
    existingKeys.add(dedupeKey);

    await supabaseAdmin.from('pending_imports').insert({
      user_id:    user.id,
      source:     'gmail',
      status:     'pending',
      confidence: parsed.confidence,
      raw_data: {
        title:    parsed.title,
        venue:    parsed.venue,
        date:     parsed.date,
        time:     parsed.time,
        seat:     parsed.seat,
        category: parsed.category,
        tint:     parsed.tint,
        image_url: parsed.image_url,
        subject,
      },
    });
    result.pending++;
  }

  // Update connection — save new historyId and sync timestamp
  await supabase
    .from('gmail_connections')
    .update({
      gmail_history_id: newHistoryId,
      last_synced_at:   new Date().toISOString(),
    })
    .eq('user_id', user.id);

  result.historyId = newHistoryId;

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
});