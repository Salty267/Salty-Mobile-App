import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  Image, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView,
  LayoutAnimation, UIManager, Platform, Alert,
} from 'react-native';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const LA = () => LayoutAnimation.configureNext({
  duration: 220,
  create:  { type: 'easeInEaseOut', property: 'opacity' },
  update:  { type: 'easeInEaseOut' },
  delete:  { type: 'easeInEaseOut', property: 'opacity' },
});
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomPad } from '@/lib/useBottomPad';
import { SCREEN_W, scale } from '@/lib/layout';
import { useRouter } from 'expo-router';

const TKT_IMG_W = Math.round(SCREEN_W * 0.23);
const TKT_IMG_H = Math.round(TKT_IMG_W * 1.22);
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase/client';
import { useSidebar } from '@/lib/SidebarContext';
import { useSavedEvents } from '@/lib/SavedEventsContext';
import { isEventPast } from '@/lib/parseEventDate';

const BRAND_FROM = '#4f6cf2';
const BRAND_TO   = '#a25cf2';
const FG         = '#1a1530';
const MUTED      = '#6b6a85';
const SURFACE    = '#ffffff';
const BG         = '#eef0fb';
const GREEN      = '#059669';

type Ticket = {
  id: string; title: string; venue: string; date: string; time: string;
  category: string; tint: string; image: string; seat?: string;
  isPast: boolean;
};

// Map display category → DB category value
const CATEGORY_DB: Record<string, string> = {
  Concert: 'concert', Sports: 'sports', Festival: 'festival',
  Trip: 'trip', Theatre: 'theater', Other: 'other',
};
const CATEGORY_TINTS: Record<string, string> = {
  Concert: '#FAC775', Sports: '#E8581A', Festival: '#FFCBA4',
  Trip: '#A8E6D3', Theatre: '#C8B8FF', Other: '#b0b8e0',
};
const CATEGORIES = Object.keys(CATEGORY_TINTS);

const IMAP_PROVIDERS: Record<string, { host: string; port: number; label: string; hint: string }> = {
  'outlook.com': { host: 'outlook.office365.com', port: 993, label: 'Outlook',   hint: 'Use your Microsoft account password.' },
  'hotmail.com': { host: 'outlook.office365.com', port: 993, label: 'Hotmail',   hint: 'Use your Microsoft account password.' },
  'live.com':    { host: 'outlook.office365.com', port: 993, label: 'Live',      hint: 'Use your Microsoft account password.' },
  'yahoo.com':   { host: 'imap.mail.yahoo.com',   port: 993, label: 'Yahoo',     hint: 'Generate an app password at myaccount.yahoo.com.' },
  'ymail.com':   { host: 'imap.mail.yahoo.com',   port: 993, label: 'Yahoo',     hint: 'Generate an app password at myaccount.yahoo.com.' },
  'icloud.com':  { host: 'imap.mail.me.com',      port: 993, label: 'iCloud',    hint: 'Generate an app-specific password at appleid.apple.com.' },
  'me.com':      { host: 'imap.mail.me.com',      port: 993, label: 'iCloud',    hint: 'Generate an app-specific password at appleid.apple.com.' },
  'aol.com':     { host: 'imap.aol.com',          port: 993, label: 'AOL',       hint: 'Generate an app password in your AOL account security settings.' },
};

function detectImapProvider(email: string) {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  return IMAP_PROVIDERS[domain] ?? null;
}

type AddForm = { title: string; venue: string; date: string; time: string; category: string; seat: string };
type ImapForm = { email: string; password: string };

function formatLastScanned(ts: string | null): string {
  if (!ts) return 'Never scanned';
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60)   return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function TicketsScreen(): React.JSX.Element {
  const { openSidebar } = useSidebar();
  const bottomPad = useBottomPad();
  const router = useRouter();
  const [tab,            setTab]           = useState<'upcoming' | 'past'>('upcoming');
  const [tickets,        setTickets]       = useState<Ticket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailEmail,     setGmailEmail]    = useState('');
  const [lastSyncedAt,   setLastSyncedAt]  = useState<string | null>(null);
  const [geminiConsent,  setGeminiConsent] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [scanning,       setScanning]      = useState(false);
  const [connecting,     setConnecting]    = useState(false);
  const [addVisible,     setAddVisible]    = useState(false);
  const [form,           setForm]          = useState<AddForm>({ title: '', venue: '', date: '', time: '', category: 'Concert', seat: '' });

  // IMAP (non-Gmail) connection state
  const [imapConnected,      setImapConnected]      = useState(false);
  const [imapEmail,          setImapEmail]          = useState('');
  const [imapLastSyncedAt,   setImapLastSyncedAt]   = useState<string | null>(null);
  const [imapConsent,        setImapConsent]        = useState(false);
  const [imapScanning,       setImapScanning]       = useState(false);
  const [imapConnecting,     setImapConnecting]     = useState(false);
  const [showImapModal,      setShowImapModal]      = useState(false);
  const [showImapConsent,    setShowImapConsent]    = useState(false);
  const [imapForm,           setImapForm]           = useState<ImapForm>({ email: '', password: '' });
  const [imapError,          setImapError]          = useState<string | null>(null);

  // Load tickets from Supabase
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || !active) { setTicketsLoading(false); return; }

      const uid = user.id;

      // Load tickets and gmail connection in parallel
      Promise.all([
        supabase
          .from('tickets')
          .select('id, title, venue_name, date_str, time_str, category, tint, image_url, seat')
          .eq('user_id', uid)
          .eq('status', 'active')
          .order('imported_at', { ascending: false }),
        supabase
          .from('gmail_connections')
          .select('email, last_synced_at, gemini_consent')
          .eq('user_id', uid)
          .maybeSingle(),
        supabase
          .from('imap_connections')
          .select('email, last_synced_at, ai_consent')
          .eq('user_id', uid)
          .maybeSingle(),
      ]).then(([ticketsRes, gmailRes, imapRes]) => {
        if (!active) return;

        if (ticketsRes.data) {
          setTickets(ticketsRes.data.map(mapRow));
        }

        if (gmailRes.data) {
          LA();
          setGmailConnected(true);
          setGmailEmail(gmailRes.data.email);
          setLastSyncedAt(gmailRes.data.last_synced_at ?? null);
          setGeminiConsent(gmailRes.data.gemini_consent ?? false);
        }

        if (imapRes.data) {
          LA();
          setImapConnected(true);
          setImapEmail(imapRes.data.email);
          setImapLastSyncedAt(imapRes.data.last_synced_at ?? null);
          setImapConsent(imapRes.data.ai_consent ?? false);
        }

        setTicketsLoading(false);
      });
    });
    return () => { active = false; };
  }, []);

  const handleConnectGmail = async () => {
    setConnecting(true);
    try {
      await WebBrowser.warmUpAsync();

      const isExpoGo =
        Constants.executionEnvironment === 'storeClient' ||
        (Constants.appOwnership as string | null) === 'expo';
      const redirectTo = isExpoGo
        ? 'exp://localhost:8081/--/auth/callback'
        : 'salty://auth/callback';

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          scopes: 'https://www.googleapis.com/auth/gmail.readonly',
          queryParams: { access_type: 'offline', prompt: 'consent' },
        },
      });
      if (error || !data.url) {
        Alert.alert('Gmail Error', 'Could not start Google sign-in. Please try again.');
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success' || !result.url) {
        if (result.type !== 'cancel') {
          Alert.alert('Gmail Error', `Browser closed unexpectedly (${result.type})`);
        }
        return;
      }

      // Implicit flow: Supabase puts all tokens in the URL hash
      // #access_token=SUPABASE_JWT&provider_token=GOOGLE_AT&provider_refresh_token=GOOGLE_RT&...
      const parsed = new URL(result.url);
      const hp = new URLSearchParams(parsed.hash.replace(/^#/, ''));

      const supabaseAt = hp.get('access_token');
      const supabaseRt = hp.get('refresh_token');
      const googleAccessToken  = hp.get('provider_token');
      const googleRefreshToken = hp.get('provider_refresh_token');

      if (supabaseAt && supabaseRt) {
        await supabase.auth.setSession({ access_token: supabaseAt, refresh_token: supabaseRt });
      }

      if (!googleAccessToken) {
        Alert.alert('Gmail Error', 'Google access token missing from redirect. Check that Gmail readonly scope is enabled in your Google OAuth app.');
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const email = user.email ?? '';
      const { data: gc, error: upsertError } = await supabase
        .from('gmail_connections')
        .upsert(
          { user_id: user.id, email, access_token: googleAccessToken,
            refresh_token: googleRefreshToken, connected_at: new Date().toISOString(),
            token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString() },
          { onConflict: 'user_id' },
        )
        .select('last_synced_at')
        .maybeSingle();

      if (upsertError) {
        Alert.alert('Gmail Error', 'Could not save Gmail connection. Please try again.');
        return;
      }

      LA();
      setGmailConnected(true);
      setGmailEmail(email);
      setLastSyncedAt(gc?.last_synced_at ?? null);
    } finally {
      await WebBrowser.coolDownAsync();
      setConnecting(false);
    }
  };

  const mapRow = (row: {
    id: string; title: string | null; venue_name: string | null;
    date_str: string | null; time_str: string | null; category: string;
    tint: string | null; image_url: string | null; seat: string | null;
  }): Ticket => ({
    id: row.id,
    title: row.title ?? 'Untitled',
    venue: row.venue_name ?? 'TBD',
    date: row.date_str ?? 'TBD',
    time: row.time_str ?? 'TBD',
    category: row.category,
    tint: row.tint ?? '#b0b8e0',
    image: row.image_url ?? 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400&q=85',
    seat: row.seat ?? undefined,
    isPast: isEventPast(row.date_str),
  });

  const runScan = useCallback(async () => {
    setScanning(true);
    try {
      const { data: scanResult, error } = await supabase.functions.invoke('scan-gmail');
      if (error) { console.warn('scan-gmail:', error.message); return; }
      setLastSyncedAt(new Date().toISOString());
      if ((scanResult?.pending ?? 0) > 0) {
        router.push('/review-imports');
      }
    } finally {
      setScanning(false);
    }
  }, [router]);

  const handleScanGmail = useCallback(() => {
    if (scanning) return;
    if (!geminiConsent) { setShowConsentModal(true); return; }
    runScan();
  }, [scanning, geminiConsent, runScan]);

  const handleConsentAccept = useCallback(async () => {
    setShowConsentModal(false);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('gmail_connections').update({ gemini_consent: true }).eq('user_id', user.id);
      setGeminiConsent(true);
    }
    runScan();
  }, [runScan]);

  const handleConnectImap = async () => {
    const { email, password } = imapForm;
    if (!email.trim() || !password.trim()) {
      setImapError('Please enter your email and password.');
      return;
    }
    if (email.toLowerCase().includes('@gmail.com')) {
      setImapError('Gmail accounts should use the "Connect Gmail" button above.');
      return;
    }
    const provider = detectImapProvider(email);
    if (!provider) {
      setImapError('Email provider not recognised. Please contact support.');
      return;
    }

    setImapConnecting(true);
    setImapError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('imap_connections')
        .upsert(
          {
            user_id:      user.id,
            email:        email.trim(),
            provider:     provider.label.toLowerCase(),
            imap_host:    provider.host,
            imap_port:    provider.port,
            password:     password,
            connected_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        );

      if (error) {
        setImapError('Could not save connection. Please try again.');
        return;
      }

      LA();
      setImapConnected(true);
      setImapEmail(email.trim());
      setImapLastSyncedAt(null);
      setShowImapModal(false);
      setImapForm({ email: '', password: '' });
    } finally {
      setImapConnecting(false);
    }
  };

  const runImapScan = useCallback(async () => {
    setImapScanning(true);
    try {
      const { data: scanResult, error } = await supabase.functions.invoke('scan-imap');
      if (error) {
        Alert.alert('Scan Error', error.message.includes('IMAP connection failed')
          ? 'Could not connect to your mail server. Please check your password and try reconnecting.'
          : 'Scan failed. Please try again.');
        return;
      }
      setImapLastSyncedAt(new Date().toISOString());
      if ((scanResult?.pending ?? 0) > 0) {
        router.push('/review-imports');
      }
    } finally {
      setImapScanning(false);
    }
  }, [router]);

  const handleScanImap = useCallback(() => {
    if (imapScanning) return;
    if (!imapConsent) { setShowImapConsent(true); return; }
    runImapScan();
  }, [imapScanning, imapConsent, runImapScan]);

  const handleImapConsentAccept = useCallback(async () => {
    setShowImapConsent(false);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('imap_connections').update({ ai_consent: true }).eq('user_id', user.id);
      setImapConsent(true);
    }
    runImapScan();
  }, [runImapScan]);

  // Reload tickets + gmail status whenever the tab is focused
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return; }
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      Promise.all([
        supabase
          .from('tickets')
          .select('id, title, venue_name, date_str, time_str, category, tint, image_url, seat')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('imported_at', { ascending: false }),
        supabase
          .from('gmail_connections')
          .select('email, last_synced_at, gemini_consent')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('imap_connections')
          .select('email, last_synced_at, ai_consent')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]).then(([ticketsRes, gmailRes, imapRes]) => {
        if (ticketsRes.data) { LA(); setTickets(ticketsRes.data.map(mapRow)); }
        if (gmailRes.data && !gmailConnected) {
          setGmailConnected(true);
          setGmailEmail(gmailRes.data.email);
          setLastSyncedAt(gmailRes.data.last_synced_at ?? null);
          setGeminiConsent(gmailRes.data.gemini_consent ?? false);
        }
        if (imapRes.data && !imapConnected) {
          setImapConnected(true);
          setImapEmail(imapRes.data.email);
          setImapLastSyncedAt(imapRes.data.last_synced_at ?? null);
          setImapConsent(imapRes.data.ai_consent ?? false);
        }
      });
    });
  }, [gmailConnected, imapConnected]));

  const handleAddTicket = async () => {
    if (!form.title.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const dbCategory = CATEGORY_DB[form.category] ?? 'other';
    const tint = CATEGORY_TINTS[form.category] ?? '#b0b8e0';

    const { data, error } = await supabase
      .from('tickets')
      .insert({
        user_id: user.id,
        title: form.title.trim(),
        venue_name: form.venue.trim() || 'TBD',
        date_str: form.date.trim() || 'TBD',
        time_str: form.time.trim() || 'TBD',
        category: dbCategory,
        tint,
        image_url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400&q=85',
        seat: form.seat.trim() || null,
        status: 'active',
        source: 'manual',
        is_past: false,
      })
      .select('id, title, venue_name, date_str, time_str, category, tint, image_url, seat')
      .single();

    if (!error && data) {
      LA();
      setTickets(prev => [{
        id: data.id,
        title: data.title ?? form.title.trim(),
        venue: data.venue_name ?? 'TBD',
        date: data.date_str ?? 'TBD',
        time: data.time_str ?? 'TBD',
        category: data.category,
        tint: data.tint ?? tint,
        image: data.image_url,
        seat: data.seat ?? undefined,
        isPast: isEventPast(data.date_str),
      }, ...prev]);
    }
    setForm({ title: '', venue: '', date: '', time: '', category: 'Concert', seat: '' });
    setAddVisible(false);
  };

  const visible = tickets.filter(t => tab === 'upcoming' ? !t.isPast : t.isPast);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* ── Header ── */}
      <LinearGradient
        colors={[BRAND_FROM, BRAND_TO]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ paddingBottom: 20, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}
      >
        <SafeAreaView edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 20 }}>
            <TouchableOpacity onPress={openSidebar} style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="menu" size={20} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>Your vault</Text>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 22, color: '#fff', letterSpacing: -0.4, marginTop: 2 }}>My Tickets</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={() => router.push('/scan-ticket')}
                style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="camera-outline" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setAddVisible(true)}
                style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="add" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ flexDirection: 'row', marginHorizontal: 20, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 3 }}>
            {(['upcoming', 'past'] as const).map(t => (
              <TouchableOpacity
                key={t}
                onPress={() => { LA(); setTab(t); }}
                style={{ flex: 1, paddingVertical: 7, borderRadius: 10, alignItems: 'center', backgroundColor: tab === t ? '#fff' : 'transparent' }}
                activeOpacity={0.8}
              >
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: tab === t ? BRAND_FROM : 'rgba(255,255,255,0.8)', textTransform: 'capitalize' }}>
                  {t}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: bottomPad, gap: 14 }}>

        {/* ── Gmail Card ── */}
        {!gmailConnected ? (
          <LinearGradient
            colors={['#f8f7ff', '#eef0fb']}
            style={{ borderRadius: 18, padding: 14, borderWidth: 1.5, borderColor: `${BRAND_FROM}22` }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <View style={{ width: scale(36), height: scale(36), borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3 }}>
                <Ionicons name="mail" size={18} color={BRAND_FROM} />
              </View>
              <View>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: FG }}>Connect Gmail</Text>
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: MUTED, marginTop: 1 }}>
                  Auto-import tickets from your inbox
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={handleConnectGmail}
              disabled={connecting}
              activeOpacity={0.85}
              style={{ overflow: 'hidden', borderRadius: 12 }}
            >
              <LinearGradient
                colors={[BRAND_FROM, BRAND_TO]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 11 }}
              >
                {connecting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                      <Ionicons name="logo-google" size={15} color="#fff" />
                      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: '#fff' }}>Connect Gmail Account</Text>
                    </>
                }
              </LinearGradient>
            </TouchableOpacity>
          </LinearGradient>
        ) : (
          <View style={{ backgroundColor: SURFACE, borderRadius: 20, overflow: 'hidden', shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: `${FG}08` }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: scale(34), height: scale(34), borderRadius: 9, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="mail" size={16} color="#E8581A" />
                </View>
                <View>
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: FG }} numberOfLines={1}>{gmailEmail}</Text>
                  <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: MUTED, marginTop: 1 }}>
                    Last scanned: {formatLastScanned(lastSyncedAt)}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#d1fae5', borderRadius: 99, paddingHorizontal: 9, paddingVertical: 4 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN }} />
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 10, color: GREEN }}>Connected</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11 }}>
              <View>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: FG }}>Scan Gmail</Text>
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: MUTED, marginTop: 2 }}>
                  Find new tickets in your inbox
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleScanGmail}
                disabled={scanning}
                activeOpacity={0.85}
                style={{ overflow: 'hidden', borderRadius: 12 }}
              >
                <LinearGradient
                  colors={[BRAND_FROM, BRAND_TO]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10 }}
                >
                  {scanning
                    ? <ActivityIndicator color="#fff" size="small" style={{ width: 16, height: 16 }} />
                    : <Ionicons name="refresh-outline" size={15} color="#fff" />
                  }
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: '#fff' }}>
                    {scanning ? 'Scanning…' : 'Scan Now'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Other Email (IMAP) Card ── */}
        {!imapConnected ? (
          <LinearGradient
            colors={['#f8f7ff', '#eef0fb']}
            style={{ borderRadius: 18, padding: 14, borderWidth: 1.5, borderColor: `${BRAND_FROM}22` }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <View style={{ width: scale(36), height: scale(36), borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3 }}>
                <Ionicons name="mail-open-outline" size={18} color={BRAND_FROM} />
              </View>
              <View>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: FG }}>Connect Other Email</Text>
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: MUTED, marginTop: 1 }}>
                  Outlook, Yahoo, iCloud & more
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => { setImapError(null); setShowImapModal(true); }}
              activeOpacity={0.85}
              style={{ overflow: 'hidden', borderRadius: 12 }}
            >
              <LinearGradient
                colors={[BRAND_FROM, BRAND_TO]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 11 }}
              >
                <Ionicons name="mail-open-outline" size={15} color="#fff" />
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: '#fff' }}>Connect Email Account</Text>
              </LinearGradient>
            </TouchableOpacity>
          </LinearGradient>
        ) : (
          <View style={{ backgroundColor: SURFACE, borderRadius: 20, overflow: 'hidden', shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: `${FG}08` }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: scale(34), height: scale(34), borderRadius: 9, backgroundColor: '#f0f4ff', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="mail-open-outline" size={16} color={BRAND_FROM} />
                </View>
                <View>
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: FG }} numberOfLines={1}>{imapEmail}</Text>
                  <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: MUTED, marginTop: 1 }}>
                    Last scanned: {formatLastScanned(imapLastSyncedAt)}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#d1fae5', borderRadius: 99, paddingHorizontal: 9, paddingVertical: 4 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN }} />
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 10, color: GREEN }}>Connected</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11 }}>
              <View>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: FG }}>Scan Inbox</Text>
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: MUTED, marginTop: 2 }}>
                  Find new tickets in your inbox
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleScanImap}
                disabled={imapScanning}
                activeOpacity={0.85}
                style={{ overflow: 'hidden', borderRadius: 12 }}
              >
                <LinearGradient
                  colors={[BRAND_FROM, BRAND_TO]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10 }}
                >
                  {imapScanning
                    ? <ActivityIndicator color="#fff" size="small" style={{ width: 16, height: 16 }} />
                    : <Ionicons name="refresh-outline" size={15} color="#fff" />
                  }
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: '#fff' }}>
                    {imapScanning ? 'Scanning…' : 'Scan Now'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Scan Photo Card ── */}
        <TouchableOpacity
          onPress={() => router.push('/scan-ticket')}
          activeOpacity={0.85}
          style={{ backgroundColor: SURFACE, borderRadius: 18, overflow: 'hidden', shadowColor: '#503cb4', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 }}
        >
          <LinearGradient
            colors={[`${BRAND_TO}12`, `${BRAND_FROM}08`]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1.5, borderColor: `${BRAND_TO}22`, borderRadius: 18 }}
          >
            <View style={{ width: scale(36), height: scale(36), borderRadius: 10, backgroundColor: `${BRAND_TO}18`, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="camera-outline" size={18} color={BRAND_TO} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: FG }}>Scan a Photo</Text>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: MUTED, marginTop: 1 }}>
                Import a ticket from a photo or QR code
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={MUTED} />
          </LinearGradient>
        </TouchableOpacity>

        {/* ── Ticket list ── */}
        {ticketsLoading ? (
          <ActivityIndicator color={BRAND_FROM} style={{ marginTop: 40 }} />
        ) : (
          <>
            {visible.map(ticket => (
              <TicketRow
                key={ticket.id}
                ticket={ticket}
                isPast={tab === 'past'}
                onPress={() => router.push({
                  pathname: '/event-details',
                  params: {
                    id: ticket.id,
                    title: ticket.title,
                    venue: ticket.venue,
                    date: ticket.date,
                    time: ticket.time,
                    category: ticket.category,
                    image: ticket.image,
                    seat: ticket.seat ?? '',
                    tint: ticket.tint,
                  },
                })}
              />
            ))}

            {visible.length === 0 && (
              <View style={{ alignItems: 'center', paddingTop: 40 }}>
                <Ionicons name="ticket-outline" size={48} color={MUTED} />
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, marginTop: 16 }}>No tickets yet</Text>
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: MUTED, marginTop: 6, textAlign: 'center' }}>
                  Your {tab} tickets will appear here.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* ── Add Manually Modal ── */}
      <Modal visible={addVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAddVisible(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={{ flex: 1, backgroundColor: BG }}>
            <LinearGradient
              colors={[BRAND_FROM, BRAND_TO]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ paddingBottom: 20, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}
            >
              <SafeAreaView edges={['top']}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 4 }}>
                  <TouchableOpacity
                    onPress={() => setAddVisible(false)}
                    style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Ionicons name="close" size={20} color="#fff" />
                  </TouchableOpacity>
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 18, color: '#fff', letterSpacing: -0.3 }}>Add Ticket</Text>
                  <TouchableOpacity
                    onPress={handleAddTicket}
                    style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.22)' }}
                  >
                    <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: '#fff' }}>Save</Text>
                  </TouchableOpacity>
                </View>
              </SafeAreaView>
            </LinearGradient>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40, gap: 14 }}>
              <FormField label="Event name *" value={form.title} onChangeText={t => setForm(f => ({ ...f, title: t }))} placeholder="e.g. Taylor Swift — Eras Tour" />
              <FormField label="Venue" value={form.venue} onChangeText={t => setForm(f => ({ ...f, venue: t }))} placeholder="e.g. Madison Square Garden" />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <FormField label="Date" value={form.date} onChangeText={t => setForm(f => ({ ...f, date: t }))} placeholder="e.g. Aug 15, 2026" />
                </View>
                <View style={{ flex: 1 }}>
                  <FormField label="Time" value={form.time} onChangeText={t => setForm(f => ({ ...f, time: t }))} placeholder="e.g. 8:00 PM" />
                </View>
              </View>
              <FormField label="Seat / Section" value={form.seat} onChangeText={t => setForm(f => ({ ...f, seat: t }))} placeholder="e.g. Sec 114 · Row C · Seat 22" />

              <View>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: FG, marginBottom: 10 }}>Category</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {CATEGORIES.map(cat => (
                    <TouchableOpacity
                      key={cat}
                      onPress={() => setForm(f => ({ ...f, category: cat }))}
                      style={{
                        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99,
                        backgroundColor: form.category === cat ? BRAND_FROM : SURFACE,
                        shadowColor: '#503cb4', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
                      }}
                    >
                      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: form.category === cat ? '#fff' : FG }}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <TouchableOpacity onPress={handleAddTicket} activeOpacity={0.85} style={{ overflow: 'hidden', borderRadius: 16, marginTop: 8 }}>
                <LinearGradient
                  colors={[BRAND_FROM, BRAND_TO]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ height: 52, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 15, color: '#fff' }}>Add Ticket</Text>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Gemini AI Consent Modal ── */}
      <Modal visible={showConsentModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <View style={{ backgroundColor: SURFACE, borderRadius: 24, padding: 24, width: '100%' }}>
            <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: '#f3f0ff', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Ionicons name="shield-checkmark-outline" size={26} color={BRAND_FROM} />
            </View>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 18, color: FG, marginBottom: 10 }}>Before we scan</Text>
            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 14, color: MUTED, lineHeight: 21, marginBottom: 20 }}>
              To detect tickets in your emails, Salty sends the subject and content of matching emails to Claude AI for parsing. No email data is stored — only the ticket details extracted from it.
            </Text>
            <TouchableOpacity onPress={handleConsentAccept} activeOpacity={0.85} style={{ overflow: 'hidden', borderRadius: 14, marginBottom: 10 }}>
              <LinearGradient
                colors={[BRAND_FROM, BRAND_TO]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ height: 50, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 15, color: '#fff' }}>I Understand, Continue</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowConsentModal(false)} style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 14, color: MUTED }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* ── IMAP Setup Modal ── */}
      <Modal visible={showImapModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowImapModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={{ flex: 1, backgroundColor: BG }}>
            <LinearGradient
              colors={[BRAND_FROM, BRAND_TO]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ paddingBottom: 20, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}
            >
              <SafeAreaView edges={['top']}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 4 }}>
                  <TouchableOpacity
                    onPress={() => setShowImapModal(false)}
                    style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Ionicons name="close" size={20} color="#fff" />
                  </TouchableOpacity>
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 18, color: '#fff', letterSpacing: -0.3 }}>Connect Email</Text>
                  <View style={{ width: 40 }} />
                </View>
              </SafeAreaView>
            </LinearGradient>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40, gap: 16 }}>
              {imapError && (
                <View style={{ backgroundColor: '#FDEBD9', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderLeftWidth: 4, borderLeftColor: '#E8581A' }}>
                  <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: '#E8581A' }}>{imapError}</Text>
                </View>
              )}

              {(() => {
                const provider = detectImapProvider(imapForm.email);
                return provider ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: `${BRAND_FROM}12`, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
                    <Ionicons name="checkmark-circle" size={16} color={BRAND_FROM} />
                    <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: FG, flex: 1 }}>
                      <Text style={{ fontFamily: 'DMSans_700Bold' }}>{provider.label}</Text> detected. {provider.hint}
                    </Text>
                  </View>
                ) : null;
              })()}

              <FormField
                label="Email address"
                value={imapForm.email}
                onChangeText={t => setImapForm(f => ({ ...f, email: t }))}
                placeholder="you@outlook.com"
              />
              <FormField
                label="App password"
                value={imapForm.password}
                onChangeText={t => setImapForm(f => ({ ...f, password: t }))}
                placeholder="App-specific password"
                secureTextEntry
              />

              <View style={{ backgroundColor: `${FG}08`, borderRadius: 12, padding: 14, gap: 6 }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: FG }}>Supported providers</Text>
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: MUTED, lineHeight: 18 }}>
                  Outlook · Hotmail · Live · Yahoo Mail · iCloud Mail · AOL{'\n'}
                  Most providers require an app-specific password when 2FA is enabled.
                </Text>
              </View>

              <TouchableOpacity onPress={handleConnectImap} disabled={imapConnecting} activeOpacity={0.85} style={{ overflow: 'hidden', borderRadius: 16, marginTop: 4 }}>
                <LinearGradient
                  colors={[BRAND_FROM, BRAND_TO]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ height: 52, alignItems: 'center', justifyContent: 'center' }}
                >
                  {imapConnecting
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 15, color: '#fff' }}>Connect Account</Text>
                  }
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── IMAP AI Consent Modal ── */}
      <Modal visible={showImapConsent} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <View style={{ backgroundColor: SURFACE, borderRadius: 24, padding: 24, width: '100%' }}>
            <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: '#f3f0ff', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Ionicons name="shield-checkmark-outline" size={26} color={BRAND_FROM} />
            </View>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 18, color: FG, marginBottom: 10 }}>Before we scan</Text>
            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 14, color: MUTED, lineHeight: 21, marginBottom: 20 }}>
              To detect tickets in your emails, Salty sends the subject and content of matching emails to Claude AI for parsing. No email data is stored — only the ticket details extracted from it.
            </Text>
            <TouchableOpacity onPress={handleImapConsentAccept} activeOpacity={0.85} style={{ overflow: 'hidden', borderRadius: 14, marginBottom: 10 }}>
              <LinearGradient
                colors={[BRAND_FROM, BRAND_TO]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ height: 50, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 15, color: '#fff' }}>I Understand, Continue</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowImapConsent(false)} style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 14, color: MUTED }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Form Field ─────────────────────────────────────────────────────────────────
function FormField({ label, value, onChangeText, placeholder, secureTextEntry }: {
  label: string; value: string; onChangeText: (t: string) => void; placeholder: string; secureTextEntry?: boolean;
}): React.JSX.Element {
  return (
    <View>
      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: '#1a1530', marginBottom: 8 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#6b6a85"
        secureTextEntry={secureTextEntry}
        autoCapitalize="none"
        style={{
          backgroundColor: '#ffffff', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13,
          fontFamily: 'DMSans_400Regular', fontSize: 14, color: '#1a1530',
          shadowColor: '#503cb4', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
        }}
      />
    </View>
  );
}

// ── Ticket Row ─────────────────────────────────────────────────────────────────
function TicketRow({ ticket, isPast, onPress }: { ticket: Ticket; isPast: boolean; onPress?: () => void }): React.JSX.Element {
  const { saveEvent, unsaveEvent, isSaved } = useSavedEvents();
  const saved = isSaved(ticket.id);
  const toggleSave = () => {
    if (saved) {
      unsaveEvent(ticket.id);
    } else {
      saveEvent({
        id: ticket.id, title: ticket.title, venue: ticket.venue,
        date: ticket.date, time: ticket.time, category: ticket.category,
        image: ticket.image, tint: ticket.tint, seat: ticket.seat,
      });
    }
  };
  return (
    <TouchableOpacity activeOpacity={0.88} onPress={onPress} style={{ backgroundColor: SURFACE, borderRadius: 20, overflow: 'hidden', shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 4, opacity: isPast ? 0.88 : 1 }}>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: 6, backgroundColor: ticket.tint }} />
        <View style={{ width: TKT_IMG_W, height: TKT_IMG_H }}>
          <Image source={{ uri: ticket.image }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          {isPast && <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)' }} />}
          {isPast && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 9, color: '#fff', letterSpacing: 1 }}>ATTENDED</Text>
              </View>
            </View>
          )}
        </View>
        <View style={{ flex: 1, padding: 14, justifyContent: 'space-between' }}>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ backgroundColor: `${ticket.tint}55`, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 9, color: FG, textTransform: 'uppercase', letterSpacing: 1 }}>{ticket.category}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity onPress={toggleSave} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name={saved ? 'heart' : 'heart-outline'} size={16} color={saved ? '#ff6b8a' : MUTED} />
                </TouchableOpacity>
                <Ionicons name="chevron-forward" size={14} color={MUTED} />
              </View>
            </View>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: FG, marginTop: 8, letterSpacing: -0.2 }} numberOfLines={1}>{ticket.title}</Text>
          </View>
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="calendar-outline" size={11} color={MUTED} />
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: MUTED }}>{ticket.date} · {ticket.time}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="location-outline" size={11} color={MUTED} />
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: MUTED }} numberOfLines={1}>{ticket.venue}</Text>
            </View>
            {ticket.seat && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Ionicons name="ticket-outline" size={11} color={BRAND_FROM} />
                <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 11, color: BRAND_FROM }} numberOfLines={1}>{ticket.seat}</Text>
              </View>
            )}
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', marginHorizontal: 10 }}>
        {Array.from({ length: 36 }).map((_, i) => (
          <View key={i} style={{ flex: 1, height: 1, backgroundColor: i % 2 === 0 ? `${FG}18` : 'transparent' }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1.5 }}>
          {[4,8,5,11,4,7,5,10,4,8,5,11,4,7,5,10,4,8,5].map((h, k) => (
            <View key={k} style={{ width: 1.8, height: (h / 11) * 18, backgroundColor: FG, opacity: 0.22, borderRadius: 1 }} />
          ))}
        </View>
        <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 9, color: `${FG}44`, letterSpacing: 1 }}>
          ADMIT ONE · #{(ticket.id.charCodeAt(0) * 3741) % 9000 + 1000}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
