import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image, TextInput,
  ActivityIndicator, LayoutAnimation, UIManager, Platform, Alert,
  InteractionManager,
} from 'react-native';
import * as Linking from 'expo-linking';
import * as MediaLibrary from 'expo-media-library';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImageManipulator from 'expo-image-manipulator';
import { decode as decodeBase64 } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase/client';
import { usePhotoLibraryScanner } from '@/lib/usePhotoLibraryScanner';
import { useBottomPad } from '@/lib/useBottomPad';
import { scale, scaleFont, sp } from '@/lib/layout';
import { isEventPast } from '@/lib/parseEventDate';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const LA = () => LayoutAnimation.configureNext({
  duration: 220,
  create:  { type: 'easeInEaseOut', property: 'opacity' },
  update:  { type: 'easeInEaseOut' },
  delete:  { type: 'easeInEaseOut', property: 'opacity' },
});

const BRAND_FROM = '#4f6cf2';
const BRAND_TO   = '#a25cf2';
const FG         = '#1a1530';
const MUTED      = '#6b6a85';
const SURFACE    = '#ffffff';
const BG         = '#eef0fb';
const GREEN      = '#059669';
const RED        = '#dc2626';
const AMBER      = '#d97706';

// ── Types ─────────────────────────────────────────────────────────────────────
interface MatchProposal {
  id: string;
  ticket_id: string;
  device_asset_id: string;
  media_type: 'photo' | 'video';
  local_uri: string | null;
  exif_taken_at: string | null;
  match_score: number;
  ai_confidence: number | null;
  ai_verified: boolean | null;
  status: string;
}

interface TicketGroup {
  ticketId: string;
  ticketTitle: string | null;
  ticketDate: string | null;
  ticketTint: string | null;
  proposals: MatchProposal[];
}

interface PendingImport {
  id: string;
  source: string;
  confidence: number;
  raw_data: {
    title: string | null;
    venue: string | null;
    date: string | null;
    time: string | null;
    seat: string | null;
    category: string;
    tint: string;
    image_url: string;
    subject: string;
    scan_job_id?: string | null;
    device_asset_ids?: string[] | null;
  };
}

const CATEGORY_DB: Record<string, string> = {
  Concert: 'concert', Sports: 'sports', Festival: 'festival',
  Trip: 'trip', Theatre: 'theater', Other: 'other',
};
const CATEGORY_TINTS: Record<string, string> = {
  Concert: '#FAC775', Sports: '#E8581A', Festival: '#FFCBA4',
  Trip: '#A8E6D3', Theatre: '#C8B8FF', Other: '#b0b8e0',
};
const DB_TO_DISPLAY: Record<string, string> = {
  concert: 'Concert', sports: 'Sports', festival: 'Festival',
  trip: 'Trip', theater: 'Theatre', dining: 'Other', other: 'Other',
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
const CATEGORIES = Object.keys(CATEGORY_TINTS);

// Editable fields for a Section-B "new event" candidate before approval
type ImportEditState = {
  title: string; venue: string; date: string; time: string; category: string;
};

// A constituent photo/video of a trip/event cluster, lazily resolved from its
// device_asset_id for the "verify photos" expand view
interface ClusterMedia {
  assetId: string;
  uri: string | null;
  isVideo: boolean;
}

// Row shape for `photos` inserts — used by approveProposalUploadOnly to carry
// upload results back to handleApproveAll for bulk batching.
type PhotoRow = {
  ticket_id: string;
  user_id: string;
  storage_url: string | null;
  match_method: string;
  match_confidence: number;
  taken_at: string | null;
  exif_lat: null;
  exif_lng: null;
  device_asset_id: string;
  media_type: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function confidenceColor(score: number): string {
  return score >= 0.75 ? GREEN : score >= 0.45 ? AMBER : RED;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PhotoScanReview(): React.JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{ ticketId?: string; jobId?: string }>();
  const bottomPad = useBottomPad();

  // Auto follow-up scan: the instant a brand-new trip/event card is approved, it
  // becomes a real ticket with its own date range (and, once geocoded, venue GPS)
  // — meaning the matching surface just grew. Photos that had nothing to match
  // against a moment ago (so they either sat in `unmatchedBuf` or weakly matched
  // some unrelated ticket) can now score correctly against THIS one. This hook
  // instance carries no fixed ticket of its own — handleApproveImport tells each
  // call which brand-new ticket to target via startScan({ singleTicketId }).
  // Queued through followUpQueueRef so approving several cards in a row runs the
  // follow-ups one at a time instead of letting them race on shared scan state;
  // fire-and-forget so Approve never waits on it.
  const followUpScanner = usePhotoLibraryScanner();
  const followUpQueueRef = useRef<Promise<void>>(Promise.resolve());

  const [loading, setLoading] = useState(true);
  const [ticketGroups, setTicketGroups] = useState<TicketGroup[]>([]);
  const [newTickets, setNewTickets] = useState<PendingImport[]>([]);

  // Audit finding ("why does approving photos take so much time"): this used to be
  // a single `processingId: string | null`, which meant the UI could only ever
  // represent ONE in-flight item — so handleApproveAll had no choice but to await
  // each photo's full upload-and-insert pipeline before even starting the next.
  // A Set lets many items be genuinely "in flight" at once so their network work
  // (storage upload + two table writes each) can overlap instead of stacking up.
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const beginProcessing = useCallback((id: string) => {
    setProcessingIds(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);
  const endProcessing = useCallback((id: string) => {
    setProcessingIds(prev => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);
  // Guards "Approve All" against a rapid double-tap starting two overlapping
  // worker pools on the same group — a `ref` mutation takes effect immediately,
  // unlike `processingIds` state (which only takes effect on the next render and
  // so would leave a brief window where a second tap sees the old, empty set).
  const approveAllInFlightRef = useRef<Set<string>>(new Set());

  // Pre-warm cache for compressed images, keyed by proposal.id. `local_uri` is
  // already on every proposal the instant they're loaded (no async resolution
  // needed — see the load effect below), so the slowest CPU step in the whole
  // approve pipeline (resize+compress via ImageManipulator) can run quietly in
  // the background WHILE the user is still looking at the review screen deciding
  // what to approve — work that would otherwise only start the moment they tap.
  // approveProposalWork checks this cache first: a hit skips straight to
  // decode->upload, taking compression latency out of the tap-to-saved critical
  // path entirely. A miss (user taps before pre-warm gets there, or it's a
  // re-approval after a prior failure) just falls through to the same inline
  // manipulateAsync call as before — correctness never depends on a warm cache.
  // Plain ref (mirrors approveAllInFlightRef just above) — this is a mutable
  // cache, not render state; populating it should never trigger a re-render.
  const compressionCacheRef = useRef<Map<string, ImageManipulator.ImageResult>>(new Map());

  const [isLimitedAccess, setIsLimitedAccess] = useState(false);
  const [scanStats, setScanStats] = useState<{ scanned: number; total: number } | null>(null);
  // Populated once from the getUser() call in the load effect below, then reused
  // by every approve/reject action. The previous code called supabase.auth.getUser()
  // again inside handleApproveProposal/handleApproveImport — a genuine network
  // round trip to Supabase Auth to re-confirm an identity that cannot change
  // mid-session — and that fired on EVERY single photo during "Approve All".
  // Reusing one cached id removes a full extra round trip per photo.
  const [userId, setUserId] = useState<string | null>(null);

  // Section B — inline edit state for "New event" candidates (mirrors review-imports.tsx)
  const [editingImportId, setEditingImportId] = useState<string | null>(null);
  const [importEditState, setImportEditState] = useState<ImportEditState>({
    title: '', venue: '', date: '', time: '', category: 'Trip',
  });

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    MediaLibrary.getPermissionsAsync().then(({ accessPrivileges }) => {
      setIsLimitedAccess(accessPrivileges === 'limited');
    }).catch(() => {});
  }, []);

  const totalMatched = ticketGroups.reduce((sum, g) => sum + g.proposals.length, 0);
  const total = totalMatched + newTickets.length;

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) { setLoading(false); return; }
      setUserId(user.id);

      // Load scan job stats — "Scanned X of your photos" line in the summary header
      let jobQuery = supabase
        .from('photo_scan_jobs')
        .select('total_assets, scanned_assets')
        .eq('user_id', user.id);
      jobQuery = params.jobId
        ? jobQuery.eq('id', params.jobId)
        : jobQuery.order('started_at', { ascending: false }).limit(1);
      const { data: jobRows } = await jobQuery;
      const job = jobRows?.[0] as { total_assets: number; scanned_assets: number } | undefined;
      if (job && active) {
        setScanStats({ scanned: job.scanned_assets ?? 0, total: job.total_assets ?? 0 });
      }

      // Load proposals
      let proposalQuery = supabase
        .from('photo_match_proposals')
        .select('id, ticket_id, device_asset_id, media_type, local_uri, exif_taken_at, match_score, ai_confidence, ai_verified, status')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .order('match_score', { ascending: false });

      if (params.ticketId) {
        proposalQuery = proposalQuery.eq('ticket_id', params.ticketId);
      }

      const { data: proposals } = await proposalQuery;

      if (proposals?.length && active) {
        // Load ticket info for grouping
        const ticketIds = [...new Set(proposals.map((p: MatchProposal) => p.ticket_id))];
        const { data: tickets } = await supabase
          .from('tickets')
          .select('id, title, date_str, tint')
          .in('id', ticketIds);

        const ticketMap = new Map(tickets?.map((t: { id: string; title: string | null; date_str: string | null; tint: string | null }) => [t.id, t]) ?? []);

        const groups: TicketGroup[] = ticketIds.map(tid => {
          const t = ticketMap.get(tid) as { id: string; title: string | null; date_str: string | null; tint: string | null } | undefined;
          return {
            ticketId:    tid,
            ticketTitle: t?.title ?? null,
            ticketDate:  t?.date_str ?? null,
            ticketTint:  t?.tint ?? null,
            proposals:   proposals.filter((p: MatchProposal) => p.ticket_id === tid),
          };
        });

        if (active) setTicketGroups(groups);

        // Kick off the pre-warm pass — see compressionCacheRef's declaration above
        // for the full reasoning. InteractionManager.runAfterInteractions defers
        // this until the screen has finished its initial paint/animations, so it
        // never competes with the first render for the JS thread; a narrow
        // PREWARM_CONCURRENCY (well below BATCH_CONCURRENCY's 6) keeps it a quiet
        // background courtesy that won't contend with an active "Approve All"
        // for CPU/memory if the user moves fast.
        const photoProposals = proposals.filter(
          (p: MatchProposal) => p.media_type === 'photo' && p.local_uri,
        );
        if (photoProposals.length) {
          InteractionManager.runAfterInteractions(() => {
            if (!active) return;
            const PREWARM_CONCURRENCY = 2;
            let cursor = 0;
            const nextProposal = (): MatchProposal | undefined => photoProposals[cursor++];
            const prewarmWorker = async () => {
              for (let p = nextProposal(); p; p = nextProposal()) {
                if (!active || compressionCacheRef.current.has(p.id)) continue;
                try {
                  const manipulated = await ImageManipulator.manipulateAsync(
                    p.local_uri!,
                    [{ resize: { width: 1200 } }],
                    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true },
                  );
                  if (active) compressionCacheRef.current.set(p.id, manipulated);
                } catch {
                  // Miss — approveProposalWork's inline manipulateAsync call covers it
                  // when the user actually taps Approve. Pre-warming is a courtesy,
                  // never a dependency, so failures here are silently swallowed.
                }
              }
            };
            Promise.all(
              Array.from({ length: Math.min(PREWARM_CONCURRENCY, photoProposals.length) }, prewarmWorker),
            ).catch(() => {});
          });
        }
      }

      // Load new ticket candidates from this scan job (photo source only)
      let importQuery = supabase
        .from('pending_imports')
        .select('id, source, confidence, raw_data')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .eq('source', 'photo');

      if (params.jobId) {
        importQuery = importQuery.filter('raw_data->>scan_job_id', 'eq', params.jobId);
      }

      const { data: imports } = await importQuery.order('created_at', { ascending: false });
      if (active) setNewTickets(imports ?? []);

      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [params.ticketId, params.jobId]);

  // Core approval pipeline for ONE matched photo/video — compress + upload
  // (photos only), insert the `photos` row, flip the proposal to `approved`, and
  // drop it from the on-screen list. Deliberately carries no awareness of the
  // processing-guard: both the single-tap handler below AND the concurrent batch
  // runner in handleApproveAll call this directly and own their own id
  // bookkeeping — which is exactly what lets several of these run at once instead
  // of queuing behind one another.
  // Returns true ONLY once a `photos` row genuinely exists for this proposal — see the
  // audit-finding comment right before the status-flip below for why that guarantee
  // matters and what broke without it. Callers (single-tap and the batch runner) use the
  // return value to decide whether to surface a "didn't save" notice to the user.
  const approveProposalWork = useCallback(async (proposal: MatchProposal, ticketId: string, uid: string): Promise<boolean> => {
    let saved = false;
    if (proposal.media_type === 'photo' && proposal.local_uri) {
      // Compress and upload photo to ticket-photos storage
      try {
        // Cache hit ("pre-warmed" in the background while the user was still
        // reviewing — see compressionCacheRef's declaration for the full
        // reasoning) skips the resize+compress step entirely, taking the
        // slowest CPU-bound part of this pipeline out of the tap-to-saved
        // critical path. Consumed-and-removed on hit so the Map doesn't keep
        // holding a decoded base64 string for a photo that's about to be saved
        // (and therefore about to be filtered out of `ticketGroups` for good).
        // A miss — user tapped before pre-warm reached this photo, it's a
        // re-approval retry after a prior failure, or pre-warming itself
        // errored — falls through to the exact same manipulateAsync call as
        // before; the result is identical either way, just arrives sooner on a hit.
        const cached = compressionCacheRef.current.get(proposal.id);
        if (cached) compressionCacheRef.current.delete(proposal.id);
        const manipulated = cached ?? await ImageManipulator.manipulateAsync(
          proposal.local_uri,
          [{ resize: { width: 1200 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true },
        );

        if (manipulated.base64) {
          // base64 -> ArrayBuffer via base64-arraybuffer's decode(), NOT atob()+a
          // hand-rolled charCodeAt loop. That loop is pure single-threaded JS work —
          // ~150-400K iterations per photo — and JS in RN is single-threaded, so it
          // does NOT parallelize across BATCH_CONCURRENCY workers; it serializes on
          // the one JS thread, blocking it (and the UI) for its duration, repeatedly,
          // every batch. decode() goes straight to an ArrayBuffer without ever
          // materializing an intermediate "raw bytes as UTF-16 chars" JS string (what
          // atob produces — doubling memory and forcing a second char-by-char pass).
          // Output type is identical (Uint8Array -> .upload(), proven to work below).
          const bytes = new Uint8Array(decodeBase64(manipulated.base64));

          const path = `${uid}/${ticketId}/${proposal.device_asset_id}.jpg`;
          const { error: upErr } = await supabase.storage
            .from('ticket-photos')
            .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });

          if (!upErr) {
            const { data: { publicUrl } } = supabase.storage
              .from('ticket-photos')
              .getPublicUrl(path);

            const { error: insErr } = await supabase.from('photos').insert({
              ticket_id:        ticketId,
              user_id:          uid,
              storage_url:      publicUrl,
              match_method:     'library_scan',
              match_confidence: proposal.ai_confidence ?? proposal.match_score,
              taken_at:         proposal.exif_taken_at,
              exif_lat:         null,
              exif_lng:         null,
              device_asset_id:  proposal.device_asset_id,
              media_type:       'photo',
            });
            saved = !insErr;
          }
        }
      } catch { /* swallow — `saved` stays false; handled uniformly below */ }
    } else if (proposal.media_type === 'video') {
      // Videos: store device_asset_id reference only (no upload)
      const { error: insErr } = await supabase.from('photos').insert({
        ticket_id:        ticketId,
        user_id:          uid,
        storage_url:      null,
        match_method:     'library_scan',
        match_confidence: proposal.ai_confidence ?? proposal.match_score,
        taken_at:         proposal.exif_taken_at,
        device_asset_id:  proposal.device_asset_id,
        media_type:       'video',
      });
      saved = !insErr;
    }

    // Audit finding ("Now it is approving 3 photos at once but after all the photos are
    // done and I open the details page I don't see any photos there"): this used to mark
    // EVERY proposal `approved` — and remove it from the on-screen list — no matter what
    // happened above, on the theory that one bad upload shouldn't stall the rest of the
    // batch (see the old comment: "upload failed — still mark proposal approved"). A DB
    // audit of this account found the real cost of that theory: 19 of 169 "approved"
    // photo proposals (~11%) have NO matching `photos` row at all — `manipulated.base64`
    // came back empty, or the storage upload (`upErr`) or the insert (`insErr`) failed, or
    // ImageManipulator/atob/upload threw — and every one of those silently vanished from
    // the queue having saved nothing, with no row, no error, and no way to retry. Bumping
    // BATCH_CONCURRENCY to run several uploads at once (the very thing that made approving
    // feel fast) only made this MORE likely to bite, not less — four uploads competing for
    // the same network/memory budget fail more often than one at a time ever did.
    // "Approved" must mean "the photo is actually there." When it isn't, leave the
    // proposal exactly as it was — still `pending`, still sitting right there in the list
    // — so the natural retry is just pressing the same Approve button again.
    if (!saved) return false;

    await supabase.from('photo_match_proposals').update({ status: 'approved' }).eq('id', proposal.id);
    // UI removal is now handled optimistically by handleApproveProposal (the caller),
    // which removes the card the instant the user taps Approve — before any network
    // work starts — so the single-tap path gives instant visual feedback. This
    // function's job ends here: flip the DB status, return true. The card is already gone.
    return true;
  }, []);

  // Batch-path companion to approveProposalWork: does compress → decode →
  // upload for ONE proposal and returns the `photos` row data ready to
  // bulk-insert on success, or null on any failure. DB writes are intentionally
  // omitted so handleApproveAll can collect all successes first and then issue:
  //   • one chunked bulk `photos` INSERT  (⌈N/CHUNK⌉ round trips)
  //   • one bulk `proposals` status-flip  (1 round trip)
  // instead of the current 2×N individual writes (2 per photo). That's ~4 total
  // for a 20-photo batch vs. 40. approveProposalWork is left untouched — the
  // single-tap path still uses it and still does its own immediate insert,
  // preserving the Session-2 invariant on both paths: "approved means a
  // `photos` row genuinely exists."
  const approveProposalUploadOnly = useCallback(async (
    proposal: MatchProposal, ticketId: string, uid: string,
  ): Promise<{ proposalId: string; row: PhotoRow } | null> => {
    try {
      if (proposal.media_type === 'photo' && proposal.local_uri) {
        // Same compression-cache check as approveProposalWork — consumes on hit
        const cached = compressionCacheRef.current.get(proposal.id);
        if (cached) compressionCacheRef.current.delete(proposal.id);
        const manipulated = cached ?? await ImageManipulator.manipulateAsync(
          proposal.local_uri,
          [{ resize: { width: 1200 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true },
        );
        if (!manipulated.base64) return null;

        const bytes = new Uint8Array(decodeBase64(manipulated.base64));
        const path = `${uid}/${ticketId}/${proposal.device_asset_id}.jpg`;
        const { error: upErr } = await supabase.storage
          .from('ticket-photos')
          .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
        if (upErr) return null;

        const { data: { publicUrl } } = supabase.storage.from('ticket-photos').getPublicUrl(path);
        return {
          proposalId: proposal.id,
          row: {
            ticket_id:        ticketId,
            user_id:          uid,
            storage_url:      publicUrl,
            match_method:     'library_scan',
            match_confidence: proposal.ai_confidence ?? proposal.match_score,
            taken_at:         proposal.exif_taken_at,
            exif_lat:         null,
            exif_lng:         null,
            device_asset_id:  proposal.device_asset_id,
            media_type:       'photo',
          },
        };
      } else if (proposal.media_type === 'video') {
        return {
          proposalId: proposal.id,
          row: {
            ticket_id:        ticketId,
            user_id:          uid,
            storage_url:      null,
            match_method:     'library_scan',
            match_confidence: proposal.ai_confidence ?? proposal.match_score,
            taken_at:         proposal.exif_taken_at,
            exif_lat:         null,
            exif_lng:         null,
            device_asset_id:  proposal.device_asset_id,
            media_type:       'video',
          },
        };
      }
    } catch { /* null → treated as failure in handleApproveAll */ }
    return null;
  }, []);

  const handleApproveProposal = useCallback(async (proposal: MatchProposal, ticketId: string) => {
    if (processingIds.has(proposal.id) || !userId) return;
    beginProcessing(proposal.id);

    // Optimistic removal: animate the card out the instant Approve is tapped —
    // the user gets immediate feedback rather than the item sitting frozen-
    // but-present for the ~2s of network work ahead. If the save fails, we
    // re-insert the proposal back into its group (with another animation) and
    // fire the same alert as before, so the item reappears ready to retry.
    // Capture the group now (before removal) in case it's the last proposal
    // in its group and we need to reconstruct the whole group on rollback.
    const groupSnapshot = ticketGroups.find(g => g.ticketId === ticketId);
    LA();
    setTicketGroups(prev =>
      prev
        .map(g => ({ ...g, proposals: g.proposals.filter(p => p.id !== proposal.id) }))
        .filter(g => g.proposals.length > 0),
    );

    try {
      const ok = await approveProposalWork(proposal, ticketId, userId);
      if (!ok) {
        // Rollback: put the proposal back so the user can retry naturally
        LA();
        setTicketGroups(prev => {
          const existing = prev.find(g => g.ticketId === ticketId);
          if (existing) {
            // Group still exists (had other proposals) — re-insert at the front
            return prev.map(g =>
              g.ticketId === ticketId
                ? { ...g, proposals: [proposal, ...g.proposals] }
                : g,
            );
          } else if (groupSnapshot) {
            // Group was fully cleared — recreate it with this one proposal
            return [...prev, { ...groupSnapshot, proposals: [proposal] }];
          }
          return prev;
        });
        Alert.alert("Couldn't save this photo", "Please check your connection and try again — it's still in your list.");
      }
    } finally {
      endProcessing(proposal.id);
    }
  }, [processingIds, userId, ticketGroups, beginProcessing, endProcessing, approveProposalWork]);

  const handleRejectProposal = useCallback(async (proposalId: string) => {
    if (processingIds.has(proposalId)) return;
    beginProcessing(proposalId);
    try {
      await supabase.from('photo_match_proposals').update({ status: 'rejected' }).eq('id', proposalId);
      LA();
      setTicketGroups(prev =>
        prev
          .map(g => ({ ...g, proposals: g.proposals.filter(p => p.id !== proposalId) }))
          .filter(g => g.proposals.length > 0),
      );
    } finally {
      endProcessing(proposalId);
    }
  }, [processingIds, beginProcessing, endProcessing]);

  // Section B — start/cancel/update inline edit for a "New event" candidate
  // (mirrors startEdit/cancelEdit in review-imports.tsx, minus the seat field
  // since photo-trip candidates never carry one)
  const startEditImport = useCallback((item: PendingImport) => {
    const d = item.raw_data;
    LA();
    setEditingImportId(item.id);
    setImportEditState({
      title:    d.title ?? '',
      venue:    d.venue ?? '',
      date:     d.date ?? '',
      time:     d.time ?? '',
      category: DB_TO_DISPLAY[d.category] ?? 'Trip',
    });
  }, []);

  const cancelEditImport = useCallback(() => {
    LA();
    setEditingImportId(null);
  }, []);

  const updateImportEdit = useCallback((patch: Partial<ImportEditState>) => {
    setImportEditState(s => ({ ...s, ...patch }));
  }, []);

  const handleApproveImport = useCallback(async (item: PendingImport) => {
    if (processingIds.has(item.id) || !userId) return;
    beginProcessing(item.id);
    try {
      const d = item.raw_data;
      const isEditing = editingImportId === item.id;
      const title    = isEditing ? importEditState.title    : (d.title ?? '');
      const venue    = isEditing ? importEditState.venue    : (d.venue ?? '');
      const date     = isEditing ? importEditState.date     : (d.date  ?? '');
      const time     = isEditing ? importEditState.time     : (d.time  ?? '');
      const display  = isEditing ? importEditState.category : (DB_TO_DISPLAY[d.category] ?? 'Other');
      const dbCat    = CATEGORY_DB[display] ?? 'other';
      const tint     = CATEGORY_TINTS[display] ?? d.tint ?? '#b0b8e0';

      const dateStr = date || 'TBD';

      const { data: newTicket, error } = await supabase.from('tickets').insert({
        user_id:    userId,
        title:      title || 'Untitled',
        venue_name: venue || 'TBD',
        date_str:   dateStr,
        time_str:   time  || 'TBD',
        seat:       d.seat || null,
        category:   dbCat,
        tint,
        image_url:  d.image_url ?? CATEGORY_IMAGES[dbCat] ?? CATEGORY_IMAGES.other,
        confidence: item.confidence,
        source:     'photo',
        status:     'active',
        is_past:    isEventPast(dateStr),
      }).select('id').single();
      if (error || !newTicket) { Alert.alert('Could not approve', error?.message ?? 'Unknown error'); return; }

      // Auto-link cluster photos to the new ticket.
      //
      // Audit findings ("Now it is approving 3 photos at once but after all the photos
      // are done and I open the details page I don't see any photos there" + a DB check
      // showing this exact path had linked "Washington DC Visit" to 102 photos —
      // EVERY one with storage_url: null, taken_at: null, and media_type hardcoded to
      // 'photo' even for any videos in the cluster): this used to insert bare
      // device_asset_id-only rows with no real upload — a structurally different (and
      // strictly worse) path than approveProposalWork's proven compress→upload→insert
      // pipeline just above. With no storage_url these rows have no cloud copy (so they
      // vanish if the user frees up device space, switches phones, or restores from
      // backup), no taken_at (so they sort wrong / break date-based grouping), and any
      // videos in the cluster were mislabeled 'photo' (so they'd try to render as a
      // broken image instead of a video). event-details.tsx had to grow a fragile,
      // specially-chunked client-side fallback (MediaLibrary.getAssetInfoAsync →
      // local file:// URI, 12-at-a-time to avoid crashing on a 102-photo cluster) just
      // to show these at all — "fine for now", but not a real fix.
      //
      // Run every linked asset through the SAME pipeline approveProposalWork already
      // proves works, concurrently — mirroring its BATCH_CONCURRENCY worker-pool pattern
      // — so a brand-new ticket's photos are first-class from the moment it's created:
      // cloud-backed, correctly dated, and correctly typed for video vs photo. If the
      // upload genuinely can't complete for one asset (no network, huge/odd file), it
      // still degrades gracefully to a metadata-correct linked row — strictly better
      // than the old always-bare row — so the existing local-URI fallback keeps working
      // as a true last resort rather than the only resort.
      if (d.device_asset_ids?.length) {
        const LINK_CONCURRENCY = 4;
        const assetIds = d.device_asset_ids as string[];
        let linkCursor = 0;
        const nextAssetId = (): string | undefined => assetIds[linkCursor++];

        const linkWorker = async () => {
          for (let assetId = nextAssetId(); assetId; assetId = nextAssetId()) {
            let mediaType: 'photo' | 'video' = 'photo';
            let takenAt: string | null = null;
            let localUri: string | null = null;
            try {
              const info = await MediaLibrary.getAssetInfoAsync(assetId);
              if (info?.mediaType === 'video') mediaType = 'video';
              if (info?.creationTime) takenAt = new Date(info.creationTime).toISOString();
              localUri = info?.localUri ?? null;
            } catch { /* couldn't resolve — link with whatever we have below */ }

            let storageUrl: string | null = null;
            if (mediaType === 'photo' && localUri) {
              try {
                const manipulated = await ImageManipulator.manipulateAsync(
                  localUri,
                  [{ resize: { width: 1200 } }],
                  { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true },
                );
                if (manipulated.base64) {
                  // Same swap as approveProposalWork above — see its comment for why
                  // the atob()+charCodeAt-loop decode was a hidden single-thread
                  // bottleneck that no amount of concurrency could parallelize away.
                  const bytes = new Uint8Array(decodeBase64(manipulated.base64));

                  const path = `${userId}/${newTicket.id}/${assetId}.jpg`;
                  const { error: upErr } = await supabase.storage
                    .from('ticket-photos')
                    .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
                  if (!upErr) {
                    const { data: { publicUrl } } = supabase.storage.from('ticket-photos').getPublicUrl(path);
                    storageUrl = publicUrl;
                  }
                }
              } catch { /* keep storageUrl null — row below still links via device_asset_id+taken_at */ }
            }

            await supabase.from('photos').insert({
              ticket_id:       newTicket.id,
              user_id:         userId,
              storage_url:     storageUrl,
              match_method:    'library_scan',
              taken_at:        takenAt,
              device_asset_id: assetId,
              media_type:      mediaType,
            });
          }
        };

        await Promise.all(
          Array.from({ length: Math.min(LINK_CONCURRENCY, assetIds.length) }, linkWorker),
        );
      }

      await supabase.from('pending_imports').update({ status: 'approved' }).eq('id', item.id);

      // Queue the auto follow-up scan for this brand-new ticket — see
      // followUpScanner above. Placed AFTER the cluster photos are linked and
      // the import is marked approved (not before): the follow-up scan loads
      // its own "already linked" set from the `photos` table at start-up, so
      // those rows must already be committed or it would re-propose the very
      // photos this approval just finished linking. Chained on the existing
      // queue (not awaited) so it can never block this tap or race a sibling
      // approval's follow-up — each runs to completion before the next starts.
      followUpQueueRef.current = followUpQueueRef.current
        .then(() => followUpScanner.startScan({ singleTicketId: newTicket.id }))
        .catch(() => {});

      LA();
      setEditingImportId(null);
      setNewTickets(prev => prev.filter(i => i.id !== item.id));
    } finally {
      endProcessing(item.id);
    }
  }, [processingIds, userId, editingImportId, importEditState, beginProcessing, endProcessing, followUpScanner.startScan]);

  const handleRejectImport = useCallback(async (id: string) => {
    if (processingIds.has(id)) return;
    beginProcessing(id);
    try {
      await supabase.from('pending_imports').update({ status: 'rejected' }).eq('id', id);
      LA();
      setNewTickets(prev => prev.filter(i => i.id !== id));
    } finally {
      endProcessing(id);
    }
  }, [processingIds, beginProcessing, endProcessing]);

  // "Approve All" — two-phase pipeline designed to minimise total round trips:
  //
  // Phase 1 (concurrent): each BATCH_CONCURRENCY worker runs the per-item
  //   compress → decode → upload steps via approveProposalUploadOnly (no DB
  //   writes), collecting {proposalId, row} on success into a shared array.
  //   JS is single-threaded so concurrent appends to the results array are safe
  //   — workers only interleave at await boundaries, never on the push() itself.
  //
  // Phase 2 (sequential, after all uploads finish):
  //   • chunked bulk `photos` INSERT  (⌈N/CHUNK⌉ round trips, ≪ N)
  //   • one bulk `proposals` status-flip via .in('id', successIds)  (1 round trip)
  //   • one batched LayoutAnimation + setTicketGroups removal for all successes
  //
  // For a 20-photo group this replaces the old 40 individual DB round trips
  // with ~3-4 total (1-2 chunked inserts + 1 bulk update + uploads already ran
  // concurrently in phase 1). Failure semantics are identical to before: any
  // photo whose upload failed stays `pending` in the list; the `photos` insert
  // and `proposals` flip only happen for uploads that actually succeeded, so
  // "approved always means a photos row genuinely exists" is preserved.
  const handleApproveAll = useCallback(async (group: TicketGroup) => {
    if (!userId || approveAllInFlightRef.current.has(group.ticketId)) return;
    approveAllInFlightRef.current.add(group.ticketId);
    try {
      // Bumped from 4 → 6 now that the JS-thread bottleneck (atob+charCodeAt loop,
      // Tasks #8) is gone and the work is genuinely network-bound and parallelisable.
      // With 4 workers we were getting some thread serialisation on the decode step;
      // now each worker spends almost all its time waiting on network I/O, so adding
      // two more overlapping uploads is net-positive with negligible extra contention.
      const BATCH_CONCURRENCY = 6;
      const BULK_INSERT_CHUNK = 12; // well under PostgREST's default payload limit
      const queue = group.proposals.filter(p => !processingIds.has(p.id));
      if (!queue.length) return;

      // Reserve every queued id up front so the whole group shows busy
      // the instant "Approve All" is pressed (not staggered as workers pick up).
      queue.forEach(p => beginProcessing(p.id));

      // ── Phase 1: concurrent compress → decode → upload ──────────────────
      let cursor = 0;
      const next = (): MatchProposal | undefined => queue[cursor++];
      const uploadResults: Array<{ proposalId: string; row: PhotoRow }> = [];
      let failCount = 0;

      const worker = async () => {
        for (let p = next(); p; p = next()) {
          try {
            const result = await approveProposalUploadOnly(p, group.ticketId, userId);
            if (result) {
              uploadResults.push(result); // safe: JS is single-threaded, push at await yields is atomic
            } else {
              failCount++;
            }
          } finally {
            endProcessing(p.id);
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(BATCH_CONCURRENCY, queue.length) }, worker));

      // ── Phase 2: bulk DB writes + UI removal ─────────────────────────────
      if (uploadResults.length > 0) {
        // Chunked bulk INSERT — each chunk is one round trip; atomic per chunk
        // (a chunk-level failure leaves those N proposals `pending`, still in list)
        for (let i = 0; i < uploadResults.length; i += BULK_INSERT_CHUNK) {
          await supabase.from('photos').insert(
            uploadResults.slice(i, i + BULK_INSERT_CHUNK).map(r => r.row),
          );
        }

        // One bulk proposal status-flip covering the whole successful set
        const successIds = uploadResults.map(r => r.proposalId);
        await supabase.from('photo_match_proposals')
          .update({ status: 'approved' })
          .in('id', successIds);

        // One LayoutAnimation + one state update for all removed cards at once
        LA();
        const successSet = new Set(successIds);
        setTicketGroups(prev =>
          prev
            .map(g => ({ ...g, proposals: g.proposals.filter(p => !successSet.has(p.id)) }))
            .filter(g => g.proposals.length > 0),
        );
      }

      if (failCount > 0) {
        Alert.alert(
          failCount === queue.length ? "Couldn't save these photos" : "Some photos didn't save",
          `${failCount} of ${queue.length} couldn't be saved — they're still in your list, ready to try again.`,
        );
      }
    } finally {
      approveAllInFlightRef.current.delete(group.ticketId);
    }
  }, [processingIds, userId, beginProcessing, endProcessing, approveProposalUploadOnly]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <LinearGradient
        colors={[BRAND_FROM, BRAND_TO]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ paddingBottom: sp(20), borderBottomLeftRadius: scale(32), borderBottomRightRadius: scale(32) }}
      >
        <SafeAreaView edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: sp(20), paddingTop: 4, paddingBottom: 4 }}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ width: scale(40), height: scale(40), borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="arrow-back" size={20} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(12), color: 'rgba(255,255,255,0.72)' }}>Photo Library Scan</Text>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(22), color: '#fff', letterSpacing: -0.4, marginTop: 2 }}>Photo Matches</Text>
            </View>
            <View style={{ width: scale(40) }} />
          </View>
        </SafeAreaView>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator color={BRAND_FROM} style={{ marginTop: sp(60) }} />
      ) : total === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: sp(40) }}>
          <Ionicons name="images-outline" size={64} color={MUTED} />
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(20), color: FG, marginTop: sp(16), textAlign: 'center' }}>No event photos found</Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(14), color: MUTED, marginTop: sp(8), textAlign: 'center' }}>
            You can add photos manually from each event page.
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.85}
            style={{ marginTop: sp(24), overflow: 'hidden', borderRadius: scale(14) }}
          >
            <LinearGradient
              colors={[BRAND_FROM, BRAND_TO]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ paddingHorizontal: sp(28), paddingVertical: sp(13) }}
            >
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(14), color: '#fff' }}>Back</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: sp(20), paddingTop: sp(20), paddingBottom: bottomPad + sp(20), gap: sp(24) }}
        >
          {/* Limited access banner */}
          {isLimitedAccess && (
            <TouchableOpacity
              onPress={() => {
                setTimeout(async () => {
                  try {
                    await MediaLibrary.presentPermissionsPickerAsync();
                  } catch {
                    Linking.openSettings();
                    return;
                  }
                  router.back();
                }, 300);
              }}
              activeOpacity={0.75}
              style={{ flexDirection: 'row', alignItems: 'center', gap: sp(10), backgroundColor: '#fef3c7', borderRadius: scale(14), paddingHorizontal: sp(14), paddingVertical: sp(11), borderWidth: 1, borderColor: '#fde68a' }}
            >
              <Ionicons name="images-outline" size={scale(18)} color="#b45309" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(13), color: '#92400e' }}>Limited photo access</Text>
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(12), color: '#b45309', marginTop: 1 }}>
                  Only your selected photos were scanned. Tap to add more and re-scan.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={scale(14)} color="#b45309" />
            </TouchableOpacity>
          )}

          {/* Summary header */}
          <View style={{ gap: sp(2) }}>
            {scanStats != null && (
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(13), color: FG }}>
                Scanned {scanStats.scanned.toLocaleString()} of {scanStats.total.toLocaleString()} photos · {total} found
              </Text>
            )}
            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(13), color: MUTED }}>
              {total} found — {totalMatched} match your events, {newTickets.length} look like new ones.
            </Text>
          </View>

          {/* ── Section A: Matched to existing tickets ── */}
          {ticketGroups.length > 0 && (
            <View style={{ gap: sp(16) }}>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(16), color: FG }}>
                Photos Matched to Your Tickets
              </Text>

              {ticketGroups.map(group => (
                <TicketGroupCard
                  key={group.ticketId}
                  group={group}
                  processingIds={processingIds}
                  onApprove={handleApproveProposal}
                  onReject={handleRejectProposal}
                  onApproveAll={handleApproveAll}
                />
              ))}
            </View>
          )}

          {/* ── Section B: New event candidates ── */}
          {newTickets.length > 0 && (
            <View style={{ gap: sp(16) }}>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(16), color: FG }}>
                New Events Found in Your Photos
              </Text>

              {newTickets.map(item => (
                <NewTicketCard
                  key={item.id}
                  item={item}
                  processingIds={processingIds}
                  isEditing={editingImportId === item.id}
                  editState={importEditState}
                  onStartEdit={startEditImport}
                  onCancelEdit={cancelEditImport}
                  onChangeEdit={updateImportEdit}
                  onApprove={handleApproveImport}
                  onReject={handleRejectImport}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ── Ticket Group Card ─────────────────────────────────────────────────────────
function TicketGroupCard({
  group, processingIds, onApprove, onReject, onApproveAll,
}: {
  group: TicketGroup;
  processingIds: Set<string>;
  onApprove: (p: MatchProposal, ticketId: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  onApproveAll: (group: TicketGroup) => Promise<void>;
}): React.JSX.Element {
  const tint = group.ticketTint ?? '#b0b8e0';
  // "Approve All" should freeze only once ITS OWN photos start moving — not
  // whenever some other card on screen happens to be mid-approval. Now that
  // separate groups can be approved concurrently (see handleApproveAll), there's
  // no shared-state reason to block them from one another.
  const groupBusy = group.proposals.some(p => processingIds.has(p.id));

  return (
    <View style={{
      backgroundColor: SURFACE, borderRadius: scale(20), overflow: 'hidden',
      shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.10, shadowRadius: 16, elevation: 4,
    }}>
      <View style={{ height: 4, backgroundColor: tint }} />

      <View style={{ padding: sp(14) }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: sp(10) }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(14), color: FG }} numberOfLines={1}>
              {group.ticketTitle ?? 'Event'}
            </Text>
            {group.ticketDate && (
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(12), color: MUTED }}>
                {group.ticketDate}
              </Text>
            )}
          </View>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(12), color: MUTED }}>
            {group.proposals.length} photo{group.proposals.length !== 1 ? 's' : ''}
          </Text>
        </View>

        {/* Thumbnail row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: sp(8), paddingBottom: sp(4) }}
        >
          {group.proposals.map(p => (
            <ProposalThumb
              key={p.id}
              proposal={p}
              ticketId={group.ticketId}
              processingIds={processingIds}
              onApprove={onApprove}
              onReject={onReject}
            />
          ))}
        </ScrollView>

        {/* Approve all button */}
        {group.proposals.length > 1 && (
          <TouchableOpacity
            onPress={() => onApproveAll(group)}
            disabled={groupBusy}
            activeOpacity={0.8}
            style={{
              marginTop: sp(10), borderRadius: scale(10), overflow: 'hidden',
              opacity: groupBusy ? 0.5 : 1,
            }}
          >
            <LinearGradient
              colors={[BRAND_FROM, BRAND_TO]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ paddingVertical: sp(10), alignItems: 'center' }}
            >
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(13), color: '#fff' }}>
                Approve All ({group.proposals.length})
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── Individual Photo Thumbnail ────────────────────────────────────────────────
function ProposalThumb({
  proposal, ticketId, processingIds, onApprove, onReject,
}: {
  proposal: MatchProposal;
  ticketId: string;
  processingIds: Set<string>;
  onApprove: (p: MatchProposal, ticketId: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
}): React.JSX.Element {
  const score = proposal.ai_confidence ?? proposal.match_score;
  const color = confidenceColor(score);
  const isProcessing = processingIds.has(proposal.id);

  return (
    <View style={{ width: scale(100), borderRadius: scale(10), overflow: 'hidden', backgroundColor: BG }}>
      {/* Thumbnail */}
      <View style={{ width: scale(100), height: scale(100), backgroundColor: `${MUTED}22`, position: 'relative' }}>
        {proposal.local_uri ? (
          <Image source={{ uri: proposal.local_uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="image-outline" size={32} color={MUTED} />
          </View>
        )}

        {/* Video badge */}
        {proposal.media_type === 'video' && (
          <View style={{
            position: 'absolute', top: 5, left: 5,
            backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 99,
            paddingHorizontal: 5, paddingVertical: 2,
            flexDirection: 'row', alignItems: 'center', gap: 2,
          }}>
            <Ionicons name="play" size={8} color="#fff" />
          </View>
        )}

        {/* Match score badge */}
        <View style={{
          position: 'absolute', top: 5, right: 5,
          backgroundColor: `${color}dd`, borderRadius: 99,
          paddingHorizontal: 5, paddingVertical: 2,
        }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(9), color: '#fff' }}>
            {Math.round(score * 100)}%
          </Text>
        </View>

        {/* Date badge */}
        {proposal.exif_taken_at && (
          <View style={{
            position: 'absolute', bottom: 5, left: 4, right: 4,
            backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 5,
            paddingHorizontal: 4, paddingVertical: 2,
          }}>
            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(8), color: '#fff' }} numberOfLines={1}>
              {formatDate(proposal.exif_taken_at)}
            </Text>
          </View>
        )}
      </View>

      {/* Action buttons */}
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: `${FG}08` }}>
        <TouchableOpacity
          onPress={() => onReject(proposal.id)}
          disabled={isProcessing}
          style={{ flex: 1, paddingVertical: sp(7), alignItems: 'center' }}
          activeOpacity={0.7}
        >
          {isProcessing
            ? <ActivityIndicator size="small" color={MUTED} />
            : <Ionicons name="close" size={16} color={RED} />
          }
        </TouchableOpacity>
        <View style={{ width: 1, backgroundColor: `${FG}08` }} />
        <TouchableOpacity
          onPress={() => onApprove(proposal, ticketId)}
          disabled={isProcessing}
          style={{ flex: 1, paddingVertical: sp(7), alignItems: 'center' }}
          activeOpacity={0.7}
        >
          {isProcessing
            ? <ActivityIndicator size="small" color={GREEN} />
            : <Ionicons name="checkmark" size={16} color={GREEN} />
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── New Ticket Card (Section B) ───────────────────────────────────────────────
function NewTicketCard({
  item, processingIds, isEditing, editState, onStartEdit, onCancelEdit, onChangeEdit, onApprove, onReject,
}: {
  item: PendingImport;
  processingIds: Set<string>;
  isEditing: boolean;
  editState: ImportEditState;
  onStartEdit: (item: PendingImport) => void;
  onCancelEdit: () => void;
  onChangeEdit: (patch: Partial<ImportEditState>) => void;
  onApprove: (item: PendingImport) => Promise<void>;
  onReject: (id: string) => Promise<void>;
}): React.JSX.Element {
  const d = item.raw_data;
  const tint      = d.tint ?? '#b0b8e0';
  const confPct   = Math.round(item.confidence * 100);
  const confColor = confidenceColor(item.confidence);
  const dispCat   = DB_TO_DISPLAY[d.category] ?? 'Other';
  const isProcessing = processingIds.has(item.id);
  const assetIds  = d.device_asset_ids ?? [];

  // "Verify photos" — lazily resolves the cluster's constituent media from their
  // device_asset_ids so the user can confirm this candidate was built from the
  // right photos before approving (or spot a bad cluster and reject/edit it).
  const [expanded, setExpanded] = useState(false);
  const [photos, setPhotos] = useState<ClusterMedia[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);

  const togglePhotos = useCallback(async () => {
    LA();
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (photos.length || loadingPhotos || !assetIds.length) return;

    setLoadingPhotos(true);
    try {
      // Cap at 40 — clusters can hold hundreds of assets and we're only showing a
      // verification strip, not the full gallery.
      const ids = assetIds.slice(0, 40);
      const resolved = await Promise.all(ids.map(async (assetId): Promise<ClusterMedia> => {
        try {
          const info = await MediaLibrary.getAssetInfoAsync(assetId);
          return { assetId, uri: info?.localUri ?? info?.uri ?? null, isVideo: info?.mediaType === 'video' };
        } catch {
          return { assetId, uri: null, isVideo: false };
        }
      }));
      setPhotos(resolved);
    } finally {
      setLoadingPhotos(false);
    }
  }, [expanded, photos.length, loadingPhotos, assetIds]);

  return (
    <View style={{
      backgroundColor: SURFACE, borderRadius: scale(20), overflow: 'hidden',
      shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.10, shadowRadius: 16, elevation: 4,
    }}>
      <View style={{ height: 5, backgroundColor: tint }} />

      <View style={{ padding: sp(16) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: sp(10) }}>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(11), color: MUTED, flex: 1, marginRight: sp(8) }} numberOfLines={1}>
            {d.subject}
          </Text>
          <View style={{ backgroundColor: `${confColor}18`, borderRadius: 99, paddingHorizontal: sp(8), paddingVertical: 3 }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(10), color: confColor }}>{confPct}% match</Text>
          </View>
        </View>

        {isEditing ? (
          <View style={{ gap: sp(10) }}>
            <ReviewField label="Title" value={editState.title} onChangeText={t => onChangeEdit({ title: t })} placeholder="e.g. NYC Trip" />
            <ReviewField label="Venue / Location" value={editState.venue} onChangeText={t => onChangeEdit({ venue: t })} placeholder="e.g. New York City, NY" />
            <View style={{ flexDirection: 'row', gap: sp(10) }}>
              <View style={{ flex: 1 }}>
                <ReviewField label="Date" value={editState.date} onChangeText={t => onChangeEdit({ date: t })} placeholder="e.g. Jun 1, 2026" />
              </View>
              <View style={{ flex: 1 }}>
                <ReviewField label="Time" value={editState.time} onChangeText={t => onChangeEdit({ time: t })} placeholder="e.g. 8:00 PM" />
              </View>
            </View>
            <View>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(12), color: FG, marginBottom: sp(6) }}>Category</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sp(6) }}>
                {CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => onChangeEdit({ category: cat })}
                    style={{
                      paddingHorizontal: sp(12), paddingVertical: sp(6), borderRadius: 99,
                      backgroundColor: editState.category === cat ? BRAND_FROM : BG,
                    }}
                  >
                    <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(11), color: editState.category === cat ? '#fff' : FG }}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        ) : (
          <View style={{ gap: sp(6) }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(16), color: FG, letterSpacing: -0.2 }} numberOfLines={2}>
              {d.title ?? 'Untitled'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="location-outline" size={12} color={MUTED} />
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(13), color: MUTED }} numberOfLines={1}>{d.venue ?? 'TBD'}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="calendar-outline" size={12} color={MUTED} />
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(13), color: MUTED }}>
                {d.date ?? 'TBD'}{d.time ? ` · ${d.time}` : ''}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', marginTop: 2 }}>
              <View style={{ backgroundColor: `${tint}55`, borderRadius: 99, paddingHorizontal: sp(9), paddingVertical: 3 }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(10), color: FG, textTransform: 'uppercase', letterSpacing: 0.5 }}>{dispCat}</Text>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Verify photos — expand to see the actual media this candidate was built from */}
      {assetIds.length > 0 && (
        <View style={{ paddingHorizontal: sp(16), paddingBottom: sp(14) }}>
          <TouchableOpacity
            onPress={togglePhotos}
            activeOpacity={0.7}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
              backgroundColor: BG, borderRadius: 99, paddingHorizontal: sp(12), paddingVertical: sp(7),
            }}
          >
            <Ionicons name={expanded ? 'chevron-up-outline' : 'images-outline'} size={14} color={BRAND_FROM} />
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(12), color: BRAND_FROM }}>
              {expanded ? 'Hide photos' : `Verify photos (${assetIds.length})`}
            </Text>
          </TouchableOpacity>

          {expanded && (
            loadingPhotos ? (
              <View style={{ paddingVertical: sp(16), alignItems: 'center' }}>
                <ActivityIndicator color={BRAND_FROM} size="small" />
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: sp(8), paddingTop: sp(10) }}
              >
                {photos.map(p => (
                  <View key={p.assetId} style={{ width: scale(84), height: scale(84), borderRadius: scale(10), overflow: 'hidden', backgroundColor: BG, position: 'relative' }}>
                    {p.uri ? (
                      <Image source={{ uri: p.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    ) : (
                      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="image-outline" size={26} color={MUTED} />
                      </View>
                    )}
                    {p.isVideo && (
                      <View style={{
                        position: 'absolute', top: 5, left: 5,
                        backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 99,
                        paddingHorizontal: 5, paddingVertical: 3,
                      }}>
                        <Ionicons name="play" size={8} color="#fff" />
                      </View>
                    )}
                  </View>
                ))}
                {assetIds.length > photos.length && (
                  <View style={{ width: scale(84), height: scale(84), borderRadius: scale(10), backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(12), color: MUTED }}>
                      +{assetIds.length - photos.length}
                    </Text>
                  </View>
                )}
              </ScrollView>
            )
          )}
        </View>
      )}

      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: `${FG}08` }}>
        <TouchableOpacity
          onPress={() => onReject(item.id)}
          disabled={!!isProcessing}
          style={{ flex: 1, paddingVertical: sp(14), alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
          activeOpacity={0.7}
        >
          <Ionicons name="close-circle-outline" size={17} color={RED} />
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(13), color: RED }}>Reject</Text>
        </TouchableOpacity>

        <View style={{ width: 1, backgroundColor: `${FG}08` }} />

        <TouchableOpacity
          onPress={() => isEditing ? onCancelEdit() : onStartEdit(item)}
          disabled={!!isProcessing}
          style={{ flex: 1, paddingVertical: sp(14), alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
          activeOpacity={0.7}
        >
          <Ionicons name={isEditing ? 'close-outline' : 'create-outline'} size={17} color={MUTED} />
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(13), color: MUTED }}>{isEditing ? 'Cancel' : 'Edit'}</Text>
        </TouchableOpacity>

        <View style={{ width: 1, backgroundColor: `${FG}08` }} />

        <TouchableOpacity
          onPress={() => onApprove(item)}
          disabled={!!isProcessing}
          style={{ flex: 1, paddingVertical: sp(14), alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
          activeOpacity={0.7}
        >
          {isProcessing
            ? <ActivityIndicator color={GREEN} size="small" />
            : <>
                <Ionicons name="checkmark-circle-outline" size={17} color={GREEN} />
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(13), color: GREEN }}>Approve</Text>
              </>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ReviewField({ label, value, onChangeText, placeholder }: {
  label: string; value: string; onChangeText: (t: string) => void; placeholder: string;
}): React.JSX.Element {
  return (
    <View>
      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(11), color: FG, marginBottom: sp(4) }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#6b6a85"
        style={{
          backgroundColor: BG, borderRadius: scale(10), paddingHorizontal: sp(12), paddingVertical: sp(9),
          fontFamily: 'DMSans_400Regular', fontSize: scaleFont(13), color: FG,
        }}
      />
    </View>
  );
}
