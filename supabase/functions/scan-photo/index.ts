import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const HEADERS = { 'Content-Type': 'application/json' };

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

const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

const EXTRACT_TICKET_TOOL = {
  name: 'extract_ticket',
  description: 'Extract event/ticket info from a ticket image',
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
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { ...HEADERS, 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } });
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
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

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: HEADERS });
  }

  // ── Request body ──────────────────────────────────────────────────────────
  let imageBase64 = '';
  let mimeType = 'image/jpeg';
  try {
    const body = await req.json();
    imageBase64 = body.imageBase64 ?? '';
    mimeType    = body.mimeType    ?? 'image/jpeg';
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400, headers: HEADERS });
  }

  if (!imageBase64) {
    return new Response(JSON.stringify({ error: 'imageBase64 is required' }), { status: 400, headers: HEADERS });
  }

  // ── Claude Haiku Vision ───────────────────────────────────────────────────
  if (!ANTHROPIC_KEY) {
    return new Response(JSON.stringify({ error: 'AI service not configured' }), { status: 500, headers: HEADERS });
  }

  let parsed: {
    is_ticket: boolean;
    title?: string; venue?: string; date?: string;
    time?: string;  seat?: string;  category?: string;
  };

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        tools: [EXTRACT_TICKET_TOOL],
        tool_choice: { type: 'any' },
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
            { type: 'text', text: `Analyze this ticket image. Extract all visible info using the extract_ticket tool.
Set is_ticket=true for: concerts, sports, theater, festivals, flights, hotels, restaurant reservations.
Set is_ticket=false for: parking, packages, subscriptions, movie theater tickets, refunds.
- title: event/artist name (for flights: "City A → City B")
- venue: venue name only (for flights: departure airport)
- date: format as "Mon DD, YYYY" (e.g., "Aug 15, 2026")
- time: format as "H:MM AM/PM" (e.g., "8:00 PM")
- seat: section/row/seat or confirmation number` },
          ],
        }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error('Claude error:', errText);
      return new Response(JSON.stringify({ error: 'Vision service error' }), { status: 500, headers: HEADERS });
    }

    const claudeJson = await claudeRes.json();
    const toolUse = claudeJson.content?.find((b: { type: string }) => b.type === 'tool_use') as { input: Record<string, string> } | undefined;
    if (!toolUse) {
      return new Response(JSON.stringify({ error: 'Failed to analyze image' }), { status: 500, headers: HEADERS });
    }
    parsed = toolUse.input as typeof parsed;
  } catch (e) {
    console.error('Claude parse error:', e);
    return new Response(JSON.stringify({ error: 'Failed to analyze image' }), { status: 500, headers: HEADERS });
  }

  // ── Not a ticket ──────────────────────────────────────────────────────────
  if (!parsed.is_ticket) {
    return new Response(JSON.stringify({ pending: 0 }), { status: 200, headers: HEADERS });
  }

  // ── Build insert payload ──────────────────────────────────────────────────
  const orNull = (v?: string) => (v?.trim() ? v.trim() : null);

  const title    = orNull(parsed.title);
  const venue    = orNull(parsed.venue);
  const date     = orNull(parsed.date);
  const time     = orNull(parsed.time);
  const seat     = orNull(parsed.seat);
  const category = parsed.category ?? 'other';

  const confidence =
    (title  ? 0.30 : 0) +
    (date   ? 0.25 : 0) +
    (venue  ? 0.20 : 0) +
    (time   ? 0.15 : 0) +
    (seat   ? 0.10 : 0);

  const { error: insertError } = await supabaseAdmin.from('pending_imports').insert({
    user_id:    user.id,
    source:     'photo',
    status:     'pending',
    confidence,
    raw_data: {
      title,
      venue,
      date,
      time,
      seat,
      category,
      tint:      CATEGORY_TINTS[category]  ?? '#b0b8e0',
      image_url: CATEGORY_IMAGES[category] ?? CATEGORY_IMAGES.other,
      subject:   'Photo scan',
    },
  });

  if (insertError) {
    console.error('Insert error:', insertError.message);
    return new Response(JSON.stringify({ error: 'Failed to save import' }), { status: 500, headers: HEADERS });
  }

  return new Response(JSON.stringify({ pending: 1 }), { status: 200, headers: HEADERS });
});
