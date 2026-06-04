import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const HEADERS = { 'Content-Type': 'application/json' };
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        ...HEADERS,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    });
  }

  // ── Auth ────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: HEADERS });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: HEADERS });
  }

  // ── Request body ─────────────────────────────────────────────────────────
  let question = '';
  try {
    const body = await req.json();
    question = (body.question ?? '').trim();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400, headers: HEADERS });
  }

  if (!question) {
    return new Response(JSON.stringify({ error: 'question is required' }), { status: 400, headers: HEADERS });
  }

  // ── Fetch user's ticket history ──────────────────────────────────────────
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: tickets, error: ticketsError } = await supabaseAdmin
    .from('tickets')
    .select('title, venue_name, date_str, category')
    .eq('user_id', user.id)
    .order('date_str', { ascending: false })
    .limit(200);

  if (ticketsError) {
    console.error('Tickets fetch error:', ticketsError.message);
    return new Response(JSON.stringify({ error: 'Failed to load event history' }), { status: 500, headers: HEADERS });
  }

  if (!tickets || tickets.length === 0) {
    return new Response(JSON.stringify({ answer: "You haven't imported any events yet. Scan some tickets first and I'll be able to answer questions about your history!" }), { status: 200, headers: HEADERS });
  }

  // ── Build compact ticket summary ─────────────────────────────────────────
  const ticketSummary = tickets
    .map(t => `- ${t.title ?? 'Unknown'} | ${t.venue_name ?? 'Unknown venue'} | ${t.date_str ?? 'Unknown date'} | ${t.category}`)
    .join('\n');

  // ── Ask Claude Haiku ─────────────────────────────────────────────────────
  if (!ANTHROPIC_KEY) {
    return new Response(JSON.stringify({ error: 'AI service not configured' }), { status: 500, headers: HEADERS });
  }

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
        system: `You are a fan memory assistant for the Salty app. You help users recall their event history — concerts, sports games, theater shows, trips, and more. Answer questions based ONLY on the event data provided. Be conversational, warm, and specific. If the event isn't in the list, say so honestly. Never make up events.`,
        messages: [{
          role: 'user',
          content: `Here is my complete event history:\n${ticketSummary}\n\nMy question: ${question}`,
        }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error('Claude error:', errText);
      return new Response(JSON.stringify({ error: 'AI service error' }), { status: 500, headers: HEADERS });
    }

    const claudeJson = await claudeRes.json();
    const answer = claudeJson.content?.[0]?.text ?? 'Sorry, I could not generate a response.';
    return new Response(JSON.stringify({ answer }), { status: 200, headers: HEADERS });

  } catch (e) {
    console.error('Ask memory error:', e);
    return new Response(JSON.stringify({ error: 'Failed to process question' }), { status: 500, headers: HEADERS });
  }
});
