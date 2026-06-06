import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  Animated,
  Easing,
  PanResponder,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase/client';
import { scale, scaleFont, sp } from '@/lib/layout';

// ── Layout constants ──────────────────────────────────────────────────────────
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const BAND_W    = SCREEN_W - 40;
const CARD_W    = Math.round(BAND_W * 0.88);
const CARD_H    = Math.max(100, Math.min(Math.round(CARD_W / 1.5), SCREEN_H - 588));
const CARD_LEFT = Math.round((BAND_W - CARD_W) / 2);

const EXPANDED_Y  = [0, 72, 144] as const;
const STACK_H     = EXPANDED_Y[2] + CARD_H + 28;
const ROTATIONS   = ['3deg', '-5deg', '1.5deg'] as const;
const X_NUDGE     = [0, -6, 4] as const;
const LOOP_MS     = 3500;
const SWIPE_MIN   = 40;

const DEEP = '#1A0848';

// ── Data ──────────────────────────────────────────────────────────────────────
type CardData = {
  tint: string;
  cardBg: string;
  iconName: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  sub: string;
  meta: string;
  category: string;
  image: string;
};

const UNS = 'https://images.unsplash.com/photo-';
const IMG = (id: string) => `${UNS}${id}?w=600&h=450&fit=crop&q=90`;

const PAGES: { title: string; cards: CardData[] }[] = [
  {
    title: 'Concerts & Shows',
    cards: [
      { tint: '#FAC775', cardBg: '#FEF6E4', iconName: 'pricetag-outline',      label: 'The Strokes',       sub: 'Madison Sq Garden',    meta: 'FRI · 09:00 PM', category: 'LIVE',    image: IMG('1501386761578-eac5c94b800a') },
      { tint: '#A8E6D3', cardBg: '#E2F7F0', iconName: 'musical-notes-outline', label: 'Tame Impala',       sub: 'Forest Hills Stadium', meta: 'JUN 14',         category: 'LIVE',    image: IMG('1514525253161-7a46d19cd819') },
      { tint: '#FFCBA4', cardBg: '#FDEEDE', iconName: 'mic-outline',           label: 'Coachella W2',      sub: 'Empire Polo Club',     meta: 'APR · 3 days',   category: 'FEST',    image: IMG('1506157786151-b8491531f063') },
    ],
  },
  {
    title: 'Sports & Friends',
    cards: [
      { tint: '#E8581A', cardBg: '#FDEBD9', iconName: 'trophy-outline',        label: 'Lakers vs Celtics', sub: 'Crypto.com Arena',     meta: 'SUN · 07:30 PM', category: 'NBA',     image: IMG('1546519638-68e109498ffc')    },
      { tint: '#C8B8FF', cardBg: '#EDE8FF', iconName: 'heart-outline',         label: "Sofia's birthday",  sub: 'Brooklyn rooftop',     meta: 'LAST SAT',       category: 'FRIENDS', image: IMG('1530103862676-de8c9debad1d') },
      { tint: '#FAC775', cardBg: '#FEF6E4', iconName: 'location-outline',      label: 'Marathon NYC',      sub: 'Central Park',         meta: 'NOV 03',         category: 'RUN',     image: IMG('1486218119243-13301543a1b3') },
    ],
  },
  {
    title: 'Travel & Culture',
    cards: [
      { tint: '#A8E6D3', cardBg: '#E2F7F0', iconName: 'airplane-outline',      label: 'Lisbon weekend',    sub: 'Alfama district',      meta: 'MAY · 4 days',   category: 'TRIP',    image: IMG('1555881400-74d7acaacd8b')    },
      { tint: '#FFCBA4', cardBg: '#FDEEDE', iconName: 'restaurant-outline',    label: 'Eleven Madison',    sub: 'Tasting menu',         meta: 'MAR 22',         category: 'FOOD',    image: IMG('1414235077428-338989a2e8c0') },
      { tint: '#E8581A', cardBg: '#FDEBD9', iconName: 'color-palette-outline', label: 'MoMA — Yayoi',      sub: 'Infinity rooms',       meta: 'FEB 09',         category: 'ART',     image: IMG('1531243625752-c0eb5e6fbaf1') },
    ],
  },
];

// ── Animation helpers ─────────────────────────────────────────────────────────
type Anim = { y: Animated.Value; opacity: Animated.Value };

function makeAnims(): Anim[] {
  return [0, 1, 2].map(() => ({
    y:       new Animated.Value(0),
    opacity: new Animated.Value(0),
  }));
}

function runExpand(anims: Anim[], cb?: () => void) {
  Animated.stagger(90, anims.map((a, i) =>
    Animated.parallel([
      Animated.spring(a.y, {
        toValue: EXPANDED_Y[i],
        useNativeDriver: true,
        damping: 14, stiffness: 105, mass: 0.85,
      }),
      Animated.timing(a.opacity, {
        toValue: 1, duration: 260,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ])
  )).start(({ finished }) => finished && cb?.());
}

function runCollapse(anims: Anim[], cb?: () => void) {
  Animated.parallel([
    Animated.parallel([
      Animated.timing(anims[2].y,       { toValue: 0, duration: 200, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      Animated.timing(anims[2].opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
    ]),
    Animated.sequence([
      Animated.delay(50),
      Animated.parallel([
        Animated.timing(anims[1].y,       { toValue: 0, duration: 200, easing: Easing.in(Easing.ease), useNativeDriver: true }),
        Animated.timing(anims[1].opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      ]),
    ]),
    Animated.sequence([
      Animated.delay(100),
      Animated.parallel([
        Animated.timing(anims[0].y,       { toValue: 0, duration: 200, easing: Easing.in(Easing.ease), useNativeDriver: true }),
        Animated.timing(anims[0].opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      ]),
    ]),
  ]).start(({ finished }) => finished && cb?.());
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function OnboardingScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [page,        setPage]       = useState(0);
  const [displayPage, setDisplayPage] = useState(0);

  const isAnimating         = useRef(false);
  const pageRef             = useRef(0);
  const anims               = useRef(makeAnims()).current;
  const loopTimer           = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlePageChangeRef = useRef<(p: number) => void>(() => {});

  function scheduleLoop() {
    if (loopTimer.current) clearTimeout(loopTimer.current);
    loopTimer.current = setTimeout(() => {
      const next = (pageRef.current + 1) % PAGES.length;
      handlePageChangeRef.current(next);
    }, LOOP_MS);
  }

  function handlePageChange(newPage: number) {
    if (isAnimating.current || newPage === pageRef.current) return;
    isAnimating.current = true;
    if (loopTimer.current) clearTimeout(loopTimer.current);
    pageRef.current = newPage;
    setPage(newPage);
    runCollapse(anims, () => {
      setDisplayPage(newPage);
      runExpand(anims, () => {
        isAnimating.current = false;
        scheduleLoop();
      });
    });
  }

  handlePageChangeRef.current = handlePageChange;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 10,
      onPanResponderTerminationRequest: () => true,
      onPanResponderRelease: (_, { dx }) => {
        if (Math.abs(dx) < SWIPE_MIN) return;
        const curr = pageRef.current;
        const next = dx < 0
          ? (curr + 1) % PAGES.length
          : (curr - 1 + PAGES.length) % PAGES.length;
        handlePageChangeRef.current(next);
      },
    })
  ).current;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/(tabs)');
    });
  }, []);

  useEffect(() => {
    runExpand(anims, () => {
      isAnimating.current = false;
      scheduleLoop();
    });
    return () => {
      if (loopTimer.current) clearTimeout(loopTimer.current);
    };
  }, []);

  const current = PAGES[displayPage];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF8F1' }} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FBF8F1" />

      <View style={{ flex: 1, backgroundColor: '#FBF8F1' }}>

        {/* ── SALTY WORDMARK ── */}
        <View style={{ alignItems: 'center', paddingTop: sp(16), paddingBottom: sp(16) }}>
          <Text style={{ fontFamily: 'BebasNeue_400Regular', fontSize: scaleFont(32), letterSpacing: 10, color: DEEP, opacity: 0.85 }}>
            SALTY
          </Text>
        </View>

        {/* ── HEADLINE ── */}
        <View style={{ paddingHorizontal: sp(24), paddingBottom: sp(20) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(91,47,212,0.09)', borderRadius: 99, paddingHorizontal: sp(11), paddingVertical: sp(6), alignSelf: 'flex-start', marginBottom: sp(16) }}>
            <Ionicons name="star" size={scale(11)} color="#5B2FD4" />
            <Text style={{ fontSize: scaleFont(10.5), fontFamily: 'DMSans_700Bold', letterSpacing: 1.4, color: DEEP, textTransform: 'uppercase' }}>
              Your year, replayed
            </Text>
          </View>
          <Text style={{ fontSize: scaleFont(36), fontFamily: 'DMSans_700Bold', color: DEEP, letterSpacing: -0.6 }}>
            Don't just go.{'\n'}
            <Text style={{ fontStyle: 'italic', color: '#E8581A' }}>Remember it.</Text>
          </Text>
        </View>

        {/* ── CARDS STAGE (swipeable) ── */}
        <View
          style={{ marginHorizontal: sp(20), borderRadius: scale(28), backgroundColor: '#5B2FD4', overflow: 'hidden', paddingHorizontal: sp(16), paddingTop: sp(16), paddingBottom: sp(24) }}
          {...pan.panHandlers}
        >
          <View pointerEvents="none" style={{ position: 'absolute', top: -80, left: -80, width: 280, height: 280, borderRadius: 140, backgroundColor: '#FAC775', opacity: 0.22 }} />
          <View pointerEvents="none" style={{ position: 'absolute', bottom: -100, right: -80, width: 340, height: 340, borderRadius: 170, backgroundColor: '#E8581A', opacity: 0.28 }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: sp(16), zIndex: 10 }}>
            <Text style={{ fontSize: scaleFont(10), fontFamily: 'DMSans_700Bold', letterSpacing: 3, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase' }}>
              {String(page + 1).padStart(2, '0')} / {String(PAGES.length).padStart(2, '0')}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 99, paddingHorizontal: sp(11), paddingVertical: sp(5) }}>
              <Ionicons name="sparkles-outline" size={scale(10)} color="#FAC775" />
              <Text style={{ fontSize: scaleFont(10), fontFamily: 'DMSans_700Bold', letterSpacing: 1.5, color: '#fff', textTransform: 'uppercase' }}>
                {current.title}
              </Text>
            </View>
          </View>

          <View style={{ position: 'relative', height: STACK_H }}>
            {current.cards.map((card, i) => (
              <Animated.View
                key={i}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: CARD_LEFT + X_NUDGE[i],
                  width: CARD_W,
                  height: CARD_H,
                  zIndex: 30 - i * 10,
                  opacity: anims[i].opacity,
                  transform: [
                    { translateY: anims[i].y },
                    { rotate: ROTATIONS[i] },
                  ],
                }}
              >
                <TicketCard {...card} index={i} />
              </Animated.View>
            ))}
          </View>
        </View>

        {/* ── PAGE DOTS ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingTop: sp(16), paddingBottom: sp(4) }}>
          {PAGES.map((_, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => handlePageChange(i)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <View style={{
                height: scale(7),
                width: i === page ? scale(26) : scale(7),
                borderRadius: 4,
                backgroundColor: i === page ? '#5B2FD4' : 'rgba(91,47,212,0.2)',
              }} />
            </TouchableOpacity>
          ))}
        </View>

        {/* ── CTA ── */}
        <View style={{ paddingHorizontal: sp(20), paddingTop: sp(16) }}>
          <TouchableOpacity
            style={{ backgroundColor: DEEP, borderRadius: scale(18), paddingVertical: sp(18), alignItems: 'center', justifyContent: 'center' }}
            onPress={() => router.push('/(auth)/signin' as any)}
            activeOpacity={0.85}
          >
            <Text style={{ fontSize: scaleFont(14), fontFamily: 'DMSans_700Bold', color: '#fff', letterSpacing: 1.5, textTransform: 'uppercase' }}>
              Log In
            </Text>
          </TouchableOpacity>

          <View style={{ alignItems: 'center', paddingTop: sp(14), paddingBottom: Math.max(12, insets.bottom) }}>
            <Text style={{ fontSize: scaleFont(12.5), fontFamily: 'DMSans_400Regular', color: `${DEEP}88` }}>
              Don't have an account?{' '}
              <Text
                style={{ fontFamily: 'DMSans_700Bold', color: '#5B2FD4', textDecorationLine: 'underline' }}
                onPress={() => router.push('/(auth)/signup')}
              >
                Sign up
              </Text>
            </Text>
          </View>
        </View>

      </View>
    </SafeAreaView>
  );
}

// ── Ticket Card ───────────────────────────────────────────────────────────────
type TicketCardProps = CardData & { index: number };

const DASH_COUNT  = 30;
const BARCODE_FULL = [3,9,6,12,3,6,9,3,12,6,3,9,6,12,3,9,6,3,12,6,9,3,6,12,3];

function TicketCard({ tint, cardBg, iconName, label, sub, meta, category, image, index }: TicketCardProps): React.JSX.Element {
  const isFront   = index === 0;
  const bg        = isFront ? '#FFFDF5' : cardBg;
  const STUB_H    = isFront ? 40 : 30;
  const PERF_Y    = CARD_H - STUB_H;
  const ticketNum = (label.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 9000) + 1000;

  return (
    <View style={{
      flex: 1,
      borderRadius: scale(20),
      overflow: 'hidden',
      backgroundColor: bg,
      shadowColor: '#14083C',
      shadowOffset: { width: 0, height: isFront ? 28 : 8 },
      shadowOpacity: isFront ? 0.58 : 0.18,
      shadowRadius: isFront ? 36 : 12,
      elevation: 30 - index * 10,
    }}>
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: isFront ? 7 : 5, backgroundColor: tint, zIndex: 5 }} />
      <View style={{ position: 'absolute', left: -11, top: PERF_Y - 11, width: 22, height: 22, borderRadius: 11, backgroundColor: '#5B2FD4', zIndex: 6 }} />
      <View style={{ position: 'absolute', right: -11, top: PERF_Y - 11, width: 22, height: 22, borderRadius: 11, backgroundColor: '#5B2FD4', zIndex: 6 }} />

      <View style={{ height: PERF_Y }}>
        <Image
          source={{ uri: image }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['rgba(8,2,22,0.72)', 'transparent', 'rgba(8,2,22,0.86)']}
          locations={[0, 0.42, 1]}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />

        <View style={{
          position: 'absolute',
          top: isFront ? 13 : 9,
          left: isFront ? 18 : 13,
          right: isFront ? 13 : 10,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}>
          <View style={{
            width: isFront ? scale(36) : scale(26), height: isFront ? scale(36) : scale(26),
            borderRadius: isFront ? scale(10) : scale(7),
            backgroundColor: tint,
            alignItems: 'center', justifyContent: 'center',
            shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 5,
          }}>
            <Ionicons name={iconName} size={isFront ? scale(17) : scale(12)} color="#fff" />
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <View style={{ backgroundColor: tint, borderRadius: 99, paddingHorizontal: sp(8), paddingVertical: sp(3) }}>
              <Text style={{ fontSize: scaleFont(7), fontFamily: 'DMSans_700Bold', letterSpacing: 1.5, color: '#fff', textTransform: 'uppercase' }}>
                {category}
              </Text>
            </View>
            <Text style={{ fontSize: scaleFont(8), fontFamily: 'DMSans_700Bold', color: 'rgba(255,255,255,0.88)' }}>
              {meta}
            </Text>
          </View>
        </View>

        <View style={{
          position: 'absolute',
          bottom: isFront ? 13 : 9,
          left: isFront ? 18 : 13,
          right: isFront ? 13 : 10,
          gap: 4,
        }}>
          <Text
            style={{
              fontSize: isFront ? scaleFont(20) : scaleFont(13),
              fontFamily: 'DMSans_700Bold',
              color: '#fff',
              lineHeight: isFront ? 22 : 15,
              textShadowColor: 'rgba(0,0,0,0.5)',
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 4,
            }}
            numberOfLines={1}
          >
            {label}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Ionicons name="location-sharp" size={scale(9)} color="rgba(255,255,255,0.7)" />
            <Text style={{ fontSize: scaleFont(8.5), fontFamily: 'DMSans_500Medium', color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: 0.4 }} numberOfLines={1}>
              {sub}
            </Text>
          </View>
        </View>
      </View>

      <View style={{ height: 1, flexDirection: 'row', marginHorizontal: 10 }}>
        {Array.from({ length: DASH_COUNT }).map((_, i) => (
          <View key={i} style={{ flex: 1, height: 1, backgroundColor: i % 2 === 0 ? `${DEEP}30` : 'transparent' }} />
        ))}
      </View>

      <View style={{ height: STUB_H, paddingLeft: isFront ? sp(20) : sp(15), paddingRight: isFront ? sp(14) : sp(11), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: isFront ? 2 : 1.5 }}>
          {BARCODE_FULL.map((h, k) => (
            <View key={k} style={{ width: isFront ? 2 : 1.5, height: (h / 12) * (isFront ? 22 : 17), backgroundColor: DEEP, opacity: 0.3, borderRadius: 1 }} />
          ))}
        </View>
        {isFront && (
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <Text style={{ fontSize: scaleFont(7), fontFamily: 'DMSans_700Bold', letterSpacing: 1.8, color: `${DEEP}55`, textTransform: 'uppercase' }}>
              ADMIT ONE
            </Text>
            <Text style={{ fontSize: scaleFont(7.5), fontFamily: 'DMSans_400Regular', color: `${DEEP}40`, letterSpacing: 0.8 }}>
              #{ticketNum}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
