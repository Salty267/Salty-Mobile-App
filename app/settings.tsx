import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  Switch, ActivityIndicator, Alert,
  LayoutAnimation, UIManager, Platform,
} from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
const LA = () => LayoutAnimation.configureNext({ duration: 220, create: { type: 'easeInEaseOut', property: 'opacity' }, update: { type: 'easeInEaseOut' }, delete: { type: 'easeInEaseOut', property: 'opacity' } });
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { scale } from '@/lib/layout';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
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

const ACCOUNT_ITEMS = [
  { icon: 'lock-closed-outline' as const, label: 'Privacy' },
] as const;

type NotificationPreferences = {
  event_reminders:   boolean;
  friend_activity:   boolean;
  new_detections:    boolean;
  setlist_available: boolean;
  photos_added:      boolean;
};

const NOTIF_TOGGLE_ROWS: { key: keyof NotificationPreferences; label: string; sub: string }[] = [
  { key: 'event_reminders',   label: 'Event Reminders',  sub: 'Remind me before events start'        },
  { key: 'friend_activity',   label: 'Friend Activity',  sub: 'Friend requests and tags'              },
  { key: 'new_detections',    label: 'New Detections',   sub: 'When AI finds a ticket in your inbox' },
  { key: 'setlist_available', label: 'Setlists',         sub: 'When a setlist is posted for an event' },
  { key: 'photos_added',      label: 'Photos Added',     sub: 'When photos are uploaded to an event'  },
];

const SUPPORT_ITEMS = [
  { icon: 'help-circle-outline' as const, label: 'Help & Support' },
  { icon: 'star-outline'        as const, label: 'Rate the App'   },
] as const;

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
        style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: scale(56), gap: 14 }}
      >
        <View style={{ width: scale(36), height: scale(36), borderRadius: 10, backgroundColor: SECONDARY, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={18} color={BRAND_FROM} />
        </View>
        <Text style={{ flex: 1, fontFamily: 'DMSans_500Medium', fontSize: 15, color: FG }}>{label}</Text>
        <Ionicons name="chevron-forward" size={16} color={MUTED} />
      </TouchableOpacity>
      {!last && <View style={{ height: 1, backgroundColor: '#f1eefb', marginLeft: 66 }} />}
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
  const [deleting,       setDeleting]       = useState(false);
  const [notifPrefs,     setNotifPrefs]     = useState<NotificationPreferences>({
    event_reminders:   true,
    friend_activity:   true,
    new_detections:    true,
    setlist_available: true,
    photos_added:      true,
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

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all your data — tickets, badges, friends, and activity. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Last chance',
              'Are you absolutely sure? Your data will be gone forever.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Yes, delete everything', style: 'destructive', onPress: confirmDeleteAccount },
              ]
            );
          },
        },
      ]
    );
  };

  const confirmDeleteAccount = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.functions.invoke('delete-account');
      if (error) throw error;
      await supabase.auth.signOut();
    } catch (e) {
      console.error('Account deletion failed:', e);
      Alert.alert('Error', 'Failed to delete account. Please try again.');
      setDeleting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>


      {/* ── Header ── */}
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
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 20, color: '#fff', letterSpacing: -0.3 }}>Settings</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 24, paddingBottom: bottom + 32 }}>

        {/* ── Account ── */}
        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Account</Text>
          <View style={{ backgroundColor: SURFACE, borderRadius: 20, overflow: 'hidden', shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 14, elevation: 3 }}>
            {ACCOUNT_ITEMS.map((item, i) => (
              <SettingsRow key={item.label} icon={item.icon} label={item.label} last={i === ACCOUNT_ITEMS.length - 1} />
            ))}
          </View>
        </View>

        {/* ── Notifications ── */}
        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Notifications</Text>
          <View style={{ backgroundColor: SURFACE, borderRadius: 20, overflow: 'hidden', shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 14, elevation: 3 }}>
            {NOTIF_TOGGLE_ROWS.map((row, i) => (
              <View key={row.key}>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 14 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: FG }}>{row.label}</Text>
                    <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: MUTED, marginTop: 2 }}>{row.sub}</Text>
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
                  <View style={{ height: 1, backgroundColor: '#f1eefb', marginLeft: 16 }} />
                )}
              </View>
            ))}
          </View>
        </View>

        {/* ── Gmail ── */}
        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Gmail</Text>
          <View style={{ backgroundColor: SURFACE, borderRadius: 20, overflow: 'hidden', shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 14, elevation: 3 }}>

            {/* Connection row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: gmailConnected ? 1 : 0, borderBottomColor: '#f1eefb', gap: 14 }}>
              <View style={{ width: scale(36), height: scale(36), borderRadius: 10, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="mail" size={18} color="#E8581A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: FG }}>
                  {gmailConnected ? 'Connected Gmail' : 'Connect Gmail'}
                </Text>
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: MUTED, marginTop: 2 }} numberOfLines={1}>
                  {gmailConnected ? gmailEmail : 'Import tickets from your inbox'}
                </Text>
              </View>
              {gmailConnected ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#d1fae5', borderRadius: 99, paddingHorizontal: 9, paddingVertical: 4 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN }} />
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 10, color: GREEN }}>Connected</Text>
                </View>
              ) : (
                <TouchableOpacity onPress={handleConnectGmail} disabled={connecting} style={{ overflow: 'hidden', borderRadius: 10 }} activeOpacity={0.85}>
                  <LinearGradient colors={[BRAND_FROM, BRAND_TO]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8 }}>
                    {connecting
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <><Ionicons name="logo-google" size={13} color="#fff" /><Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: '#fff' }}>Connect</Text></>
                    }
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>

            {/* Auto-scan — only when connected */}
            {gmailConnected && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 14, borderBottomWidth: autoScan ? 1 : 0, borderBottomColor: '#f1eefb' }}>
                  <View style={{ width: scale(36), height: scale(36), borderRadius: 10, backgroundColor: SECONDARY, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="time-outline" size={18} color={BRAND_FROM} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: FG }}>Auto-scan</Text>
                    <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: MUTED, marginTop: 2 }}>
                      {autoScan ? `Daily at ${autoScanTime}` : 'Scan inbox automatically every day'}
                    </Text>
                  </View>
                  <Switch
                    value={autoScan}
                    onValueChange={handleAutoScanToggle}
                    trackColor={{ false: '#e5e7eb', true: `${BRAND_FROM}55` }}
                    thumbColor={autoScan ? BRAND_FROM : '#fff'}
                    ios_backgroundColor="#e5e7eb"
                  />
                </View>

                {autoScan && (
                  <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14 }}>
                    <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 11, color: MUTED, marginBottom: 10 }}>SCAN TIME</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {AUTO_SCAN_TIMES.map(time => (
                        <TouchableOpacity key={time} onPress={() => handleTimeChange(time)} activeOpacity={0.8} style={{ overflow: 'hidden', borderRadius: 99 }}>
                          {time === autoScanTime ? (
                            <LinearGradient colors={[BRAND_FROM, BRAND_TO]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingHorizontal: 14, paddingVertical: 8 }}>
                              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: '#fff' }}>{time}</Text>
                            </LinearGradient>
                          ) : (
                            <View style={{ paddingHorizontal: 14, paddingVertical: 8, backgroundColor: SECONDARY, borderRadius: 99 }}>
                              <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 12, color: MUTED }}>{time}</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </>
            )}
          </View>
        </View>

        {/* ── Support ── */}
        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Support</Text>
          <View style={{ backgroundColor: SURFACE, borderRadius: 20, overflow: 'hidden', shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 14, elevation: 3 }}>
            {SUPPORT_ITEMS.map((item, i) => (
              <SettingsRow key={item.label} icon={item.icon} label={item.label} last={i === SUPPORT_ITEMS.length - 1} />
            ))}
          </View>
        </View>

        {/* ── Danger Zone ── */}
        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: '#ef4444', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Danger Zone</Text>
          <View style={{ backgroundColor: SURFACE, borderRadius: 20, overflow: 'hidden', shadowColor: '#ef4444', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 }}>
            <TouchableOpacity
              onPress={handleDeleteAccount}
              disabled={deleting}
              activeOpacity={0.7}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16, gap: 14 }}
            >
              <View style={{ width: scale(36), height: scale(36), borderRadius: 10, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center' }}>
                {deleting
                  ? <ActivityIndicator size="small" color="#ef4444" />
                  : <Ionicons name="trash-outline" size={18} color="#ef4444" />
                }
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 15, color: '#ef4444' }}>Delete Account</Text>
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: MUTED, marginTop: 2 }}>Permanently remove your data</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#ef4444" />
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}
