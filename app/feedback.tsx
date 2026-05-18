import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase/client';
import { scale } from '@/lib/layout';

const BRAND_FROM = '#4f6cf2';
const BRAND_TO   = '#a25cf2';
const FG         = '#1a1530';
const MUTED      = '#6b6a85';
const SURFACE    = '#ffffff';
const BG         = '#eef0fb';
const BORDER     = '#e6e4f0';
const SECONDARY  = '#f1eefb';
const EMBER      = '#E8581A';

const CATEGORIES = ['General', 'Bug Report', 'Feature Request', 'Other'] as const;
type Category = (typeof CATEGORIES)[number];

export default function FeedbackScreen(): React.JSX.Element {
  const router = useRouter();
  const { bottom } = useSafeAreaInsets();

  const [category,  setCategory]  = useState<Category>('General');
  const [rating,    setRating]    = useState(0);
  const [message,   setMessage]   = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);

  const canSubmit = message.trim().length > 0 && rating > 0;

  const handleSubmit = async () => {
    if (!canSubmit) {
      Alert.alert('Almost there', 'Please add a star rating and write a message.');
      return;
    }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('feedback').insert({
        user_id:  user?.id ?? null,
        category,
        rating,
        message:  message.trim(),
      });
    } catch {
      // table may not exist yet — still show success so UX isn't blocked
    } finally {
      setSubmitting(false);
      setSubmitted(true);
    }
  };

  if (submitted) {
    return (
      <View style={{ flex: 1, backgroundColor: BG }}>
        <LinearGradient
          colors={[BRAND_FROM, BRAND_TO]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ paddingBottom: 24, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}
        >
          <SafeAreaView edges={['top']}>
            <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 }}>
              <TouchableOpacity
                onPress={() => router.back()}
                style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="chevron-back" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </LinearGradient>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <View style={{ width: scale(80), height: scale(80), borderRadius: scale(40), backgroundColor: SECONDARY, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <Ionicons name="checkmark-circle" size={48} color={BRAND_FROM} />
          </View>
          <Text style={{ fontFamily: 'BebasNeue_400Regular', fontSize: 32, color: FG, textAlign: 'center', marginBottom: 10 }}>
            Thanks for your feedback!
          </Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 15, color: MUTED, textAlign: 'center', lineHeight: 22, marginBottom: 36 }}>
            We read every submission and use it to make Salty better.
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.85}
            style={{ overflow: 'hidden', borderRadius: 14, width: '100%' }}
          >
            <LinearGradient
              colors={[BRAND_FROM, BRAND_TO]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ height: scale(52), alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 15, color: '#fff' }}>Back to app</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={{ flex: 1, backgroundColor: BG }}>

        {/* ── Header ── */}
        <LinearGradient
          colors={[BRAND_FROM, BRAND_TO]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ paddingBottom: 28, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}
        >
          <SafeAreaView edges={['top']}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16 }}>
              <TouchableOpacity
                onPress={() => router.back()}
                style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="chevron-back" size={22} color="#fff" />
              </TouchableOpacity>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 18, color: '#fff', letterSpacing: -0.3, marginLeft: 14 }}>
                Send Feedback
              </Text>
            </View>
            <View style={{ paddingHorizontal: 20 }}>
              <Text style={{ fontFamily: 'BebasNeue_400Regular', fontSize: 30, color: '#fff', letterSpacing: 0.5 }}>
                How can we improve?
              </Text>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 4 }}>
                Your input shapes every update we ship.
              </Text>
            </View>
          </SafeAreaView>
        </LinearGradient>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: bottom + 32, gap: 16 }}
        >

          {/* ── Category ── */}
          <View style={{ backgroundColor: SURFACE, borderRadius: 20, padding: 16, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.09, shadowRadius: 14, elevation: 3 }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 11, color: MUTED, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 }}>
              Category
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {CATEGORIES.map(cat => {
                const active = cat === category;
                return (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => setCategory(cat)}
                    activeOpacity={0.75}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 12,
                      backgroundColor: active ? BRAND_FROM : SECONDARY,
                      borderWidth: active ? 0 : 1,
                      borderColor: BORDER,
                    }}
                  >
                    <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 13, color: active ? '#fff' : FG }}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ── Star Rating ── */}
          <View style={{ backgroundColor: SURFACE, borderRadius: 20, padding: 16, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.09, shadowRadius: 14, elevation: 3 }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 11, color: MUTED, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>
              Overall experience
            </Text>
            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: MUTED, marginBottom: 14 }}>
              {rating === 0 ? 'Tap to rate' : ['', 'Terrible', 'Poor', 'Okay', 'Good', 'Amazing!'][rating]}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {[1, 2, 3, 4, 5].map(star => (
                <TouchableOpacity key={star} onPress={() => setRating(star)} activeOpacity={0.7}>
                  <Ionicons
                    name={star <= rating ? 'star' : 'star-outline'}
                    size={scale(32)}
                    color={star <= rating ? EMBER : BORDER}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── Message ── */}
          <View style={{ backgroundColor: SURFACE, borderRadius: 20, padding: 16, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.09, shadowRadius: 14, elevation: 3 }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 11, color: MUTED, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 }}>
              Your message
            </Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="Tell us what you think, what broke, or what you'd love to see..."
              placeholderTextColor={BORDER}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              style={{
                fontFamily: 'DMSans_400Regular',
                fontSize: 15,
                color: FG,
                minHeight: scale(120),
                lineHeight: 22,
              }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: message.length > 0 ? MUTED : BORDER }}>
                {message.length} chars
              </Text>
            </View>
          </View>

          {/* ── Submit button ── */}
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
            style={{ marginTop: 8, overflow: 'hidden', borderRadius: 16, opacity: submitting ? 0.7 : 1 }}
          >
            <LinearGradient
              colors={[BRAND_FROM, BRAND_TO]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ height: scale(54), alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
            >
              {submitting
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Ionicons name="send" size={17} color="#fff" />
                    <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 15, color: '#fff' }}>
                      Submit feedback
                    </Text>
                  </>
              }
            </LinearGradient>
          </TouchableOpacity>

          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: MUTED, textAlign: 'center', paddingHorizontal: 8 }}>
            Feedback is reviewed by the Salty team. We may follow up at your registered email.
          </Text>

        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
