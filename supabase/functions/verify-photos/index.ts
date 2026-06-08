import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const HEADERS = { 'Content-Type': 'application/json' };
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

const VERIFY_TOOL = {
  name: 'verify_photo_match',
  description: 'Determine whether this photo/video frame was taken at a specific event, and screen it for sensitive personal content',
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
      contains_sensitive_content: {
        type: 'boolean',
        description: "True if the image shows a screenshot (of an app, website, or text/chat conversation), a credit/debit/bank card, an ID card, passport, driver's license, boarding pass, or any other document/object that exposes personal or financial information — regardless of whether it otherwise matches the event. False for an ordinary photo/video of a place, person, performance, or event scene.",
      },
      reason: {
        type: 'string',
        description: 'Brief reason for your assessment (1 sentence)',
      },
    },
    required: ['is_match', 'confidence', 'detected_category', 'contains_sensitive_content'],
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
  // Set for high-confidence (score >= 0.75) metadata matches: the date+GPS evidence
  // already cleared a strict bar, so we don't ask the model to re-litigate the match
  // (that just invites false rejections of perfectly good matches). It still gets a
  // full pass through this function — but ONLY for the privacy/sensitive-content screen.
  // See the audit note above `verifyOne` for why this exists.
  matchPreConfirmed?: boolean;
}

// Audit finding ("exclude screenshots/credit cards/debit cards/or anyother personal
// things from finding"): high-confidence metadata matches (match_score >= 0.75) used
// to be inserted as proposals straight from date+GPS scoring and NEVER reached this
// function — meaning a credit card, ID, or screenshot photographed at the right venue
// during the right time window would sail through to the user's event gallery with
// zero content-level check. Now every proposal — pre-confirmed or not — gets a pass
// through here, but the QUESTION asked of the model differs:
//   - matchPreConfirmed (high tier): the metadata case is already strong; asking the
//     model to re-judge "is this a match?" only invites false rejections of perfectly
//     good photos. So we tell it to TRUST the match and act as a privacy screen ONLY.
//   - everything else (medium tier / backlog): full match judgement AND privacy screen,
//     exactly as before, just with the new sensitive-content question added on.
// Either way, `contains_sensitive_content: true` is an unconditional reject below —
// a coincidentally-matching credit card photo doesn't get a pass just because the
// metadata lined up.
async function verifyOne(proposal: Proposal): Promise<{ confidence: number; keep: boolean; sensitive: boolean }> {
  const mediaNote = proposal.mediaType === 'video'
    ? 'This is a frame extracted from a video.'
    : 'This is a photo.';

  const privacyNote = `Also screen for privacy: set "contains_sensitive_content" to true if the image shows (in whole or in part, foreground or background) a screenshot of an app/website/text/chat conversation, a credit/debit/bank card, an ID card, passport, driver's license, boarding pass, or any other document or object that exposes personal or financial information. This applies regardless of whether the image otherwise looks like it belongs to the event — that kind of content should never be surfaced as "event evidence."`;

  const task = proposal.matchPreConfirmed
    ? `This photo/video has ALREADY been confidently matched to the event below using its date and location metadata — that judgement is solid, so you do NOT need to re-decide whether it belongs to this event. Just set "is_match" to true and give your honest "confidence" and "detected_category" for logging purposes.

Event (already matched): ${proposal.ticketTitle} — ${proposal.ticketVenue} (${proposal.ticketDate}, ${proposal.ticketCategory})

Your real job here is the privacy screen below — look closely at the actual image content.

${privacyNote}`
    : `Event to verify against:
- Event: ${proposal.ticketTitle}
- Venue: ${proposal.ticketVenue}
- Date: ${proposal.ticketDate}
- Category: ${proposal.ticketCategory}

Does this ${proposal.mediaType === 'video' ? 'video frame' : 'photo'} appear to have been taken at this event or a very similar event of the same type?

${privacyNote}`;

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
            text: `${mediaNote}\n\n${task}\n\nUse the verify_photo_match tool.`,
          },
        ],
      }],
    }),
  });

  if (!res.ok) return { confidence: 0, keep: false, sensitive: false };

  const json = await res.json();
  const toolUse = json.content?.find((b: { type: string }) => b.type === 'tool_use') as
    | { input: { is_match: boolean; confidence: number; contains_sensitive_content?: boolean } }
    | undefined;

  if (!toolUse) return { confidence: 0, keep: false, sensitive: false };

  const confidence = toolUse.input.confidence ?? 0;
  const sensitive = toolUse.input.contains_sensitive_content === true;
  // Videos get a small bonus — harder to fake event context
  const adjustedConfidence = proposal.mediaType === 'video'
    ? Math.min(confidence + 0.05, 1.0)
    : confidence;

  // Pre-confirmed matches keep their metadata-earned spot — no confidence floor
  // re-applied here. Everything else still needs to clear the usual confidence bar.
  // Sensitive content is an unconditional reject either way.
  const keep = (proposal.matchPreConfirmed === true || adjustedConfidence >= 0.35) && !sensitive;

  return { confidence: adjustedConfidence, keep, sensitive };
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
    const { confidence, keep, sensitive } = await verifyOne(proposal);
    if (sensitive) {
      console.log(`Rejected proposal ${proposal.proposalId} — flagged as sensitive personal content (screenshot/card/ID/document)`);
    }

    await supabaseAdmin
      .from('photo_match_proposals')
      .update({
        ai_verified: true,
        ai_confidence: confidence,
        // Auto-reject low-confidence proposals AND anything flagged as sensitive/personal content
        ...(keep ? {} : { status: 'rejected' }),
      })
      .eq('id', proposal.proposalId)
      .eq('user_id', user.id);

    if (keep) verified++;
    else rejected++;
  }

  return new Response(JSON.stringify({ verified, rejected }), { status: 200, headers: HEADERS });
});
