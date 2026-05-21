import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, StatusBar,
} from 'react-native';
import { scaleFont } from '@/lib/layout';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase/client';

const BG     = '#FBF8F1';
const DEEP   = '#1A0848';
const EMBER  = '#E8581A';
const MUTED  = '#8B8690';
const BORDER = '#E8E4DE';
const GREEN  = '#059669';

function usernameIsValid(u: string): boolean {
  return /^[a-z0-9_]{3,30}$/.test(u);
}

export default function SignupScreen(): React.JSX.Element {
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [phone,    setPhone]    = useState('');
  const [zipcode,  setZipcode]  = useState('');
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const checkUsername = useCallback(async (value: string) => {
    const clean = value.toLowerCase().trim();
    if (!clean) { setUsernameStatus('idle'); return; }
    if (!usernameIsValid(clean)) { setUsernameStatus('invalid'); return; }
    setUsernameStatus('checking');
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('username', clean)
      .maybeSingle();
    setUsernameStatus(data ? 'taken' : 'available');
  }, []);

  const handleUsernameChange = (value: string) => {
    const clean = value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setUsername(clean);
    setUsernameStatus('idle');
    if (clean.length >= 3) {
      checkUsername(clean);
    } else if (clean.length > 0) {
      setUsernameStatus('invalid');
    }
  };

  const handlePhoneChange = (value: string) => {
    setPhone(value.replace(/\D/g, '').slice(0, 10));
  };

  const handleSubmit = async (): Promise<void> => {
    if (!fullName.trim())  { setError('Please enter your full name.'); return; }
    if (!email.trim())     { setError('Please enter your email.'); return; }
    if (!password.trim())  { setError('Please enter a password.'); return; }
    if (!phone.trim())     { setError('Please enter your phone number.'); return; }
    if (phone.length !== 10) { setError('Phone number must be exactly 10 digits.'); return; }
    if (!zipcode.trim())   { setError('Please enter your zip code.'); return; }
    if (!/^\d{5}(-\d{4})?$/.test(zipcode.trim())) { setError('Please enter a valid zip code.'); return; }
    if (!username.trim())  { setError('Please choose a username.'); return; }
    if (!usernameIsValid(username)) { setError('Username must be 3–30 characters: lowercase letters, numbers, underscores only.'); return; }
    if (usernameStatus === 'taken')    { setError('That username is already taken.'); return; }
    if (usernameStatus === 'checking') { setError('Still checking username availability…'); return; }

    setLoading(true);
    setError(null);

    const { error: signUpErr } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // username stored in metadata so the DB trigger reads it on OTP confirmation
        data: {
          full_name: fullName.trim(),
          phone_number: phone,
          zip_code: zipcode.trim(),
          username: username.trim(),
        },
      },
    });

    if (signUpErr) { setError(signUpErr.message); setLoading(false); return; }

    router.replace({ pathname: '/(auth)/verify-otp', params: { email: email.trim() } } as any);
  };

  const usernameHint = (): { text: string; color: string } | null => {
    switch (usernameStatus) {
      case 'checking':  return { text: 'Checking…', color: MUTED };
      case 'available': return { text: '@' + username + ' is available', color: GREEN };
      case 'taken':     return { text: 'Username already taken', color: EMBER };
      case 'invalid':   return { text: 'Only lowercase letters, numbers, underscores (3–30 chars)', color: EMBER };
      default:          return null;
    }
  };

  const hint = usernameHint();

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
              placeholder="Full Name"
              placeholderTextColor={MUTED}
              value={fullName}
              onChangeText={setFullName}
            />

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
              style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: DEEP, backgroundColor: '#fff', borderWidth: 1.5, borderColor: BORDER, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 14 }}
              placeholder="Password"
              placeholderTextColor={MUTED}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <TextInput
              style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: DEEP, backgroundColor: '#fff', borderWidth: 1.5, borderColor: BORDER, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 14 }}
              placeholder="Phone Number (10 digits)"
              placeholderTextColor={MUTED}
              value={phone}
              onChangeText={handlePhoneChange}
              keyboardType="phone-pad"
              maxLength={10}
            />

            <TextInput
              style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: DEEP, backgroundColor: '#fff', borderWidth: 1.5, borderColor: BORDER, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 14 }}
              placeholder="Zip Code"
              placeholderTextColor={MUTED}
              value={zipcode}
              onChangeText={setZipcode}
              keyboardType="number-pad"
              maxLength={10}
            />

            {/* Username field */}
            <View style={{ marginBottom: hint ? 6 : 28 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1.5, borderColor: usernameStatus === 'taken' || usernameStatus === 'invalid' ? EMBER : usernameStatus === 'available' ? GREEN : BORDER, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14 }}>
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: MUTED, marginRight: 2 }}>@</Text>
                <TextInput
                  style={{ flex: 1, fontFamily: 'DMSans_400Regular', fontSize: 13, color: DEEP, padding: 0 }}
                  placeholder="username"
                  placeholderTextColor={MUTED}
                  value={username}
                  onChangeText={handleUsernameChange}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={30}
                />
                {usernameStatus === 'checking' && <ActivityIndicator size="small" color={MUTED} />}
                {usernameStatus === 'available' && <Text style={{ fontSize: 16 }}>✓</Text>}
              </View>
              {hint && (
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: hint.color, marginTop: 4, marginLeft: 4, marginBottom: 14 }}>
                  {hint.text}
                </Text>
              )}
            </View>

            <TouchableOpacity
              style={{ backgroundColor: DEEP, borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 14, opacity: loading ? 0.6 : 1 }}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, letterSpacing: 1.5, color: '#fff', textTransform: 'uppercase' }}>
                    Create Account
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
