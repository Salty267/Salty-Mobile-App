import '../global.css';
import React, { useEffect, useRef, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SavedEventsProvider } from '@/lib/SavedEventsContext';
import { StatusBar } from 'expo-status-bar';
import { useFonts, BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue';
import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { View, Text, TouchableOpacity, Modal, StyleSheet, AppState } from 'react-native';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import * as ExpoCalendar from 'expo-calendar';
import * as Location from 'expo-location';
import * as Contacts from 'expo-contacts';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase/client';
import { registerForPushNotifications } from '@/lib/notifications';
import { scale, scaleFont, sp } from '@/lib/layout';
import type { Session } from '@supabase/supabase-js';
import type * as NotificationsType from 'expo-notifications';

// Expo Go dropped remote push support in SDK 53 — skip all push setup there
const isExpoGo =
  Constants.executionEnvironment === 'storeClient' ||
  (Constants.appOwnership as string | null) === 'expo';

const PERM_KEY = 'salty_permissions_v1';

// ── Permissions we request and what we say about each ────────────────────────
const PERMS = [
  { icon: 'notifications-outline' as const, color: '#4f6cf2', label: 'Notifications', desc: 'Get reminders before your events and alerts when new tickets are detected.' },
  { icon: 'camera-outline'        as const, color: '#a25cf2', label: 'Camera',        desc: 'Scan physical tickets by pointing your camera at them.' },
  { icon: 'images-outline'        as const, color: '#E8581A', label: 'Photo Library', desc: 'Import tickets saved in your camera roll and set your profile photo.' },
  { icon: 'calendar-outline'      as const, color: '#059669', label: 'Calendar',      desc: 'Find concerts, games, and shows you have coming up.' },
  { icon: 'location-outline'      as const, color: '#f59e0b', label: 'Location',      desc: 'Show events happening near you on the Discover page.' },
  { icon: 'people-outline'        as const, color: '#ec4899', label: 'Contacts',      desc: 'Find friends who are already on Salty.' },
];

// ── Permission gate modal ─────────────────────────────────────────────────────
function PermissionsGate({ visible, onDone }: { visible: boolean; onDone: () => void }): React.JSX.Element {
  const [requesting, setRequesting] = useState(false);

  const requestAll = async () => {
    setRequesting(true);
    try {
      // 1. Push notifications
      if (!isExpoGo) {
        const N = await import('expo-notifications');
        await N.requestPermissionsAsync().catch(() => {});
      }
      // 2. Camera
      await ImagePicker.requestCameraPermissionsAsync().catch(() => {});
      // 3. Photo library
      await ImagePicker.requestMediaLibraryPermissionsAsync().catch(() => {});
      // 4. Calendar
      await ExpoCalendar.requestCalendarPermissionsAsync().catch(() => {});
      // 5. Location
      await Location.requestForegroundPermissionsAsync().catch(() => {});
      // 6. Contacts
      await Contacts.requestPermissionsAsync().catch(() => {});
    } finally {
      await SecureStore.setItemAsync(PERM_KEY, 'true').catch(() => {});
      setRequesting(false);
      onDone();
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" hardwareAccelerated>
      <View style={styles.permBg}>
        <LinearGradient
          colors={['#4f6cf2', '#a25cf2']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.permHeader}
        >
          <SafeAreaView edges={['top']}>
            <View style={{ alignItems: 'center', paddingTop: sp(16), paddingBottom: sp(8) }}>
              <View style={styles.permIconWrap}>
                <Ionicons name="shield-checkmark" size={scale(32)} color="#4f6cf2" />
              </View>
              <Text style={styles.permTitle}>Before we get started</Text>
              <Text style={styles.permSub}>
                Salty needs a few permissions to give you the full experience.
                You can change these anytime in Settings.
              </Text>
            </View>
          </SafeAreaView>
        </LinearGradient>

        <View style={styles.permList}>
          {PERMS.map(p => (
            <View key={p.label} style={styles.permRow}>
              <View style={[styles.permDot, { backgroundColor: p.color + '20' }]}>
                <Ionicons name={p.icon} size={scale(20)} color={p.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.permLabel}>{p.label}</Text>
                <Text style={styles.permDesc}>{p.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.permFooter}>
          <SafeAreaView edges={['bottom']}>
            <TouchableOpacity
              onPress={requestAll}
              disabled={requesting}
              activeOpacity={0.85}
              style={{ overflow: 'hidden', borderRadius: scale(18), marginHorizontal: sp(20) }}
            >
              <LinearGradient
                colors={['#4f6cf2', '#a25cf2']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.permBtn}
              >
                <Text style={styles.permBtnText}>
                  {requesting ? 'Setting up…' : 'Allow permissions'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
            <Text style={styles.permSkip} onPress={() => {
              SecureStore.setItemAsync(PERM_KEY, 'skipped').catch(() => {});
              onDone();
            }}>
              Skip for now
            </Text>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  permBg:     { flex: 1, backgroundColor: '#eef0fb' },
  permHeader: { paddingBottom: sp(24), borderBottomLeftRadius: scale(32), borderBottomRightRadius: scale(32) },
  permIconWrap: { width: scale(64), height: scale(64), borderRadius: scale(20), backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginBottom: sp(16), shadowColor: '#4f6cf2', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 14, elevation: 6 },
  permTitle:  { fontFamily: 'DMSans_700Bold', fontSize: scaleFont(22), color: '#fff', letterSpacing: -0.4, textAlign: 'center', marginBottom: sp(8) },
  permSub:    { fontFamily: 'DMSans_400Regular', fontSize: scaleFont(13), color: 'rgba(255,255,255,0.80)', textAlign: 'center', lineHeight: 20, paddingHorizontal: sp(24) },
  permList:   { flex: 1, paddingHorizontal: sp(20), paddingTop: sp(24), gap: sp(16) },
  permRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: sp(14), backgroundColor: '#fff', borderRadius: scale(16), padding: sp(14), shadowColor: '#503cb4', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 10, elevation: 2 },
  permDot:    { width: scale(42), height: scale(42), borderRadius: scale(12), alignItems: 'center', justifyContent: 'center' },
  permLabel:  { fontFamily: 'DMSans_700Bold', fontSize: scaleFont(14), color: '#1a1530', marginBottom: 3 },
  permDesc:   { fontFamily: 'DMSans_400Regular', fontSize: scaleFont(12), color: '#6b6a85', lineHeight: 18 },
  permFooter: { paddingBottom: sp(8) },
  permBtn:    { height: scale(54), alignItems: 'center', justifyContent: 'center' },
  permBtnText:{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(15), color: '#fff', letterSpacing: 0.3 },
  permSkip:   { fontFamily: 'DMSans_400Regular', fontSize: scaleFont(13), color: '#6b6a85', textAlign: 'center', paddingVertical: sp(14) },
});

// ── Protected route ───────────────────────────────────────────────────────────
function useProtectedRoute(session: Session | null, isLoading: boolean): void {
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/onboarding' as any);
    } else if (session && inAuthGroup && segments[1] !== 'confirmed') {
      router.replace('/(tabs)');
    }
  }, [session, segments, isLoading]);
}

// ── Root layout ───────────────────────────────────────────────────────────────
export default function RootLayout(): React.JSX.Element | null {
  const router = useRouter();
  const [session,          setSession]          = useState<Session | null>(null);
  const [isLoading,        setIsLoading]        = useState<boolean>(true);
  const [showPermissions,  setShowPermissions]  = useState(false);
  const notificationListener = useRef<NotificationsType.Subscription | null>(null);
  const responseListener     = useRef<NotificationsType.Subscription | null>(null);

  const [fontsLoaded] = useFonts({
    BebasNeue_400Regular,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });

  // Check whether we should show the permissions gate after login
  useEffect(() => {
    if (!session) { setShowPermissions(false); return; }
    SecureStore.getItemAsync(PERM_KEY).then(val => {
      if (!val) setShowPermissions(true);
    }).catch(() => {});
  }, [session?.user?.id]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        setSession(null);
        setIsLoading(false);
        return;
      }
      // Validate the stored session before autoRefreshToken fires and throws.
      const { error } = await supabase.auth.getUser();
      if (error) {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        setSession(null);
      } else {
        setSession(session);
        registerForPushNotifications(session.user.id).catch(() => {});
      }
      setIsLoading(false);
    }).catch(async () => {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      setSession(null);
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!session && (event === 'TOKEN_REFRESHED' || event === 'SIGNED_OUT')) {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        setSession(null);
        return;
      }
      setSession(session);
      if (event === 'SIGNED_IN' && session?.user) {
        await registerForPushNotifications(session.user.id).catch(() => {});
      }
    });

    const handleDeepLink = async ({ url }: { url: string }) => {
      if (!url.includes('auth/callback')) return;
      const parsed = new URL(url);
      const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));
      const tokenHash = parsed.searchParams.get('token_hash');
      const type = parsed.searchParams.get('type') as 'signup' | 'recovery' | 'email' | null;
      if (tokenHash && type) {
        await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        return;
      }
      const accessToken  = hashParams.get('access_token')  ?? parsed.searchParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token') ?? parsed.searchParams.get('refresh_token');
      if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      }
    };

    let notifCleanup: (() => void) | undefined;
    if (!isExpoGo) {
      void (async () => {
        const N = await import('expo-notifications');
        notificationListener.current = N.addNotificationReceivedListener(() => {});
        responseListener.current = N.addNotificationResponseReceivedListener(response => {
          const screen = response.notification.request.content.data?.screen as string | undefined;
          if (screen) router.push(`/(tabs)/${screen}` as Parameters<typeof router.push>[0]);
        });
        notifCleanup = () => {
          notificationListener.current?.remove();
          responseListener.current?.remove();
        };
      })();
    }

    const sub = Linking.addEventListener('url', handleDeepLink);
    Linking.getInitialURL().then((url) => { if (url) handleDeepLink({ url }); });

    return () => {
      subscription.unsubscribe();
      sub.remove();
      notifCleanup?.();
    };
  }, []);

  // Trigger artist-alert check when app comes to foreground (throttled to ~6 h)
  useEffect(() => {
    if (!session) return;
    const THROTTLE_MS = 6 * 60 * 60 * 1000;
    let lastChecked = 0;
    const checkAlerts = async () => {
      if (Date.now() - lastChecked < THROTTLE_MS) return;
      lastChecked = Date.now();
      const { data: { session: s } } = await supabase.auth.getSession();
      if (!s) return;
      try {
        await fetch(
          `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/check-artist-alerts`,
          { method: 'POST', headers: { Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' }, body: '{}' },
        );
      } catch { /* best-effort */ }
    };
    checkAlerts();
    const sub = AppState.addEventListener('change', state => { if (state === 'active') checkAlerts(); });
    return () => sub.remove();
  }, [session]);

  useProtectedRoute(session, isLoading);

  if (!fontsLoaded || isLoading) {
    return <View style={{ flex: 1, backgroundColor: '#FBF8F1' }} />;
  }

  return (
    <SavedEventsProvider>
      <StatusBar style="light" translucent />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#eef0fb' },
          animation: 'slide_from_right',
          gestureEnabled: true,
          gestureDirection: 'horizontal',
        }}
      >
        <Stack.Screen name="(auth)"    options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="(tabs)"    options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="auth/callback" options={{ animation: 'none', gestureEnabled: false }} />
        <Stack.Screen name="settings" />
        <Stack.Screen name="privacy" />
        <Stack.Screen name="terms" />
        <Stack.Screen name="help" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="edit-profile" />
        <Stack.Screen name="event-details" />
        <Stack.Screen name="user-profile" />
        <Stack.Screen name="discover-event" />
        <Stack.Screen name="review-imports" />
        <Stack.Screen name="following" />
        <Stack.Screen name="scan-ticket" options={{ presentation: 'modal', headerShown: false }} />
      </Stack>

      {/* Permissions gate — shown once on first login */}
      <PermissionsGate
        visible={showPermissions}
        onDone={() => setShowPermissions(false)}
      />
    </SavedEventsProvider>
  );
}
