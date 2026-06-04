import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  Switch, ActivityIndicator, Alert, Linking,
  LayoutAnimation, UIManager, Platform,
} from 'react-native';
import Constants from 'expo-constants';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
const LA = () => LayoutAnimation.configureNext({ duration: 220, create: { type: 'easeInEaseOut', property: 'opacity' }, update: { type: 'easeInEaseOut' }, delete: { type: 'easeInEaseOut', property: 'opacity' } });
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { scale, scaleFont, sp } from '@/lib/layout';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as StoreReview from 'expo-store-review';
import { supabase } from '@/lib/supabase/client';

const BRAND_FROM = '#4f6cf2';
const BRAND_TO   = '#a25cf2';
const FG         = '#1a1530';
const MUTED      = '#6b6a85';
const SURFACE    = '#ffffff';
const SECONDARY  = '#f1eefb';
const BG         = '#eef0fb';
const GREEN      = '#059669';

const AUTO_SCAN_TIMES = ['6:00 AM', '9:00 AM', '12:00 PM', '3:00 PM', '6:00 PM', '9:00 PM'];

type NotificationPreferences = {
  event_reminders:   boolean;
  friend_activity:   boolean;
  new_detections:    boolean;
  setlist_available: boolean;
  photos_added:      boolean;
  artist_alerts:     boolean;
};

const NOTIF_TOGGLE_ROWS: { key: keyof NotificationPreferences; label: string; sub: string }[] = [
  { key: 'event_reminders',   label: 'Event Reminders',  sub: 'Remind me before events start'        },
  { key: 'friend_activity',   label: 'Friend Activity',  sub: 'Friend requests and tags'              },
  { key: 'new_detections',    label: 'New Detections',   sub: 'When AI finds a ticket in your inbox' },
  { key: 'setlist_available', label: 'Setlists',         sub: 'When a setlist is posted for an event' },
  { key: 'photos_added',      label: 'Photos Added',     sub: 'When photos are uploaded to an event'  },
  { key: 'artist_alerts',    label: 'Artist Alerts',    sub: 'New shows from artists you follow'      },
];

function SettingsRow({ icon, label, onPress, last = false }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress?: () => void;
  last?: boolean;
}): React.JSX.Element {
  return (
    <View>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: sp(16), height: scale(56), gap: sp(14) }}
      >
        <View style={{ width: scale(36), height: scale(36), borderRadius: 10, backgroundColor: SECONDARY, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={18} color={BRAND_FROM} />
        </View>
        <Text style={{ flex: 1, fontFamily: 'DMSans_500Medium', fontSize: scaleFont(15), color: FG }}>{label}</Text>
        <Ionicons name="chevron-forward" size={16} color={MUTED} />
      </TouchableOpacity>
      {!last && <View style={{ height: 1, backgroundColor: '#f1eefb', marginLeft: scale(66) }} />}
    </View>
  );
}

export default function SettingsScreen(): React.JSX.Element {
  const router = useRouter();
  const { bottom } = useSafeAreaInsets();

  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailEmail,     setGmailEmail]     = useState('');
  const [autoScan,       setAutoScan]       = useState(false);
  const [autoScanTime,   setAutoScanTime]   = useState('9:00 AM');
  const [connecting,     setConnecting]     = useState(false);
  const [notifPrefs,     setNotifPrefs]     = useState<NotificationPreferences>({
    event_reminders:   false,
    friend_activity:   false,
    new_detections:    false,
    setlist_available: false,
    photos_added:      false,
    artist_alerts:     false,
  });
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);

      const hasGoogle   = user.identities?.some(id => id.provider === 'google');
      const storedEmail = user.user_metadata?.gmail_email as string | undefined;
      if (hasGoogle || storedEmail) {
        LA(); setGmailConnected(true);
        setGmailEmail(storedEmail ?? user.email ?? '');
      }
      const gmailPrefs = user.user_metadata?.gmail_prefs as { autoScan?: boolean; autoScanTime?: string } | undefined;
      if (gmailPrefs) {
        setAutoScan(gmailPrefs.autoScan ?? false);
        setAutoScanTime(gmailPrefs.autoScanTime ?? '9:00 AM');
      }

      const { data } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();
      if (data) {
        setNotifPrefs({
          event_reminders:   data.event_reminders   ?? true,
          friend_activity:   data.friend_activity   ?? true,
          new_detections:    data.new_detections    ?? true,
          setlist_available: data.setlist_available ?? true,
          photos_added:      data.photos_added      ?? true,
          artist_alerts:     data.artist_alerts     ?? true,
        });
      }
    });
  }, []);

  const updateNotifPref = async (key: keyof NotificationPreferences, value: boolean) => {
    setNotifPrefs(prev => ({ ...prev, [key]: value }));
    if (!userId) return;
    await supabase.from('notification_preferences').upsert(
      { user_id: userId, [key]: value, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
  };

  const savePrefs = useCallback(async (scan: boolean, time: string) => {
    await supabase.auth.updateUser({ data: { gmail_prefs: { autoScan: scan, autoScanTime: time } } });
  }, []);

  const handleAutoScanToggle = async (value: boolean) => {
    LA(); setAutoScan(value);
    await savePrefs(value, autoScanTime);
  };

  const handleTimeChange = async (time: string) => {
    setAutoScanTime(time);
    await savePrefs(autoScan, time);
  };

  const handleConnectGmail = async () => {
    setConnecting(true);
    try {
      const redirectTo = 'salty://auth/callback';
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, scopes: 'https://www.googleapis.com/auth/gmail.readonly', queryParams: { access_type: 'offline', prompt: 'consent' } },
      });
      if (error || !data.url) return;
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === 'success' && result.url) {
        const parsed = new URL(result.url);
        const hp = new URLSearchParams(parsed.hash.replace(/^#/, ''));
        const at = hp.get('access_token') ?? parsed.searchParams.get('access_token');
        const rt = hp.get('refresh_token') ?? parsed.searchParams.get('refresh_token');
        if (at && rt) {
          await supabase.auth.setSession({ access_token: at, refresh_token: rt });
          const { data: { user } } = await supabase.auth.getUser();
          const email = user?.email ?? '';
          LA(); setGmailConnected(true);
          setGmailEmail(email);
          await supabase.auth.updateUser({ data: { gmail_email: email } });
        }
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleRateApp = async () => {
    if (await StoreReview.hasAction()) {
      await StoreReview.requestReview();
    }
  };


  return (
    <View style={{ flex: 1, backgroundColor: BG }}>


      {/* ── Header ── */}
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
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(12), color: 'rgba(255,255,255,0.72)' }}>Preferences</Text>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(24), color: '#fff', letterSpacing: -0.4, marginTop: 2 }}>Settings</Text>
            </View>
            <View style={{ width: scale(40) }} />
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: sp(24), paddingBottom: bottom + 32 }}>

        {/* ── Gmail ── */}
        <View style={{ paddingHorizontal: sp(20), marginBottom: sp(24) }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(12), color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: sp(10) }}>Gmail</Text>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/tickets')}
            activeOpacity={gmailConnected ? 1 : 0.85}
            style={{ backgroundColor: SURFACE, borderRadius: scale(20), overflow: 'hidden', shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 14, elevation: 3 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: sp(16), paddingVertical: sp(16), gap: sp(14) }}>
              <View style={{ width: scale(36), height: scale(36), borderRadius: 10, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="mail" size={18} color="#E8581A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(14), color: FG }}>
                  {gmailConnected ? 'Gmail connected' : 'Connect Gmail'}
                </Text>
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(12), color: MUTED, marginTop: 2 }} numberOfLines={1}>
                  {gmailConnected ? gmailEmail : 'Manage in My Tickets'}
                </Text>
              </View>
              {gmailConnected ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#d1fae5', borderRadius: 99, paddingHorizontal: sp(9), paddingVertical: 4 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN }} />
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(10), color: GREEN }}>Active</Text>
                </View>
              ) : (
                <Ionicons name="chevron-forward" size={16} color={MUTED} />
              )}
            </View>
          </TouchableOpacity>
        </View>

        {/* ── Notifications ── */}
        <View style={{ paddingHorizontal: sp(20), marginBottom: sp(24) }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(12), color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: sp(10) }}>Notifications</Text>
          <View style={{ backgroundColor: SURFACE, borderRadius: scale(20), overflow: 'hidden', shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 14, elevation: 3 }}>
            {NOTIF_TOGGLE_ROWS.map((row, i) => (
              <View key={row.key}>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: sp(16), paddingVertical: sp(14), gap: sp(14) }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(14), color: FG }}>{row.label}</Text>
                    <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(12), color: MUTED, marginTop: 2 }}>{row.sub}</Text>
                  </View>
                  <Switch
                    value={notifPrefs[row.key]}
                    onValueChange={v => updateNotifPref(row.key, v)}
                    trackColor={{ false: '#e5e7eb', true: `${BRAND_FROM}55` }}
                    thumbColor={notifPrefs[row.key] ? BRAND_FROM : '#fff'}
                    ios_backgroundColor="#e5e7eb"
                  />
                </View>
                {i < NOTIF_TOGGLE_ROWS.length - 1 && (
                  <View style={{ height: 1, backgroundColor: '#f1eefb', marginLeft: sp(16) }} />
                )}
              </View>
            ))}
          </View>
        </View>

        {/* ── Account ── */}
        <View style={{ paddingHorizontal: sp(20), marginBottom: sp(24) }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(12), color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: sp(10) }}>Account</Text>
          <View style={{ backgroundColor: SURFACE, borderRadius: scale(20), overflow: 'hidden', shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 14, elevation: 3 }}>
            <SettingsRow icon="lock-closed-outline" label="Privacy" onPress={() => router.push('/privacy')} />
            <View style={{ height: 1, backgroundColor: '#f1eefb', marginLeft: scale(66) }} />
            <SettingsRow icon="document-text-outline" label="Terms of Service" onPress={() => WebBrowser.openBrowserAsync('https://saltydigital.ai/terms')} last />
          </View>
        </View>

        {/* ── Support ── */}
        <View style={{ paddingHorizontal: sp(20), marginBottom: sp(24) }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(12), color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: sp(10) }}>Support</Text>
          <View style={{ backgroundColor: SURFACE, borderRadius: scale(20), overflow: 'hidden', shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 14, elevation: 3 }}>
            <SettingsRow icon="help-circle-outline" label="Help & Support" onPress={() => router.push('/help')} last />
          </View>
        </View>

        <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(12), color: MUTED, textAlign: 'center', marginTop: sp(8), marginBottom: sp(8) }}>
          Salty v{Constants.expoConfig?.version ?? '1.0.0'}
        </Text>

      </ScrollView>
    </View>
  );
}
