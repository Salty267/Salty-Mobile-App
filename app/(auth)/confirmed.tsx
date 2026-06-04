import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StatusBar, Animated, Easing,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { scale, scaleFont, sp } from '@/lib/layout';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const BG    = '#FBF8F1';
const DEEP  = '#1A0848';
const MUTED = '#8B8690';
const GREEN = '#059669';

const FEATURES = [
  {
    icon:  'mail-outline'    as const,
    tint:  '#FAC775',
    bg:    '#FEF6E4',
    title: 'Scan your tickets',
    sub:   'Import from email, camera roll, or calendar',
  },
  {
    icon:  'scan-outline'    as const,
    tint:  '#A8E6D3',
    bg:    '#E2F7F0',
    title: 'Auto Scan',
    sub:   'Automatically detect tickets from Gmail',
  },
  {
    icon:  'sparkles-outline' as const,
    tint:  '#C8B8FF',
    bg:    '#EDE8FF',
    title: 'Discover what\'s on',
    sub:   'Trending events and shows near you',
  },
  {
    icon:  'people-outline'  as const,
    tint:  '#A8E6D3',
    bg:    '#E2F7F0',
    title: 'Go with friends',
    sub:   'See what your crew is attending',
  },
];

export default function ConfirmedScreen(): React.JSX.Element {
  const router = useRouter();

  const checkScale   = useRef(new Animated.Value(0)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const headY        = useRef(new Animated.Value(18)).current;
  const headOpacity  = useRef(new Animated.Value(0)).current;
  const featureAnims = useRef(
    FEATURES.map(() => ({ y: new Animated.Value(14), opacity: new Animated.Value(0) }))
  ).current;
  const btnY       = useRef(new Animated.Value(18)).current;
  const btnOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Request photo library permission proactively during onboarding
    ImagePicker.requestMediaLibraryPermissionsAsync();

    Animated.sequence([
      Animated.delay(120),
      Animated.parallel([
        Animated.spring(checkScale,   { toValue: 1, useNativeDriver: true, damping: 11, stiffness: 115 }),
        Animated.timing(checkOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]),
    ]).start();

    Animated.sequence([
      Animated.delay(340),
      Animated.parallel([
        Animated.timing(headY,       { toValue: 0, duration: 320, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(headOpacity, { toValue: 1, duration: 320, useNativeDriver: true }),
      ]),
    ]).start();

    Animated.sequence([
      Animated.delay(540),
      Animated.stagger(100, featureAnims.map(a =>
        Animated.parallel([
          Animated.timing(a.y,       { toValue: 0, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(a.opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
        ])
      )),
    ]).start();

    Animated.sequence([
      Animated.delay(880),
      Animated.parallel([
        Animated.timing(btnY,       { toValue: 0, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(btnOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />

      <View style={{ flex: 1, paddingHorizontal: sp(24), justifyContent: 'center' }}>

        {/* ── Check circle ── */}
        <Animated.View style={{
          alignItems: 'center', marginBottom: sp(32),
          opacity: checkOpacity, transform: [{ scale: checkScale }],
        }}>
          <LinearGradient
            colors={['#34d399', '#059669']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{
              width: scale(80), height: scale(80), borderRadius: scale(40),
              alignItems: 'center', justifyContent: 'center',
              shadowColor: GREEN, shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.32, shadowRadius: 20, elevation: 8,
            }}
          >
            <Ionicons name="checkmark" size={scale(40)} color="#fff" />
          </LinearGradient>
        </Animated.View>

        {/* ── Headline ── */}
        <Animated.View style={{
          alignItems: 'center', marginBottom: sp(36),
          opacity: headOpacity, transform: [{ translateY: headY }],
        }}>
          <Text style={{
            fontFamily: 'BebasNeue_400Regular',
            fontSize: scaleFont(46), letterSpacing: 8,
            color: DEEP, textAlign: 'center',
          }}>
            YOU'RE IN.
          </Text>
          <Text style={{
            fontFamily: 'DMSans_400Regular',
            fontSize: scaleFont(14), color: MUTED, textAlign: 'center',
            marginTop: sp(8), lineHeight: 21,
          }}>
            Email confirmed. Here's what's waiting for you.
          </Text>
        </Animated.View>

        {/* ── Feature rows ── */}
        <View style={{ gap: sp(12), marginBottom: sp(40) }}>
          {FEATURES.map((f, i) => (
            <Animated.View
              key={i}
              style={{
                opacity: featureAnims[i].opacity,
                transform: [{ translateY: featureAnims[i].y }],
                flexDirection: 'row', alignItems: 'center', gap: sp(14),
                backgroundColor: '#fff', borderRadius: scale(18), padding: sp(14),
                shadowColor: DEEP, shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.07, shadowRadius: 10, elevation: 2,
              }}
            >
              <View style={{
                width: scale(44), height: scale(44), borderRadius: scale(14),
                backgroundColor: f.bg, alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name={f.icon} size={scale(20)} color={f.tint} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(14), color: DEEP, letterSpacing: -0.2 }}>
                  {f.title}
                </Text>
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(12), color: MUTED, marginTop: 2 }}>
                  {f.sub}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={scale(14)} color={`${MUTED}66`} />
            </Animated.View>
          ))}
        </View>

        {/* ── CTA ── */}
        <Animated.View style={{ opacity: btnOpacity, transform: [{ translateY: btnY }] }}>
          <TouchableOpacity
            style={{
              backgroundColor: DEEP, borderRadius: scale(14),
              paddingVertical: sp(16), alignItems: 'center', justifyContent: 'center',
            }}
            onPress={() => router.replace('/(tabs)')}
            activeOpacity={0.85}
          >
            <Text style={{
              fontFamily: 'DMSans_700Bold', fontSize: scaleFont(14),
              letterSpacing: 2, color: '#fff', textTransform: 'uppercase',
            }}>
              Start Exploring →
            </Text>
          </TouchableOpacity>
        </Animated.View>

      </View>
    </SafeAreaView>
  );
}
