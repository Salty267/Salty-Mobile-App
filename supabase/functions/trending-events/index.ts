const TM_URL = 'https://app.ticketmaster.com/discovery/v2/events.json';

const TINTS: Record<string, string> = {
  concert:  '#FAC775',
  sports:   '#E8581A',
  festival: '#FFCBA4',
  theater:  '#C8B8FF',
  other:    '#b0b8e0',
};

function tmToCategory(segment: string, genre: string): string {
  const s = (segment ?? '').toLowerCase();
  const g = (genre ?? '').toLowerCase();
  if (s === 'music') return g.includes('festival') ? 'festival' : 'concert';
  if (s === 'sports') return 'sports';
  if (s.includes('arts') || s.includes('theatre')) return 'theater';
  return 'other';
}

// Returns null for categories with no Ticketmaster equivalent (dining, trip).
function categoryToTmParams(cat: string): Record<string, string> | null {
  if (cat === 'concert')  return { segmentName: 'Music' };
  if (cat === 'sports')   return { segmentName: 'Sports' };
  if (cat === 'theater')  return { segmentName: 'Arts & Theatre' };
  if (cat === 'festival') return { segmentName: 'Music', genreName: 'Music Festival' };
  if (cat === 'dining' || cat === 'trip') return null;
  return {}; // all / unfiltered
}

function bestImage(images: any[]): string | null {
  if (!images?.length) return null;
  const sixteenNine = images
    .filter(i => i.ratio === '16_9' && i.url)
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return sixteenNine[0]?.url ?? images.find(i => i.url)?.url ?? null;
}

function fmtTime(localTime?: string): string | undefined {
  if (!localTime) return undefined;
  const [hh, mm] = localTime.split(':').map(Number);
  if (isNaN(hh) || isNaN(mm)) return undefined;
  const period = hh >= 12 ? 'PM' : 'AM';
  const h12 = ((hh + 11) % 12) + 1;
  return `${h12}:${String(mm).padStart(2, '0')} ${period}`;
}

const HEADERS = { 'Content-Type': 'application/json' };
const empty   = () => new Response(JSON.stringify({ events: [] }), { status: 200, headers: HEADERS });

Deno.serve(async (req) => {
  const tmKey = Deno.env.get('TICKETMASTER_API_KEY');
  if (!tmKey) return empty();

  let body: {
    zipCode?: string;
    city?: string;
    countryCode?: string;
    category?: string | null;
    limit?: number;
  } = {};
  try { body = await req.json(); } catch { /* empty body → worldwide, all categories */ }

  const { zipCode, city, countryCode, category, limit = 12 } = body;

  // Resolve app category → TM params
  const appCat = category && category !== 'all' ? category : null;
  const catParams = appCat ? categoryToTmParams(appCat) : {};
  if (catParams === null) return empty(); // dining / trip: no TM equivalent

  // Build query
  const now = new Date().toISOString().slice(0, 19) + 'Z';
  const qs = new URLSearchParams({
    apikey: tmKey,
    size: String(Math.min(limit, 20)),
    sort: 'date,asc',
    startDateTime: now,
    ...catParams,
  });

  if (zipCode) {
    qs.set('postalCode', zipCode);
    qs.set('radius', '200');
    qs.set('unit', 'miles');
  } else if (city) {
    qs.set('city', city);
    if (countryCode) qs.set('countryCode', countryCode);
  }

  try {
    const resp = await fetch(`${TM_URL}?${qs}`);
    if (!resp.ok) return empty();

    const json = await resp.json();
    const tmEvents: any[] = json._embedded?.events ?? [];

    const events = tmEvents.map(ev => {
      const seg   = ev.classifications?.[0]?.segment?.name ?? '';
      const genre = ev.classifications?.[0]?.genre?.name   ?? '';
      const cat   = tmToCategory(seg, genre);
      return {
        tmId:     ev.id as string,
        key:      ev.id as string,
        title:    (ev.name as string) ?? 'Untitled',
        venue:    ev._embedded?.venues?.[0]?.name ?? '',
        dateStr:  ev.dates?.start?.localDate ?? '',
        timeStr:  fmtTime(ev.dates?.start?.localTime),
        category: cat,
        imageUrl: bestImage(ev.images ?? []),
        tint:     TINTS[cat] ?? '#b0b8e0',
      };
    });

    return new Response(JSON.stringify({ events }), { status: 200, headers: HEADERS });
  } catch {
    return empty();
  }
});
