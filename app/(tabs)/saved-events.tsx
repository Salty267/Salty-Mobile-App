import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image,
  LayoutAnimation, UIManager, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomPad } from '@/lib/useBottomPad';
import { SCREEN_W } from '@/lib/layout';

const SE_IMG_W = Math.round(SCREEN_W * 0.23); // ~90dp on 390dp screen
const SE_IMG_H = Math.round(SE_IMG_W * 1.42); // maintain ~90×128 aspect ratio
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSidebar } from '@/lib/SidebarContext';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
const LA = () => LayoutAnimation.configureNext({
  duration: 220,
  create:  { type: 'easeInEaseOut', property: 'opacity' },
  update:  { type: 'easeInEaseOut' },
  delete:  { type: 'easeInEaseOut', property: 'opacity' },
});

const YEAR = new Date().getFullYear();

const BRAND_FROM = '#4f6cf2';
const BRAND_TO   = '#a25cf2';
const FG         = '#1a1530';
const MUTED      = '#6b6a85';
const SURFACE    = '#ffffff';
const SECONDARY  = '#f1eefb';
const BG         = '#eef0fb';

// ── Data ──────────────────────────────────────────────────────────────────────
type SavedEvent = {
  id: string; title: string; subtitle: string; venue: string;
  date: string; time: string; daysAway: number;
  category: string; tint: string; image: string;
};

const SAVED_EVENTS: SavedEvent[] = [
  {
    id: '1', title: 'Olivia Rodrigo', subtitle: 'GUTS World Tour',
    venue: 'Madison Square Garden', date: 'Jun 3', time: '8:00 PM', daysAway: 17,
    category: 'Concerts', tint: '#FAC775',
    image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=85',
  },
  {
    id: '2', title: 'NBA Playoffs', subtitle: 'Eastern Conference Finals',
    venue: 'TD Garden, Boston', date: 'Jun 8', time: '7:30 PM', daysAway: 22,
    category: 'Sports', tint: '#E8581A',
    image: 'https://images.unsplash.com/photo-1504450758481-7338eba7524a?w=400&q=85',
  },
  {
    id: '3', title: `Lollapalooza ${YEAR}`, subtitle: 'Chicago Music Festival',
    venue: 'Grant Park, Chicago', date: 'Aug 1', time: 'All day', daysAway: 76,
    category: 'Festivals', tint: '#A8E6D3',
    image: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=400&q=85',
  },
  {
    id: '4', title: 'MoMA Summer Exhibition', subtitle: 'Contemporary Works',
    venue: 'MoMA, New York', date: 'Jun 20', time: '10:00 AM', daysAway: 34,
    category: 'Arts', tint: '#C8B8FF',
    image: 'https://images.unsplash.com/photo-1531058020387-3be344556be6?w=400&q=85',
  },
  {
    id: '5', title: 'Night Market NYC', subtitle: 'Asian Street Food Festival',
    venue: 'Flushing Meadows', date: 'Jul 12', time: '5:00 PM', daysAway: 56,
    category: 'Food', tint: '#FFCBA4',
    image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&q=85',
  },
  {
    id: '6', title: 'Tokyo Trip', subtitle: 'Cherry Blossom Season',
    venue: 'Shinjuku Gyoen', date: 'Sep 5', time: 'All day', daysAway: 111,
    category: 'Travel', tint: '#93C5FD',
    image: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=400&q=85',
  },
];

const FILTER_CHIPS = ['All', 'Concerts', 'Sports', 'Festivals', 'Arts', 'Food', 'Travel'] as const;
type FilterChip = typeof FILTER_CHIPS[number];

// ── Main screen ───────────────────────────────────────────────────────────────
export default function SavedEventsScreen(): React.JSX.Element {
  const { openSidebar } = useSidebar();
  const bottomPad = useBottomPad();
  const [activeFilter, setActiveFilter] = useState<FilterChip>('All');
  const [savedIds, setSavedIds] = useState<Set<string>>(
    new Set(SAVED_EVENTS.map(e => e.id))
  );

  const handleUnsave = (id: string) => {
    LA();
    setSavedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  const visible = SAVED_EVENTS.filter(e =>
    savedIds.has(e.id) && (activeFilter === 'All' || e.category === activeFilter)
  );

  const isEmpty = visible.length === 0;
  const isFiltered = activeFilter !== 'All' || savedIds.size < SAVED_EVENTS.length;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* ── Header ── */}
      <LinearGradient
        colors={[BRAND_FROM, BRAND_TO]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ paddingBottom: 20, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}
      >
        <SafeAreaView edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 20 }}>
            <TouchableOpacity onPress={openSidebar} style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="menu" size={20} color="#fff" />
            </TouchableOpacity>

            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>Events</Text>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 22, color: '#fff', letterSpacing: -0.4, marginTop: 2 }}>Saved</Text>
            </View>

            <TouchableOpacity style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="filter-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* ── Filter chips — pinned outside ScrollView ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 }}
      >
        {FILTER_CHIPS.map(chip => {
          const isActive = chip === activeFilter;
          return (
            <TouchableOpacity
              key={chip}
              onPress={() => { LA(); setActiveFilter(chip); }}
              activeOpacity={0.8}
              style={{
                height: 36,
                paddingHorizontal: 18,
                borderRadius: 999,
                overflow: 'hidden',
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: isActive ? 'transparent' : SURFACE,
                borderWidth: isActive ? 0 : 1.5,
                borderColor: '#e2e0f0',
              }}
            >
              {isActive && (
                <LinearGradient
                  colors={[BRAND_FROM, BRAND_TO]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                />
              )}
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: isActive ? '#fff' : FG }}>
                {chip}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Event list ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: bottomPad, gap: 14 }}
      >
        {isEmpty
          ? <EmptyState filtered={isFiltered} />
          : visible.map(event => (
              <SavedEventCard key={event.id} event={event} onUnsave={handleUnsave} />
            ))
        }
      </ScrollView>
    </View>
  );
}

// ── Saved Event Card ───────────────────────────────────────────────────────────
function SavedEventCard({ event, onUnsave }: { event: SavedEvent; onUnsave: (id: string) => void }): React.JSX.Element {
  return (
    <View style={{ backgroundColor: SURFACE, borderRadius: 20, overflow: 'hidden', shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 14, elevation: 3 }}>
      <View style={{ flexDirection: 'row' }}>

        {/* Left: image — explicit height matches TicketRow pattern */}
        <View style={{ width: SE_IMG_W, height: SE_IMG_H }}>
          <Image source={{ uri: event.image }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.18)']}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 40 }}
          />
        </View>

        {/* Right: details — gap-based, no space-between */}
        <View style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 12, gap: 6 }}>

          {/* Category badge + unsave button */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ backgroundColor: `${event.tint}55`, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 9, color: FG, textTransform: 'uppercase', letterSpacing: 1 }}>
                {event.category}
              </Text>
            </View>
            <TouchableOpacity onPress={() => onUnsave(event.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7}>
              <Ionicons name="heart" size={18} color={BRAND_FROM} />
            </TouchableOpacity>
          </View>

          {/* Title + subtitle */}
          <View>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: FG, letterSpacing: -0.2 }} numberOfLines={1}>
              {event.title}
            </Text>
            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: MUTED, marginTop: 1 }} numberOfLines={1}>
              {event.subtitle}
            </Text>
          </View>

          {/* Venue + date */}
          <View style={{ gap: 3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="location-outline" size={10} color={MUTED} />
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: MUTED }} numberOfLines={1}>{event.venue}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="calendar-outline" size={10} color={MUTED} />
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: MUTED }}>{event.date} · {event.time}</Text>
            </View>
          </View>

          {/* Days-away chip */}
          <View style={{ alignSelf: 'flex-start', backgroundColor: `${BRAND_FROM}14`, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 10, color: BRAND_FROM }}>
              {event.daysAway === 0 ? 'Today' : `${event.daysAway}d away`}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────
function EmptyState({ filtered }: { filtered: boolean }): React.JSX.Element {
  return (
    <View style={{ alignItems: 'center', paddingTop: 60 }}>
      <Ionicons name="heart-outline" size={52} color={MUTED} />
      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 17, color: FG, marginTop: 18 }}>
        {filtered ? 'No events in this category' : 'No saved events yet'}
      </Text>
      <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: MUTED, marginTop: 8, textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 }}>
        {filtered
          ? 'Try a different filter or save more events.'
          : 'Heart events to save them here for quick access.'}
      </Text>
    </View>
  );
}
