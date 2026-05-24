const TM_URL = 'https://app.ticketmaster.com/discovery/v2/events';

function tmToCategory(segment: string, genre: string): string {
  const s = (segment ?? '').toLowerCase();
  const g = (genre ?? '').toLowerCase();
  if (s === 'music') return g.includes('festival') ? 'festival' : 'concert';
  if (s === 'sports') return 'sports';
  if (s.includes('arts') || s.includes('theatre')) return 'theater';
  return 'other';
}

function bestImage(images: any[], largest = true): string | null {
  if (!images?.length) return null;
  const sixteenNine = images
    .filter(i => i.ratio === '16_9' && i.url)
    .sort((a, b) => largest ? (b.width ?? 0) - (a.width ?? 0) : (a.width ?? 0) - (b.width ?? 0));
  return sixteenNine[0]?.url ?? images.find(i => i.url)?.url ?? null;
}

function fmtTime(localTime?: string): string {
  if (!localTime) return '';
  const [hh, mm] = localTime.split(':').map(Number);
  if (isNaN(hh) || isNaN(mm)) return '';
  const period = hh >= 12 ? 'PM' : 'AM';
  const h12 = ((hh + 11) % 12) + 1;
  return `${h12}:${String(mm).padStart(2, '0')} ${period}`;
}

const HEADERS = { 'Content-Type': 'application/json' };

Deno.serve(async (req) => {
  const tmKey = Deno.env.get('TICKETMASTER_API_KEY');
  if (!tmKey) {
    return new Response(JSON.stringify({ error: 'Missing API key' }), { status: 500, headers: HEADERS });
  }

  let body: { tmId?: string } = {};
  try { body = await req.json(); } catch {}

  const { tmId } = body;
  if (!tmId) {
    return new Response(JSON.stringify({ error: 'tmId required' }), { status: 400, headers: HEADERS });
  }

  try {
    const resp = await fetch(`${TM_URL}/${encodeURIComponent(tmId)}.json?apikey=${tmKey}`);
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: 'Event not found' }), { status: 200, headers: HEADERS });
    }
    const ev = await resp.json();

    const seg     = ev.classifications?.[0]?.segment?.name  ?? '';
    const genre   = ev.classifications?.[0]?.genre?.name    ?? null;
    const subGenre = ev.classifications?.[0]?.subGenre?.name ?? null;
    const cat     = tmToCategory(seg, genre ?? '');

    const tmVenue = ev._embedded?.venues?.[0];
    const venue = tmVenue ? {
      name:       tmVenue.name ?? '',
      address:    tmVenue.address?.line1 ?? null,
      city:       tmVenue.city?.name ?? null,
      state:      tmVenue.state?.stateCode ?? null,
      country:    tmVenue.country?.name ?? null,
      postalCode: tmVenue.postalCode ?? null,
      lat:        tmVenue.location?.latitude  ? parseFloat(tmVenue.location.latitude)  : null,
      lng:        tmVenue.location?.longitude ? parseFloat(tmVenue.location.longitude) : null,
    } : null;

    const priceRanges = (ev.priceRanges ?? []).map((p: any) => ({
      min:      p.min      ?? 0,
      max:      p.max      ?? 0,
      currency: p.currency ?? 'USD',
    }));

    const attractions = (ev._embedded?.attractions ?? []).map((a: any) => ({
      name:     a.name ?? '',
      imageUrl: bestImage(a.images ?? []),
    }));

    const event = {
      tmId:        ev.id,
      title:       ev.name       ?? '',
      dateStr:     ev.dates?.start?.localDate ?? '',
      rawDate:     ev.dates?.start?.dateTime  ?? '',
      timeStr:     fmtTime(ev.dates?.start?.localTime),
      category:    cat,
      genre,
      subGenre,
      imageUrl:    bestImage(ev.images ?? []),
      thumbUrl:    bestImage(ev.images ?? [], false),
      ticketUrl:   ev.url ?? null,
      info:        ev.info ?? ev.pleaseNote ?? null,
      priceRanges,
      venue,
      attractions,
      status:      ev.dates?.status?.code ?? null,
    };

    return new Response(JSON.stringify({ event }), { status: 200, headers: HEADERS });
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to fetch event' }), { status: 200, headers: HEADERS });
  }
});
