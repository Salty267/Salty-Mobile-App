import '../global.css';
import React, { useEffect, useRef, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SavedEventsProvider } from '@/lib/SavedEventsContext';
import { StatusBar } from 'expo-status-bar';
import { useFonts, BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue';
import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { View, AppState } from 'react-native';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase/client';
import { registerForPushNotifications } from '@/lib/notifications';
import type { Session } from '@supabase/supabase-js';
import type * as NotificationsType from 'expo-notifications';

// Expo Go dropped remote push support in SDK 53 — skip all push setup there
const isExpoGo =
  Constants.executionEnvironment === 'storeClient' ||
  (Constants.appOwnership as string | null) === 'expo';

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

export default function RootLayout(): React.JSX.Element | null {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const notificationListener = useRef<NotificationsType.Subscription | null>(null);
  const responseListener = useRef<NotificationsType.Subscription | null>(null);

  const [fontsLoaded] = useFonts({
    BebasNeue_400Regular,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        setSession(null);
        setIsLoading(false);
        return;
      }
      // Validate the stored session before autoRefreshToken fires and throws
      const { error } = await supabase.auth.getUser();
      if (error) {
        await supabase.auth.signOut();
        setSession(null);
      } else {
        setSession(session);
        registerForPushNotifications(session.user.id).catch(() => {});
      }
      setIsLoading(false);
    }).catch(async () => {
      await supabase.auth.signOut();
      setSession(null);
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      if (event === 'SIGNED_IN' && session?.user) {
        await registerForPushNotifications(session.user.id).catch(() => {});
      }
    });

    // Handle deep link callbacks (e.g. email confirmation, OAuth redirect)
    const handleDeepLink = async ({ url }: { url: string }) => {
      if (!url.includes('auth/callback')) return;
      const parsed = new URL(url);
      const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));

      // Supabase v2 email confirmation: token_hash + type
      const tokenHash = parsed.searchParams.get('token_hash');
      const type = parsed.searchParams.get('type') as 'signup' | 'recovery' | 'email' | null;
      if (tokenHash && type) {
        await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        return;
      }

      // OAuth / magic-link: access_token + refresh_token in hash or query
      const accessToken = hashParams.get('access_token') ?? parsed.searchParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token') ?? parsed.searchParams.get('refresh_token');
      if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      }
    };

    let notifCleanup: (() => void) | undefined;

    if (!isExpoGo) {
      // Dynamic import prevents expo-notifications loading (and throwing) in Expo Go
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
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${s.access_token}`,
              'Content-Type': 'application/json',
            },
            body: '{}',
          },
        );
      } catch { /* best-effort */ }
    };

    checkAlerts();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') checkAlerts();
    });
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
        <Stack.Screen name="(auth)" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="auth/callback" options={{ animation: 'none', gestureEnabled: false }} />
        <Stack.Screen name="settings" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="edit-profile" />
        <Stack.Screen name="event-details" />
        <Stack.Screen name="user-profile" />
        <Stack.Screen name="discover-event" />
        <Stack.Screen name="review-imports" />
        <Stack.Screen name="following" />
      </Stack>
    </SavedEventsProvider>
  );
}
