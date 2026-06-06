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
    body: 'Please read these Terms and Conditions ("Terms") carefully before using the Salty mobile application, website, and related services (the "Service") operated by Salty Digital LLC ("Salty," "we," "us," or "our"). By accessing or using the Service, you agree to be bound by these Terms and our Privacy Policy. If you disagree with any part of these Terms, do not use the Service.\n\nEffective Date: May 31, 2026  ·  Last Updated: May 30, 2026',
  },
  {
    title: '1. Acceptance of Terms',
    body: 'By creating an account or using any part of the Service, you confirm that:\n(a) you are at least 13 years of age;\n(b) you have the legal capacity to enter into a binding agreement in your jurisdiction; and\n(c) you have read, understood, and agree to be bound by these Terms and our Privacy Policy.',
  },
  {
    title: '2. Description of Service',
    body: 'Salty is a mobile application that allows users to:\n• Import, organize, and track tickets for live events including concerts, sports, theater, and dining\n• Enrich event records with setlists, scores, photos, and venue information\n• Connect with friends and share event experiences\n• Discover upcoming events in their area\n• Build a personal archive and memory collection of live experiences\n\nFeatures and availability may change over time as we continue to develop the Service.',
  },
  {
    title: '3. User Accounts',
    body: '3.1 Registration\nYou must create an account to use the Service. You agree to provide accurate, current, and complete information during registration and to update such information promptly if it changes. You may not create an account on behalf of another person without their authorization.\n\n3.2 Account Security\nYou are solely responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. You agree to notify us immediately at privacy@saltydigital.ai if you suspect any unauthorized access to or use of your account.\n\n3.3 Account Termination\nWe reserve the right to suspend or terminate your account at our sole discretion, with or without notice, for conduct that we determine violates these Terms, is harmful to other users, or is otherwise objectionable. You may also delete your account at any time through the app settings.',
  },
  {
    title: '4. User Content',
    body: '4.1 Ownership\nYou retain ownership of content you create, upload, or share through the Service ("User Content"), including photos, notes, and ticket information. By submitting User Content, you grant Salty Digital LLC a non-exclusive, worldwide, royalty-free license to use, store, display, reproduce, and process that content solely as necessary to operate and improve the Service.\n\n4.2 Content Standards\nYou agree not to upload, post, or share content that:\n• Is unlawful, defamatory, obscene, threatening, or harassing\n• Infringes any third party\'s intellectual property or privacy rights\n• Contains viruses, malware, or other harmful code\n• Impersonates another person or entity\n• Violates any applicable law or regulation\n\n4.3 Removal of Content\nWe reserve the right to remove any User Content that violates these Terms or that we determine, in our sole discretion, is otherwise objectionable, without prior notice.',
  },
  {
    title: '5. Gmail & Google Integration',
    body: "If you connect your Gmail account, you authorize Salty to access your Gmail solely to detect and import ticket confirmation emails. You represent that you are the owner or authorized user of the connected Google account. You may revoke this access at any time through app settings or Google Account settings.\n\nSalty's use of Gmail data complies with the Google API Services User Data Policy including the Limited Use requirements.",
  },
  {
    title: '6. Prohibited Conduct',
    body: 'You agree not to:\n• Use the Service for any unlawful purpose or in violation of these Terms\n• Attempt to gain unauthorized access to any part of the Service or other users\' accounts\n• Scrape, data-mine, or extract data from the Service using automated means without our written consent\n• Reverse engineer, decompile, or disassemble any part of the Service\n• Use the Service to transmit spam, unsolicited messages, or commercial solicitations\n• Upload or transmit any content that contains viruses or malicious code\n• Interfere with or disrupt the integrity, performance, or availability of the Service\n• Create multiple accounts for the purpose of abuse, manipulation, or circumventing restrictions\n• Impersonate Salty Digital LLC, its employees, or another user',
  },
  {
    title: '7. Intellectual Property',
    body: 'The Service and its original content, features, and functionality — including the Salty name, logos, design, and source code — are the exclusive property of Salty Digital LLC and are protected by copyright, trademark, and other applicable intellectual property laws. You may not use, copy, reproduce, or distribute any part of the Service without our prior written consent.\n\nNothing in these Terms grants you any right or license to use our trademarks, service marks, or trade names.',
  },
  {
    title: '8. Third-Party Services',
    body: 'The Service integrates with third-party platforms and APIs including Google, Ticketmaster, Setlist.fm, ESPN, and Sportmonks. Your use of those services is governed by their respective terms of service and privacy policies. We are not responsible for the content, accuracy, availability, or practices of any third-party services.',
  },
  {
    title: '9. Disclaimers',
    body: 'THE SERVICE IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, OR NON-INFRINGEMENT.\n\nWE DO NOT WARRANT THAT: (A) THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE; (B) ANY DEFECTS WILL BE CORRECTED; OR (C) THE SERVICE OR SERVERS ARE FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS.\n\nSalty does not guarantee the accuracy, completeness, or timeliness of event data, setlists, scores, or other third-party enrichment data.',
  },
  {
    title: '10. Limitation of Liability',
    body: 'TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, SALTY DIGITAL LLC, ITS OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF (OR INABILITY TO USE) THE SERVICE.\n\nOUR TOTAL CUMULATIVE LIABILITY FOR ALL CLAIMS ARISING UNDER THESE TERMS SHALL NOT EXCEED THE GREATER OF: (A) THE TOTAL FEES YOU PAID TO US IN THE TWELVE MONTHS PRECEDING THE CLAIM; OR (B) USD $50.',
  },
  {
    title: '11. Indemnification',
    body: 'You agree to indemnify, defend, and hold harmless Salty Digital LLC and its officers, directors, employees, contractors, and agents from and against any and all claims, liabilities, damages, losses, costs, and expenses (including reasonable attorneys\' fees) arising out of or in connection with: (a) your use of or inability to use the Service; (b) your User Content; (c) your violation of these Terms; or (d) your violation of any rights of another person or entity.',
  },
  {
    title: '12. Modifications to the Service',
    body: 'We reserve the right to modify, suspend, or discontinue the Service or any feature thereof at any time with or without notice. We shall not be liable to you or any third party for any modification, suspension, or discontinuation of the Service.',
  },
  {
    title: '13. Changes to These Terms',
    body: 'We may revise these Terms from time to time. We will notify you of material changes by updating the "Last Updated" date at the top of this document and, where appropriate, by in-app notification or email. Your continued use of the Service after revised Terms take effect constitutes your acceptance of those changes.',
  },
  {
    title: '14. Governing Law & Dispute Resolution',
    body: 'These Terms shall be governed by and construed in accordance with the laws of the State of New Jersey, without regard to its conflict of law principles. Any disputes arising out of or relating to these Terms or the Service shall be resolved exclusively in the state or federal courts located in New Jersey.\n\nBefore initiating any legal action, you agree to first contact us at privacy@saltydigital.ai and provide a written description of the dispute. Both parties will make a good-faith effort to resolve the dispute informally within 30 days.',
  },
  {
    title: '15. Entire Agreement',
    body: 'These Terms, together with our Privacy Policy, constitute the entire agreement between you and Salty Digital LLC regarding your use of the Service and supersede all prior and contemporaneous agreements, representations, and understandings, whether written or oral.',
  },
  {
    title: '16. Severability',
    body: 'If any provision of these Terms is found to be unenforceable or invalid under applicable law, that provision will be limited or eliminated to the minimum extent necessary, and the remaining provisions will continue in full force and effect.',
  },
];

export default function TermsScreen(): React.JSX.Element {
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
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(24), color: '#fff', letterSpacing: -0.4, marginTop: 2 }}>Terms of Service</Text>
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
            17. Contact Us
          </Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(13), color: MUTED, lineHeight: 20, marginBottom: sp(14) }}>
            {'Questions about these Terms? Contact us at:'}
          </Text>
          <TouchableOpacity
            onPress={() => Linking.openURL('mailto:support@saltydigital.ai?subject=Terms%20of%20Service%20Inquiry')}
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
