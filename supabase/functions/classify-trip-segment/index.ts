import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const HEADERS = { 'Content-Type': 'application/json' };
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

const CLASSIFY_TOOL = {
  name: 'classify_trip',
  description: 'Classify a group of photos taken at the same location during a trip',
  input_schema: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'City and country/state (e.g., "New York City, NY" or "Paris, France")',
      },
      visual_evidence: {
        type: 'string',
        description: 'REQUIRED whenever no GPS is provided: name the SPECIFIC landmark, sign, storefront text, license plate, language/script, or other concrete visual detail that lets you pin down the location (e.g., "Eiffel Tower visible in background", "street sign reads Rue de Rivoli", "temple entrance sign in Hindi reads...", "double-decker buses and red phone booth"). Generic scenery — mountains, beaches, forests, generic temples/streets/skylines — is NOT sufficient evidence on its own. Leave this empty if you have no such evidence.',
      },
      suggested_title: {
        type: 'string',
        description: 'Short title for this trip segment (e.g., "NYC Trip" or "Paris Vacation")',
      },
      category: {
        type: 'string',
        enum: ['trip', 'concert', 'festival', 'sports', 'other'],
        description: 'Best category. Use "trip" for travel/vacation, specific categories if clearly identifiable.',
      },
      confidence: {
        type: 'number',
        description: 'Confidence 0.0-1.0 in this classification',
      },
      is_event_worthy: {
        type: 'boolean',
        description: 'True if this cluster of photos represents a meaningful event/trip worth creating a ticket for',
      },
      contains_sensitive_content: {
        type: 'boolean',
        description: "True if THIS representative photo is itself a screenshot (of an app, website, or text/chat conversation), a credit/debit/bank card, an ID card, passport, driver's license, boarding pass, or any other document/object exposing personal or financial information — rather than an actual travel/event scene. False for an ordinary travel photo.",
      },
    },
    required: ['location', 'suggested_title', 'category', 'confidence', 'is_event_worthy', 'contains_sensitive_content'],
  },
};

const CATEGORY_TINTS: Record<string, string> = {
  concert:  '#FAC775',
  sports:   '#E8581A',
  festival: '#FFCBA4',
  trip:     '#A8E6D3',
  other:    '#b0b8e0',
};

const CATEGORY_IMAGES: Record<string, string> = {
  concert:  'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400&q=85',
  sports:   'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=400&q=85',
  festival: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=400&q=85',
  trip:     'https://images.unsplash.com/photo-1488085061387-422e29b40080?w=400&q=85',
  other:    'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400&q=85',
};

// Hedge / uncertainty language in the final "location" string is a tell that Claude is
// guessing rather than identifying — e.g. "Alpine region, likely Switzerland or Austria"
// slipped through the visual_evidence length check because the hedge text padded it past
// 8 characters. If Claude isn't sure enough to commit to ONE place, we shouldn't either.
const HEDGE_PATTERN = /\b(likely|probably|possibly|maybe|perhaps|presumably|allegedly|appears? to be|looks? like|seems? to be|might be|could be|may be|not sure|hard to tell|unclear|unconfirmed|uncertain|guess(?:ing)?|or\s+(?:maybe|perhaps))\b/i;

// "visual_evidence" that just rationalizes a guess from generic style/vibe — rather than
// pointing at one concrete, readable, place-specific thing — is the exact failure mode
// that let "Indore, India" through twice (a generic temple "looks Indian" is not proof
// it's in Indore). Require the evidence to read like a specific, namable detail, not a
// description of a general style/category/typical-of-region impression.
const GENERIC_EVIDENCE_PATTERN = /\b(typical|style|common(?:ly)?|similar to|resembles?|characteristic of|reminds? (?:me )?of|consistent with|in the style of|architecture (?:typical|common|suggests?|indicates?)|suggests? (?:a |an )?(?:indian|hindu|asian|european|alpine|mountain))\b/i;

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

  let body: {
    imageBase64: string;
    mimeType: string;
    gpsLat: number | null;
    gpsLng: number | null;
    dateFrom: string;
    dateTo: string;
    photoCount: number;
    stops?: string[];
    scanJobId?: string;
    deviceAssetIds?: string[];
  };

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid body' }), { status: 400, headers: HEADERS });
  }

  // Audit finding ("and also there are many trips in those remaining 3000 photos" — a
  // direct DB check found two separate scans each producing a "Goa Beach Trip" card
  // that named the EXACT SAME 21 photos): unlike photo_match_proposals (which has a
  // dedup unique index on user+asset+ticket), nothing stopped the same underlying photo
  // cluster from minting a brand-new pending_imports row every time a later scan
  // re-clustered and re-classified it — buildTripClusters' output isn't byte-identical
  // run to run, so the existing-row check would need to be fuzzy anyway. Compare the
  // RAW cluster membership (available before we even call the AI — saving the Haiku
  // cost on every re-detection too): if most of these photos already belong to a trip
  // card this user is sitting on — still pending review, or already approved into a
  // ticket — this is a re-detection, not a new discovery. Skip it.
  if (body.deviceAssetIds?.length) {
    const { data: existingRows } = await supabaseAdmin
      .from('pending_imports')
      .select('raw_data')
      .eq('user_id', user.id)
      .eq('source', 'photo')
      .in('status', ['pending', 'approved']);

    const newSet = new Set(body.deviceAssetIds);
    for (const row of existingRows ?? []) {
      const existingIds = (row.raw_data as { device_asset_ids?: unknown } | null)?.device_asset_ids;
      if (!Array.isArray(existingIds) || !existingIds.length) continue;
      const overlap = existingIds.filter((id) => typeof id === 'string' && newSet.has(id)).length;
      const denom = Math.min(existingIds.length, newSet.size);
      if (denom > 0 && overlap / denom >= 0.5) {
        console.log(`Skipped duplicate trip cluster — ${overlap}/${denom} photos already in an existing card`);
        return new Response(JSON.stringify({ created: false, duplicate: true }), { status: 200, headers: HEADERS });
      }
    }
  }

  const stopsNote = body.stops?.length
    ? `The user traveled to multiple locations: ${body.stops.join(' → ')}.`
    : '';

  const hasGps = typeof body.gpsLat === 'number' && typeof body.gpsLng === 'number';
  const gpsNote = hasGps
    ? `near GPS coordinates (${body.gpsLat!.toFixed(4)}, ${body.gpsLng!.toFixed(4)})`
    : `(no GPS data available for this cluster)`;

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
      tools: [CLASSIFY_TOOL],
      tool_choice: { type: 'any' },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: body.mimeType, data: body.imageBase64 } },
          {
            type: 'text',
            text: `This is a representative photo from a cluster of ${body.photoCount} photos taken between ${body.dateFrom} and ${body.dateTo} ${gpsNote}. ${stopsNote}

Classify this photo cluster using the classify_trip tool.

Also screen for privacy: set "contains_sensitive_content" to true if THIS representative photo is itself a screenshot (of an app/website/conversation), a credit/debit/bank card, an ID card, passport, driver's license, boarding pass, or any other document/object exposing personal or financial information — rather than an actual travel/event scene. A card or screenshot should never become the cover image of a trip card.

${hasGps
  ? `Identify the specific city and country/state using the image content together with the GPS coordinates given above.`
  : `IMPORTANT — there is NO GPS data for this cluster. You may ONLY name a specific city/country if you can point to a concrete, distinguishing visual detail in the "visual_evidence" field — a famous landmark, readable signage/text, a license plate, a distinctive flag, architecture unique to one place, etc. Generic scenery (mountains, beaches, forests, a temple, a city skyline, a hiking trail) looks similar across many countries and is NOT enough to name a specific city — guessing one is worse than not creating a card at all.

HIGH-RISK CATEGORIES — be EXTRA skeptical of yourself here, because these are exactly the kinds of images that tempt a confident-sounding but WRONG specific guess: temples, shrines, mosques, churches and other religious/devotional sites; mountains, valleys, and alpine scenery; beaches, lakes, and waterfalls; generic city skylines and streets. A temple with no readable signage could be in India, Nepal, Thailand, Indonesia, or a dozen other countries — do NOT default to a specific Indian city (or any other specific city) just because the architecture "looks like" somewhere. The same goes for snowy mountains — they could be the Alps, the Rockies, the Himalayas, or the Andes. If the cluster falls into one of these high-risk categories and you lack a specific landmark/sign/text to point to, name only the broad region or country (or nothing) and set "location" generically — never a specific city.

Also: if you find yourself wanting to write words like "likely", "probably", "possibly", "maybe", "appears to be", or list multiple alternative places ("X or Y") in the location field — STOP. That hedging means you don't actually know, and the location field will be rejected. In that case either commit to a genuinely confident, evidenced answer, name only a broad region/country, or set is_event_worthy to false. Do not invent or hedge a city name to sound confident.`}`,
          },
        ],
      }],
    }),
  });

  if (!res.ok) {
    return new Response(JSON.stringify({ error: 'AI service error' }), { status: 500, headers: HEADERS });
  }

  const json = await res.json();
  const toolUse = json.content?.find((b: { type: string }) => b.type === 'tool_use') as
    | { input: { location: string; visual_evidence?: string; suggested_title: string; category: string; confidence: number; is_event_worthy: boolean; contains_sensitive_content?: boolean } }
    | undefined;

  if (!toolUse?.input.is_event_worthy) {
    return new Response(JSON.stringify({ created: false }), { status: 200, headers: HEADERS });
  }

  // Same audit finding as verify-photos ("exclude screenshots/credit cards/debit
  // cards/or anyother personal things from finding"): the representative photo sent
  // here becomes the COVER IMAGE of an entire trip card shown to the user. Reject the
  // whole cluster outright if it's a screenshot/card/ID/document — rather than mint a
  // trip titled "Goa Beach Trip" fronted by a photo of someone's debit card.
  if (toolUse.input.contains_sensitive_content) {
    console.log('Rejected trip cluster — representative photo flagged as sensitive personal content (screenshot/card/ID/document)');
    return new Response(JSON.stringify({ created: false }), { status: 200, headers: HEADERS });
  }

  const { location, suggested_title, category, confidence, visual_evidence } = toolUse.input;

  // Reject vague or unknown locations
  if (!location || location.includes('<UNKNOWN>') || location.toLowerCase() === 'unknown') {
    return new Response(JSON.stringify({ created: false }), { status: 200, headers: HEADERS });
  }

  // Reject hedged/uncertain location strings outright — e.g. "Alpine region, likely
  // Switzerland or Austria" slipped past the visual_evidence length check because the
  // hedge text itself was long enough to count as "evidence". A location Claude isn't
  // sure enough to commit to is exactly the kind of guess that creates false memories
  // ("ive never visited switzerland or indore").
  if (HEDGE_PATTERN.test(location)) {
    console.log(`Rejected hedged location guess "${location}"`);
    return new Response(JSON.stringify({ created: false }), { status: 200, headers: HEADERS });
  }

  // Without GPS, a specific city/country claim is just a guess unless Claude can point to
  // concrete visual proof (landmark, signage, etc). Generic scenery (mountains, temples,
  // beaches) looks similar worldwide — Claude was hallucinating plausible-sounding cities
  // (e.g. "Engelberg, Switzerland" for generic mountain photos, "Indore, India" for a generic
  // temple) when given only visual cues, TWICE for "Indore" across independent scans — a
  // sign that a short, padded "evidence" string isn't enough of a bar. Require evidence
  // that (a) clears a real length floor and (b) reads like a specific, namable detail
  // rather than a "this style is typical of region X" rationalization.
  if (!hasGps) {
    const evidence = (visual_evidence ?? '').trim();
    if (evidence.length < 20) {
      console.log(`Rejected no-GPS location guess "${location}" — visual_evidence too short ("${evidence}")`);
      return new Response(JSON.stringify({ created: false }), { status: 200, headers: HEADERS });
    }
    if (GENERIC_EVIDENCE_PATTERN.test(evidence)) {
      console.log(`Rejected no-GPS location guess "${location}" — visual_evidence reads as a generic style rationalization, not a concrete detail ("${evidence}")`);
      return new Response(JSON.stringify({ created: false }), { status: 200, headers: HEADERS });
    }
  }

  // Format date range for display
  const dateDisplay = body.dateFrom === body.dateTo ? body.dateFrom : `${body.dateFrom} – ${body.dateTo}`;

  // Cap displayed confidence lower for no-GPS identifications — even with named visual
  // evidence, a single-photo visual ID is inherently less certain than GPS-confirmed location.
  const confidenceCap = hasGps ? 0.85 : 0.65;

  // Insert into pending_imports for user review
  const { error: insertErr } = await supabaseAdmin.from('pending_imports').insert({
    user_id:    user.id,
    source:     'photo',
    status:     'pending',
    confidence: Math.min(confidence, confidenceCap),
    raw_data: {
      title:     suggested_title,
      venue:     location,
      date:      body.dateFrom,
      time:      null,
      seat:      null,
      category:  category ?? 'trip',
      tint:      CATEGORY_TINTS[category] ?? '#A8E6D3',
      image_url: CATEGORY_IMAGES[category] ?? CATEGORY_IMAGES.trip,
      subject:   `Photo Library Scan — ${dateDisplay} · ${body.photoCount} photos`,
      scan_job_id: body.scanJobId ?? null,
      trip_stops: body.stops ?? null,
      device_asset_ids: body.deviceAssetIds ?? null,
    },
  });

  if (insertErr) {
    console.error('Insert error:', insertErr.message);
    return new Response(JSON.stringify({ error: 'Failed to save' }), { status: 500, headers: HEADERS });
  }

  return new Response(
    JSON.stringify({ created: true, location, title: suggested_title, category }),
    { status: 200, headers: HEADERS },
  );
});
