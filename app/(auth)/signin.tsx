import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StatusBar } from 'react-native';
import { scaleFont } from '@/lib/layout';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase/client';

WebBrowser.maybeCompleteAuthSession();

const BG     = '#FBF8F1';
const DEEP   = '#1A0848';
const EMBER  = '#E8581A';
const MUTED  = '#8B8690';
const BORDER = '#E8E4DE';

export default function SignInScreen(): React.JSX.Element {
  const router = useRouter();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const handleSignIn = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  };

  const handleGoogleSignIn = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const redirectTo = 'salty://auth/callback';
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (error) { setError(error.message); return; }
      if (!data.url) { setError('Could not open Google sign-in.'); return; }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === 'success' && result.url) {
        const parsed = new URL(result.url);
        const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));
        const accessToken = hashParams.get('access_token') ?? parsed.searchParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token') ?? parsed.searchParams.get('refresh_token');
        if (accessToken && refreshToken) {
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingBottom: 40 }}
        >
          <View style={{ flex: 1, justifyContent: 'center' }}>

            <View style={{ alignItems: 'center', marginBottom: 40 }}>
              <Text style={{ fontFamily: 'BebasNeue_400Regular', fontSize: scaleFont(40), letterSpacing: 12, color: DEEP, marginBottom: 4 }}>
                SALTY
              </Text>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: MUTED, fontStyle: 'italic' }}>
                Shazam for Your Life.
              </Text>
            </View>

            {error && (
              <View style={{ backgroundColor: '#FDEBD9', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 20, borderLeftWidth: 4, borderLeftColor: EMBER }}>
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: EMBER }}>{error}</Text>
              </View>
            )}

            <TextInput
              style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: DEEP, backgroundColor: '#fff', borderWidth: 1.5, borderColor: BORDER, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 14 }}
              placeholder="Email"
              placeholderTextColor={MUTED}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <TextInput
              style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: DEEP, backgroundColor: '#fff', borderWidth: 1.5, borderColor: BORDER, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 28 }}
              placeholder="Password"
              placeholderTextColor={MUTED}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <TouchableOpacity
              style={{ backgroundColor: DEEP, borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 14, opacity: loading ? 0.6 : 1 }}
              onPress={handleSignIn}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, letterSpacing: 1.5, color: '#fff', textTransform: 'uppercase' }}>Sign In</Text>
              }
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: MUTED, marginHorizontal: 10 }}>or</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
            </View>

            <TouchableOpacity
              style={{ backgroundColor: '#fff', borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 24, borderWidth: 1.5, borderColor: BORDER, opacity: loading ? 0.6 : 1, flexDirection: 'row', gap: 10 }}
              onPress={handleGoogleSignIn}
              disabled={loading}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 16 }}>G</Text>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: DEEP }}>Continue with Google</Text>
            </TouchableOpacity>

            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: `${DEEP}88` }}>
                Don't have an account?{' '}
                <Text
                  style={{ fontFamily: 'DMSans_700Bold', color: '#5B2FD4', textDecorationLine: 'underline' }}
                  onPress={() => router.push('/(auth)/signup' as any)}
                >
                  Sign up
                </Text>
              </Text>
            </View>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
