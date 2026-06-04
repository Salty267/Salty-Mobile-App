import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { scale, scaleFont, sp } from '@/lib/layout';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase/client';

const isExpoGo =
  Constants.executionEnvironment === 'storeClient' ||
  (Constants.appOwnership as string | null) === 'expo';

const BRAND_FROM = '#4f6cf2';
const BRAND_TO   = '#a25cf2';
const FG         = '#1a1530';
const MUTED      = '#6b6a85';
const SURFACE    = '#ffffff';
const BG         = '#eef0fb';

type NotificationRow = {
  id:         string;
  title:      string;
  body:       string;
  data:       Record<string, string> | null;
  read:       boolean;
  created_at: string;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NotificationsScreen(): React.JSX.Element {
  const router = useRouter();
  const { bottom } = useSafeAreaInsets();
  const [items,     setItems]     = useState<NotificationRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); setRefreshing(false); return; }

    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    setItems((data as NotificationRow[]) ?? []);
    setLoading(false);
    setRefreshing(false);

    // Mark all as read
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false);

    if (!isExpoGo) {
      await import('expo-notifications').then(N => N.setBadgeCountAsync(0)).catch(() => {});
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const renderItem = ({ item }: { item: NotificationRow }) => (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => {
        const screen = item.data?.screen;
        if (screen) router.push(`/(tabs)/${screen}` as Parameters<typeof router.push>[0]);
      }}
      style={{
        flexDirection: 'row', alignItems: 'flex-start', gap: sp(12),
        paddingHorizontal: sp(16), paddingVertical: sp(14),
        backgroundColor: item.read ? SURFACE : '#f0eeff',
      }}
    >
      <View style={{
        width: scale(36), height: scale(36), borderRadius: scale(18),
        backgroundColor: `${BRAND_FROM}22`, alignItems: 'center', justifyContent: 'center', marginTop: 2,
      }}>
        <Ionicons name="notifications" size={16} color={BRAND_FROM} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(14), color: FG }}>{item.title}</Text>
        <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(13), color: MUTED, marginTop: 2 }}>{item.body}</Text>
        <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(11), color: MUTED, marginTop: sp(4) }}>{timeAgo(item.created_at)}</Text>
      </View>
      {!item.read && (
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: BRAND_FROM, marginTop: 6 }} />
      )}
    </TouchableOpacity>
  );

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
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(12), color: 'rgba(255,255,255,0.72)' }}>Stay up to date</Text>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(24), color: '#fff', letterSpacing: -0.4, marginTop: 2 }}>Notifications</Text>
            </View>
            <View style={{ width: scale(40) }} />
          </View>
        </SafeAreaView>
      </LinearGradient>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BRAND_FROM} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={BRAND_FROM} />}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#f1eefb', marginLeft: scale(64) }} />}
          contentContainerStyle={{ paddingBottom: bottom + sp(24), flexGrow: 1 }}
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: sp(80), gap: sp(12) }}>
              <Ionicons name="notifications-off-outline" size={48} color={MUTED} />
              <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: scaleFont(16), color: MUTED }}>No notifications yet</Text>
            </View>
          }
        />
      )}
    </View>
  );
}
