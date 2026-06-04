import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Linking,
  LayoutAnimation, UIManager, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { scale, scaleFont, sp } from '@/lib/layout';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const BRAND_FROM = '#4f6cf2';
const BRAND_TO   = '#a25cf2';
const FG         = '#1a1530';
const MUTED      = '#6b6a85';
const SURFACE    = '#ffffff';
const BG         = '#eef0fb';

const SUPPORT_EMAIL = 'support@saltydigital.ai';

const FAQ: { q: string; a: string }[] = [
  {
    q: 'How do I import tickets?',
    a: 'Connect Gmail in Settings to let Salty automatically find ticket emails, or tap the camera button on the Tickets tab to scan a ticket photo.',
  },
  {
    q: "Why isn't Gmail finding my tickets?",
    a: 'Make sure you connected the Gmail account where your tickets are sent. Once connected, go to the Tickets tab and tap "Scan Now" to run a fresh scan.',
  },
  {
    q: 'How do I add friends?',
    a: 'Open your Profile and tap "Find Friends" to search by username, or sync your contacts to see who you already know on Salty.',
  },
  {
    q: 'Can I edit event details?',
    a: 'Yes — open any event and tap the edit icon in the top-right corner to update the title, venue, date, time, or seat.',
  },
  {
    q: 'How do I share an event?',
    a: 'Open the event and tap the Share button in the header. You can share a link or share event details directly.',
  },
  {
    q: 'What is the setlist feature?',
    a: 'For concerts and festivals, Salty automatically fetches the setlist after the show. Open the event details to see what songs were played.',
  },
  {
    q: 'How do I delete my account?',
    a: 'Go to Settings → scroll to the bottom → tap Delete Account. This permanently removes all your data and cannot be undone.',
  },
];

function FAQItem({ q, a }: { q: string; a: string }): React.JSX.Element {
  const [open, setOpen] = useState(false);

  const toggle = () => {
    LayoutAnimation.configureNext({
      duration: 220,
      create: { type: 'easeInEaseOut', property: 'opacity' },
      update: { type: 'easeInEaseOut' },
      delete: { type: 'easeInEaseOut', property: 'opacity' },
    });
    setOpen(v => !v);
  };

  return (
    <View>
      <TouchableOpacity onPress={toggle} activeOpacity={0.7}
        style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: sp(16), paddingVertical: sp(16), gap: sp(12) }}>
        <Text style={{ flex: 1, fontFamily: 'DMSans_500Medium', fontSize: scaleFont(14), color: FG }}>
          {q}
        </Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={MUTED}
        />
      </TouchableOpacity>
      {open && (
        <View style={{ paddingHorizontal: sp(16), paddingBottom: sp(16) }}>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(13), color: MUTED, lineHeight: 20 }}>
            {a}
          </Text>
        </View>
      )}
    </View>
  );
}

export default function HelpScreen(): React.JSX.Element {
  const router = useRouter();
  const { bottom } = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <LinearGradient
        colors={[BRAND_FROM, BRAND_TO]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ paddingBottom: sp(20), borderBottomLeftRadius: scale(32), borderBottomRightRadius: scale(32) }}
      >
        <SafeAreaView edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: sp(20), paddingTop: 4, paddingBottom: 4 }}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ width: scale(40), height: scale(40), borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(12), color: 'rgba(255,255,255,0.72)' }}>FAQ & support</Text>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(24), color: '#fff', letterSpacing: -0.4, marginTop: 2 }}>Help</Text>
            </View>
            <View style={{ width: scale(40) }} />
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: sp(20), paddingTop: sp(24), paddingBottom: bottom + 32, gap: sp(16) }}>

        {/* FAQ */}
        <View style={{ backgroundColor: SURFACE, borderRadius: scale(20), overflow: 'hidden', shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(11), color: MUTED, letterSpacing: 1, textTransform: 'uppercase', paddingHorizontal: sp(16), paddingTop: sp(16), paddingBottom: sp(4) }}>
            Frequently Asked
          </Text>
          {FAQ.map((item, i) => (
            <View key={item.q}>
              <FAQItem q={item.q} a={item.a} />
              {i < FAQ.length - 1 && (
                <View style={{ height: 1, backgroundColor: '#f1eefb', marginHorizontal: sp(16) }} />
              )}
            </View>
          ))}
        </View>

        {/* Still need help */}
        <View style={{ backgroundColor: SURFACE, borderRadius: scale(20), padding: sp(20), shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(11), color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: sp(10) }}>
            Still Need Help?
          </Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(14), color: FG, lineHeight: 22, marginBottom: sp(14) }}>
            Can't find what you're looking for? Send us a message and we'll get back to you within 24 hours.
          </Text>
          <TouchableOpacity
            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Help%20Request`)}
            activeOpacity={0.8}
            style={{ overflow: 'hidden', borderRadius: scale(12), alignSelf: 'flex-start' }}
          >
            <LinearGradient colors={[BRAND_FROM, BRAND_TO]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: sp(8), paddingHorizontal: sp(18), paddingVertical: sp(11) }}>
              <Ionicons name="mail-outline" size={16} color="#fff" />
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(14), color: '#fff' }}>Contact Support</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
}
