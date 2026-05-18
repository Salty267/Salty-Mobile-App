import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, Image, TouchableOpacity, ScrollView,
  Switch, ActivityIndicator,
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
import { useAvatar } from '@/lib/useAvatar';

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
  { icon: 'notifications-outline' as const, label: 'Notifications' },
  { icon: 'lock-closed-outline'   as const, label: 'Privacy'       },
] as const;

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
  const { avatarUrl } = useAvatar();
  const { bottom } = useSafeAreaInsets();

  const [fullName,       setFullName]       = useState('');
  const [userEmail,      setUserEmail]      = useState('');
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailEmail,     setGmailEmail]     = useState('');
  const [autoScan,       setAutoScan]       = useState(false);
  const [autoScanTime,   setAutoScanTime]   = useState('9:00 AM');
  const [connecting,     setConnecting]     = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setFullName((user.user_metadata?.full_name as string | undefined) ?? '');
      setUserEmail(user.email ?? '');
      const hasGoogle   = user.identities?.some(id => id.provider === 'google');
      const storedEmail = user.user_metadata?.gmail_email as string | undefined;
      if (hasGoogle || storedEmail) {
        LA(); setGmailConnected(true);
        setGmailEmail(storedEmail ?? user.email ?? '');
      }
      const prefs = user.user_metadata?.gmail_prefs as { autoScan?: boolean; autoScanTime?: string } | undefined;
      if (prefs) {
        setAutoScan(prefs.autoScan ?? false);
        setAutoScanTime(prefs.autoScanTime ?? '9:00 AM');
      }
    });
  }, []);

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

        {/* ── Edit Profile card ── */}
        <TouchableOpacity
          onPress={() => router.push('/edit-profile')}
          activeOpacity={0.85}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 20, marginBottom: 24, backgroundColor: SURFACE, borderRadius: 20, padding: 16, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 14, elevation: 3 }}
        >
          {/* Avatar */}
          <View style={{ width: scale(52), height: scale(52), borderRadius: scale(26), overflow: 'hidden', backgroundColor: `${BRAND_FROM}22`, alignItems: 'center', justifyContent: 'center' }}>
            {avatarUrl
              ? <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              : <Text style={{ fontFamily: 'BebasNeue_400Regular', fontSize: 20, color: BRAND_FROM }}>
                  {fullName ? fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?'}
                </Text>
            }
          </View>

          {/* Info */}
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 15, color: FG }} numberOfLines={1}>
              {fullName || 'Your Name'}
            </Text>
            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: MUTED, marginTop: 2 }} numberOfLines={1}>
              {userEmail}
            </Text>
          </View>

          {/* Edit pill */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: SECONDARY, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Ionicons name="pencil-outline" size={12} color={BRAND_FROM} />
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: BRAND_FROM }}>Edit</Text>
          </View>
        </TouchableOpacity>

        {/* ── Account ── */}
        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Account</Text>
          <View style={{ backgroundColor: SURFACE, borderRadius: 20, overflow: 'hidden', shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 14, elevation: 3 }}>
            {ACCOUNT_ITEMS.map((item, i) => (
              <SettingsRow key={item.label} icon={item.icon} label={item.label} last={i === ACCOUNT_ITEMS.length - 1} />
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


      </ScrollView>
    </View>
  );
}
