import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  StatusBar, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase/client';
import { scale, scaleFont, sp } from '@/lib/layout';

const BG     = '#FBF8F1';
const DEEP   = '#1A0848';
const EMBER  = '#E8581A';
const MUTED  = '#8B8690';
const BORDER = '#E8E4DE';
const PURPLE = '#5B2FD4';

const OTP_LENGTH = 6;

export default function VerifyOtpScreen(): React.JSX.Element {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();

  const [digits, setDigits]   = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [resent, setResent]   = useState(false);

  const inputs = useRef<(TextInput | null)[]>([]);

  const token = digits.join('');

  useEffect(() => {
    // Auto-focus first box on mount
    setTimeout(() => inputs.current[0]?.focus(), 150);
  }, []);

  const handleChange = (text: string, index: number) => {
    // Allow paste of full code into first box
    if (text.length > 1) {
      const pasted = text.replace(/\D/g, '').slice(0, OTP_LENGTH).split('');
      const next = [...Array(OTP_LENGTH).fill('')];
      pasted.forEach((d, i) => { next[i] = d; });
      setDigits(next);
      inputs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
      return;
    }

    const digit = text.replace(/\D/g, '');
    const next = [...digits];
    next[index] = digit;
    setDigits(next);

    if (digit && index < OTP_LENGTH - 1) {
      inputs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !digits[index] && index > 0) {
      const next = [...digits];
      next[index - 1] = '';
      setDigits(next);
      inputs.current[index - 1]?.focus();
    }
  };

  const verify = async (code: string) => {
    setLoading(true);
    setError(null);
    try {
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        email: email ?? '',
        token: code,
        type: 'signup',
      });
      if (verifyErr) {
        setError('Invalid code. Please try again.');
        setDigits(Array(OTP_LENGTH).fill(''));
        inputs.current[0]?.focus();
        return;
      }
      router.replace('/(auth)/confirmed' as any);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token.length === OTP_LENGTH) {
      verify(token);
    }
  }, [token]);

  const handleResend = async () => {
    setError(null);
    setResent(false);
    try {
      await supabase.auth.resend({ email: email ?? '', type: 'signup' });
      setResent(true);
      setDigits(Array(OTP_LENGTH).fill(''));
      setTimeout(() => inputs.current[0]?.focus(), 100);
      setTimeout(() => setResent(false), 4000);
    } catch {
      setError('Could not resend code. Please try again.');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: sp(24) }}>

          <Text style={{ fontSize: scaleFont(56), marginBottom: sp(24) }}>📬</Text>

          <Text style={{ fontFamily: 'BebasNeue_400Regular', fontSize: scaleFont(40), letterSpacing: 8, color: DEEP, textAlign: 'center', marginBottom: sp(10) }}>
            CHECK YOUR{'\n'}EMAIL
          </Text>

          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(13), color: MUTED, textAlign: 'center', lineHeight: 20, marginBottom: sp(36) }}>
            We sent a {OTP_LENGTH}-digit code to{'\n'}
            <Text style={{ fontFamily: 'DMSans_700Bold', color: DEEP }}>{email}</Text>
          </Text>

          {/* OTP digit boxes */}
          <View style={{ flexDirection: 'row', gap: sp(10), marginBottom: sp(28) }}>
            {digits.map((d, i) => (
              <TextInput
                key={i}
                ref={ref => { inputs.current[i] = ref; }}
                style={{
                  width: scale(46), height: scale(56),
                  borderWidth: 1.5,
                  borderColor: d ? PURPLE : BORDER,
                  borderRadius: scale(14),
                  backgroundColor: '#fff',
                  textAlign: 'center',
                  fontSize: scaleFont(22),
                  fontFamily: 'DMSans_700Bold',
                  color: DEEP,
                }}
                value={d}
                onChangeText={text => handleChange(text, i)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
                keyboardType="number-pad"
                maxLength={OTP_LENGTH}
                selectTextOnFocus
              />
            ))}
          </View>

          {error && (
            <View style={{ backgroundColor: '#FDEBD9', borderRadius: scale(12), paddingHorizontal: sp(14), paddingVertical: sp(10), marginBottom: sp(20), borderLeftWidth: 4, borderLeftColor: EMBER, width: '100%' }}>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(12), color: EMBER }}>{error}</Text>
            </View>
          )}

          {resent && (
            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(12), color: PURPLE, marginBottom: sp(16) }}>
              Code resent — check your inbox.
            </Text>
          )}

          {loading && <ActivityIndicator color={DEEP} style={{ marginBottom: sp(20) }} />}

          <TouchableOpacity onPress={handleResend} disabled={loading} activeOpacity={0.7}>
            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(13), color: MUTED }}>
              Didn't get a code?{' '}
              <Text style={{ fontFamily: 'DMSans_700Bold', color: PURPLE, textDecorationLine: 'underline' }}>
                Resend
              </Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.back()}
            style={{ marginTop: sp(24) }}
            activeOpacity={0.7}
          >
            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(12), color: MUTED }}>
              ← Back to sign up
            </Text>
          </TouchableOpacity>

        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
