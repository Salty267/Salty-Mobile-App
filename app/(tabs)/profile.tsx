import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Image, TouchableOpacity,
  ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SCREEN_W, scale } from '@/lib/layout';
import { useBottomPad } from '@/lib/useBottomPad';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSidebar } from '@/lib/SidebarContext';
import { useAvatar } from '@/lib/useAvatar';
import { supabase } from '@/lib/supabase/client';
import { useFriends } from '@/lib/useFriends';
import { isEventPast } from '@/lib/parseEventDate';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import WrappedCard from '@/components/WrappedCard';
import { useFollowedArtists } from '@/lib/useFollowedArtists';

const BRAND_FROM = '#4f6cf2';
const BRAND_TO   = '#a25cf2';
const FG         = '#1a1530';
const MUTED      = '#6b6a85';
const SURFACE    = '#ffffff';
const BG         = '#eef0fb';
const BORDER     = '#e6e4f0';

const ICON_BTN = {
  width: 40, height: 40, borderRadius: 999,
  backgroundColor: 'rgba(255,255,255,0.18)',
  alignItems: 'center' as const, justifyContent: 'center' as const,
};

const MONTHS = ['J','F','M','A','M','J','J','A','S','O','N','D'];
const BAR_MAX_H = 78;
const BADGE_W = (SCREEN_W - 40 - 12) / 2;

type BadgeData = {
  totalShows: number;
  uniqueVenues: number;
  categoryCounts: Record<string, number>;
  categoryCount: number;
  friendCount: number;
  accountAgeYears: number;
  monthsActive: number;
  hasRepeatShow: boolean;
};

type BadgeDef = {
  id: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  tagline: string;
  from: string;
  to: string;
  condition: (d: BadgeData) => boolean;
};

const BADGE_DEFS: BadgeDef[] = [
  { id: 'first_show',        icon: 'star-outline',          label: 'First Show',         tagline: 'Welcome to the live life',     from: '#fbbf24', to: '#f97316', condition: d => d.totalShows >= 1   },
  { id: 'double_digits',     icon: 'trophy-outline',        label: 'Double Digits',      tagline: "You're just getting started",  from: '#fb923c', to: '#ef4444', condition: d => d.totalShows >= 10  },
  { id: 'century_club',      icon: 'medal-outline',         label: 'Century Club',       tagline: 'A true live event obsessive',  from: '#a78bfa', to: '#4f6cf2', condition: d => d.totalShows >= 100 },
  { id: 'crate_digger',      icon: 'headset-outline',       label: 'Crate Digger',       tagline: 'Concert floor regular',        from: '#22d3ee', to: '#2563eb', condition: d => (d.categoryCounts.concert  ?? 0) > 0 },
  { id: 'festival_weekender',icon: 'musical-notes-outline', label: 'Festival Weekender', tagline: 'Mud, music & memories',        from: '#e879f9', to: '#9333ea', condition: d => (d.categoryCounts.festival ?? 0) > 0 },
  { id: 'sports_fanatic',    icon: 'football-outline',      label: 'Sports Fanatic',     tagline: 'Cheering from the stands',     from: '#34d399', to: '#059669', condition: d => (d.categoryCounts.sports  ?? 0) > 0 },
  { id: 'globe_trotter',     icon: 'airplane-outline',      label: 'Globe Trotter',      tagline: 'Shows beyond your backyard',   from: '#22d3ee', to: '#0ea5e9', condition: d => (d.categoryCounts.trip    ?? 0) > 0 },
  { id: 'taste_explorer',    icon: 'sparkles',              label: 'Taste Explorer',     tagline: 'A little bit of everything',   from: '#a25cf2', to: '#4f6cf2', condition: d => d.categoryCount >= 4        },
  { id: 'venue_hopper',      icon: 'location-outline',      label: 'Venue Hopper',       tagline: "You've been everywhere",       from: '#f87171', to: '#dc2626', condition: d => d.uniqueVenues >= 10        },
  { id: 'social_butterfly',  icon: 'people-outline',        label: 'Social Butterfly',   tagline: 'Better with your crew',        from: '#fbbf24', to: '#f59e0b', condition: d => d.friendCount >= 3          },
  { id: 'loyal_fan',         icon: 'heart-outline',         label: 'Loyal Fan',          tagline: 'Been here since day one',      from: '#fb7185', to: '#e11d48', condition: d => d.accountAgeYears >= 1      },
  { id: 'season_regular',    icon: 'calendar-outline',      label: 'Season Regular',     tagline: 'Showing up all year long',     from: '#818cf8', to: '#4f6cf2', condition: d => d.monthsActive >= 4         },
  { id: 'repeat_offender',   icon: 'repeat-outline',        label: 'Repeat Offender',    tagline: "Can't get enough",             from: '#fb923c', to: '#fbbf24', condition: d => d.hasRepeatShow             },
];

// ── Level system ───────────────────────────────────────────────────────────────
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
  const progress = next
    ? (shows - current.threshold) / (next.threshold - current.threshold)
    : 1;
  return {
    lvlNum: idx + 1,
    label: current.label,
    progress: Math.min(1, Math.max(0, progress)),
    toNext: next ? next.threshold - shows : 0,
    nextLabel: next?.label ?? '',
  };
}

// ── Category DNA config ────────────────────────────────────────────────────────
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

// Parse { month (0-11), year } from a freeform date_str text field
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

type TicketRow = {
  title: string | null;
  venue_name: string | null;
  date_str: string | null;
  category: string;
  is_past: boolean;
  image_url: string | null;
};

type NextEvent = {
  title: string;
  venueName: string;
  dateStr: string;
  imageUrl: string | null;
};

// ── Screen ─────────────────────────────────────────────────────────────────────
export default function ProfileScreen(): React.JSX.Element {
  const router = useRouter();
  const { openSidebar } = useSidebar();
  const bottomPad = useBottomPad();
  const { avatarUrl } = useAvatar();
  const { friends } = useFriends();
  const { isFollowing, followArtist, unfollowArtist } = useFollowedArtists();

  const wrappedShotRef = useRef<ViewShot>(null);
  const [sharingWrapped, setSharingWrapped] = useState(false);

  const handleShareWrapped = async () => {
    if (!wrappedShotRef.current) return;
    setSharingWrapped(true);
    try {
      const uri = await (wrappedShotRef.current as any).capture();
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your Salty Wrapped' });
    } catch {
      Alert.alert('Could not share', 'Please try again.');
    } finally {
      setSharingWrapped(false);
    }
  };

  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState<string | null>(null);
  const [zipCode, setZipCode] = useState<string | null>(null);
  const [joinYear, setJoinYear] = useState<number | null>(null);

  const [totalShows, setTotalShows] = useState(0);
  const [uniqueVenues, setUniqueVenues] = useState(0);
  const [pastShows, setPastShows] = useState(0);

  const [yearShows, setYearShows] = useState(0);
  const [monthlyBars, setMonthlyBars] = useState<number[]>(new Array(12).fill(0));

  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [showAllBadges, setShowAllBadges] = useState(false);
  const [dnaSegments, setDnaSegments] = useState<{ label: string; pct: number; color: string }[]>([]);
  const [mostSeen, setMostSeen] = useState<{ name: string; times: number; from: string; to: string }[]>([]);
  const [nextEvent, setNextEvent] = useState<NextEvent | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const u = session?.user ?? null;
      if (!u || cancelled) return;
      setUser(u);

      const [profileRes, ticketsRes] = await Promise.all([
        supabase
          .from('users')
          .select('display_name, username, zip_code, created_at')
          .eq('id', u.id)
          .single(),
        supabase
          .from('tickets')
          .select('title, venue_name, date_str, category, is_past, image_url')
          .eq('user_id', u.id)
          .eq('status', 'active'),
      ]);

      if (cancelled) return;

      if (profileRes.data) {
        setDisplayName(profileRes.data.display_name ?? '');
        setUsername(profileRes.data.username ?? null);
        setZipCode(profileRes.data.zip_code ?? null);
        setJoinYear(profileRes.data.created_at
          ? new Date(profileRes.data.created_at).getFullYear()
          : null);
      }

      const tickets: TicketRow[] = ticketsRes.data ?? [];

      // Stats
      setTotalShows(tickets.length);
      setUniqueVenues(new Set(tickets.map(t => t.venue_name).filter(Boolean)).size);
      setPastShows(tickets.filter(t => isEventPast(t.date_str)).length);

      // Monthly bars for current year
      const currentYear = new Date().getFullYear();
      const bars = new Array(12).fill(0);
      let thisYearCount = 0;
      for (const t of tickets) {
        const parsed = parseDateStr(t.date_str);
        if (parsed && parsed.year === currentYear) {
          bars[parsed.month]++;
          thisYearCount++;
        }
      }
      setMonthlyBars(bars);
      setYearShows(thisYearCount);

      // Taste DNA + raw category counts (used for badges)
      const catCounts: Record<string, number> = {};
      for (const t of tickets) {
        catCounts[t.category] = (catCounts[t.category] ?? 0) + 1;
      }
      setCategoryCounts(catCounts);
      const totalCats = Object.values(catCounts).reduce((s, n) => s + n, 0);
      if (totalCats > 0) {
        const segments = Object.entries(catCounts)
          .map(([cat, count]) => ({
            label: CATEGORY_CONFIG[cat]?.label ?? cat,
            pct: Math.round((count / totalCats) * 100),
            color: CATEGORY_CONFIG[cat]?.color ?? '#94a3b8',
          }))
          .sort((a, b) => b.pct - a.pct)
          .slice(0, 4);
        setDnaSegments(segments);
      }

      // Most Seen — group by title
      const titleCounts: Record<string, number> = {};
      for (const t of tickets) {
        if (t.title) titleCounts[t.title] = (titleCounts[t.title] ?? 0) + 1;
      }
      setMostSeen(
        Object.entries(titleCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([name, times], i) => ({
            name,
            times,
            from: CARD_GRADIENTS[i % CARD_GRADIENTS.length][0],
            to:   CARD_GRADIENTS[i % CARD_GRADIENTS.length][1],
          }))
      );

      // Next upcoming event
      const upcoming = tickets.filter(t => !t.is_past);
      if (upcoming.length > 0) {
        const next = upcoming[0];
        setNextEvent({
          title: next.title ?? 'Upcoming Event',
          venueName: next.venue_name ?? '',
          dateStr: next.date_str ?? '',
          imageUrl: next.image_url ?? null,
        });
      }
    };

    load();
    return () => { cancelled = true; };
  }, []);

  // Derived display values
  const authName = (user?.user_metadata?.full_name as string | undefined) ?? '';
  const nameDisplay = displayName || authName || 'Hey there';
  const initials = nameDisplay !== 'Hey there'
    ? nameDisplay.split(' ').map((n: string) => n[0]).join('').toUpperCase()
    : user?.email?.[0].toUpperCase() ?? '?';

  const levelInfo = getLevelInfo(totalShows);
  const maxBar = Math.max(...monthlyBars, 1);

  const locationLine = joinYear ? `Live since ${joinYear}` : null;

  const crewData = friends.slice(0, 3).map(f => ({
    id: f.id,
    name: f.display_name ?? 'Friend',
    shows: f.mutual_events,
    avatarUrl: f.avatar_url,
  }));

  const badgeData: BadgeData = {
    totalShows,
    uniqueVenues,
    categoryCounts,
    categoryCount: Object.keys(categoryCounts).length,
    friendCount: friends.length,
    accountAgeYears: joinYear ? new Date().getFullYear() - joinYear : 0,
    monthsActive: monthlyBars.filter(v => v > 0).length,
    hasRepeatShow: mostSeen.some(s => s.times >= 2),
  };
  const allBadges = BADGE_DEFS.map(b => ({ ...b, earned: b.condition(badgeData) }));
  const earnedCount = allBadges.filter(b => b.earned).length;
  const sortedBadges = [...allBadges.filter(b => b.earned), ...allBadges.filter(b => !b.earned)];
  const displayedBadges = showAllBadges ? sortedBadges : sortedBadges.filter(b => b.earned);

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
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 4 }}>
              <TouchableOpacity onPress={openSidebar} style={ICON_BTN}>
                <Ionicons name="menu" size={20} color="#fff" />
              </TouchableOpacity>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 11, color: 'rgba(255,255,255,0.85)', letterSpacing: 2, textTransform: 'uppercase' }}>
                Salty · Passport
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={ICON_BTN}>
                  <Ionicons name="share-social-outline" size={18} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.push('/edit-profile')} style={ICON_BTN}>
                  <Ionicons name="pencil-outline" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Avatar + level pill */}
            <View style={{ alignItems: 'center', paddingHorizontal: 20 }}>
              <View style={{ width: scale(96), height: scale(96), borderRadius: scale(48), padding: 3, backgroundColor: 'rgba(255,255,255,0.45)' }}>
                <View style={{ flex: 1, borderRadius: scale(45), overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                  {avatarUrl
                    ? <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    : <Text style={{ fontFamily: 'BebasNeue_400Regular', fontSize: 32, color: '#fff' }}>{initials}</Text>
                  }
                </View>
              </View>

              <View style={{ backgroundColor: '#fff', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, marginTop: -10, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 10, color: FG, letterSpacing: 0.3 }}>
                  LVL {levelInfo.lvlNum} · {levelInfo.label}
                </Text>
              </View>

              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 22, color: '#fff', letterSpacing: -0.4, marginTop: 14 }}>
                {nameDisplay}
              </Text>
              {username && (
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>
                  @{username}
                </Text>
              )}
              {zipCode && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
                  <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.9)" />
                  <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: 'rgba(255,255,255,0.9)' }}>
                    {zipCode}
                  </Text>
                </View>
              )}
              {locationLine && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: zipCode ? 2 : 4 }}>
                  <Ionicons name="calendar-outline" size={12} color="rgba(255,255,255,0.9)" />
                  <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: 'rgba(255,255,255,0.9)' }}>
                    {locationLine}
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
            [String(totalShows), 'Shows'],
            [String(uniqueVenues), 'Venues'],
            [String(pastShows), 'Attended'],
            [String(friends.length) || '–', 'Friends'],
          ] as [string, string][]).map(([val, label], i) => (
            <View key={label} style={{ flex: 1, alignItems: 'center', borderLeftWidth: i > 0 ? 1 : 0, borderLeftColor: BORDER }}>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 20, color: FG }}>{val}</Text>
              <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 10, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 }}>{label}</Text>
            </View>
          ))}
        </View>

        {/* ── Year in Live ── */}
        <View style={{ paddingHorizontal: 20, marginTop: 28 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 }}>
            <View>
              <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 10, color: MUTED, letterSpacing: 1, textTransform: 'uppercase' }}>{new Date().getFullYear()} Year in Live</Text>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, letterSpacing: -0.3, marginTop: 2 }}>
                {yearShows} show{yearShows !== 1 ? 's' : ''} this year
              </Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/(tabs)/memories')}>
              <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 12, color: BRAND_FROM }}>Recap →</Text>
            </TouchableOpacity>
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
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, letterSpacing: -0.3 }}>Your taste DNA</Text>
            </View>
            <View style={{ backgroundColor: SURFACE, borderRadius: 24, padding: 20, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.09, shadowRadius: 16, elevation: 3 }}>
              <View style={{ flexDirection: 'row', height: 12, borderRadius: 99, overflow: 'hidden' }}>
                {dnaSegments.map(seg => (
                  <View key={seg.label} style={{ flex: seg.pct, backgroundColor: seg.color }} />
                ))}
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

        {/* ── Most Seen ── */}
        {mostSeen.length > 0 && (
          <View style={{ marginTop: 28 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 12 }}>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, letterSpacing: -0.3 }}>Most seen</Text>
              <TouchableOpacity>
                <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 12, color: BRAND_FROM }}>All</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
              {mostSeen.map((item, i) => {
                const following = isFollowing(item.name);
                return (
                  <View key={item.name} style={{ width: 120, height: 120, borderRadius: 18, overflow: 'hidden', shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 14, elevation: 4 }}>
                    <LinearGradient
                      colors={[item.from, item.to]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      style={{ flex: 1, padding: 10, justifyContent: 'space-between' }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 10, color: FG }}>{i + 1}</Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => following ? unfollowArtist(item.name) : followArtist(item.name)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Ionicons
                            name={following ? 'notifications' : 'notifications-outline'}
                            size={15}
                            color={following ? '#fff' : 'rgba(255,255,255,0.7)'}
                          />
                        </TouchableOpacity>
                      </View>
                      <View>
                        <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: '#fff' }} numberOfLines={1}>{item.name}</Text>
                        <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 10, color: 'rgba(255,255,255,0.9)', marginTop: 2 }}>seen {item.times}×</Text>
                      </View>
                    </LinearGradient>
                  </View>
                );
              })}
            </ScrollView>
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
                    ? <LinearGradient
                        colors={[b.from, b.to]}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
                      >
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

        {/* ── Share Wrapped ── */}
        <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
          <TouchableOpacity
            onPress={handleShareWrapped}
            disabled={sharingWrapped}
            activeOpacity={0.85}
            style={{ borderRadius: 16, overflow: 'hidden' }}
          >
            <LinearGradient
              colors={['#0d0822', '#4f1d8f']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 }}
            >
              <Ionicons name="share-social-outline" size={18} color="#fff" />
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 15, color: '#fff' }}>
                {sharingWrapped ? 'Preparing…' : 'Share Your Wrapped'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* ── Your Crew ── */}
        {crewData.length > 0 && (
          <View style={{ paddingHorizontal: 20, marginTop: 28 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, letterSpacing: -0.3 }}>Your crew</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/friends')}>
                <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 12, color: BRAND_FROM }}>See all</Text>
              </TouchableOpacity>
            </View>
            <View style={{ backgroundColor: SURFACE, borderRadius: 24, overflow: 'hidden', shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.09, shadowRadius: 16, elevation: 3 }}>
              {crewData.map((c, i) => (
                <View key={c.id}>
                  {i > 0 && <View style={{ height: 1, backgroundColor: BORDER, marginLeft: 70 }} />}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
                    <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 11, color: MUTED, width: 14, textAlign: 'center' }}>{i + 1}</Text>
                    <View style={{ width: 40, height: 40, borderRadius: 20, overflow: 'hidden', backgroundColor: BORDER }}>
                      {c.avatarUrl
                        ? <Image source={{ uri: c.avatarUrl }} style={{ width: 40, height: 40 }} resizeMode="cover" />
                        : <LinearGradient colors={[BRAND_FROM, BRAND_TO]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: '#fff' }}>{c.name[0].toUpperCase()}</Text>
                          </LinearGradient>
                      }
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: FG }}>{c.name}</Text>
                      {c.shows > 0 && (
                        <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: MUTED, marginTop: 1 }}>{c.shows} show{c.shows !== 1 ? 's' : ''} together</Text>
                      )}
                    </View>
                    <TouchableOpacity style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, backgroundColor: '#f0eef9' }}>
                      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 11, color: FG }}>Invite</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Currently Chasing ── */}
        {nextEvent && (
          <View style={{ paddingHorizontal: 20, marginTop: 28 }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, letterSpacing: -0.3, marginBottom: 12 }}>Currently chasing</Text>
            <View style={{ height: 160, borderRadius: 24, overflow: 'hidden', shadowColor: '#503cb4', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 5 }}>
              {nextEvent.imageUrl
                ? <Image source={{ uri: nextEvent.imageUrl }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="cover" />
                : <LinearGradient colors={['#3b1f6e', '#a04ec5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }} />
              }
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.72)']}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              />
              <View style={{ position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.95)' }}>
                <Ionicons name="flash" size={11} color={BRAND_FROM} />
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 10, color: FG, letterSpacing: 0.5, textTransform: 'uppercase' }}>Next up</Text>
              </View>
              <View style={{ position: 'absolute', bottom: 14, left: 14, right: 14 }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 18, color: '#fff', letterSpacing: -0.3 }} numberOfLines={1}>{nextEvent.title}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.9)" />
                  <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: 'rgba(255,255,255,0.9)' }} numberOfLines={1}>
                    {[nextEvent.venueName, nextEvent.dateStr].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

      </ScrollView>

      {/* Off-screen card captured by ViewShot — never visible to user */}
      <View style={{ position: 'absolute', top: 0, left: -9999, opacity: 0, pointerEvents: 'none' }}>
        <ViewShot ref={wrappedShotRef} options={{ format: 'png', quality: 1 }}>
          <WrappedCard
            username={username ?? ''}
            year={new Date().getFullYear()}
            totalShows={totalShows}
            topArtists={mostSeen.map(s => ({ name: s.name, times: s.times }))}
            topCategory={dnaSegments.length > 0 ? { label: dnaSegments[0].label, pct: dnaSegments[0].pct } : null}
            levelLabel={levelInfo.label}
            levelNum={levelInfo.lvlNum}
            earnedBadges={earnedCount}
          />
        </ViewShot>
      </View>
    </View>
  );
}
