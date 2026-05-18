import React, { useEffect, useState } from 'react';
import { useSidebar } from '@/lib/SidebarContext';
import {
  View, Text, TouchableOpacity,
  ScrollView, Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomPad } from '@/lib/useBottomPad';
import { TAB_BAR_H, SCREEN_W, scale } from '@/lib/layout';

// Upcoming event card — sized as ~43% of screen width so two fit with a peek
const EVENT_CARD_W  = Math.round(SCREEN_W * 0.43);
const EVENT_CARD_IMG_H = Math.round(EVENT_CARD_W / 1.5); // 3:2 aspect ratio
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase/client';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const YEAR = new Date().getFullYear();

const BRAND_FROM = '#4f6cf2';
const BRAND_TO   = '#a25cf2';
const FG         = '#1a1530';
const MUTED      = '#6b6a85';
const SURFACE    = '#ffffff';
const BG         = '#eef0fb';

const STATS = [
  { icon: 'ticket-outline'       as const, value: '24', label: 'Events',  color: '#4f6cf2', bg: '#eef0fb' },
  { icon: 'location-outline'     as const, value: '8',  label: 'Cities',  color: '#E8581A', bg: '#fdebd9' },
  { icon: 'musical-notes-outline'as const, value: '12', label: 'Shows',   color: '#a25cf2', bg: '#f3eeff' },
  { icon: 'people-outline'       as const, value: '47', label: 'Friends', color: '#059669', bg: '#d1fae5' },
];

const UPCOMING = [
  {
    id: '1',
    title: 'Taylor Swift',
    subtitle: 'Eras Tour',
    venue: 'MetLife Stadium',
    date: 'Aug 15',
    time: '7:30 PM',
    daysAway: 12,
    category: 'Concert',
    image: 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=400&q=85',
  },
  {
    id: '2',
    title: 'Lakers vs Warriors',
    subtitle: 'NBA Playoffs',
    venue: 'Crypto.com Arena',
    date: 'Aug 10',
    time: '8:00 PM',
    daysAway: 7,
    category: 'Sports',
    image: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=400&q=85',
  },
  {
    id: '3',
    title: 'Jazz Festival',
    subtitle: 'Blue Note Series',
    venue: 'Central Park',
    date: 'Sep 15',
    time: '4:00 PM',
    daysAway: 43,
    category: 'Festival',
    image: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&q=85',
  },
];

export default function HomeScreen(): React.JSX.Element {
  const { openSidebar } = useSidebar();
  const { bottom: bottomInset } = useSafeAreaInsets();
  const bottomPad = useBottomPad();
  const [firstName, setFirstName] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const full = user?.user_metadata?.full_name ?? user?.email ?? '';
      setFirstName(full.split(' ')[0]);
    });
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>

      {/* ── Gradient Header ── */}
      <LinearGradient
        colors={[BRAND_FROM, BRAND_TO]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ paddingBottom: 20, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}
      >
        <SafeAreaView edges={['top']}>
          {/* Top row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16 }}>
            <TouchableOpacity onPress={openSidebar} style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="menu" size={20} color="#fff" />
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="star" size={16} color="#fff" />
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 20, color: '#fff', letterSpacing: -0.2 }}>Salty</Text>
            </View>

            <TouchableOpacity style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="notifications-outline" size={20} color="#fff" />
              <View style={{ position: 'absolute', top: 9, right: 9, width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' }} />
            </TouchableOpacity>
          </View>

        </SafeAreaView>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad }}>

        {/* ── Welcome note ── */}
        <View style={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 20 }}>
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

        {/* ── Dashboard ── */}
        <View style={{ paddingHorizontal: 20, paddingTop: 0 }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, letterSpacing: -0.3, marginBottom: 14 }}>Your {YEAR} at a glance</Text>

          {/* 2×2 Stats Grid */}
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
            <StatCard stat={STATS[0]} />
            <StatCard stat={STATS[1]} />
          </View>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
            <StatCard stat={STATS[2]} />
            <StatCard stat={STATS[3]} />
          </View>

          {/* Year progress card */}
          <LinearGradient
            colors={[BRAND_FROM, BRAND_TO]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ borderRadius: 20, padding: 18, marginBottom: 8 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <View>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 15, color: '#fff' }}>Your {YEAR}</Text>
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: 'rgba(255,255,255,0.72)', marginTop: 2 }}>24 events · 8 cities · 12 shows</Text>
              </View>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="trophy-outline" size={20} color="#fff" />
              </View>
            </View>

            {/* Progress bar */}
            <View style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 11, color: 'rgba(255,255,255,0.8)' }}>vs last year (36 events)</Text>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 11, color: '#fff' }}>67%</Text>
              </View>
              <View style={{ height: 6, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.25)' }}>
                <View style={{ width: '67%', height: 6, borderRadius: 99, backgroundColor: '#fff' }} />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 }}>
                <Ionicons name="trending-up" size={12} color="#fff" />
                <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 11, color: '#fff' }}>+3 this month</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 }}>
                <Ionicons name="flame-outline" size={12} color="#fff" />
                <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 11, color: '#fff' }}>5-month streak</Text>
              </View>
            </View>
          </LinearGradient>
        </View>

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
            {UPCOMING.map(event => <UpcomingCard key={event.id} event={event} />)}
          </ScrollView>
        </View>

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
                2 new events detected
              </Text>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 18 }}>
                We found new events from your emails and photos.
              </Text>
              <TouchableOpacity style={{ marginTop: 12, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.96)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: FG }}>Review events</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>

      </ScrollView>

      {/* FAB */}
      <LinearGradient
        colors={[BRAND_FROM, BRAND_TO]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', bottom: TAB_BAR_H + bottomInset + 8, right: 20, width: 56, height: 56, borderRadius: 999 }}
      >
        <TouchableOpacity style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} activeOpacity={0.85}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>

    </View>
  );
}

// ── Stat Card ──────────────────────────────────────────────────────────────────
type StatItem = typeof STATS[0];

function StatCard({ stat }: { stat: StatItem }): React.JSX.Element {
  return (
    <View style={{
      flex: 1, backgroundColor: SURFACE, borderRadius: 18, padding: 16,
      shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.09, shadowRadius: 16, elevation: 3,
    }}>
      <View style={{ width: scale(36), height: scale(36), borderRadius: 10, backgroundColor: stat.bg, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
        <Ionicons name={stat.icon} size={18} color={stat.color} />
      </View>
      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 26, color: FG, letterSpacing: -0.5 }}>{stat.value}</Text>
      <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: MUTED, marginTop: 2 }}>{stat.label}</Text>
    </View>
  );
}

// ── Upcoming Card ──────────────────────────────────────────────────────────────
type UpcomingEvent = typeof UPCOMING[0];

function UpcomingCard({ event }: { event: UpcomingEvent }): React.JSX.Element {
  return (
    <View style={{
      width: EVENT_CARD_W, backgroundColor: SURFACE, borderRadius: 20, overflow: 'hidden',
      shadowColor: '#503cb4', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 20, elevation: 4,
    }}>
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
    </View>
  );
}
