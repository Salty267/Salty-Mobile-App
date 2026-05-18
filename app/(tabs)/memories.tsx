import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  Image, Dimensions,
  LayoutAnimation, UIManager, Platform,
} from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
const LA = () => LayoutAnimation.configureNext({ duration: 220, create: { type: 'easeInEaseOut', property: 'opacity' }, update: { type: 'easeInEaseOut' }, delete: { type: 'easeInEaseOut', property: 'opacity' } });
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomPad } from '@/lib/useBottomPad';
import { scale } from '@/lib/layout';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSidebar } from '@/lib/SidebarContext';

const { width: SCREEN_W } = Dimensions.get('window');
// Mosaic grid and memory card heights scale with usable content width
const CONTENT_W      = SCREEN_W - 40; // 20dp padding each side
const MOSAIC_H       = Math.round(CONTENT_W * 0.64);   // ~224 on 390dp screen
const MEMORY_CARD_IMG_H = Math.round(CONTENT_W * 0.54); // ~188 on 390dp screen
const YEAR = new Date().getFullYear();

const BRAND_FROM = '#4f6cf2';
const BRAND_TO   = '#a25cf2';
const FG         = '#1a1530';
const MUTED      = '#6b6a85';
const SURFACE    = '#ffffff';
const BG         = '#eef0fb';
const BORDER     = '#e6e4f0';

// ── Data ──────────────────────────────────────────────────────────────────────
type Memory = {
  id: string; title: string; venue: string; date: string; mood: string;
  photos: number; image: string; caption: string; friends: number; month: string;
};

const TIMELINE: { month: string; data: Memory[] }[] = [
  {
    month: `AUGUST ${YEAR}`,
    data: [{
      id: '1', month: 'Aug', title: 'Taylor Swift — Eras Tour', venue: 'MetLife Stadium',
      date: 'Aug 15', mood: '🤩', photos: 47, caption: 'Three and a half hours of pure magic.',
      friends: 3, image: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=700&q=85',
    }],
  },
  {
    month: `APRIL ${YEAR}`,
    data: [{
      id: '2', month: 'Apr', title: `Coachella ${YEAR}`, venue: 'Empire Polo Club',
      date: 'Apr 14', mood: '🎵', photos: 312, caption: 'Desert vibes and the best weekend of the year.',
      friends: 3, image: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=700&q=85',
    }],
  },
  {
    month: `MARCH ${YEAR}`,
    data: [{
      id: '3', month: 'Mar', title: 'Lakers vs Warriors', venue: 'Crypto.com Arena',
      date: 'Mar 22', mood: '🔥', photos: 23, caption: 'Courtside seats and an OT thriller.',
      friends: 1, image: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=700&q=85',
    }],
  },
];

const REELS = [
  { label: 'Your',     sub: 'Recap',  image: 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=200&q=80', isYou: true },
  { label: 'Coachella',sub: '3 days', image: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=200&q=80' },
  { label: 'Lakers',   sub: 'OT win', image: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=200&q=80' },
  { label: 'Taylor',   sub: 'Eras',   image: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=200&q=80' },
  { label: 'Jazz Fest',sub: 'Sep',    image: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=200&q=80' },
];

const MONTH_CHIPS = ['All', 'Aug', 'Jul', 'Jun', 'May', 'Apr'];

const absoluteFill = { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 };

// ── Main screen ───────────────────────────────────────────────────────────────
export default function MemoriesScreen(): React.JSX.Element {
  const { openSidebar } = useSidebar();
  const bottomPad = useBottomPad();
  const [activeChip, setActiveChip] = useState('All');

  const filteredTimeline = activeChip === 'All'
    ? TIMELINE
    : TIMELINE.filter(g => g.data.some(m => m.month === activeChip));

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* ── Gradient Header ── */}
      <LinearGradient
        colors={[BRAND_FROM, BRAND_TO]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ borderBottomLeftRadius: 32, borderBottomRightRadius: 32, paddingBottom: 20 }}
      >
        <SafeAreaView edges={['top']}>
          {/* Title row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16 }}>
            <TouchableOpacity onPress={openSidebar} style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="menu" size={20} color="#fff" />
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="heart" size={16} color="#fff" />
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 20, color: '#fff', letterSpacing: -0.2 }}>Memories</Text>
            </View>

            <TouchableOpacity style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* On This Day banner */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 20, padding: 14, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.16)' }}>
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Ionicons name="sparkles" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 10, color: 'rgba(255,255,255,0.85)', letterSpacing: 1, textTransform: 'uppercase' }}>
                On this day · 1 year ago
              </Text>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: '#fff', marginTop: 2 }} numberOfLines={1}>
                The Weeknd — After Hours Tour
              </Text>
            </View>
            <TouchableOpacity style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.95)' }}>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 11, color: FG }}>View</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad }}>

        {/* ── Recap Reels ── */}
        <View style={{ marginTop: 24 }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, letterSpacing: -0.2, marginBottom: 14, paddingHorizontal: 20 }}>Recap reels</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}>
            {REELS.map((reel, i) => <ReelItem key={i} {...reel} />)}
          </ScrollView>
        </View>

        {/* ── Featured Moments ── */}
        <View style={{ marginTop: 28, paddingHorizontal: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, letterSpacing: -0.2 }}>Featured moments</Text>
            <TouchableOpacity>
              <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 12, color: BRAND_FROM }}>All photos</Text>
            </TouchableOpacity>
          </View>

          {/* Mosaic grid */}
          <View style={{ flexDirection: 'row', height: MOSAIC_H, gap: 8 }}>
            {/* Left: tall tile */}
            <View style={{ flex: 1, borderRadius: 18, overflow: 'hidden' }}>
              <Image source={{ uri: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=400&q=85' }} style={absoluteFill} resizeMode="cover" />
              <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 90 }} />
              <View style={{ position: 'absolute', bottom: 10, left: 10, right: 10 }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 11, color: '#fff' }}>Taylor Swift</Text>
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 10, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>47 photos</Text>
              </View>
            </View>

            {/* Right: 2 rows */}
            <View style={{ flex: 2, gap: 8 }}>
              {/* Top row: 2 tiles */}
              <View style={{ flex: 1, flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1, borderRadius: 18, overflow: 'hidden' }}>
                  <Image source={{ uri: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=300&q=85' }} style={absoluteFill} resizeMode="cover" />
                </View>
                <View style={{ flex: 1, borderRadius: 18, overflow: 'hidden' }}>
                  <Image source={{ uri: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=300&q=85' }} style={absoluteFill} resizeMode="cover" />
                </View>
              </View>
              {/* Bottom row: wide tile */}
              <View style={{ flex: 1, borderRadius: 18, overflow: 'hidden' }}>
                <Image source={{ uri: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=400&q=85' }} style={absoluteFill} resizeMode="cover" />
                <View style={{ ...absoluteFill, backgroundColor: 'rgba(0,0,0,0.42)' }} />
                <View style={{ ...absoluteFill, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 22, color: '#fff', lineHeight: 24 }}>+312</Text>
                  <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: 'rgba(255,255,255,0.9)', marginTop: 3 }}>more photos</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* ── Memory Timeline ── */}
        <View style={{ marginTop: 28, paddingHorizontal: 20 }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, letterSpacing: -0.2, marginBottom: 14 }}>Memory timeline</Text>

          {/* Filter chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 2 }} style={{ marginBottom: 20 }}>
            {MONTH_CHIPS.map(chip => (
              <TouchableOpacity
                key={chip}
                onPress={() => { LA(); setActiveChip(chip); }}
                activeOpacity={0.8}
                style={{ overflow: 'hidden', borderRadius: 999 }}
              >
                {chip === activeChip ? (
                  <LinearGradient colors={[BRAND_FROM, BRAND_TO]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 36, paddingHorizontal: 18, justifyContent: 'center' }}>
                    <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: '#fff' }}>{chip}</Text>
                  </LinearGradient>
                ) : (
                  <View style={{ height: 36, paddingHorizontal: 18, justifyContent: 'center', backgroundColor: SURFACE, borderRadius: 999, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 2 }}>
                    <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: FG }}>{chip}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Timeline groups */}
          {filteredTimeline.map((group, gi) => (
            <View key={group.month}>
              {/* Month header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14, marginTop: gi > 0 ? 24 : 0 }}>
                <Ionicons name="calendar-outline" size={13} color={MUTED} />
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 11, color: MUTED, letterSpacing: 1 }}>{group.month}</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
              </View>

              {/* Memory cards */}
              {group.data.map(memory => (
                <MemoryCard key={memory.id} memory={memory} />
              ))}
            </View>
          ))}
        </View>

      </ScrollView>
    </View>
  );
}

// ── Reel Item ─────────────────────────────────────────────────────────────────
function ReelItem({ label, sub, image, isYou }: { label: string; sub: string; image: string; isYou?: boolean }): React.JSX.Element {
  return (
    <TouchableOpacity activeOpacity={0.85} style={{ alignItems: 'center', gap: 6, width: scale(64) }}>
      {/* Gradient ring */}
      <LinearGradient
        colors={[BRAND_FROM, BRAND_TO]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ width: scale(68), height: scale(68), borderRadius: scale(34), padding: 2.5 }}
      >
        <View style={{ flex: 1, borderRadius: 31, overflow: 'hidden', borderWidth: 2, borderColor: SURFACE }}>
          <Image source={{ uri: image }} style={{ flex: 1 }} resizeMode="cover" />
          <View style={{ ...{ position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 }, backgroundColor: 'rgba(0,0,0,0.22)' }} />
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="play" size={14} color="#fff" />
          </View>
        </View>
      </LinearGradient>

      {/* + badge (your recap only) */}
      {isYou && (
        <View style={{ position: 'absolute', top: scale(46), right: 0, width: scale(20), height: scale(20), borderRadius: scale(10), backgroundColor: BRAND_FROM, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: BG }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: '#fff', lineHeight: 14 }}>+</Text>
        </View>
      )}

      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 11, color: FG, textAlign: 'center' }} numberOfLines={1}>{label}</Text>
      <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 10, color: MUTED, textAlign: 'center', marginTop: -4 }}>{sub}</Text>
    </TouchableOpacity>
  );
}

// ── Memory Card ───────────────────────────────────────────────────────────────
function MemoryCard({ memory }: { memory: Memory }): React.JSX.Element {
  const FRIEND_AVATARS = Array.from({ length: memory.friends }, (_, i) => `https://i.pravatar.cc/60?img=${i + 1}`);

  return (
    <View style={{ backgroundColor: SURFACE, borderRadius: 24, overflow: 'hidden', shadowColor: '#503cb4', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 20, elevation: 4, marginBottom: 16 }}>

      {/* Cover image */}
      <View style={{ height: MEMORY_CARD_IMG_H }}>
        <Image source={{ uri: memory.image }} style={absoluteFill} resizeMode="cover" />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.68)']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 100 }} />

        {/* Photo count badge */}
        <View style={{ position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.42)' }}>
          <Ionicons name="camera-outline" size={12} color="#fff" />
          <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 11, color: '#fff' }}>{memory.photos}</Text>
        </View>

        {/* Mood badge */}
        <View style={{ position: 'absolute', top: 12, right: 12, width: scale(36), height: scale(36), borderRadius: scale(18), backgroundColor: 'rgba(0,0,0,0.42)', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 16 }}>{memory.mood}</Text>
        </View>

        {/* Title + venue */}
        <View style={{ position: 'absolute', bottom: 12, left: 12, right: 12 }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: '#fff', letterSpacing: -0.2 }} numberOfLines={1}>{memory.title}</Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: 'rgba(255,255,255,0.88)', marginTop: 3 }}>
            📍 {memory.venue} · {memory.date}
          </Text>
        </View>
      </View>

      {/* Body */}
      <View style={{ padding: 16 }}>
        <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 14, color: FG, lineHeight: 20 }}>{memory.caption}</Text>

        {/* Friends */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <View style={{ flexDirection: 'row' }}>
            {FRIEND_AVATARS.map((uri, i) => (
              <View key={i} style={{ width: scale(26), height: scale(26), borderRadius: scale(13), overflow: 'hidden', borderWidth: 2, borderColor: SURFACE, marginLeft: i === 0 ? 0 : -8 }}>
                <Image source={{ uri }} style={{ flex: 1 }} resizeMode="cover" />
              </View>
            ))}
          </View>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: MUTED }}>
            with {memory.friends} friend{memory.friends !== 1 ? 's' : ''}
          </Text>
        </View>

        {/* Action buttons */}
        <View style={{ flexDirection: 'row', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: BORDER }}>
          {[
            { icon: 'camera-outline' as const,          label: 'Photos'  },
            { icon: 'musical-notes-outline' as const,   label: 'Setlist' },
            { icon: 'pencil-outline' as const,          label: 'Notes'   },
            { icon: 'share-social-outline' as const,    label: 'Share'   },
          ].map(({ icon, label }) => (
            <TouchableOpacity key={label} activeOpacity={0.7} style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 6, borderRadius: 10 }}>
              <Ionicons name={icon} size={16} color={MUTED} />
              <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 10, color: MUTED }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}
