import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase/client';

export default function AuthCallback(): React.JSX.Element {
  const router = useRouter();

  useEffect(() => {
    const handle = async (url: string) => {
      try {
        const parsed = new URL(url);
        const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));

        // OAuth / magic-link tokens
        const accessToken  = hashParams.get('access_token')  ?? parsed.searchParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token') ?? parsed.searchParams.get('refresh_token');
        if (accessToken && refreshToken) {
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          router.replace('/(tabs)');
          return;
        }

        // Email confirmation (token_hash)
        const tokenHash = parsed.searchParams.get('token_hash');
        const type = parsed.searchParams.get('type') as 'signup' | 'recovery' | 'email' | null;
        if (tokenHash && type) {
          await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
          router.replace('/(tabs)');
          return;
        }

        // Gmail OAuth via PKCE — handleConnectGmail already processed the tokens.
        // Just navigate back to the app.
        router.replace('/(tabs)');
      } catch (e) {
        console.error('Auth callback error:', e);
        router.replace('/(tabs)');
      }
    };

    Linking.getInitialURL().then((url) => { if (url) handle(url); });
    const sub = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => sub.remove();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#eef0fb', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color="#4f6cf2" />
    </View>
  );
}
