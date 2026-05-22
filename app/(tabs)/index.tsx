import React, { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useSidebar } from '@/lib/SidebarContext';
import {
  View, Text, TouchableOpacity,
  ScrollView, Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomPad } from '@/lib/useBottomPad';
import { TAB_BAR_H, SCREEN_W } from '@/lib/layout';
import { useRouter } from 'expo-router';

// Upcoming event card — sized as ~43% of screen width so two fit with a peek
const EVENT_CARD_W     = Math.round(SCREEN_W * 0.43);
const EVENT_CARD_IMG_H = Math.round(EVENT_CARD_W / 1.5);
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase/client';
import { useSavedEvents } from '@/lib/SavedEventsContext';
import { parseEventDate, isEventPast, daysUntil } from '@/lib/parseEventDate';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const BRAND_FROM = '#4f6cf2';
const BRAND_TO   = '#a25cf2';
const FG         = '#1a1530';
const MUTED      = '#6b6a85';
const SURFACE    = '#ffffff';
const BG         = '#eef0fb';

type UpcomingEvent = {
  id: string;
  title: string;
  subtitle?: string;
  venue: string;
  date: string;
  time: string;
  daysAway: number;
  category: string;
  image: string;
};

type QuickAction = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  route: string;
  color: string;
  bg: string;
};

const QUICK_ACTIONS: QuickAction[] = [
  { icon: 'mail-outline',     label: 'Scan Gmail', route: '/(tabs)/tickets',  color: '#E8581A',  bg: '#fdebd9' },
  { icon: 'calendar-outline', label: 'Calendar',   route: '/(tabs)/calendar', color: '#a25cf2',  bg: '#f3eeff' },
  { icon: 'people-outline',   label: 'Friends',    route: '/(tabs)/friends',  color: '#059669',  bg: '#d1fae5' },
];

type FabAction = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  route: string;
  color: string;
  bg: string;
};

const FAB_ACTIONS: FabAction[] = [
  { icon: 'create-outline', label: 'Add manually', route: '/(tabs)/tickets', color: BRAND_FROM, bg: '#eef0fb' },
  { icon: 'camera-outline', label: 'Scan photo',   route: '/(tabs)/tickets', color: '#a25cf2',  bg: '#f3eeff' },
  { icon: 'mail-outline',   label: 'Import Gmail', route: '/(tabs)/tickets', color: '#E8581A',  bg: '#fdebd9' },
];

type OnThisDayEvent = {
  id: string;
  title: string;
  venue: string;
  image: string;
  yearsAgo: number;
};

export default function HomeScreen(): React.JSX.Element {
  const { openSidebar } = useSidebar();
  const { bottom: bottomInset } = useSafeAreaInsets();
  const bottomPad = useBottomPad();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [fabOpen, setFabOpen] = useState(false);
  const [upcoming, setUpcoming] = useState<UpcomingEvent[]>([]);
  const [onThisDay, setOnThisDay] = useState<OnThisDayEvent | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [hasUnread, setHasUnread] = useState(false);

  // Async data: user identity + tickets
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      setUserId(user.id);
      const full = (user.user_metadata?.full_name as string | undefined) ?? user.email ?? '';
      setFirstName(full.split(' ')[0]);

      supabase
        .from('pending_imports')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .then(({ count }) => { if (!cancelled) setPendingCount(count ?? 0); });
      const { data } = await supabase
        .from('tickets')
        .select('id, title, venue_name, date_str, time_str, category, image_url')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('date_str', { ascending: true });
      if (!data || cancelled) return;

      const DEFAULT_IMG = 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400&q=85';
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const thisYear = now.getFullYear();
      const thisMonth = now.getMonth();
      const thisDay = now.getDate();

      setUpcoming(
        data
          .filter(row => !isEventPast(row.date_str))
          .map(row => ({
            id: row.id,
            title: row.title ?? 'Untitled',
            venue: row.venue_name ?? 'TBD',
            date: row.date_str ?? 'TBD',
            time: row.time_str ?? 'TBD',
            category: row.category,
            image: row.image_url ?? DEFAULT_IMG,
            daysAway: Math.max(0, daysUntil(row.date_str) ?? 0),
          }))
          .sort((a, b) => a.daysAway - b.daysAway),
      );

      // On this day: past events whose month+day match today, most recent first
      const otdCandidates = data
        .map(row => ({ row, parsed: parseEventDate(row.date_str) }))
        .filter(({ parsed }) =>
          parsed !== null &&
          parsed.getFullYear() < thisYear &&
          parsed.getMonth() === thisMonth &&
          parsed.getDate() === thisDay,
        )
        .sort((a, b) => b.parsed!.getFullYear() - a.parsed!.getFullYear());

      if (otdCandidates.length > 0 && !cancelled) {
        const { row, parsed } = otdCandidates[0];
        setOnThisDay({
          id: row.id,
          title: row.title ?? 'Untitled',
          venue: row.venue_name ?? 'TBD',
          image: row.image_url ?? DEFAULT_IMG,
          yearsAgo: thisYear - parsed!.getFullYear(),
        });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Realtime dot: synchronous chain (no awaits), unique name avoids topic conflicts
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notif_dot_${userId}_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, () => setHasUnread(true))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  // Re-fetch pending count + unread count whenever home tab regains focus
  useFocusEffect(useCallback(() => {
    if (!userId) return;
    supabase
      .from('pending_imports')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'pending')
      .then(({ count }) => setPendingCount(count ?? 0));
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false)
      .then(({ count }) => setHasUnread((count ?? 0) > 0));
  }, [userId]));

  const nextEvent = upcoming[0] ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>

      {/* ── Gradient Header ── */}
      <LinearGradient
        colors={[BRAND_FROM, BRAND_TO]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ paddingBottom: 20, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}
      >
        <SafeAreaView edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16 }}>
            <TouchableOpacity onPress={openSidebar} style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="menu" size={20} color="#fff" />
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="star" size={16} color="#fff" />
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 20, color: '#fff', letterSpacing: -0.2 }}>Salty</Text>
            </View>

            <TouchableOpacity
              onPress={() => { setHasUnread(false); router.push('/notifications'); }}
              style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="notifications-outline" size={20} color="#fff" />
              {hasUnread && (
                <View style={{ position: 'absolute', top: 9, right: 9, width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' }} />
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad }}>

        {/* ── Welcome note ── */}
        <View style={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 16 }}>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: MUTED }}>
            {greeting()},
          </Text>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 26, color: FG, letterSpacing: -0.5, marginTop: 2 }}>
            {firstName ? `${firstName} 👋` : '👋'}
          </Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: MUTED, marginTop: 4 }}>
            Here's what's happening with your events.
          </Text>
        </View>

        {/* ── Next Event Countdown ── */}
        {nextEvent && (
          <View style={{ paddingHorizontal: 20 }}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => router.push({
                pathname: '/event-details',
                params: {
                  id: nextEvent.id,
                  title: nextEvent.title,
                  venue: nextEvent.venue,
                  date: nextEvent.date,
                  time: nextEvent.time,
                  category: nextEvent.category,
                  image: nextEvent.image,
                },
              })}
              style={{ borderRadius: 24, overflow: 'hidden', height: 156 }}
            >
              <Image
                source={{ uri: nextEvent.image }}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                resizeMode="cover"
              />
              <LinearGradient
                colors={['rgba(26,21,48,0.12)', 'rgba(26,21,48,0.84)']}
                start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                style={{ flex: 1, padding: 18, justifyContent: 'space-between' }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Ionicons name="time-outline" size={11} color="#fff" />
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 10, color: '#fff', letterSpacing: 0.5 }}>NEXT UP</Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 18, color: '#fff', letterSpacing: -0.3 }} numberOfLines={1}>{nextEvent.title}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <Ionicons name="location-outline" size={11} color="rgba(255,255,255,0.75)" />
                      <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: 'rgba(255,255,255,0.75)' }} numberOfLines={1}>{nextEvent.venue}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <Ionicons name="calendar-outline" size={11} color="rgba(255,255,255,0.75)" />
                      <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: 'rgba(255,255,255,0.75)' }}>{nextEvent.date} · {nextEvent.time}</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 44, color: '#fff', lineHeight: 46 }}>{nextEvent.daysAway}</Text>
                    <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 10, color: 'rgba(255,255,255,0.8)' }}>days away</Text>
                  </View>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Upcoming Events ── */}
        <View style={{ paddingTop: 28 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 14 }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 18, color: FG, letterSpacing: -0.3 }}>Upcoming Events</Text>
            <TouchableOpacity>
              <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 13, color: BRAND_FROM }}>See all</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingLeft: 20, paddingRight: 8, gap: 14 }}
          >
            {upcoming.length <= 1 ? (
              <View style={{ paddingHorizontal: 8, justifyContent: 'center' }}>
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: MUTED }}>No upcoming tickets yet.</Text>
              </View>
            ) : upcoming.slice(1).map(event => (
              <UpcomingCard
                key={event.id}
                event={event}
                onPress={() => router.push({
                  pathname: '/event-details',
                  params: {
                    id: event.id,
                    title: event.title,
                    venue: event.venue,
                    date: event.date,
                    time: event.time,
                    category: event.category,
                    image: event.image,
                  },
                })}
              />
            ))}
          </ScrollView>
        </View>

        {/* ── Quick Actions ── */}
        <View style={{ paddingHorizontal: 20, paddingTop: 28 }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, letterSpacing: -0.3, marginBottom: 14 }}>Quick actions</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {QUICK_ACTIONS.map(action => (
              <QuickActionBtn
                key={action.label}
                action={action}
                onPress={() => router.push(action.route as any)}
              />
            ))}
          </View>
        </View>

        {/* ── On This Day ── */}
        {onThisDay && (
          <View style={{ paddingHorizontal: 20, paddingTop: 24 }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, letterSpacing: -0.3, marginBottom: 14 }}>On this day</Text>
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => router.push({
                pathname: '/event-details',
                params: {
                  id: onThisDay.id,
                  title: onThisDay.title,
                  venue: onThisDay.venue,
                  image: onThisDay.image,
                },
              })}
            >
              <View style={{
                backgroundColor: SURFACE, borderRadius: 20, overflow: 'hidden', flexDirection: 'row',
                shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 4,
              }}>
                <LinearGradient
                  colors={[BRAND_FROM, BRAND_TO]}
                  start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                  style={{ width: 5 }}
                />
                <View style={{ width: 80, height: 88 }}>
                  <Image source={{ uri: onThisDay.image }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.18)' }} />
                </View>
                <View style={{ flex: 1, padding: 14, justifyContent: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                    <Ionicons name="sparkles" size={12} color={BRAND_FROM} />
                    <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 10, color: BRAND_FROM, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                      {onThisDay.yearsAgo} {onThisDay.yearsAgo === 1 ? 'year' : 'years'} ago today
                    </Text>
                  </View>
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: FG, letterSpacing: -0.2 }} numberOfLines={1}>{onThisDay.title}</Text>
                  <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: MUTED, marginTop: 2 }} numberOfLines={1}>📍 {onThisDay.venue}</Text>
                </View>
                <View style={{ justifyContent: 'center', paddingRight: 14 }}>
                  <Ionicons name="chevron-forward" size={16} color={MUTED} />
                </View>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Detection banner ── */}
        <View style={{ paddingHorizontal: 20, paddingTop: 24 }}>
          <LinearGradient
            colors={[BRAND_FROM, BRAND_TO]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ padding: 16, borderRadius: 20, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}
          >
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="sparkles-outline" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: '#fff', marginBottom: 4 }}>
                {pendingCount} ticket{pendingCount === 1 ? '' : 's'} waiting for review
              </Text>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 18 }}>
                Found in your Gmail — approve to add to your vault.
              </Text>
              <TouchableOpacity
                onPress={() => router.push('/review-imports')}
                style={{ marginTop: 12, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.96)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: FG }}>Review now</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>

      </ScrollView>

      {/* FAB backdrop */}
      {fabOpen && (
        <TouchableOpacity
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(26,21,48,0.45)' }}
          activeOpacity={1}
          onPress={() => setFabOpen(false)}
        />
      )}

      {/* FAB + Speed Dial */}
      <View style={{ position: 'absolute', bottom: TAB_BAR_H + bottomInset + 8, right: 20, alignItems: 'flex-end', gap: 12 }}>
        {fabOpen && FAB_ACTIONS.map(action => (
          <TouchableOpacity
            key={action.label}
            activeOpacity={0.85}
            onPress={() => { setFabOpen(false); router.push(action.route as any); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
          >
            <View style={{ backgroundColor: SURFACE, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3 }}>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: FG }}>{action.label}</Text>
            </View>
            <View style={{ width: 44, height: 44, borderRadius: 999, backgroundColor: action.bg, alignItems: 'center', justifyContent: 'center', shadowColor: action.color, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 4 }}>
              <Ionicons name={action.icon} size={20} color={action.color} />
            </View>
          </TouchableOpacity>
        ))}

        <LinearGradient
          colors={[BRAND_FROM, BRAND_TO]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ width: 56, height: 56, borderRadius: 999 }}
        >
          <TouchableOpacity
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
            activeOpacity={0.85}
            onPress={() => setFabOpen(v => !v)}
          >
            <Ionicons name={fabOpen ? 'close' : 'add'} size={28} color="#fff" />
          </TouchableOpacity>
        </LinearGradient>
      </View>

    </View>
  );
}

// ── Quick Action Button ────────────────────────────────────────────────────────
function QuickActionBtn({ action, onPress }: { action: QuickAction; onPress: () => void }): React.JSX.Element {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ flex: 1, alignItems: 'center', gap: 8 }}>
      <View style={{
        width: 54, height: 54, borderRadius: 16, backgroundColor: action.bg,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: action.color, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 3,
      }}>
        <Ionicons name={action.icon} size={22} color={action.color} />
      </View>
      <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 11, color: FG, textAlign: 'center' }} numberOfLines={1}>{action.label}</Text>
    </TouchableOpacity>
  );
}

// ── Upcoming Card ──────────────────────────────────────────────────────────────
function UpcomingCard({ event, onPress }: { event: UpcomingEvent; onPress?: () => void }): React.JSX.Element {
  const { saveEvent, unsaveEvent, isSaved } = useSavedEvents();
  const saved = isSaved(event.id);
  const toggleSave = () => {
    if (saved) {
      unsaveEvent(event.id);
    } else {
      saveEvent({
        id: event.id, title: event.title, subtitle: event.subtitle,
        venue: event.venue, date: event.date, time: event.time,
        category: event.category, image: event.image, daysAway: event.daysAway,
      });
    }
  };
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      style={{
        width: EVENT_CARD_W, backgroundColor: SURFACE, borderRadius: 20, overflow: 'hidden',
        shadowColor: '#503cb4', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 20, elevation: 4,
      }}
    >
      {/* Image */}
      <View style={{ height: EVENT_CARD_IMG_H }}>
        <Image source={{ uri: event.image }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.5)']}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 60 }}
        />
        {/* Days away badge */}
        <View style={{ position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 4 }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 10, color: '#fff' }}>
            {event.daysAway === 0 ? 'Today' : `${event.daysAway}d away`}
          </Text>
        </View>
        {/* Heart / save */}
        <TouchableOpacity
          onPress={toggleSave}
          style={{ position: 'absolute', bottom: 10, right: 10, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name={saved ? 'heart' : 'heart-outline'} size={15} color={saved ? '#ff6b8a' : '#fff'} />
        </TouchableOpacity>
        {/* Category */}
        <View style={{ position: 'absolute', top: 10, left: 10, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 9, color: FG, textTransform: 'uppercase', letterSpacing: 0.5 }}>{event.category}</Text>
        </View>
      </View>

      {/* Details */}
      <View style={{ padding: 12 }}>
        <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: FG, letterSpacing: -0.1 }} numberOfLines={1}>{event.title}</Text>
        <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: MUTED, marginTop: 1 }} numberOfLines={1}>{event.subtitle}</Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
          <Ionicons name="calendar-outline" size={11} color={MUTED} />
          <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 11, color: MUTED }}>{event.date} · {event.time}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
          <Ionicons name="location-outline" size={11} color={MUTED} />
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: MUTED }} numberOfLines={1}>{event.venue}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}
