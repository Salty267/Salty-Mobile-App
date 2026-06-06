import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { scale, scaleFont, sp } from '@/lib/layout';

const BRAND_FROM = '#4f6cf2';
const BRAND_TO   = '#a25cf2';
const FG         = '#1a1530';
const MUTED      = '#6b6a85';
const SURFACE    = '#ffffff';
const BG         = '#eef0fb';

type Section = { title: string; body: string };

const SECTIONS: Section[] = [
  {
    title: 'Introduction',
    body: 'Salty Digital LLC ("Salty," "we," "our," or "us") values your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard information when you use the Salty mobile application, website, and related services (collectively, the "Service").\n\nWe operate in accordance with New Jersey law and applicable U.S. privacy regulations.\n\nEffective Date: May 31, 2026  ·  Last Updated: May 30, 2026',
  },
  {
    title: '1. Eligibility',
    body: 'Our services are not directed to children under the age of 13. We do not knowingly collect personal information from anyone under 13 years of age. If you are under 13, please do not use our services or provide any personal information. If we learn that we have collected personal information from a child under 13, we will delete it promptly.',
  },
  {
    title: '2. Information We Collect',
    body: '2.1 Information You Provide Directly\n• Account registration: name, email address, zip code, phone number and password\n• Profile information: display name and profile photo\n• Event and ticket information you enter manually\n• Notes, reflections, and mood tags you attach to events\n• Feedback, support messages, and other communications with us\n\n2.2 Information Collected Automatically\n• Device and technical data: IP address, device identifiers, OS, browser type\n• App usage data: screens viewed, features used, session duration, interaction patterns\n• Location data (with your permission): GPS used to detect nearby events and match photos\n• Photos and camera content (with your permission): used to scan physical ticket barcodes\n• Cookies and similar tracking technologies\n\n2.3 Information from Third-Party Services\n• Google Account (OAuth): name, email address, and profile photo\n• Gmail (with explicit permission): email content accessed solely to detect ticket confirmations — we do not read, index, store, or share any other email content\n• Ticketmaster Discovery API: publicly available event and venue metadata\n• Setlist.fm: publicly available concert setlist data\n• ESPN / Sportmonks: publicly available sports statistics',
  },
  {
    title: '3. How We Use Your Information',
    body: 'We use collected information to:\n• Create, maintain, and secure your Salty account\n• Import and organize your live event tickets\n• Enrich ticket records with setlists, sports stats, venue details, and media\n• Enable social features including friend connections, tagging, and shared event experiences\n• Send push notifications about upcoming events, new ticket detections, and friend activity (only if you opt in)\n• Respond to your support requests and feedback\n• Analyze aggregate, anonymized usage patterns to improve app features and performance\n• Detect and prevent fraud, abuse, and security incidents\n• Comply with legal obligations under applicable law',
  },
  {
    title: '4. Gmail Integration & Google API Policy',
    body: "Salty's use and transfer to any other app of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.\n\nSpecifically:\n• We request Gmail read-only scope solely to scan for ticket confirmation emails\n• We extract only the minimum data necessary: event name, date, venue, seat, and confirmation number\n• We do not store the full text or attachments of any email\n• We do not use Gmail data for advertising, profiling, or any purpose other than importing your tickets\n• Gmail access tokens are stored securely using Expo Secure Store on your device and Supabase with row-level security on our servers\n• You can revoke Gmail access at any time from Settings → Connected Accounts within the app, or directly from your Google Account settings at myaccount.google.com",
  },
  {
    title: '5. How We Share Your Information',
    body: 'We do not sell your personal information. We may share limited information only in the following circumstances:\n\n5.1 With Other Salty Users\nWhen you tag friends in events or use social features, your display name and profile photo are visible to Salty users you are connected with. You control which events are shared via event privacy settings.\n\n5.2 With Service Providers\nWe use Supabase (database, authentication, and file storage) to operate the Service. Supabase processes data only as instructed by us and is contractually obligated to protect your information.\n\n5.3 Legal Authorities\nWe may disclose information if required by law, regulation, court order, or governmental authority, or if we believe disclosure is necessary to protect our rights, your safety, or the safety of others.\n\n5.4 Business Transfers\nIf Salty Digital LLC undergoes a merger, acquisition, or sale of substantially all of its assets, your information may be transferred as part of that transaction. We will notify you before your information becomes subject to a materially different privacy policy.',
  },
  {
    title: '6. Data Retention',
    body: 'We retain your personal data for as long as your account is active or as needed to provide the Service. If you request account deletion, your personal data will be removed from our active systems within 30 days, except where retention is required by applicable law. Anonymized aggregate data may be retained indefinitely for analytics purposes.',
  },
  {
    title: '7. Data Security',
    body: 'We implement industry-standard security measures including:\n• Supabase Row Level Security (RLS) — each user can only access their own data\n• PKCE OAuth flow for secure authentication on mobile devices\n• Encrypted storage of authentication tokens using Expo Secure Store\n• HTTPS/TLS encryption for all data in transit\n• Service role keys are never bundled in the mobile app\n\nNo method of electronic transmission or storage is 100% secure. While we strive to use commercially acceptable means to protect your data, we cannot guarantee absolute security.',
  },
  {
    title: '8. Cookies & Tracking',
    body: 'Our website and web-based components may use cookies and similar technologies to analyze traffic, remember your preferences, and improve your experience across sessions.\n\nYou can control or disable cookies through your browser settings. The mobile app uses Expo Secure Store rather than browser cookies for session management.',
  },
  {
    title: '9. Your Rights & Choices',
    body: 'As a New Jersey resident and/or user of our Service, you may have the following rights:\n• Access: request a copy of the personal information we hold about you\n• Correction: request that we correct inaccurate or incomplete information\n• Deletion: request that we delete your personal information\n• Portability: request your data in a structured, machine-readable format\n• Opt-out of marketing: unsubscribe from promotional emails at any time\n• Withdraw consent: withdraw consent for Gmail access or location tracking at any time through app settings\n\nTo exercise any of these rights, please contact us at privacy@saltydigital.ai. We will respond within 45 days.\n\nAccount Deletion: You may delete your Salty account at any time from Settings → Account → Delete Account. Your personal data will be removed from our active systems within 30 days.',
  },
  {
    title: '10. Third-Party Links & Services',
    body: 'The Service may contain links to third-party websites or integrate with third-party services (Ticketmaster, Setlist.fm, etc.). This Privacy Policy does not apply to those third parties. We encourage you to review the privacy policies of any third-party services you access through our app.',
  },
  {
    title: '11. Changes to This Policy',
    body: 'We may update this Privacy Policy from time to time. Material changes will be communicated by updating the "Last Updated" date and, where appropriate, by in-app notification or email. Your continued use of the Service after changes take effect constitutes your acceptance of the revised policy.',
  },
  {
    title: '12. Google Play Data Safety',
    body: 'Data Collected:\n• Name and email address (account registration)\n• Photos and videos (ticket scanning and event galleries, with permission)\n• Precise location (nearby event detection and venue matching, with permission)\n• Email messages (Gmail integration only, ticket confirmation parsing, with explicit permission)\n• Device and app identifiers (crash reporting and analytics)\n• App activity and interaction data\n\nData Sharing:\nWe do not sell your personal data. Data is shared only with Supabase (our infrastructure provider) and third-party analytics vendors under data processing agreements. Gmail data is never shared with any third party.\n\nSecurity:\nAll data is encrypted in transit using HTTPS/TLS. Authentication tokens are encrypted at rest using Expo Secure Store and Supabase with Row Level Security.',
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
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(12), color: 'rgba(255,255,255,0.72)' }}>Salty Digital LLC</Text>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(24), color: '#fff', letterSpacing: -0.4, marginTop: 2 }}>Privacy Policy</Text>
            </View>
            <View style={{ width: scale(40) }} />
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: sp(20), paddingTop: sp(24), paddingBottom: bottom + 32, gap: sp(14) }}>

        {SECTIONS.map(section => (
          <View key={section.title} style={{ backgroundColor: SURFACE, borderRadius: scale(20), padding: sp(18), shadowColor: '#503cb4', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 3 }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(13), color: FG, marginBottom: sp(8) }}>
              {section.title}
            </Text>
            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(13), color: MUTED, lineHeight: 20 }}>
              {section.body}
            </Text>
          </View>
        ))}

        {/* Contact */}
        <View style={{ backgroundColor: SURFACE, borderRadius: scale(20), padding: sp(18), shadowColor: '#503cb4', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 3 }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(13), color: FG, marginBottom: sp(8) }}>
            13. Contact Us
          </Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(13), color: MUTED, lineHeight: 20, marginBottom: sp(14) }}>
            {'Questions about how your data is handled? Contact us at:'}
          </Text>
          <TouchableOpacity
            onPress={() => Linking.openURL('mailto:support@saltydigital.ai?subject=Privacy%20Inquiry')}
            activeOpacity={0.8}
            style={{ overflow: 'hidden', borderRadius: scale(12), alignSelf: 'flex-start' }}
          >
            <LinearGradient colors={[BRAND_FROM, BRAND_TO]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: sp(8), paddingHorizontal: sp(16), paddingVertical: sp(10) }}>
              <Ionicons name="mail-outline" size={15} color="#fff" />
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(13), color: '#fff' }}>support@saltydigital.ai</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(11), color: MUTED, textAlign: 'center', marginTop: sp(4) }}>
          Salty Digital LLC  ·  Effective May 31, 2026  ·  Last Updated May 30, 2026
        </Text>

      </ScrollView>
    </View>
  );
}
