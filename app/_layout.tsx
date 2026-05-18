import '../global.css';
import React, { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts, BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue';
import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { View } from 'react-native';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase/client';
import type { Session } from '@supabase/supabase-js';

function useProtectedRoute(session: Session | null, isLoading: boolean): void {
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/onboarding' as any);
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, segments, isLoading]);
}

export default function RootLayout(): React.JSX.Element | null {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [fontsLoaded] = useFonts({
    BebasNeue_400Regular,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    // Handle deep link callbacks (e.g. email confirmation, OAuth redirect)
    const handleDeepLink = async ({ url }: { url: string }) => {
      if (!url.includes('auth/callback')) return;
      const parsed = new URL(url);
      // Supabase OAuth puts tokens in the hash fragment; email links use query params
      const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));
      const accessToken = hashParams.get('access_token') ?? parsed.searchParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token') ?? parsed.searchParams.get('refresh_token');
      if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      }
    };

    const sub = Linking.addEventListener('url', handleDeepLink);
    Linking.getInitialURL().then((url) => { if (url) handleDeepLink({ url }); });

    return () => {
      subscription.unsubscribe();
      sub.remove();
    };
  }, []);

  useProtectedRoute(session, isLoading);

  if (!fontsLoaded || isLoading) {
    return <View style={{ flex: 1, backgroundColor: '#FBF8F1' }} />;
  }

  return (
    <>
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
        <Stack.Screen name="settings" />
        <Stack.Screen name="edit-profile" />
      </Stack>
    </>
  );
}
