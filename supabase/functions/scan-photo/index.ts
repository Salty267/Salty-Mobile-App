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

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';

const PROMPT = `Analyze this image of a ticket, event pass, booking confirmation, or QR code.
If you see a QR code, decode its content and use that information to extract ticket details.
Return is_ticket=true ONLY for real event or experience tickets: concerts, sports games, theater shows, festivals, travel (flights/hotels), and dining reservations.
Set is_ticket=false for parking, packages, subscription renewals, or non-event items.
Extract all visible fields:
- title: the event name, show name, or restaurant name (empty string if not found)
- venue: the venue, location, or restaurant (empty string if not found)
- date: formatted as "Aug 15, 2026" — convert any date format you see (empty string if not found)
- time: formatted as "8:00 PM" (empty string if not found)
- seat: seat number, section, row, or ticket/confirmation number (empty string if not found)
- category: one of concert | sports | theater | festival | trip | dining | other
Use empty string (never null) for any field you cannot determine.`;

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

  // ── Gemini Vision ─────────────────────────────────────────────────────────
  const apiKey = Deno.env.get('GOOGLE_AI_STUDIO_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'AI service not configured' }), { status: 500, headers: HEADERS });
  }

  let parsed: {
    is_ticket: boolean;
    title?: string; venue?: string; date?: string;
    time?: string;  seat?: string;  category?: string;
  };

  try {
    const geminiRes = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType, data: imageBase64 } },
            { text: PROMPT },
          ],
        }],
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
              category:  {
                type: 'STRING',
                enum: ['concert', 'sports', 'theater', 'festival', 'trip', 'dining', 'other'],
              },
            },
            required: ['is_ticket', 'category'],
          },
          temperature: 0,
        },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini error:', errText);
      return new Response(JSON.stringify({ error: 'Vision service error' }), { status: 500, headers: HEADERS });
    }

    const geminiJson = await geminiRes.json();
    const raw = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text;
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error('Gemini parse error:', e);
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
