import React, { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { scale } from '@/lib/layout';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSidebar } from '@/lib/SidebarContext';
import { useAvatar } from '@/lib/useAvatar';
import { supabase } from '@/lib/supabase/client';
import type { User as SupabaseUser } from '@supabase/supabase-js';

const BRAND_FROM = '#4f6cf2';
const BRAND_TO   = '#a25cf2';
const FG         = '#1a1530';
const MUTED      = '#6b6a85';
const SURFACE    = '#ffffff';
const SECONDARY  = '#f1eefb';
const BG         = '#eef0fb';

const QUICK_LINKS = [
  { icon: 'notifications-outline' as const, label: 'Notifications' },
  { icon: 'heart-outline'         as const, label: 'Saved Events'  },
  { icon: 'people-outline'        as const, label: 'Friends'       },
] as const;

export default function ProfileScreen(): React.JSX.Element {
  const router = useRouter();
  const { openSidebar } = useSidebar();
  const { bottom } = useSafeAreaInsets();
  const { avatarUrl, uploading, pickAndUpload } = useAvatar();
  const [user, setUser] = useState<SupabaseUser | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
  }, []);

  const fullName = user?.user_metadata?.full_name as string | undefined;
  const initials = fullName
    ? fullName.split(' ').map((n: string) => n[0]).join('').toUpperCase()
    : user?.email?.[0].toUpperCase() ?? '?';

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* ── Gradient header ── */}
      <LinearGradient
        colors={[BRAND_FROM, BRAND_TO]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ paddingBottom: 32, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}
      >
        <SafeAreaView edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 20 }}>
            <TouchableOpacity onPress={openSidebar} style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="menu" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/settings')} style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="settings-outline" size={18} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={{ alignItems: 'center', paddingHorizontal: 20 }}>
            {/* Tappable avatar */}
            <TouchableOpacity onPress={pickAndUpload} activeOpacity={0.85} style={{ marginBottom: 12 }}>
              <View style={{ width: scale(84), height: scale(84), borderRadius: scale(42), backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.5)', overflow: 'hidden' }}>
                {avatarUrl
                  ? <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  : <Text style={{ fontFamily: 'BebasNeue_400Regular', fontSize: 32, color: '#fff' }}>{initials}</Text>
                }
              </View>
              {/* Camera badge */}
              <View style={{ position: 'absolute', bottom: 0, right: 0, width: scale(28), height: scale(28), borderRadius: scale(14), backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)' }}>
                {uploading
                  ? <ActivityIndicator size="small" color={BRAND_FROM} />
                  : <Ionicons name="camera" size={14} color={BRAND_FROM} />
                }
              </View>
            </TouchableOpacity>
            {fullName && (
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 20, color: '#fff', letterSpacing: -0.3 }}>{fullName}</Text>
            )}
            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 4 }}>{user?.email}</Text>

            <View style={{ flexDirection: 'row', gap: 32, marginTop: 20 }}>
              {[['12', 'Events'], ['4', 'Friends'], ['3', 'Upcoming']].map(([val, label]) => (
                <View key={label} style={{ alignItems: 'center' }}>
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 20, color: '#fff' }}>{val}</Text>
                  <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* ── Quick links ── */}
      <View style={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: bottom + 16 }}>
        <View style={{ backgroundColor: SURFACE, borderRadius: 20, overflow: 'hidden', shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 14, elevation: 3 }}>
          {QUICK_LINKS.map((item, i) => (
            <View key={item.label}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: scale(56), gap: 14 }}
                activeOpacity={0.7}
                onPress={() => {
                  if (item.label === 'Saved Events') router.push('/(tabs)/saved-events');
                }}
              >
                <View style={{ width: scale(36), height: scale(36), borderRadius: 10, backgroundColor: SECONDARY, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={item.icon} size={18} color={BRAND_FROM} />
                </View>
                <Text style={{ flex: 1, fontFamily: 'DMSans_500Medium', fontSize: 15, color: FG }}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={16} color={MUTED} />
              </TouchableOpacity>
              {i < QUICK_LINKS.length - 1 && <View style={{ height: 1, backgroundColor: '#f1eefb', marginLeft: 66 }} />}
            </View>
          ))}
        </View>

        {/* Settings shortcut */}
        <TouchableOpacity
          onPress={() => router.push('/settings')}
          activeOpacity={0.85}
          style={{ marginTop: 16, overflow: 'hidden', borderRadius: 20 }}
        >
          <LinearGradient
            colors={[BRAND_FROM, BRAND_TO]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, height: scale(56), gap: 14 }}
          >
            <Ionicons name="settings-outline" size={20} color="#fff" />
            <Text style={{ flex: 1, fontFamily: 'DMSans_700Bold', fontSize: 15, color: '#fff' }}>Settings</Text>
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.7)" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}
