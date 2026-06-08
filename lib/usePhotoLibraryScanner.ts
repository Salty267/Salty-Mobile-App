import { useState, useRef, useCallback } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as ImageManipulator from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';
import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabase/client';
import { haversineKm } from './haversine';
import { parseEventDate } from './parseEventDate';

// ── Constants ─────────────────────────────────────────────────────────────────
const SCAN_STATE_KEY = 'photo_scan_state_v1';
// General fix for "I have to keep manually re-scanning everything to find what was missed
// last time": bump this integer whenever a change to matching/clustering/scoring logic
// could newly surface content a previous run silently missed — e.g. this exact session's
// trio of fixes (MAX_TRIP_CLUSTERS 20→40, the multi-day date-curve overhaul, and the
// TRIP_SEGMENT_GAP_HOURS 12→24 de-fragmentation), and v2's centroid-based GPS clustering
// (see buildTripClusters) which reshapes trip clusters that v1 had already produced and
// surfaced — a stale-version rescan is what lets the corrected, tighter clusters replace
// the old oversized ones instead of being permanently skipped as "already scanned". The
// persisted scan state now carries the version it was written under (see "Determine scan
// window" below); a stale version silently forces the next scan to be a full pass —
// exactly like the existing "DB was cleared" self-heal — so improvements apply themselves
// automatically. Users never have to remember a "scan everything again" button exists;
// incremental scans resume right after that one comprehensive catch-up pass.
// v3: scorePhotoVsTicket's date curve is now asymmetric (a photo can't depict an
// event that hasn't started yet — see "meaningfullyBefore" below) and verify-photos
// is actually reachable again (the re-query that silently broke it for any scan with
// 1000+ medium matches is gone) — both change which proposals get *created* (fewer
// ungrounded date-only guesses) and which survive (AI now genuinely gets a look),
// so existing incremental cursors need to be replayed through the corrected pipeline.
const SCAN_ALGO_VERSION = 3;
const BATCH_SIZE = 200;
// Audit findings ("it is finding different trips/events on every new scan... every time
// it is scanning few items from all the library"): once the cursor settles near "now",
// every later scan's lookback collapses to ~7 days — a sliver of the library — so trip
// discovery (which needs the FULL unmatched pool to produce stable results — see
// dueForFullSweep below) was only ever running by accident, on whatever random subset a
// self-heal reset happened to produce. Forcing a real comprehensive sweep on a
// predictable cadence is what makes scans both fast (incremental stays narrow) AND
// trustworthy (trip discovery gets the complete, consistent view it needs).
const FULL_RESCAN_INTERVAL_MS = 14 * 24 * 3_600_000; // 14 days
const TRIP_CLUSTER_MIN_PHOTOS = 2;
const TRIP_CLUSTER_RADIUS_KM = 50;
// Audit finding: real multi-day trips routinely have a quiet stretch — a slow morning,
// a no-photos travel day, an early night — long enough to exceed 12h. Each time that
// happened, buildTripClusters sliced ONE real trip into multiple independent segments,
// and each fragment then had to separately survive the MAX_TRIP_CLUSTERS rank cut AND
// the AI's is_event_worthy judgment — so a single trip could easily end up "discovered
// but missing half its days" (e.g. day 1 becomes a card, day 3 silently never does).
// Raised 12h → 24h (a full day) so a single quiet day no longer fragments a trip, while
// two genuinely separate outings more than a day apart still split correctly.
const TRIP_SEGMENT_GAP_HOURS = 24;
// Audit finding: a 4017-photo library left ~3.7k photos unmatched to any ticket — and
// buildTripClusters' 24h-gap segmentation + 50km GPS sub-clustering on a pool that size
// very likely yields 50-150+ candidate clusters. But only the top-N by photo count ever
// reach classify-trip-segment for AI evaluation; everything past the cutoff is silently
// dropped before AI ever sees it, even a perfectly legitimate weekend trip or day outing.
// Raised 20 → 40 so meaningfully more real clusters get a chance at review (cost:
// ~$0.0008/cluster in Haiku calls — +20 calls ≈ +$0.016 per full scan, trivial against
// "find as many [event] photos as it can").
const MAX_TRIP_CLUSTERS = 40;
// GPS sampling for unmatched-asset trip clustering: getAssetsAsync never returns
// `location` on iOS, so we probe a sample of assets per time-segment via
// getAssetInfoAsync (a fast on-device call, not network-bound) to give
// buildTripClusters real coordinates to sub-cluster on. Audit finding: with the old
// value of 3, EVERY ONE of the last scan's 11 trip clusters came back with zero GPS —
// 3 probes per segment isn't enough when a meaningful slice of any library (screenshots,
// saved/shared images, indoor shots, GPS-off photos) has no EXIF GPS at all; bad luck on
// 3 draws routinely produced an all-null sample. Raised sampling depth + total budget so
// segments reliably surface real coordinates — which both (a) lets buildTripClusters
// correctly split multi-city trips into separate GPS sub-clusters instead of one mega
// blob, and (b) gives classify-trip-segment real GPS to identify against instead of
// forcing it to guess from pixels alone, which is exactly the guesswork that produced
// the "Switzerland"/"Indore" hallucinations for trips the user never took.
const GPS_SAMPLES_PER_SEGMENT = 10;
const GPS_MAX_TOTAL = 400;

// Single-day events (concerts, sports, one-off shows) get a tight ±36h window —
// photos taken much earlier/later are unlikely to be from the event.
// Trips and festivals routinely span multiple days (a festival's listed date is
// often just the date the ticket was bought/the gates opened, and trips obviously
// cover several days) — a flat ±36h window was silently dropping all of those
// photos to score 0, which is why "Coachella" and similar multi-day tickets were
// matching zero photos despite the user having photos from those dates.
const SINGLE_EVENT_WINDOW_HOURS = 36;
const MULTI_DAY_WINDOW_HOURS = 5 * 24; // ±5 days
// Hoisted to module scope (was a local inside scorePhotoVsTicket) so the future-event
// ticket filter below can share the exact same "how early is too early to count" rule —
// see both use sites for the full rationale.
const PRE_EVENT_GRACE_HOURS = 6;
function isMultiDayCategory(category: string | null | undefined): boolean {
  return category === 'trip' || category === 'festival';
}

export type ScanStateType =
  | 'idle'
  | 'requesting'
  | 'scanning'
  | 'verifying'
  | 'done'
  | 'error';

export interface ScanProgress {
  state: ScanStateType;
  scanned: number;
  total: number;
  matched: number;
  newCandidates: number;
  jobId: string | null;
  limitedAccess: boolean;
  isIncremental: boolean;
}

interface PhotoScanStateStore {
  lastScanCursorMs: number;
  lastFullScanAt: number;
  lastScanJobId: string | null;
  // Optional because states persisted before this field existed won't have it — treated
  // as version 0 (always stale) so existing installs get exactly one auto full-rescan.
  algoVersion?: number;
}

interface TicketForMatch {
  id: string;
  date_str: string | null;
  time_str: string | null;
  venue_lat: number | null;
  venue_lng: number | null;
  category: string;
  title: string | null;
  venue_name: string | null;
}

interface MatchCandidate {
  assetId: string;
  mediaType: 'photo' | 'video';
  creationTimeMs: number;
  lat: number | null;
  lng: number | null;
  localUri: string;
  score: number;
  ticket: TicketForMatch;
}

interface UnmatchedAsset {
  assetId: string;
  mediaType: 'photo' | 'video';
  creationTimeMs: number;
  lat: number | null;
  lng: number | null;
  localUri: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// Reject null island (0°, 0°) — the Gulf of Guinea. iOS returns this when GPS is unavailable.
function isValidGPS(lat: number, lng: number): boolean {
  return !(Math.abs(lat) < 0.5 && Math.abs(lng) < 0.5);
}

function parseTimeStr(timeStr: string | null): { hours: number; minutes: number } | null {
  if (!timeStr) return null;
  const m = timeStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const ampm = m[3]?.toLowerCase();
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  return { hours: h, minutes: min };
}

function scorePhotoVsTicket(
  creationTimeMs: number,
  lat: number | null,
  lng: number | null,
  ticket: TicketForMatch,
): number {
  const date = parseEventDate(ticket.date_str);
  if (!date) return 0;

  const eventDate = new Date(date);
  const time = parseTimeStr(ticket.time_str);
  eventDate.setHours(time?.hours ?? 19, time?.minutes ?? 0, 0, 0);
  const eventMs = eventDate.getTime();

  const diffMs = creationTimeMs - eventMs;
  const diffHours = Math.abs(diffMs) / 3_600_000;
  const multiDay = isMultiDayCategory(ticket.category);
  const maxDiffHours = multiDay ? MULTI_DAY_WINDOW_HOURS : SINGLE_EVENT_WINDOW_HOURS;
  if (diffHours > maxDiffHours) return 0;

  // Audit finding: users reported approved trips (e.g. a multi-day Niagara Falls visit)
  // were still missing most of their own photos. Root cause — this date curve was built
  // for SINGLE-DAY events, where "hours from showtime" is a meaningful signal (a photo
  // 40h before/after a concert probably isn't from it). For a multi-day trip, "hours from
  // the ticket's anchor date" is the wrong question — day 3 of a 4-day trip is just as
  // legitimately "from the trip" as day 1, but was scoring a mere +0.05, which (needing
  // GPS within 2km just to limp over the 0.25 floor) silently failed to match almost
  // every day but the first. Multi-day tickets now get a flat, generous baseline across
  // their WHOLE ±5-day window — every photo from every day clears 0.25 on date alone, so
  // it at least gets a chance at AI-verification + your final approval (this only widens
  // what gets a *chance* to surface; nothing is auto-kept on date score alone).
  //
  // Second audit finding, same curve, opposite edge — two concrete user reports:
  // (1) "a night of love doesnt match the pictures i didnt have any pictures for that
  //     event" — snowy car/driveway photos from 8–11 AM scored 40% against that night's
  //     7 PM concert, because |diffHours| ≈ 8–10h scored the same whether the photo came
  //     BEFORE or after doors. (2) "seattle trip is on 9th june i havent even been to the
  //     trip but it found photos for it" — screenshots taken TODAY (Jun 7) scored 30%
  //     against a flight that doesn't depart until Jun 9, because the ±5-day multi-day
  //     window is symmetric and 44h-before fell in the generous "any other day" bucket.
  // Both are the same logical error: a photo can only depict an event that has already
  // STARTED — there's no such thing as a "trip photo" from two days before departure, or
  // a "concert photo" from that morning's commute. "Hours before" and "hours after" are
  // NOT equally good evidence; only the latter is evidence at all. The one legitimate
  // exception is arriving early (T17: pre-show queue, tailgate, festival camping — people
  // really do show up a few hours ahead) — which the existing ≤6h tier already covers
  // without needing to know which side of the event it falls on. Beyond that grace
  // window, treat "before" as essentially baseline-zero on date alone: let GPS (scored
  // below) be the ONLY thing that can rescue an early-arrival story, instead of letting
  // raw date-coincidence alone wave it through to the review queue.
  // (PRE_EVENT_GRACE_HOURS now lives at module scope — shared with the future-event
  // ticket filter in the scan loop below, which needs the exact same threshold.)
  const meaningfullyBefore = diffMs < 0 && diffHours > PRE_EVENT_GRACE_HOURS;

  let score = 0;
  if (meaningfullyBefore) {
    score += multiDay ? 0.05 : 0.03;
  } else if (multiDay) {
    if (diffHours <= 6)       score += 0.50;
    else if (diffHours <= 36) score += 0.40;
    else                      score += 0.30; // any other day within the trip's ±5-day span (on or after it started)
  } else {
    if (diffHours <= 6)       score += 0.50;
    else if (diffHours <= 18) score += 0.35;
    else if (diffHours <= 36) score += 0.08;
  }

  if (lat != null && lng != null && ticket.venue_lat != null && ticket.venue_lng != null) {
    const dist = haversineKm(lat, lng, ticket.venue_lat, ticket.venue_lng);
    if (dist <= 0.5)       score += 0.40;
    else if (dist <= 2.0)  score += 0.25;
    else if (dist <= 10.0) score += 0.10;
  }

  if (['concert', 'festival', 'sports'].includes(ticket.category)) {
    score += 0.05;
  }

  return Math.min(score, 1.0);
}

function isEveningTime(ms: number): boolean {
  const h = new Date(ms).getHours();
  return h >= 18 || h <= 2;
}

function formatDateForDisplay(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Cluster unmatched assets by GPS proximity (50km) + time segments (12h gaps)
function buildTripClusters(assets: UnmatchedAsset[]): UnmatchedAsset[][] {
  if (!assets.length) return [];

  // Sort by time
  const sorted = [...assets].sort((a, b) => a.creationTimeMs - b.creationTimeMs);

  // Split into travel segments by time gap
  const segments: UnmatchedAsset[][] = [];
  let current: UnmatchedAsset[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const gapHours = (sorted[i].creationTimeMs - sorted[i - 1].creationTimeMs) / 3_600_000;
    if (gapHours > TRIP_SEGMENT_GAP_HOURS) {
      segments.push(current);
      current = [];
    }
    current.push(sorted[i]);
  }
  segments.push(current);

  // Within each segment, sub-cluster by GPS (50km)
  const clusters: UnmatchedAsset[][] = [];
  for (const segment of segments) {
    const withGps = segment.filter(a => a.lat != null && a.lng != null);
    const noGps   = segment.filter(a => a.lat == null || a.lng == null);

    // GPS clustering — group by proximity, but defer the size check until after we've
    // tried to fold in nearby no-GPS items below (a 1-photo GPS cluster + 2 folded-in
    // no-GPS photos from the same stop is a real, groundable cluster; checking the
    // threshold here would have discarded it before it had the chance to qualify).
    const gpsClusters: UnmatchedAsset[][] = [];
    const gpsAssigned = new Set<number>();
    for (let i = 0; i < withGps.length; i++) {
      if (gpsAssigned.has(i)) continue;
      const cluster: UnmatchedAsset[] = [withGps[i]];
      gpsAssigned.add(i);
      // Audit finding ("...it found 1005 photos for a few the location doesn't match" +
      // reproduced 102-photo "Washington DC Visit"): membership was judged against the
      // cluster's seed point only. That lets a chain of borderline (~50km) hops drag the
      // cluster far past TRIP_CLUSTER_RADIUS_KM from where it started — e.g. a DC-area
      // seed admits a point 45km out, which admits one 45km past THAT, and now a photo
      // 90km from the seed (a different city entirely) is bucketed into "Washington DC
      // Visit" purely by chained proximity. Comparing against the running centroid
      // instead keeps every member within ~TRIP_CLUSTER_RADIUS_KM of the cluster's
      // actual geographic middle, so the representative photo classify-trip-segment
      // picks — and the single location name it returns — genuinely describes every
      // member instead of just whichever asset happened to be chronologically first.
      let centroidLat = withGps[i].lat!;
      let centroidLng = withGps[i].lng!;
      for (let j = i + 1; j < withGps.length; j++) {
        if (gpsAssigned.has(j)) continue;
        const dist = haversineKm(centroidLat, centroidLng, withGps[j].lat!, withGps[j].lng!);
        if (dist <= TRIP_CLUSTER_RADIUS_KM) {
          cluster.push(withGps[j]);
          gpsAssigned.add(j);
          // Incremental running mean — O(1) per admission, no re-scan of the cluster.
          centroidLat += (withGps[j].lat! - centroidLat) / cluster.length;
          centroidLng += (withGps[j].lng! - centroidLng) / cluster.length;
        }
      }
      gpsClusters.push(cluster);
    }

    // No-GPS items that share a segment with real GPS clusters are very likely from
    // the same trip leg as whichever cluster they're chronologically nearest to — they
    // already passed the TRIP_SEGMENT_GAP_HOURS test to be grouped into this segment at
    // all. Folding them in (a) recovers photos that would otherwise be dropped from a
    // real, locatable cluster (directly serves "find as many photos as it can"), and
    // (b) stops them from forming a second, location-less "blob" cluster alongside a
    // perfectly good GPS-grounded one for the same stop — exactly the kind of
    // ungrounded cluster that forces classify-trip-segment to guess from pixels alone
    // and produces hallucinated trips like "Switzerland"/"Indore". Only items with no
    // reasonably-close GPS cluster fall back to forming their own blob.
    const orphanedNoGps: UnmatchedAsset[] = [];
    if (gpsClusters.length) {
      const ranges = gpsClusters.map(cluster => ({
        cluster,
        min: Math.min(...cluster.map(a => a.creationTimeMs)),
        max: Math.max(...cluster.map(a => a.creationTimeMs)),
      }));
      for (const item of noGps) {
        let best: typeof ranges[number] | null = null;
        let bestGapMs = Infinity;
        for (const r of ranges) {
          const gapMs = item.creationTimeMs < r.min ? r.min - item.creationTimeMs
                      : item.creationTimeMs > r.max ? item.creationTimeMs - r.max
                      : 0;
          if (gapMs < bestGapMs) { bestGapMs = gapMs; best = r; }
        }
        if (best && bestGapMs <= TRIP_SEGMENT_GAP_HOURS * 3_600_000) {
          best.cluster.push(item);
        } else {
          orphanedNoGps.push(item);
        }
      }
    } else {
      orphanedNoGps.push(...noGps);
    }

    for (const cluster of gpsClusters) {
      if (cluster.length >= TRIP_CLUSTER_MIN_PHOTOS) clusters.push(cluster);
    }
    // Remaining no-GPS assets that couldn't be tied to any real-GPS cluster — last-resort
    // location-less bucket so classify-trip-segment at least sees the photos exist (it
    // will fall back to visual-only identification, gated by the v7 hedge / generic-
    // evidence guardrails so it can't silently hallucinate a specific place from them).
    if (orphanedNoGps.length >= TRIP_CLUSTER_MIN_PHOTOS) {
      clusters.push(orphanedNoGps);
    }
  }

  return clusters;
}

// Pick the highest-resolution asset as cluster representative
function bestRepresentative(assets: UnmatchedAsset[], mediaAssets: Map<string, MediaLibrary.Asset>): UnmatchedAsset {
  let best = assets[0];
  let bestPixels = 0;
  for (const a of assets) {
    const ma = mediaAssets.get(a.assetId);
    if (ma) {
      const px = (ma.width ?? 0) * (ma.height ?? 0);
      if (px > bestPixels) { bestPixels = px; best = a; }
    }
  }
  return best;
}

async function getBase64Thumbnail(localUri: string): Promise<string | null> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      localUri,
      [{ resize: { width: 400 } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    return result.base64 ?? null;
  } catch {
    return null;
  }
}

async function getVideoThumbnailBase64(localUri: string): Promise<string | null> {
  try {
    const { uri } = await VideoThumbnails.getThumbnailAsync(localUri, { time: 1000 });
    return await getBase64Thumbnail(uri);
  } catch {
    return null;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function usePhotoLibraryScanner(options?: { singleTicketId?: string }) {
  const [progress, setProgress] = useState<ScanProgress>({
    state: 'idle',
    scanned: 0,
    total: 0,
    matched: 0,
    newCandidates: 0,
    jobId: null,
    limitedAccess: false,
    isIncremental: false,
  });
  const cancelRef = useRef(false);

  const update = useCallback((patch: Partial<ScanProgress>) => {
    setProgress(prev => ({ ...prev, ...patch }));
  }, []);

  const startScan = useCallback(async (opts?: { forceFullScan?: boolean; singleTicketId?: string }) => {
    cancelRef.current = false;

    // Resolve "single ticket" mode from EITHER source a caller might use:
    //  - a FIXED ticket the hook itself was instantiated with (the "Find Photos"
    //    button on event-details — one ticket for that component's whole life), or
    //  - a ticket THIS SPECIFIC CALL asks to target (the auto follow-up scan fired
    //    right after approving a brand-new trip/event card in photo-scan-review.tsx
    //    — a different ticket every time, known only once the ticket is created,
    //    from a hook instance that has no fixed ticket of its own).
    // Every singleTicketId branch below reads this one resolved value, so both
    // call shapes share the exact same narrow-window code path and guarantees.
    const targetTicketId = options?.singleTicketId ?? opts?.singleTicketId;

    update({ state: 'requesting', scanned: 0, total: 0, matched: 0, newCandidates: 0, jobId: null, isIncremental: false });

    // ── Permission ────────────────────────────────────────────────────────────
    const { status, accessPrivileges } = await MediaLibrary.requestPermissionsAsync();
    if (status === 'denied') {
      Alert.alert(
        'Photo Access Required',
        'Please go to Settings → Privacy → Photos and allow Salty to access your photo library.',
        [
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      update({ state: 'idle' });
      return;
    }

    const isLimited = accessPrivileges === 'limited' || status === 'limited' as MediaLibrary.PermissionStatus;
    if (isLimited) {
      update({ limitedAccess: true });
    }

    update({ state: 'scanning' });

    // ── Load session ──────────────────────────────────────────────────────────
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { update({ state: 'error' }); return; }

    // ── Load tickets ──────────────────────────────────────────────────────────
    let ticketsQuery = supabase
      .from('tickets')
      .select('id, date_str, time_str, venue_lat, venue_lng, category, title, venue_name')
      .eq('status', 'active')
      .not('date_str', 'is', null);

    if (targetTicketId) {
      ticketsQuery = ticketsQuery.eq('id', targetTicketId);
    }

    const { data: allTickets } = await ticketsQuery;
    if (!allTickets?.length) { update({ state: 'done' }); return; }

    // Audit finding ("why is it scanning for the photos for the events that are going to
    // happen in future than the scan date&time" — confirmed live: a "Philadelphia →
    // Seattle" trip departing TOMORROW had already produced a 95%-AI-"verified" photo
    // proposal from a screenshot taken yesterday): an event that HASN'T HAPPENED YET
    // cannot be depicted in any photo on the device — full stop. Yet the unfiltered
    // ticket list kept every future event live as a candidate for every photo in the
    // library, for the entire window between "ticket created" and "event occurs" (days,
    // sometimes months). scorePhotoVsTicket's asymmetric curve already discounts "photo
    // before event" heavily — but a photo within PRE_EVENT_GRACE_HOURS of a near-future
    // start can still legitimately score (T17: arrived early). Reusing that exact same
    // grace window here keeps that one legitimate case intact while dropping every other
    // not-yet-started event from the candidate list outright — eliminating false "trip
    // photos" for trips that haven't happened AND speeding up every scan (one fewer
    // ticket to score per photo for each upcoming event).
    const tickets = (allTickets as TicketForMatch[]).filter(t => {
      const d = parseEventDate(t.date_str);
      if (!d) return true; // unparseable date — can't judge past/future, keep prior behavior
      const time = parseTimeStr(t.time_str);
      d.setHours(time?.hours ?? 19, time?.minutes ?? 0, 0, 0);
      return d.getTime() <= Date.now() + PRE_EVENT_GRACE_HOURS * 3_600_000;
    });
    if (!tickets.length) { update({ state: 'done' }); return; }

    // Precompute per-ticket match windows (used for GPS fetch decisions). Trips/festivals
    // get a wider ±5-day window to match scorePhotoVsTicket — otherwise we'd never fetch
    // GPS for photos that scorePhotoVsTicket considers "in range" but outside ±36h.
    const ticketWindows = tickets.reduce((acc, t) => {
      const d = parseEventDate(t.date_str);
      if (!d) return acc;
      const time = parseTimeStr(t.time_str);
      d.setHours(time?.hours ?? 19, time?.minutes ?? 0, 0, 0);
      const windowHours = isMultiDayCategory(t.category) ? MULTI_DAY_WINDOW_HOURS : SINGLE_EVENT_WINDOW_HOURS;
      acc.push({ start: d.getTime() - windowHours * 3_600_000, end: d.getTime() + windowHours * 3_600_000 });
      return acc;
    }, [] as { start: number; end: number }[]);

    // ── Geocode missing venues (non-blocking) ─────────────────────────────────
    const needsGeocode = tickets
      .filter(t => t.venue_lat == null && t.venue_name)
      .map(t => t.id);
    if (needsGeocode.length) {
      supabase.functions.invoke('geocode-venues', {
        body: { ticketIds: needsGeocode.slice(0, 20) },
      }).then(({ data }) => {
        // Update in-memory ticket list with any geocoded results
        if (data?.updated > 0) {
          supabase
            .from('tickets')
            .select('id, venue_lat, venue_lng')
            .in('id', needsGeocode)
            .then(({ data: refreshed }) => {
              if (refreshed) {
                refreshed.forEach((r: { id: string; venue_lat: number; venue_lng: number }) => {
                  const t = tickets.find(x => x.id === r.id);
                  if (t) { t.venue_lat = r.venue_lat; t.venue_lng = r.venue_lng; }
                });
              }
            });
        }
      }).catch(() => {});
    }

    // ── Create scan job ───────────────────────────────────────────────────────
    const { data: jobRow } = await supabase
      .from('photo_scan_jobs')
      .insert({ user_id: session.user.id, status: 'running', consent_given: true })
      .select('id')
      .single();
    const jobId = jobRow?.id ?? null;
    update({ jobId });

    // ── Load already-processed asset IDs ─────────────────────────────────────
    // "Already handled, never propose again" has TWO independent sources, and
    // both must be honored or already-linked photos resurface as fake "new
    // discoveries":
    //  (a) photo_match_proposals the user explicitly approved/rejected through
    //      the review screen — the path this query originally covered, and
    //  (b) device_asset_ids already sitting directly in `photos` — e.g. approving
    //      a discovered trip/event card auto-links its ENTIRE photo cluster
    //      straight into `photos` in one shot (see handleApproveImport in
    //      photo-scan-review.tsx), completely bypassing photo_match_proposals.
    //      Without also checking `photos` here, every one of those already-in-
    //      the-gallery photos looks "unprocessed" to the matcher, gets re-scored
    //      against its own (now-existing) ticket — and scores great, because
    //      it's a real match — then resurfaces as a pile of "47 new matches
    //      found!" for photos the user already has. That's the exact kind of
    //      noisy self-repetition this whole self-healing effort exists to kill,
    //      just relocated from "you re-scanning" to "the system re-asking."
    const [{ data: processedRows }, { data: linkedRows }] = await Promise.all([
      supabase
        .from('photo_match_proposals')
        .select('device_asset_id')
        .eq('user_id', session.user.id)
        .in('status', ['approved', 'rejected']),
      supabase
        .from('photos')
        .select('device_asset_id')
        .eq('user_id', session.user.id)
        .not('device_asset_id', 'is', null),
    ]);
    const processedSet = new Set<string>([
      ...(processedRows?.map((r: { device_asset_id: string }) => r.device_asset_id) ?? []),
      ...(linkedRows?.map((r: { device_asset_id: string | null }) => r.device_asset_id).filter((id): id is string => !!id) ?? []),
    ]);

    // ── Determine scan window ─────────────────────────────────────────────────
    const stateJson = await SecureStore.getItemAsync(SCAN_STATE_KEY).catch(() => null);
    const scanState: PhotoScanStateStore | null = stateJson ? JSON.parse(stateJson) : null;

    // Force full rescan: wipe cursor so all photos are re-evaluated (already-approved ones are still skipped via processedSet)
    if (opts?.forceFullScan) {
      await SecureStore.deleteItemAsync(SCAN_STATE_KEY).catch(() => {});
    }

    let lookbackMs = 0; // full scan by default
    if (!targetTicketId && !opts?.forceFullScan && scanState?.lastScanCursorMs) {
      // Self-heal into a full re-scan — no user action required — whenever trusting the
      // incremental cursor would mean missing things we now know how to find:
      //  (a) DB was cleared (no processed assets) → SecureStore state is stale, or
      //  (b) the matching/clustering algorithm moved on since this cursor was saved →
      //      photos that scored too low / got clustered-and-cut / fragmented under the
      //      OLD logic deserve one fresh comprehensive look under the NEW logic. This is
      //      the general fix for "why do I have to keep finding the rescan button" — any
      //      future algorithm improvement (bump SCAN_ALGO_VERSION) now applies itself on
      //      the very next scan, automatically, then settles back into fast incrementals, or
      //  (c) it's been a while since the last comprehensive look — see dueForFullSweep.
      const staleAlgo = (scanState.algoVersion ?? 0) < SCAN_ALGO_VERSION;
      // Audit findings ("it is finding different trips/events on every new scan. Not
      // finding them in the first scan" + "every time it is scanning few items from all
      // the library in every new scan"): once the first full scan completes,
      // lastScanCursorMs sits near "now" forever after, so EVERY later scan's lookback
      // collapses to the same ~7-day sliver — a few dozen photos out of thousands (≈
      // "scanning few items"). Trip discovery (gated to full sweeps just below, at the
      // buildTripClusters call) was therefore only running by accident, whenever (a) or
      // (b) above happened to reset the cursor — each reset handing buildTripClusters a
      // DIFFERENT random subset of the library to partition, hence different "trips"
      // surfacing each time (≈ "finding different trips on every new scan", and exactly
      // what classify-trip-segment's own dedup comment calls out: "buildTripClusters'
      // output isn't byte-identical run to run"). Forcing a real full sweep on a
      // predictable cadence — not just when chance happens to trigger one — is what
      // makes incremental scans stay fast AND honest about being narrow, while trip
      // discovery gets the single, complete, consistent view it needs for stable results.
      const dueForFullSweep = Date.now() - (scanState.lastFullScanAt ?? 0) > FULL_RESCAN_INTERVAL_MS;
      if (processedSet.size === 0 || staleAlgo || dueForFullSweep) {
        await SecureStore.deleteItemAsync(SCAN_STATE_KEY).catch(() => {});
      } else {
        lookbackMs = scanState.lastScanCursorMs - 7 * 24 * 3_600_000;
        update({ isIncremental: true });
      }
    }

    // For single-ticket mode ("Find Photos" on event-details): scan a window around
    // the event date. Trips/festivals get the same wider ±5-day window as the main
    // matcher — an ±18h window would miss most of a multi-day trip's photos.
    let singleTicketWindowStart: number | null = null;
    let singleTicketWindowEnd: number | null = null;
    if (targetTicketId && tickets[0]) {
      const t = tickets[0];
      const d = parseEventDate(t.date_str);
      if (d) {
        const time = parseTimeStr(t.time_str);
        d.setHours(time?.hours ?? 19, time?.minutes ?? 0, 0, 0);
        const windowHours = isMultiDayCategory(t.category) ? MULTI_DAY_WINDOW_HOURS : 18;
        singleTicketWindowStart = d.getTime() - windowHours * 3_600_000;
        singleTicketWindowEnd   = d.getTime() + windowHours * 3_600_000;
      }
    }

    // ── Scan assets ───────────────────────────────────────────────────────────
    const highBuf: MatchCandidate[] = [];
    const mediumBuf: MatchCandidate[] = [];
    const unmatchedBuf: UnmatchedAsset[] = [];
    const mediaAssetMap = new Map<string, MediaLibrary.Asset>();

    let cursor: string | undefined = undefined;
    let totalEstimate = 0;
    let scanned = 0;
    let latestCursorMs = scanState?.lastScanCursorMs ?? 0;

    try {
      do {
        if (cancelRef.current) break;

        const result: MediaLibrary.PagedInfo<MediaLibrary.Asset> = await MediaLibrary.getAssetsAsync({
          mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
          sortBy: [[MediaLibrary.SortBy.creationTime, false]], // newest first
          first: BATCH_SIZE,
          ...(cursor ? { after: cursor } : {}),
        });

        if (!totalEstimate) {
          // In incremental mode we don't know the window size upfront — show 0 so UI hides the denominator
          totalEstimate = lookbackMs > 0 ? 0 : result.totalCount;
          update({ total: totalEstimate });

          // Update job total (always store real library count for analytics)
          if (jobId) {
            supabase.from('photo_scan_jobs').update({ total_assets: result.totalCount }).eq('id', jobId).then(() => {});
          }
        }

        for (const asset of result.assets) {
          if (cancelRef.current) break;

          const creationMs = asset.creationTime;

          // Lookback cutoff check
          if (!targetTicketId && lookbackMs > 0 && creationMs < lookbackMs) {
            // Older than our window — stop scanning (sorted newest-first)
            cursor = undefined;
            break;
          }

          // Single-ticket window check
          if (singleTicketWindowStart != null && singleTicketWindowEnd != null) {
            if (creationMs < singleTicketWindowStart || creationMs > singleTicketWindowEnd) {
              scanned++;
              continue;
            }
          }

          // Skip already processed
          if (processedSet.has(asset.id)) { scanned++; continue; }

          // Track latest cursor for incremental state
          if (creationMs > latestCursorMs) latestCursorMs = creationMs;

          // Get full info for GPS + localUri.
          // asset.location from getAssetsAsync is null on iOS; getAssetInfoAsync
          // is needed on both platforms. Limit full-info calls to assets within a
          // ticket window (GPS useful for scoring) or when access is limited (small set).
          let lat: number | null = null;
          let lng: number | null = null;
          let localUri = asset.uri;

          if (asset.location) {
            const la = asset.location.latitude, lo = asset.location.longitude;
            if (isValidGPS(la, lo)) { lat = la; lng = lo; }
          } else {
            const withinWindow = ticketWindows.some(w => creationMs >= w.start && creationMs <= w.end);
            if (withinWindow || isLimited || Platform.OS === 'android') {
              try {
                const info = await MediaLibrary.getAssetInfoAsync(asset);
                if (info.location) {
                  const la = info.location.latitude, lo = info.location.longitude;
                  if (isValidGPS(la, lo)) { lat = la; lng = lo; }
                }
                if (info.localUri) localUri = info.localUri;
              } catch { /* skip GPS for this asset */ }
            }
          }

          mediaAssetMap.set(asset.id, asset);

          const mediaType: 'photo' | 'video' = asset.mediaType === MediaLibrary.MediaType.video ? 'video' : 'photo';

          // ── Match against all tickets ────────────────────────────────────
          let bestScore = 0;
          let bestTicket: TicketForMatch | null = null;
          for (const ticket of tickets) {
            const s = scorePhotoVsTicket(creationMs, lat, lng, ticket);
            if (s > bestScore) { bestScore = s; bestTicket = ticket; }
          }

          if (bestScore >= 0.25 && bestTicket) {
            const candidate: MatchCandidate = {
              assetId: asset.id,
              mediaType,
              creationTimeMs: creationMs,
              lat, lng,
              localUri,
              score: bestScore,
              ticket: bestTicket,
            };
            if (bestScore >= 0.75) highBuf.push(candidate);
            else mediumBuf.push(candidate);
          } else if (!asset.mediaSubtypes?.includes('screenshot')) {
            // No ticket match — collect for trip/event cluster detection (no time-of-day
            // gate; trip photos happen during the day and may have no GPS).
            //
            // Screenshots are deliberately excluded here: they carry no EXIF GPS
            // (diluting the GPS-sampling pool below with guaranteed misses) and they
            // are not photos OF a place — they're UI captures, saved memes, shared
            // images, map snippets, etc. A saved/forwarded photo of a temple or alpine
            // scenery getting selected as a cluster's "representative" is exactly the
            // kind of input that fed classify-trip-segment bogus visual evidence and
            // produced "Alpine Winter Trip" / "Indore Temple Visit" cards for places
            // the user has never been ("ive never visited switzerland or indore").
            // They can still match an existing ticket by date via the scoring above —
            // we only keep them out of the *new-trip-candidate* pool.
            unmatchedBuf.push({ assetId: asset.id, mediaType, creationTimeMs: creationMs, lat, lng, localUri });
          }

          scanned++;
          if (scanned % 50 === 0) {
            update({ scanned, matched: highBuf.length + mediumBuf.length });
          }
        }

        cursor = result.hasNextPage ? result.endCursor : undefined;
      } while (cursor && !cancelRef.current);
    } catch (e) {
      console.error('Media scan error:', e);
      update({ state: 'error' });
      return;
    }

    update({ scanned, matched: highBuf.length + mediumBuf.length });

    if (cancelRef.current) {
      update({ state: 'idle' });
      return;
    }

    // ── GPS sampling for unmatched assets (iOS full-access only) ─────────────
    // getAssetsAsync always returns location=null on iOS. For ticket-window
    // assets we already called getAssetInfoAsync. For the rest, sample
    // GPS_SAMPLES_PER_SEGMENT assets per time-segment so buildTripClusters
    // has real GPS data instead of all-null clusters.
    // Gated on lookbackMs === 0 for the same reason buildTripClusters itself is below:
    // this sampling exists ONLY to feed that step. Running it on an incremental scan
    // would burn native getAssetInfoAsync calls (and the GPS_MAX_TOTAL budget) sampling a
    // pool that buildTripClusters won't even see — pure waste that makes exactly the
    // "narrow" scans that should feel fast feel slower for nothing.
    if (!targetTicketId && lookbackMs === 0 && !isLimited && Platform.OS === 'ios' && unmatchedBuf.length >= TRIP_CLUSTER_MIN_PHOTOS) {
      const sortedSeg = [...unmatchedBuf].sort((a, b) => a.creationTimeMs - b.creationTimeMs);
      const preSegs: UnmatchedAsset[][] = [];
      let curSeg: UnmatchedAsset[] = [sortedSeg[0]];
      for (let si = 1; si < sortedSeg.length; si++) {
        if ((sortedSeg[si].creationTimeMs - sortedSeg[si - 1].creationTimeMs) / 3_600_000 > TRIP_SEGMENT_GAP_HOURS) {
          preSegs.push(curSeg); curSeg = [];
        }
        curSeg.push(sortedSeg[si]);
      }
      preSegs.push(curSeg);

      let gpsFetched = 0;
      for (const ps of preSegs) {
        if (gpsFetched >= GPS_MAX_TOTAL || cancelRef.current) break;
        const noGps = ps.filter(a => a.lat == null);
        if (!noGps.length) continue;
        const step = Math.max(1, Math.floor(noGps.length / GPS_SAMPLES_PER_SEGMENT));
        for (let gi = 0; gi < noGps.length && gpsFetched < GPS_MAX_TOTAL; gi += step) {
          const item = noGps[gi];
          const ma = mediaAssetMap.get(item.assetId);
          if (!ma) continue;
          try {
            const info = await MediaLibrary.getAssetInfoAsync(ma);
            if (info.location) {
              const la = info.location.latitude, lo = info.location.longitude;
              if (isValidGPS(la, lo)) { item.lat = la; item.lng = lo; }
            }
            if (info.localUri) item.localUri = info.localUri;
            gpsFetched++;
          } catch { /* skip */ }
        }
      }
    }

    // ── Upsert high-confidence proposals ─────────────────────────────────────
    const allProposals = [...highBuf, ...mediumBuf];
    if (allProposals.length) {
      const rows = allProposals.map(c => ({
        user_id:        session.user.id,
        scan_job_id:    jobId,
        ticket_id:      c.ticket.id,
        device_asset_id: c.assetId,
        media_type:     c.mediaType,
        exif_taken_at:  c.creationTimeMs ? new Date(c.creationTimeMs).toISOString() : null,
        exif_lat:       c.lat,
        exif_lng:       c.lng,
        match_score:    parseFloat(c.score.toFixed(3)),
        match_method:   'metadata',
        local_uri:      c.localUri,
        status:         'pending',
      }));

      // Insert in batches of 50 to avoid payload limits
      for (let i = 0; i < rows.length; i += 50) {
        await supabase
          .from('photo_match_proposals')
          .upsert(rows.slice(i, i + 50), { onConflict: 'user_id,device_asset_id,ticket_id', ignoreDuplicates: true });
      }
    }

    // ── AI verification for medium-confidence ─────────────────────────────────
    update({ state: 'verifying' });

    type VerifyTarget = { proposalId: string; assetId: string; mediaType: 'photo' | 'video'; localUri: string; ticket: TicketForMatch };
    const verifyTargets: VerifyTarget[] = [];

    if (mediumBuf.length && jobId) {
      // Audit finding ("a night of love doesnt match the pictures", "seattle trip...
      // found photos for it"): this used to re-look-up the rows we just inserted via
      // `.in('device_asset_id', mediumBuf.map(...))` — for this user that's an IN-list
      // of up to ~1123 strings (50KB+ of URL-encoded filter), which silently fails
      // against PostgREST's query-size limits. The error was never checked, so idMap
      // came back empty, every item hit `continue`, and verify-photos was NEVER
      // invoked — confirmed live: 1123 medium-tier rows, 0 with ai_verified set, and
      // zero verify-photos log entries ever, despite ~90 classify-trip-segment calls
      // succeeding in the same runs. That silent hole is exactly how a snowy-morning
      // photo (40% on metadata alone) and an in-app screenshot (30%, "matching" a
      // flight that hadn't departed) sailed into the review queue with no sanity
      // check. Fix: filter by (scan_job_id, status) — both indexed, no per-asset list
      // needed, since every row this job just touched is still 'pending'.
      const { data: jobRows, error: jobRowsErr } = await supabase
        .from('photo_match_proposals')
        .select('id, device_asset_id')
        .eq('user_id', session.user.id)
        .eq('scan_job_id', jobId)
        .eq('status', 'pending');
      if (jobRowsErr) console.error('Failed to load proposal ids for verification:', jobRowsErr.message);

      const idMap = new Map<string, string>(
        (jobRows ?? []).map((r: { id: string; device_asset_id: string }) => [r.device_asset_id, r.id]),
      );
      for (const c of mediumBuf) {
        const proposalId = idMap.get(c.assetId);
        if (proposalId) verifyTargets.push({ proposalId, assetId: c.assetId, mediaType: c.mediaType, localUri: c.localUri, ticket: c.ticket });
      }
    }

    // Backlog sweep — only on general library scans (not narrow single-ticket "Find
    // Photos" runs, which should stay fast). The bug above means EVERY medium-tier
    // proposal any previous scan ever created is permanently stuck `ai_verified: null`
    // — `ignoreDuplicates` means a rescan can never revisit a device_asset_id/ticket
    // pair that already has a row, so fixing the query above only protects matches
    // from this point forward. Roll a bounded batch of the oldest never-verified rows
    // into this same pass: it's the only path left that can put a real AI opinion in
    // front of the backlog (live-checked: the exact two reported false positives are
    // among the OLDEST ~60 rows by creation order, so even one swept pass reaches
    // them), and verify-photos auto-rejects anything it scores under 35% confidence —
    // which "snow photos for an evening concert" / "screenshots of the app's own UI
    // for a future flight" should clear easily. Capped so this can't balloon an
    // incremental scan into a 10-minute operation; a handful of scans fully drains a
    // backlog this size as verified rows stop being eligible for re-sweep.
    const BACKLOG_SWEEP_CAP = 60;
    if (!targetTicketId && jobId && verifyTargets.length < BACKLOG_SWEEP_CAP) {
      const ticketById = new Map(tickets.map(t => [t.id, t]));
      const { data: backlogRows, error: backlogErr } = await supabase
        .from('photo_match_proposals')
        .select('id, device_asset_id, media_type, local_uri, ticket_id')
        .eq('user_id', session.user.id)
        .eq('status', 'pending')
        .is('ai_verified', null)
        .lt('match_score', 0.75)
        .neq('scan_job_id', jobId)
        .order('created_at', { ascending: true })
        .limit(BACKLOG_SWEEP_CAP - verifyTargets.length);
      if (backlogErr) console.error('Failed to load backlog proposals for verification:', backlogErr.message);

      for (const row of (backlogRows ?? []) as Array<{ id: string; device_asset_id: string; media_type: 'photo' | 'video'; local_uri: string | null; ticket_id: string }>) {
        const ticket = ticketById.get(row.ticket_id);
        if (!ticket || !row.local_uri) continue;
        verifyTargets.push({ proposalId: row.id, assetId: row.device_asset_id, mediaType: row.media_type, localUri: row.local_uri, ticket });
      }
    }

    if (verifyTargets.length) {
      // Build verify batches (max 10 per call)
      const verifyBatches: VerifyTarget[][] = [];
      let batch: VerifyTarget[] = [];
      for (const t of verifyTargets) {
        batch.push(t);
        if (batch.length === 10) { verifyBatches.push(batch); batch = []; }
      }
      if (batch.length) verifyBatches.push(batch);

      for (const vBatch of verifyBatches) {
        if (cancelRef.current) break;

        const proposals = await Promise.all(
          vBatch.map(async item => {
            const base64 = item.mediaType === 'video'
              ? await getVideoThumbnailBase64(item.localUri)
              : await getBase64Thumbnail(item.localUri);
            if (!base64) return null;
            return {
              proposalId: item.proposalId,
              imageBase64: base64,
              mimeType: 'image/jpeg',
              ticketTitle:    item.ticket.title    ?? '',
              ticketVenue:    item.ticket.venue_name ?? '',
              ticketCategory: item.ticket.category,
              ticketDate:     item.ticket.date_str  ?? '',
              mediaType:      item.mediaType,
            };
          }),
        );

        const validProposals = proposals.filter(Boolean);
        if (validProposals.length) {
          const { error: verifyErr } = await supabase.functions.invoke('verify-photos', {
            body: { proposals: validProposals },
          });
          if (verifyErr) console.error('verify-photos invocation failed:', verifyErr.message);
        }
      }
    }

    // ── Trip cluster detection ────────────────────────────────────────────────
    let newCandidates = 0;

    // Audit findings ("it is finding different trips/events on every new scan. Not
    // finding them in the first scan" + "every time it is scanning few items from all
    // the library in every new scan" + classify-trip-segment's own comment that
    // "buildTripClusters' output isn't byte-identical run to run"): clustering's INPUT
    // pool (unmatchedBuf) is only complete and consistent on a full sweep
    // (lookbackMs === 0) — on an incremental run it's whatever sliver of the library
    // happened to fall inside the last-7-days lookback window, a DIFFERENT sliver every
    // time, so the exact same physical photos get sliced into different segments/
    // sub-clusters run to run, surfacing different "trips" each time even though nothing
    // about the user's actual library changed. Restricting cluster discovery to full
    // sweeps means it always partitions the SAME complete not-yet-claimed pool (modulo
    // genuine processedSet growth from the user's own approvals/rejections in between)
    // → stable, repeatable results — and "scanning few items" stops feeling like a lie,
    // because narrow incremental runs no longer silently skip the one thing the user
    // actually came here to find (full sweeps now recur on a predictable schedule via
    // dueForFullSweep, so trip discovery isn't abandoned — just done properly, all at once).
    if (!targetTicketId && lookbackMs === 0 && unmatchedBuf.length >= TRIP_CLUSTER_MIN_PHOTOS) {
      const allClusters = buildTripClusters(unmatchedBuf);
      // Keep only the largest clusters (most photos = most likely a real trip) and cap calls
      const clusters = allClusters
        .sort((a, b) => b.length - a.length)
        .slice(0, MAX_TRIP_CLUSTERS);

      for (const cluster of clusters) {
        if (cancelRef.current) break;
        const rep = bestRepresentative(cluster, mediaAssetMap);

        // On iOS the rep may still have a ph:// URI (non-sampled asset).
        // Fetch localUri so ImageManipulator can process it.
        if (!rep.localUri.startsWith('file://')) {
          const ma = mediaAssetMap.get(rep.assetId);
          if (ma) {
            try {
              const info = await MediaLibrary.getAssetInfoAsync(ma);
              if (info.localUri) rep.localUri = info.localUri;
              if (info.location && rep.lat == null) {
                rep.lat = info.location.latitude;
                rep.lng = info.location.longitude;
              }
            } catch { /* fall through — thumbnail may still fail */ }
          }
        }

        const base64 = rep.mediaType === 'video'
          ? await getVideoThumbnailBase64(rep.localUri)
          : await getBase64Thumbnail(rep.localUri);

        if (!base64) continue;

        const dateFrom = formatDateForDisplay(Math.min(...cluster.map(a => a.creationTimeMs)));
        const dateTo   = formatDateForDisplay(Math.max(...cluster.map(a => a.creationTimeMs)));

        // Compute centroid GPS from valid points only — null island (0,0) is not real location data.
        // If no cluster member has valid GPS, send null so Claude relies on visual content
        // instead of being misled into thinking the photos were taken near (0°, 0°).
        const gpsItems = cluster.filter(a => a.lat != null && a.lng != null && isValidGPS(a.lat!, a.lng!));
        const gpsLat = gpsItems.length
          ? gpsItems.reduce((sum, a) => sum + a.lat!, 0) / gpsItems.length
          : null;
        const gpsLng = gpsItems.length
          ? gpsItems.reduce((sum, a) => sum + a.lng!, 0) / gpsItems.length
          : null;

        const { data } = await supabase.functions.invoke('classify-trip-segment', {
          body: {
            imageBase64: base64,
            mimeType: 'image/jpeg',
            gpsLat,
            gpsLng,
            dateFrom,
            dateTo,
            photoCount: cluster.length,
            scanJobId: jobId,
            deviceAssetIds: cluster.map(a => a.assetId),
          },
        });

        if (data?.created) newCandidates++;
      }
    }

    // ── Finalize ──────────────────────────────────────────────────────────────
    const finalMatched = highBuf.length + mediumBuf.length;
    update({ matched: finalMatched, newCandidates, state: 'done' });

    // Update scan job
    if (jobId) {
      await supabase.from('photo_scan_jobs').update({
        status: 'completed',
        scanned_assets: scanned,
        matched_count: finalMatched,
        new_ticket_count: newCandidates,
        scan_cursor_ms: latestCursorMs,
        completed_at: new Date().toISOString(),
      }).eq('id', jobId);
    }

    // Save incremental scan state
    if (!targetTicketId) {
      const newState: PhotoScanStateStore = {
        lastScanCursorMs: latestCursorMs,
        // Bug fix: this previously ALWAYS preferred the existing stored value — even
        // immediately after a brand-new full sweep just ran (lookbackMs === 0) — so once
        // set, it never changed again. dueForFullSweep would then measure age against a
        // permanently-frozen timestamp and fire on every single scan once 14 days had
        // passed since that one-time value, defeating the whole "predictable cadence"
        // premise. Update it whenever THIS run was genuinely comprehensive; otherwise
        // carry the existing value forward (or seed it now for installs that never had one).
        lastFullScanAt: lookbackMs === 0 ? Date.now() : (scanState?.lastFullScanAt ?? Date.now()),
        lastScanJobId: jobId,
        algoVersion: SCAN_ALGO_VERSION,
      };
      await SecureStore.setItemAsync(SCAN_STATE_KEY, JSON.stringify(newState)).catch(() => {});
    }
  }, [options?.singleTicketId, update]);

  const cancelScan = useCallback(() => {
    cancelRef.current = true;
    update({ state: 'idle' });
  }, [update]);

  return { progress, startScan, cancelScan };
}
