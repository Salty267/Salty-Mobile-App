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
import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase/client';

function decodeJwtPayload(token: string): Record<string, any> {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return {};
  }
}

WebBrowser.maybeCompleteAuthSession();

// ── Layout constants ──────────────────────────────────────────────────────────
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const BAND_W    = SCREEN_W - 40;
const CARD_W    = Math.round(BAND_W * 0.88);
// Cap card height so total layout fits one screen (non-card UI ≈ 588dp with compact paddings)
const CARD_H    = Math.max(100, Math.min(Math.round(CARD_W / 1.5), SCREEN_H - 588));
const CARD_LEFT = Math.round((BAND_W - CARD_W) / 2);

const EXPANDED_Y  = [0, 72, 144] as const;
const STACK_H     = EXPANDED_Y[2] + CARD_H + 28;
const ROTATIONS   = ['3deg', '-5deg', '1.5deg'] as const;
const X_NUDGE     = [0, -6, 4] as const;
const LOOP_MS     = 3500; // ms between auto-advances
const SWIPE_MIN   = 40;   // px threshold for a swipe to register

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

// Collapse back-to-front: card 2 → card 1 → card 0
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
  const [page,         setPage]        = useState(0);
  const [displayPage,  setDisplayPage] = useState(0);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthError,   setOauthError]   = useState<string | null>(null);
  const [gmailBtnW,    setGmailBtnW]    = useState(0);
  // icon(22) + gap(8) = 30px overhead; DMSans Bold avg char width ≈ 0.55× fontSize
  const gmailFontSize = gmailBtnW > 0
    ? Math.max(11, Math.min(13, Math.floor((gmailBtnW - 30) / (19 * 0.55))))
    : 13;
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showOauthError = (msg: string) => {
    if (errorTimer.current) clearTimeout(errorTimer.current);
    setOauthError(msg);
    errorTimer.current = setTimeout(() => setOauthError(null), 4000);
  };

  // Refs — read inside PanResponder / timer callbacks to avoid stale closures
  const isAnimating         = useRef(false);
  const pageRef             = useRef(0);
  const anims               = useRef(makeAnims()).current;
  const loopTimer           = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Updated every render so PanResponder always calls the latest version
  const handlePageChangeRef = useRef<(p: number) => void>(() => {});

  // ── Auto-advance loop ─────────────────────────────────────────────────────
  function scheduleLoop() {
    if (loopTimer.current) clearTimeout(loopTimer.current);
    loopTimer.current = setTimeout(() => {
      const next = (pageRef.current + 1) % PAGES.length;
      handlePageChangeRef.current(next);
    }, LOOP_MS);
  }

  // ── Page transition ───────────────────────────────────────────────────────
  function handlePageChange(newPage: number) {
    if (isAnimating.current || newPage === pageRef.current) return;
    isAnimating.current = true;

    // Cancel any pending loop tick so it doesn't fire mid-transition
    if (loopTimer.current) clearTimeout(loopTimer.current);

    // Sync ref immediately so PanResponder reads the right value during animation
    pageRef.current = newPage;
    setPage(newPage);

    runCollapse(anims, () => {
      setDisplayPage(newPage);
      runExpand(anims, () => {
        isAnimating.current = false;
        scheduleLoop(); // restart loop after each transition completes
      });
    });
  }

  // Keep the ref fresh every render
  handlePageChangeRef.current = handlePageChange;

  // ── Swipe gesture ─────────────────────────────────────────────────────────
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      // Claim the gesture only when it is clearly horizontal
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 10,
      onPanResponderTerminationRequest: () => true,
      onPanResponderRelease: (_, { dx }) => {
        if (Math.abs(dx) < SWIPE_MIN) return;
        const curr = pageRef.current;
        const next = dx < 0
          ? (curr + 1) % PAGES.length                    // swipe left → next
          : (curr - 1 + PAGES.length) % PAGES.length;   // swipe right → prev
        handlePageChangeRef.current(next);
      },
    })
  ).current;

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/(tabs)');
    });
  }, []);

  useEffect(() => {
    // Initial expand then kick off the loop
    runExpand(anims, () => {
      isAnimating.current = false;
      scheduleLoop();
    });
    return () => {
      if (loopTimer.current) clearTimeout(loopTimer.current);
    };
  }, []);

  const current = PAGES[displayPage];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF8F1' }} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FBF8F1" />

      <View style={{ flex: 1, backgroundColor: '#FBF8F1' }}>

        {/* ── SALTY WORDMARK ── */}
        <View style={{ alignItems: 'center', paddingTop: 16, paddingBottom: 16 }}>
          <Text style={{ fontFamily: 'BebasNeue_400Regular', fontSize: 32, letterSpacing: 10, color: DEEP, opacity: 0.85 }}>
            SALTY
          </Text>
        </View>

        {/* ── HEADLINE ── */}
        <View style={{ paddingHorizontal: 24, paddingBottom: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(91,47,212,0.09)', borderRadius: 99, paddingHorizontal: 11, paddingVertical: 6, alignSelf: 'flex-start', marginBottom: 16 }}>
            <Ionicons name="star" size={11} color="#5B2FD4" />
            <Text style={{ fontSize: 10.5, fontFamily: 'DMSans_700Bold', letterSpacing: 1.4, color: DEEP, textTransform: 'uppercase' }}>
              Your year, replayed
            </Text>
          </View>
          <Text style={{ fontSize: 36, fontFamily: 'DMSans_700Bold', color: DEEP, letterSpacing: -0.6, lineHeight: 38 }}>
            Don't just go.{'\n'}
            <Text style={{ fontStyle: 'italic', color: '#E8581A' }}>Remember it.</Text>
          </Text>
        </View>

        {/* ── CARDS STAGE (swipeable) ── */}
        <View
          style={{ marginHorizontal: 20, borderRadius: 28, backgroundColor: '#5B2FD4', overflow: 'hidden', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 }}
          {...pan.panHandlers}
        >
          {/* Simulated radial gradient blobs */}
          <View pointerEvents="none" style={{ position: 'absolute', top: -80, left: -80, width: 280, height: 280, borderRadius: 140, backgroundColor: '#FAC775', opacity: 0.22 }} />
          <View pointerEvents="none" style={{ position: 'absolute', bottom: -100, right: -80, width: 340, height: 340, borderRadius: 170, backgroundColor: '#E8581A', opacity: 0.28 }} />

          {/* Stage header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, zIndex: 10 }}>
            <Text style={{ fontSize: 10, fontFamily: 'DMSans_700Bold', letterSpacing: 3, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase' }}>
              {String(page + 1).padStart(2, '0')} / {String(PAGES.length).padStart(2, '0')}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 99, paddingHorizontal: 11, paddingVertical: 5 }}>
              <Ionicons name="sparkles-outline" size={10} color="#FAC775" />
              <Text style={{ fontSize: 10, fontFamily: 'DMSans_700Bold', letterSpacing: 1.5, color: '#fff', textTransform: 'uppercase' }}>
                {current.title}
              </Text>
            </View>
          </View>

          {/* Card stack */}
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
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingTop: 16, paddingBottom: 4 }}>
          {PAGES.map((_, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => handlePageChange(i)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <View style={{
                height: 7,
                width: i === page ? 26 : 7,
                borderRadius: 4,
                backgroundColor: i === page ? '#5B2FD4' : 'rgba(91,47,212,0.2)',
              }} />
            </TouchableOpacity>
          ))}
        </View>

        {/* ── CTA BUTTONS ── */}
        <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>

          {/* Buttons row — error overlays on top without shifting layout */}
          <View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 18, backgroundColor: DEEP, opacity: oauthLoading ? 0.6 : 1 }}
                onLayout={e => setGmailBtnW(e.nativeEvent.layout.width)}
                disabled={oauthLoading}
                onPress={async () => {
                  try {
                    setOauthError(null);
                    setOauthLoading(true);
                    const redirectTo = 'salty://auth/callback';
                    const { data, error } = await supabase.auth.signInWithOAuth({
                      provider: 'google',
                      options: { redirectTo },
                    });
                    if (error || !data.url) return;

                    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
                    if (result.type !== 'success' || !result.url) return;

                    const parsed = new URL(result.url);
                    const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));
                    const accessToken = hashParams.get('access_token') ?? parsed.searchParams.get('access_token');
                    const refreshToken = hashParams.get('refresh_token') ?? parsed.searchParams.get('refresh_token');
                    if (!accessToken || !refreshToken) return;

                    const { data: { user } } = await supabase.auth.getUser(accessToken);
                    if (!user) return;

                    const accountAge = Date.now() - new Date(user.created_at).getTime();
                    const isNewUser = accountAge < 30_000;

                    if (!isNewUser) {
                      showOauthError('An account with this email already exists. Please sign in.');
                      return;
                    }

                    const payload = decodeJwtPayload(accessToken);
                    const prefillEmail = payload.email ?? user.email ?? '';
                    const prefillName = payload.user_metadata?.full_name ?? payload.user_metadata?.name ?? '';

                    router.push({
                      pathname: '/(auth)/signup',
                      params: { provider: 'google', prefillName, prefillEmail, accessToken, refreshToken },
                    });
                  } catch (e) {
                    console.error('Google sign-in error:', e);
                    showOauthError('Something went wrong. Please try again.');
                  } finally {
                    setOauthLoading(false);
                  }
                }}
                activeOpacity={0.85}
              >
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, fontFamily: 'DMSans_700Bold', color: DEEP }}>G</Text>
                </View>
                <Text style={{ fontSize: gmailFontSize, fontFamily: 'DMSans_700Bold', color: '#fff' }}>
                  {oauthLoading ? 'Checking…' : 'Continue with Gmail'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1.5, borderColor: `${DEEP}18` }}
                onPress={() => router.push('/(auth)/signup')}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 13, fontFamily: 'DMSans_700Bold', color: DEEP }}>Sign up with Email</Text>
              </TouchableOpacity>
            </View>

            {/* Absolutely positioned — zero layout impact */}
            {oauthError && (
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 18, backgroundColor: 'rgba(251,248,241,0.96)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: '#E8581A', textAlign: 'center', paddingHorizontal: 16 }}>
                  {oauthError}
                </Text>
              </View>
            )}
          </View>

          <View style={{ alignItems: 'center', paddingTop: 14, paddingBottom: Math.max(12, insets.bottom) }}>
            <Text style={{ fontSize: 12.5, fontFamily: 'DMSans_400Regular', color: `${DEEP}88` }}>
              Already have an account?{' '}
              <Text
                style={{ fontFamily: 'DMSans_700Bold', color: '#5B2FD4', textDecorationLine: 'underline' }}
                onPress={() => router.push('/(auth)/signin' as any)}
              >
                Log in
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
      borderRadius: 20,
      overflow: 'hidden',
      backgroundColor: bg,
      shadowColor: '#14083C',
      shadowOffset: { width: 0, height: isFront ? 28 : 8 },
      shadowOpacity: isFront ? 0.58 : 0.18,
      shadowRadius: isFront ? 36 : 12,
      elevation: 30 - index * 10,
    }}>

      {/* Left accent stripe — sits above image */}
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: isFront ? 7 : 5, backgroundColor: tint, zIndex: 5 }} />

      {/* Perforation notches */}
      <View style={{ position: 'absolute', left: -11, top: PERF_Y - 11, width: 22, height: 22, borderRadius: 11, backgroundColor: '#5B2FD4', zIndex: 6 }} />
      <View style={{ position: 'absolute', right: -11, top: PERF_Y - 11, width: 22, height: 22, borderRadius: 11, backgroundColor: '#5B2FD4', zIndex: 6 }} />

      {/* ── Main body: full-bleed image + gradient scrims ── */}
      <View style={{ height: PERF_Y }}>

        {/* Background image — full resolution */}
        <Image
          source={{ uri: image }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          resizeMode="cover"
        />

        {/* Dual scrim: dark at top and bottom, clear in the middle */}
        <LinearGradient
          colors={['rgba(8,2,22,0.72)', 'transparent', 'rgba(8,2,22,0.86)']}
          locations={[0, 0.42, 1]}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />

        {/* Top row: icon badge + category pill + date */}
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
            width: isFront ? 36 : 26, height: isFront ? 36 : 26,
            borderRadius: isFront ? 10 : 7,
            backgroundColor: tint,
            alignItems: 'center', justifyContent: 'center',
            shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 5,
          }}>
            <Ionicons name={iconName} size={isFront ? 17 : 12} color="#fff" />
          </View>

          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <View style={{ backgroundColor: tint, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontSize: 7, fontFamily: 'DMSans_700Bold', letterSpacing: 1.5, color: '#fff', textTransform: 'uppercase' }}>
                {category}
              </Text>
            </View>
            <Text style={{ fontSize: 8, fontFamily: 'DMSans_700Bold', color: 'rgba(255,255,255,0.88)' }}>
              {meta}
            </Text>
          </View>
        </View>

        {/* Bottom row: event name + venue */}
        <View style={{
          position: 'absolute',
          bottom: isFront ? 13 : 9,
          left: isFront ? 18 : 13,
          right: isFront ? 13 : 10,
          gap: 4,
        }}>
          <Text
            style={{
              fontSize: isFront ? 20 : 13,
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
            <Ionicons name="location-sharp" size={9} color="rgba(255,255,255,0.7)" />
            <Text style={{ fontSize: 8.5, fontFamily: 'DMSans_500Medium', color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: 0.4 }} numberOfLines={1}>
              {sub}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Dashed perforation line ── */}
      <View style={{ height: 1, flexDirection: 'row', marginHorizontal: 10 }}>
        {Array.from({ length: DASH_COUNT }).map((_, i) => (
          <View key={i} style={{ flex: 1, height: 1, backgroundColor: i % 2 === 0 ? `${DEEP}30` : 'transparent' }} />
        ))}
      </View>

      {/* ── Stub / barcode section (light bg) ── */}
      <View style={{ height: STUB_H, paddingLeft: isFront ? 20 : 15, paddingRight: isFront ? 14 : 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: isFront ? 2 : 1.5 }}>
          {BARCODE_FULL.map((h, k) => (
            <View key={k} style={{ width: isFront ? 2 : 1.5, height: (h / 12) * (isFront ? 22 : 17), backgroundColor: DEEP, opacity: 0.3, borderRadius: 1 }} />
          ))}
        </View>

        {isFront && (
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <Text style={{ fontSize: 7, fontFamily: 'DMSans_700Bold', letterSpacing: 1.8, color: `${DEEP}55`, textTransform: 'uppercase' }}>
              ADMIT ONE
            </Text>
            <Text style={{ fontSize: 7.5, fontFamily: 'DMSans_400Regular', color: `${DEEP}40`, letterSpacing: 0.8 }}>
              #{ticketNum}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
