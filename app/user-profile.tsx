import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image, ActivityIndicator, Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { scale, SCREEN_W } from '@/lib/layout';
import { useBottomPad } from '@/lib/useBottomPad';
import { supabase } from '@/lib/supabase/client';
import { useFriends } from '@/lib/useFriends';
import { isEventPast } from '@/lib/parseEventDate';

const BRAND_FROM = '#4f6cf2';
const BRAND_TO   = '#a25cf2';
const FG         = '#1a1530';
const MUTED      = '#6b6a85';
const SURFACE    = '#ffffff';
const BG         = '#eef0fb';
const BORDER     = '#e6e4f0';

const MONTHS = ['J','F','M','A','M','J','J','A','S','O','N','D'];
const BAR_MAX_H = 78;
const BADGE_W   = (SCREEN_W - 40 - 12) / 2;
const PHOTO_CELL = Math.floor((SCREEN_W - 40 - 8) / 3);
const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400&q=85';

const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  concert:  { label: 'Concerts',  color: BRAND_FROM },
  festival: { label: 'Festivals', color: '#e879f9' },
  sports:   { label: 'Sports',    color: '#34d399' },
  theater:  { label: 'Theatre',   color: '#fbbf24' },
  dining:   { label: 'Dining',    color: '#f97316' },
  trip:     { label: 'Trips',     color: '#22d3ee' },
  other:    { label: 'Other',     color: '#94a3b8' },
};

const CARD_GRADIENTS: [string, string][] = [
  ['#1e1b4b', '#7c3aed'],
  ['#fb7185', '#f59e0b'],
  ['#7c3aed', '#fbbf24'],
  ['#0ea5e9', '#22d3ee'],
  ['#dc2626', '#7f1d1d'],
];

const LEVELS = [
  { threshold: 0,   label: 'Explorer' },
  { threshold: 10,  label: 'Scout' },
  { threshold: 25,  label: 'Regular' },
  { threshold: 50,  label: 'Devotee' },
  { threshold: 100, label: 'Maestro' },
  { threshold: 200, label: 'Legend' },
];

function getLevelInfo(shows: number) {
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (shows >= LEVELS[i].threshold) idx = i;
    else break;
  }
  const current = LEVELS[idx];
  const next = LEVELS[idx + 1];
  return {
    lvlNum: idx + 1,
    label: current.label,
    progress: next
      ? Math.min(1, (shows - current.threshold) / (next.threshold - current.threshold))
      : 1,
    toNext: next ? next.threshold - shows : 0,
    nextLabel: next?.label ?? '',
  };
}

function parseDateStr(s: string | null | undefined): { month: number; year: number } | null {
  if (!s) return null;
  const iso = s.match(/(\d{4})-(\d{2})-\d{2}/);
  if (iso) return { year: parseInt(iso[1], 10), month: parseInt(iso[2], 10) - 1 };
  const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const lower = s.toLowerCase();
  const yearMatch = lower.match(/\b(20\d{2})\b/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();
  for (let i = 0; i < monthNames.length; i++) {
    if (lower.includes(monthNames[i])) return { year, month: i };
  }
  return null;
}

type BadgeDef = {
  id: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  tagline: string;
  from: string;
  to: string;
  condition: (d: BadgeData) => boolean;
};

type BadgeData = {
  totalShows: number;
  uniqueVenues: number;
  categoryCounts: Record<string, number>;
  categoryCount: number;
  accountAgeYears: number;
  monthsActive: number;
  hasRepeatShow: boolean;
};

type TicketHistoryRow = {
  id: string;
  title: string | null;
  venue_name: string | null;
  date_str: string | null;
  category: string;
  image_url: string | null;
};

const BADGE_DEFS: BadgeDef[] = [
  { id: 'first_show',         icon: 'star-outline',          label: 'First Show',         tagline: 'Welcome to the live life',     from: '#fbbf24', to: '#f97316', condition: d => d.totalShows >= 1   },
  { id: 'double_digits',      icon: 'trophy-outline',        label: 'Double Digits',      tagline: "You're just getting started",  from: '#fb923c', to: '#ef4444', condition: d => d.totalShows >= 10  },
  { id: 'century_club',       icon: 'medal-outline',         label: 'Century Club',       tagline: 'A true live event obsessive',  from: '#a78bfa', to: '#4f6cf2', condition: d => d.totalShows >= 100 },
  { id: 'crate_digger',       icon: 'headset-outline',       label: 'Crate Digger',       tagline: 'Concert floor regular',        from: '#22d3ee', to: '#2563eb', condition: d => (d.categoryCounts.concert  ?? 0) > 0 },
  { id: 'festival_weekender', icon: 'musical-notes-outline', label: 'Festival Weekender', tagline: 'Mud, music & memories',        from: '#e879f9', to: '#9333ea', condition: d => (d.categoryCounts.festival ?? 0) > 0 },
  { id: 'sports_fanatic',     icon: 'football-outline',      label: 'Sports Fanatic',     tagline: 'Cheering from the stands',     from: '#34d399', to: '#059669', condition: d => (d.categoryCounts.sports  ?? 0) > 0 },
  { id: 'globe_trotter',      icon: 'airplane-outline',      label: 'Globe Trotter',      tagline: 'Shows beyond your backyard',   from: '#22d3ee', to: '#0ea5e9', condition: d => (d.categoryCounts.trip    ?? 0) > 0 },
  { id: 'taste_explorer',     icon: 'sparkles',              label: 'Taste Explorer',     tagline: 'A little bit of everything',   from: '#a25cf2', to: '#4f6cf2', condition: d => d.categoryCount >= 4        },
  { id: 'venue_hopper',       icon: 'location-outline',      label: 'Venue Hopper',       tagline: "You've been everywhere",       from: '#f87171', to: '#dc2626', condition: d => d.uniqueVenues >= 10        },
  { id: 'loyal_fan',          icon: 'heart-outline',         label: 'Loyal Fan',          tagline: 'Been here since day one',      from: '#fb7185', to: '#e11d48', condition: d => d.accountAgeYears >= 1      },
  { id: 'season_regular',     icon: 'calendar-outline',      label: 'Season Regular',     tagline: 'Showing up all year long',     from: '#818cf8', to: '#4f6cf2', condition: d => d.monthsActive >= 4         },
  { id: 'repeat_offender',    icon: 'repeat-outline',        label: 'Repeat Offender',    tagline: "Can't get enough",             from: '#fb923c', to: '#fbbf24', condition: d => d.hasRepeatShow             },
];

export default function UserProfileScreen(): React.JSX.Element {
  const router    = useRouter();
  const bottomPad = useBottomPad();
  const params    = useLocalSearchParams<{ userId: string; friendshipId: string; mutualEvents: string }>();
  const { removeFriend, sendRequest, withdrawRequest } = useFriends();

  const userId      = params.userId;
  const mutualEvents = parseInt(params.mutualEvents ?? '0', 10);

  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [removing,      setRemoving]      = useState(false);
  const [showAllBadges, setShowAllBadges] = useState(false);
  const [lightboxUri,   setLightboxUri]   = useState<string | null>(null);

  // Friendship state
  const [isFriend,          setIsFriend]          = useState(false);
  const [friendshipDbId,    setFriendshipDbId]    = useState<string | null>(null);
  const [friendRequestSent, setFriendRequestSent] = useState(false);

  // Profile fields
  const [displayName,    setDisplayName]    = useState('');
  const [avatarUrl,      setAvatarUrl]      = useState<string | null>(null);
  const [joinYear,       setJoinYear]       = useState<number | null>(null);
  const [totalShows,     setTotalShows]     = useState(0);
  const [uniqueVenues,   setUniqueVenues]   = useState(0);
  const [pastShows,      setPastShows]      = useState(0);
  const [yearShows,      setYearShows]      = useState(0);
  const [monthlyBars,    setMonthlyBars]    = useState<number[]>(new Array(12).fill(0));
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [dnaSegments,    setDnaSegments]    = useState<{ label: string; pct: number; color: string }[]>([]);
  const [mostSeen,       setMostSeen]       = useState<{ name: string; times: number; from: string; to: string }[]>([]);

  // Friends-only content
  const [tickets, setTickets] = useState<TicketHistoryRow[]>([]);
  const [photos,  setPhotos]  = useState<{ id: string; url: string }[]>([]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      const { data: { user: me } } = await supabase.auth.getUser();
      if (!me || cancelled) return;

      // Check friendship status in a single query (accepted or pending)
      const { data: friendshipRow } = await supabase
        .from('friendships')
        .select('id, status, requester_id')
        .or(`and(requester_id.eq.${me.id},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${me.id})`)
        .maybeSingle();

      const isFriendResult   = friendshipRow?.status === 'accepted';
      const isSentRequest    = friendshipRow?.status === 'pending' && friendshipRow?.requester_id === me.id;

      setIsFriend(isFriendResult);
      setFriendshipDbId(friendshipRow?.id ?? null);
      setFriendRequestSent(isSentRequest);

      const [profileRes, ticketsRes, photosRes] = await Promise.all([
        supabase.from('users').select('display_name, avatar_url, created_at').eq('id', userId).single(),
        isFriendResult
          // Friends: full columns for history list (allowed by RLS)
          ? supabase.from('tickets')
              .select('id, title, venue_name, date_str, category, image_url, is_past')
              .eq('user_id', userId).eq('status', 'active')
              .order('date_str', { ascending: false })
          // Non-friends: SECURITY DEFINER RPC returns only aggregate fields, bypassing RLS
          : supabase.rpc('get_public_ticket_stats', { target_user_id: userId }),
        isFriendResult
          ? supabase.from('photos').select('id, storage_url').eq('user_id', userId).order('taken_at', { ascending: false }).limit(30)
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (cancelled) return;
      if (profileRes.error) { setError('Could not load profile.'); setLoading(false); return; }

      const p = profileRes.data;
      setDisplayName(p.display_name ?? 'Friend');
      setAvatarUrl(p.avatar_url ?? null);
      setJoinYear(p.created_at ? new Date(p.created_at).getFullYear() : null);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allTickets: any[] = ticketsRes.data ?? [];
      setTotalShows(allTickets.length);
      setUniqueVenues(new Set(allTickets.map(t => t.venue_name).filter(Boolean)).size);
      setPastShows(allTickets.filter(t => isEventPast(t.date_str)).length);

      const currentYear = new Date().getFullYear();
      const bars = new Array(12).fill(0);
      let thisYear = 0;
      for (const t of allTickets) {
        const parsed = parseDateStr(t.date_str);
        if (parsed && parsed.year === currentYear) { bars[parsed.month]++; thisYear++; }
      }
      setMonthlyBars(bars);
      setYearShows(thisYear);

      const catCounts: Record<string, number> = {};
      for (const t of allTickets) catCounts[t.category] = (catCounts[t.category] ?? 0) + 1;
      setCategoryCounts(catCounts);

      const totalCats = Object.values(catCounts).reduce((s, n) => s + n, 0);
      if (totalCats > 0) {
        setDnaSegments(
          Object.entries(catCounts)
            .map(([cat, count]) => ({ label: CATEGORY_CONFIG[cat]?.label ?? cat, pct: Math.round((count / totalCats) * 100), color: CATEGORY_CONFIG[cat]?.color ?? '#94a3b8' }))
            .sort((a, b) => b.pct - a.pct).slice(0, 4),
        );
      }

      if (isFriendResult) {
        const titleCounts: Record<string, number> = {};
        for (const t of allTickets) {
          if (t.title) titleCounts[t.title] = (titleCounts[t.title] ?? 0) + 1;
        }
        setMostSeen(
          Object.entries(titleCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
            .map(([name, times], i) => ({ name, times, from: CARD_GRADIENTS[i % CARD_GRADIENTS.length][0], to: CARD_GRADIENTS[i % CARD_GRADIENTS.length][1] })),
        );

        setTickets(allTickets.map(t => ({
          id:         t.id,
          title:      t.title      ?? null,
          venue_name: t.venue_name ?? null,
          date_str:   t.date_str   ?? null,
          category:   t.category,
          image_url:  t.image_url  ?? null,
        })));

        const rawPhotos = (photosRes.data ?? []) as { id: string; storage_url: string }[];
        setPhotos(rawPhotos.map(ph => ({ id: ph.id, url: ph.storage_url })));
      }

      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [userId]);

  const handleUnfriend = useCallback(async () => {
    if (!friendshipDbId) return;
    setRemoving(true);
    try { await removeFriend(friendshipDbId); router.back(); }
    catch { setRemoving(false); }
  }, [friendshipDbId, removeFriend, router]);

  const handleAddFriend = useCallback(async () => {
    try {
      await sendRequest(userId);
      const { data: { user: me } } = await supabase.auth.getUser();
      if (!me) return;
      const { data: row } = await supabase
        .from('friendships')
        .select('id')
        .eq('requester_id', me.id)
        .eq('addressee_id', userId)
        .eq('status', 'pending')
        .maybeSingle();
      setFriendshipDbId(row?.id ?? null);
      setFriendRequestSent(true);
    } catch {}
  }, [sendRequest, userId]);

  const handleWithdraw = useCallback(async () => {
    if (!friendshipDbId) return;
    try {
      await withdrawRequest(friendshipDbId, userId);
      setFriendRequestSent(false);
      setFriendshipDbId(null);
    } catch {}
  }, [withdrawRequest, friendshipDbId, userId]);

  const initials  = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';
  const levelInfo = getLevelInfo(totalShows);
  const maxBar    = Math.max(...monthlyBars, 1);

  const badgeData: BadgeData = {
    totalShows, uniqueVenues, categoryCounts,
    categoryCount:   Object.keys(categoryCounts).length,
    accountAgeYears: joinYear ? new Date().getFullYear() - joinYear : 0,
    monthsActive:    monthlyBars.filter(v => v > 0).length,
    hasRepeatShow:   mostSeen.some(s => s.times >= 2),
  };
  const allBadges      = BADGE_DEFS.map(b => ({ ...b, earned: b.condition(badgeData) }));
  const earnedCount    = allBadges.filter(b => b.earned).length;
  const sortedBadges   = [...allBadges.filter(b => b.earned), ...allBadges.filter(b => !b.earned)];
  const displayedBadges = showAllBadges ? sortedBadges : sortedBadges.filter(b => b.earned);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={BRAND_FROM} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <Ionicons name="alert-circle-outline" size={48} color={MUTED} />
        <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, marginTop: 16 }}>Couldn't load profile</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: BRAND_FROM, borderRadius: 99 }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: '#fff' }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad }}>

        {/* ── Passport Header ── */}
        <LinearGradient
          colors={[BRAND_FROM, BRAND_TO]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ paddingBottom: 56, borderBottomLeftRadius: 40, borderBottomRightRadius: 40 }}
        >
          <SafeAreaView edges={['top']}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 20 }}>
              <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="chevron-back" size={20} color="#fff" />
              </TouchableOpacity>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 11, color: 'rgba(255,255,255,0.85)', letterSpacing: 2, textTransform: 'uppercase' }}>
                Salty · Passport
              </Text>
              <View style={{ width: 40 }} />
            </View>

            <View style={{ alignItems: 'center', paddingHorizontal: 20 }}>
              {/* Avatar */}
              <View style={{ width: scale(96), height: scale(96), borderRadius: scale(48), padding: 3, backgroundColor: 'rgba(255,255,255,0.45)' }}>
                <View style={{ flex: 1, borderRadius: scale(45), overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                  {avatarUrl
                    ? <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    : <Text style={{ fontFamily: 'BebasNeue_400Regular', fontSize: 32, color: '#fff' }}>{initials}</Text>
                  }
                </View>
              </View>

              {/* Level pill */}
              <View style={{ backgroundColor: '#fff', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, marginTop: -10, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 10, color: FG, letterSpacing: 0.3 }}>
                  LVL {levelInfo.lvlNum} · {levelInfo.label}
                </Text>
              </View>

              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 22, color: '#fff', letterSpacing: -0.4, marginTop: 14 }}>
                {displayName}
              </Text>
              {joinYear && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
                  <Ionicons name="calendar-outline" size={12} color="rgba(255,255,255,0.9)" />
                  <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: 'rgba(255,255,255,0.9)' }}>
                    Live since {joinYear}
                  </Text>
                </View>
              )}

              {/* Progress bar */}
              <View style={{ width: '100%', maxWidth: 280, marginTop: 20 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 11, color: 'rgba(255,255,255,0.9)' }}>
                    {totalShows} event{totalShows !== 1 ? 's' : ''}
                  </Text>
                  {levelInfo.toNext > 0 && (
                    <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 11, color: 'rgba(255,255,255,0.9)' }}>
                      {levelInfo.toNext} to {levelInfo.nextLabel}
                    </Text>
                  )}
                </View>
                <View style={{ height: 6, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden' }}>
                  <View style={{ width: `${Math.round(levelInfo.progress * 100)}%`, height: 6, borderRadius: 99, backgroundColor: '#fff' }} />
                </View>
              </View>
            </View>
          </SafeAreaView>
        </LinearGradient>

        {/* ── Stats Strip ── */}
        <View style={{
          marginTop: -40, marginHorizontal: 20,
          backgroundColor: SURFACE, borderRadius: 24,
          flexDirection: 'row', paddingVertical: 16,
          shadowColor: '#503cb4', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.13, shadowRadius: 20, elevation: 6,
        }}>
          {([
            [String(totalShows),  'Shows'],
            [String(uniqueVenues),'Venues'],
            [String(pastShows),   'Attended'],
            [String(mutualEvents),'Mutual'],
          ] as [string, string][]).map(([val, label], i) => (
            <View key={label} style={{ flex: 1, alignItems: 'center', borderLeftWidth: i > 0 ? 1 : 0, borderLeftColor: BORDER }}>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 20, color: i === 3 ? BRAND_FROM : FG }}>{val}</Text>
              <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 10, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 }}>{label}</Text>
            </View>
          ))}
        </View>

        {/* ── Friend CTA (non-friends only) ── */}
        {!isFriend && (
          <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
            {friendRequestSent ? (
              <TouchableOpacity
                onPress={handleWithdraw}
                activeOpacity={0.85}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 16, backgroundColor: '#f1eefb' }}
              >
                <Ionicons name="time-outline" size={18} color={MUTED} />
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: MUTED }}>Request Pending · Tap to cancel</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={handleAddFriend} activeOpacity={0.88} style={{ borderRadius: 16, overflow: 'hidden' }}>
                <LinearGradient
                  colors={[BRAND_FROM, BRAND_TO]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 }}
                >
                  <Ionicons name="person-add-outline" size={18} color="#fff" />
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: '#fff' }}>Add Friend</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Year in Live ── */}
        <View style={{ paddingHorizontal: 20, marginTop: 28 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 }}>
            <View>
              <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 10, color: MUTED, letterSpacing: 1, textTransform: 'uppercase' }}>{new Date().getFullYear()} Year in Live</Text>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, letterSpacing: -0.3, marginTop: 2 }}>
                {yearShows} show{yearShows !== 1 ? 's' : ''} this year
              </Text>
            </View>
          </View>
          <View style={{ backgroundColor: SURFACE, borderRadius: 24, padding: 16, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.09, shadowRadius: 16, elevation: 3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: BAR_MAX_H + 20, gap: 4 }}>
              {monthlyBars.map((v, i) => {
                const barH = v === 0 ? 3 : Math.max(8, (v / maxBar) * BAR_MAX_H);
                return (
                  <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
                    <LinearGradient
                      colors={[BRAND_FROM, BRAND_TO]}
                      start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                      style={{ width: '100%', height: barH, borderRadius: 4, opacity: v === 0 ? 0.25 : 0.92 }}
                    />
                    <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 9, color: MUTED }}>{MONTHS[i]}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {/* ── Taste DNA ── */}
        {dnaSegments.length > 0 && (
          <View style={{ paddingHorizontal: 20, marginTop: 28 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <Ionicons name="sparkles" size={16} color={BRAND_FROM} />
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, letterSpacing: -0.3 }}>Taste DNA</Text>
            </View>
            <View style={{ backgroundColor: SURFACE, borderRadius: 24, padding: 20, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.09, shadowRadius: 16, elevation: 3 }}>
              <View style={{ flexDirection: 'row', height: 12, borderRadius: 99, overflow: 'hidden' }}>
                {dnaSegments.map(seg => <View key={seg.label} style={{ flex: seg.pct, backgroundColor: seg.color }} />)}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 16, rowGap: 10, columnGap: 16 }}>
                {dnaSegments.map(seg => (
                  <View key={seg.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: '45%' }}>
                    <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: seg.color }} />
                    <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: FG, flex: 1 }}>{seg.label}</Text>
                    <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: MUTED }}>{seg.pct}%</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* ── Most Seen (friends only) ── */}
        {mostSeen.length > 0 && (
          <View style={{ marginTop: 28 }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, letterSpacing: -0.3, paddingHorizontal: 20, marginBottom: 12 }}>Most seen</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
              {mostSeen.map((item, i) => (
                <View key={item.name} style={{ width: 120, height: 120, borderRadius: 18, overflow: 'hidden', shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 14, elevation: 4 }}>
                  <LinearGradient colors={[item.from, item.to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, padding: 10, justifyContent: 'space-between' }}>
                    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 10, color: FG }}>{i + 1}</Text>
                    </View>
                    <View>
                      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: '#fff' }} numberOfLines={1}>{item.name}</Text>
                      <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 10, color: 'rgba(255,255,255,0.9)', marginTop: 2 }}>seen {item.times}×</Text>
                    </View>
                  </LinearGradient>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Ticket History (friends) / Lock (non-friends) ── */}
        {isFriend && tickets.length > 0 && (
          <View style={{ paddingHorizontal: 20, marginTop: 28 }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, letterSpacing: -0.3, marginBottom: 12 }}>Their Tickets</Text>
            <View style={{ gap: 10 }}>
              {tickets.map(ticket => {
                const catColor = CATEGORY_CONFIG[ticket.category]?.color ?? '#94a3b8';
                const catLabel = CATEGORY_CONFIG[ticket.category]?.label ?? ticket.category;
                const subtitle = [ticket.venue_name, ticket.date_str].filter(Boolean).join(' · ');
                return (
                  <View key={ticket.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: SURFACE, borderRadius: 16, padding: 12, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 }}>
                    <Image
                      source={{ uri: ticket.image_url ?? DEFAULT_IMAGE }}
                      style={{ width: 56, height: 56, borderRadius: 10 }}
                      resizeMode="cover"
                    />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <View style={{ backgroundColor: catColor, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 9, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.4 }}>{catLabel}</Text>
                        </View>
                      </View>
                      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: FG, lineHeight: 18 }} numberOfLines={1}>
                        {ticket.title ?? 'Event'}
                      </Text>
                      {!!subtitle && (
                        <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: MUTED, marginTop: 2 }} numberOfLines={1}>
                          {subtitle}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* ── Photos (friends only) ── */}
        {isFriend && photos.length > 0 && (
          <View style={{ paddingHorizontal: 20, marginTop: 28 }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, letterSpacing: -0.3, marginBottom: 12 }}>Their Photos</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
              {photos.map(photo => (
                <TouchableOpacity key={photo.id} onPress={() => setLightboxUri(photo.url)} activeOpacity={0.88}>
                  <Image source={{ uri: photo.url }} style={{ width: PHOTO_CELL, height: PHOTO_CELL, borderRadius: 10 }} resizeMode="cover" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Badges ── */}
        <View style={{ paddingHorizontal: 20, marginTop: 28 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, letterSpacing: -0.3 }}>Badges</Text>
              <View style={{ backgroundColor: earnedCount > 0 ? BRAND_FROM : BORDER, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 10, color: earnedCount > 0 ? '#fff' : MUTED }}>
                  {earnedCount} / {BADGE_DEFS.length}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => setShowAllBadges(v => !v)}>
              <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 12, color: BRAND_FROM }}>
                {showAllBadges ? 'Show less' : 'See all'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {displayedBadges.map(b => (
              <View key={b.id} style={{ width: BADGE_W, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: SURFACE, borderRadius: 16, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 4 }, shadowOpacity: b.earned ? 0.08 : 0.04, shadowRadius: 10, elevation: b.earned ? 2 : 1, opacity: b.earned ? 1 : 0.6 }}>
                <View style={{ position: 'relative' }}>
                  {b.earned
                    ? <LinearGradient colors={[b.from, b.to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name={b.icon} size={20} color="#fff" />
                      </LinearGradient>
                    : <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#e5e3f0', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name={b.icon} size={20} color="#b0aec8" />
                        <View style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: 8, backgroundColor: SURFACE, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: BORDER }}>
                          <Ionicons name="lock-closed" size={8} color={MUTED} />
                        </View>
                      </View>
                  }
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: b.earned ? FG : MUTED, lineHeight: 16 }} numberOfLines={1}>{b.label}</Text>
                  <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 10, color: MUTED, marginTop: 2, lineHeight: 13 }} numberOfLines={1}>{b.tagline}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* ── Remove Friend (friends only, at bottom) ── */}
        {isFriend && (
          <View style={{ paddingHorizontal: 20, marginTop: 32 }}>
            <TouchableOpacity
              onPress={handleUnfriend}
              disabled={removing}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 16, backgroundColor: '#fdecea', opacity: removing ? 0.6 : 1 }}
            >
              {removing
                ? <ActivityIndicator size="small" color="#e55" />
                : <Ionicons name="person-remove-outline" size={18} color="#e55" />
              }
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: '#e55' }}>
                {removing ? 'Removing…' : 'Remove Friend'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>

      {/* ── Lightbox ── */}
      <Modal visible={!!lightboxUri} transparent animationType="fade" onRequestClose={() => setLightboxUri(null)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' }}
          onPress={() => setLightboxUri(null)}
          activeOpacity={1}
        >
          {lightboxUri && (
            <Image source={{ uri: lightboxUri }} style={{ width: SCREEN_W, height: SCREEN_W }} resizeMode="contain" />
          )}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
