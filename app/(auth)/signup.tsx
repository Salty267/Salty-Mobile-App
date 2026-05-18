import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, StatusBar,
} from 'react-native';
import { scaleFont } from '@/lib/layout';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase/client';

const BG     = '#FBF8F1';
const DEEP   = '#1A0848';
const EMBER  = '#E8581A';
const MUTED  = '#8B8690';
const BORDER = '#E8E4DE';

export default function SignupScreen(): React.JSX.Element {
  const router = useRouter();
  const { provider, prefillName, prefillEmail, accessToken, refreshToken } =
    useLocalSearchParams<{
      provider?: string;
      prefillName?: string;
      prefillEmail?: string;
      accessToken?: string;
      refreshToken?: string;
    }>();

  const isGoogle = provider === 'google';

  const [fullName, setFullName] = useState(prefillName ?? '');
  const [email,    setEmail]    = useState(prefillEmail ?? '');
  const [password, setPassword] = useState('');
  const [phone,    setPhone]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [success,  setSuccess]  = useState(false);

  const handleSubmit = async (): Promise<void> => {
    if (!fullName.trim()) { setError('Please enter your full name.'); return; }
    if (!isGoogle && !email.trim()) { setError('Please enter your email.'); return; }
    if (!isGoogle && !password.trim()) { setError('Please enter a password.'); return; }
    if (!phone.trim()) { setError('Please enter your phone number.'); return; }

    setLoading(true);
    setError(null);

    if (isGoogle && accessToken && refreshToken) {
      const { error: sessionErr } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (sessionErr) { setError(sessionErr.message); setLoading(false); return; }

      const { error: updateErr } = await supabase.auth.updateUser({
        data: { full_name: fullName.trim(), phone_number: phone.trim() },
      });
      if (updateErr) { setError(updateErr.message); setLoading(false); return; }
      // session is now set — useProtectedRoute in _layout.tsx will redirect to /(tabs)
    } else {
      const { error: signUpErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName.trim(), phone_number: phone.trim() } },
      });
      if (signUpErr) { setError(signUpErr.message); setLoading(false); return; }
      setSuccess(true);
      setLoading(false);
    }
  };

  if (success) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
          <Text style={{ fontSize: 64, marginBottom: 24 }}>🎟</Text>
          <Text style={{ fontFamily: 'BebasNeue_400Regular', fontSize: scaleFont(40), letterSpacing: 8, color: DEEP, textAlign: 'center', marginBottom: 12 }}>
            CHECK YOUR{'\n'}EMAIL
          </Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: MUTED, textAlign: 'center', lineHeight: 20 }}>
            We sent a confirmation link to {email}.{'\n'}Click it to activate your account.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

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
                {isGoogle ? 'One last step.' : 'Shazam for Your Life.'}
              </Text>
            </View>

            {error && (
              <View style={{ backgroundColor: '#FDEBD9', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 20, borderLeftWidth: 4, borderLeftColor: EMBER }}>
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: EMBER }}>{error}</Text>
              </View>
            )}

            <TextInput
              style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: DEEP, backgroundColor: '#fff', borderWidth: 1.5, borderColor: BORDER, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 14 }}
              placeholder="Full Name"
              placeholderTextColor={MUTED}
              value={fullName}
              onChangeText={setFullName}
            />

            <TextInput
              style={{
                fontFamily: 'DMSans_400Regular', fontSize: 13,
                color: isGoogle ? MUTED : DEEP,
                backgroundColor: isGoogle ? '#F5F3EF' : '#fff',
                borderWidth: 1.5, borderColor: BORDER, borderRadius: 14,
                paddingHorizontal: 16, paddingVertical: 14, marginBottom: 14,
              }}
              placeholder="Email"
              placeholderTextColor={MUTED}
              value={email}
              onChangeText={isGoogle ? undefined : setEmail}
              editable={!isGoogle}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            {!isGoogle && (
              <TextInput
                style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: DEEP, backgroundColor: '#fff', borderWidth: 1.5, borderColor: BORDER, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 14 }}
                placeholder="Password"
                placeholderTextColor={MUTED}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            )}

            <TextInput
              style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: DEEP, backgroundColor: '#fff', borderWidth: 1.5, borderColor: BORDER, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 28 }}
              placeholder="Phone Number"
              placeholderTextColor={MUTED}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />

            <TouchableOpacity
              style={{ backgroundColor: DEEP, borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 14, opacity: loading ? 0.6 : 1 }}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, letterSpacing: 1.5, color: '#fff', textTransform: 'uppercase' }}>
                    {isGoogle ? 'Finish Setup' : 'Create Account'}
                  </Text>
              }
            </TouchableOpacity>

            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: `${DEEP}88` }}>
                Already have an account?{' '}
                <Text
                  style={{ fontFamily: 'DMSans_700Bold', color: '#5B2FD4', textDecorationLine: 'underline' }}
                  onPress={() => router.push('/(auth)/signin' as any)}
                >
                  Sign in
                </Text>
              </Text>
            </View>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
