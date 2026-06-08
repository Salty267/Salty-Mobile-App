import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const HEADERS = { 'Content-Type': 'application/json' };
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

const VERIFY_TOOL = {
  name: 'verify_photo_match',
  description: 'Determine whether this photo/video frame was taken at a specific event',
  input_schema: {
    type: 'object',
    properties: {
      is_match: {
        type: 'boolean',
        description: 'True if this photo appears to be from this event or a very similar event',
      },
      confidence: {
        type: 'number',
        description: 'Confidence score 0.0-1.0. 1.0 = certain match, 0.0 = definitely not a match',
      },
      detected_category: {
        type: 'string',
        enum: ['concert', 'sports', 'theater', 'festival', 'trip', 'dining', 'other'],
        description: 'What type of event does this photo appear to be from',
      },
      reason: {
        type: 'string',
        description: 'Brief reason for your assessment (1 sentence)',
      },
    },
    required: ['is_match', 'confidence', 'detected_category'],
  },
};

interface Proposal {
  proposalId: string;
  imageBase64: string;
  mimeType: string;
  ticketTitle: string;
  ticketVenue: string;
  ticketCategory: string;
  ticketDate: string;
  mediaType: 'photo' | 'video';
}

async function verifyOne(proposal: Proposal): Promise<{ confidence: number; keep: boolean }> {
  const mediaNote = proposal.mediaType === 'video'
    ? 'This is a frame extracted from a video.'
    : 'This is a photo.';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      tools: [VERIFY_TOOL],
      tool_choice: { type: 'any' },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: proposal.mimeType, data: proposal.imageBase64 } },
          {
            type: 'text',
            text: `${mediaNote}

Event to verify against:
- Event: ${proposal.ticketTitle}
- Venue: ${proposal.ticketVenue}
- Date: ${proposal.ticketDate}
- Category: ${proposal.ticketCategory}

Does this ${proposal.mediaType === 'video' ? 'video frame' : 'photo'} appear to have been taken at this event or a very similar event of the same type? Use the verify_photo_match tool.`,
          },
        ],
      }],
    }),
  });

  if (!res.ok) return { confidence: 0, keep: false };

  const json = await res.json();
  const toolUse = json.content?.find((b: { type: string }) => b.type === 'tool_use') as
    | { input: { is_match: boolean; confidence: number } }
    | undefined;

  if (!toolUse) return { confidence: 0, keep: false };

  const confidence = toolUse.input.confidence ?? 0;
  // Videos get a small bonus — harder to fake event context
  const adjustedConfidence = proposal.mediaType === 'video'
    ? Math.min(confidence + 0.05, 1.0)
    : confidence;

  return { confidence: adjustedConfidence, keep: adjustedConfidence >= 0.35 };
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

  if (!ANTHROPIC_KEY) {
    return new Response(JSON.stringify({ error: 'AI service not configured' }), { status: 500, headers: HEADERS });
  }

  let proposals: Proposal[] = [];
  try {
    const body = await req.json();
    proposals = (body.proposals ?? []).slice(0, 10); // max 10 per call
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid body' }), { status: 400, headers: HEADERS });
  }

  let verified = 0;
  let rejected = 0;

  for (const proposal of proposals) {
    const { confidence, keep } = await verifyOne(proposal);

    await supabaseAdmin
      .from('photo_match_proposals')
      .update({
        ai_verified: true,
        ai_confidence: confidence,
        // Auto-reject low confidence proposals
        ...(keep ? {} : { status: 'rejected' }),
      })
      .eq('id', proposal.proposalId)
      .eq('user_id', user.id);

    if (keep) verified++;
    else rejected++;
  }

  return new Response(JSON.stringify({ verified, rejected }), { status: 200, headers: HEADERS });
});
