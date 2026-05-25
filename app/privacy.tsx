import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

const BRAND_FROM = '#4f6cf2';
const BRAND_TO   = '#a25cf2';
const FG         = '#1a1530';
const MUTED      = '#6b6a85';
const SURFACE    = '#ffffff';
const BG         = '#eef0fb';

const SUPPORT_EMAIL = 'support@saltydigital.ai';

const SECTIONS = [
  {
    title: 'What We Collect',
    body: 'When you use Salty, we collect the information you provide during sign-up (name, email), the tickets and events you add, photos you upload to events, friend connections, and your notification preferences.\n\nIf you connect Gmail, we access the subject line, sender, and body of emails that appear to contain tickets — no other emails are read or stored.',
  },
  {
    title: 'How We Use It',
    body: 'Your data is used to display your event history, automatically detect tickets from your inbox, send you event reminders and alerts, surface setlists for concerts you attended, and connect you with friends who also use Salty.\n\nWe do not sell your data to third parties or use it for advertising.',
  },
  {
    title: 'Third-Party Services',
    body: 'Salty integrates with the following services:\n\n• Google — for sign-in and Gmail access (OAuth)\n• Setlist.fm — to fetch concert setlists\n• Spotify — if you choose to export a setlist (optional)\n• Supabase — our database and authentication provider\n\nEach service operates under its own privacy policy.',
  },
  {
    title: 'Your Rights',
    body: 'You can delete your account and all associated data at any time from Settings → Danger Zone → Delete Account. This permanently removes your tickets, photos, friend connections, and preferences.\n\nYou can also disconnect Gmail at any time by going to your Google account settings and revoking Salty\'s access.',
  },
];

export default function PrivacyScreen(): React.JSX.Element {
  const router = useRouter();
  const { bottom } = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <LinearGradient
        colors={[BRAND_FROM, BRAND_TO]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ paddingBottom: 20, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}
      >
        <SafeAreaView edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 4 }}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 20, color: '#fff', letterSpacing: -0.3 }}>Privacy</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: bottom + 32, gap: 16 }}>

        {SECTIONS.map(section => (
          <View key={section.title} style={{ backgroundColor: SURFACE, borderRadius: 20, padding: 20, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 11, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
              {section.title}
            </Text>
            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 14, color: FG, lineHeight: 22 }}>
              {section.body}
            </Text>
          </View>
        ))}

        {/* Contact */}
        <View style={{ backgroundColor: SURFACE, borderRadius: 20, padding: 20, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 11, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
            Contact
          </Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 14, color: FG, lineHeight: 22, marginBottom: 14 }}>
            Questions about how your data is handled? Reach out and we'll respond within 48 hours.
          </Text>
          <TouchableOpacity
            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Privacy%20Inquiry`)}
            activeOpacity={0.8}
            style={{ overflow: 'hidden', borderRadius: 12, alignSelf: 'flex-start' }}
          >
            <LinearGradient colors={[BRAND_FROM, BRAND_TO]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 11 }}>
              <Ionicons name="mail-outline" size={16} color="#fff" />
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: '#fff' }}>{SUPPORT_EMAIL}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: MUTED, textAlign: 'center', marginTop: 4 }}>
          Last updated May 2025
        </Text>

      </ScrollView>
    </View>
  );
}
