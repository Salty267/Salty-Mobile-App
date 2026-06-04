import React from 'react';
import {
  View, Text, TouchableOpacity, FlatList, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSidebar } from '@/lib/SidebarContext';
import { useFollowedArtists } from '@/lib/useFollowedArtists';
import { useBottomPad } from '@/lib/useBottomPad';
import { scale, scaleFont, sp } from '@/lib/layout';

const BRAND_FROM = '#4f6cf2';
const BRAND_TO   = '#a25cf2';
const FG         = '#1a1530';
const MUTED      = '#6b6a85';
const SURFACE    = '#ffffff';
const BG         = '#eef0fb';
const BORDER     = '#e6e4f0';

export default function FollowingScreen(): React.JSX.Element {
  const router = useRouter();
  const { openSidebar } = useSidebar();
  const bottomPad = useBottomPad();
  const { followed, loading, unfollowArtist } = useFollowedArtists();

  const handleUnfollow = (name: string) => {
    Alert.alert(
      `Unfollow ${name}?`,
      "You won't receive alerts for new shows.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unfollow', style: 'destructive', onPress: () => unfollowArtist(name) },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <LinearGradient
        colors={[BRAND_FROM, BRAND_TO]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ paddingBottom: sp(20), borderBottomLeftRadius: scale(32), borderBottomRightRadius: scale(32) }}
      >
        <SafeAreaView edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: sp(20), paddingTop: 4, paddingBottom: 4 }}>
            <TouchableOpacity onPress={openSidebar} style={{ width: scale(40), height: scale(40), borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="menu" size={20} color="#fff" />
            </TouchableOpacity>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(12), color: 'rgba(255,255,255,0.72)' }}>Artists & alerts</Text>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(24), color: '#fff', letterSpacing: -0.4, marginTop: 2 }}>Following</Text>
            </View>
            <View style={{ width: scale(40) }} />
          </View>
        </SafeAreaView>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator size="large" color={BRAND_FROM} style={{ marginTop: sp(60) }} />
      ) : followed.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: sp(40) }}>
          <Ionicons name="notifications-off-outline" size={48} color={MUTED} style={{ marginBottom: sp(16) }} />
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(18), color: FG, textAlign: 'center', marginBottom: sp(8) }}>
            No artists followed yet
          </Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(14), color: MUTED, textAlign: 'center', lineHeight: 20 }}>
            Tap the bell icon on your Most Seen artists or on any event to follow them and get alerts.
          </Text>
        </View>
      ) : (
        <FlatList
          data={followed}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: sp(20), paddingBottom: bottomPad, gap: sp(10) }}
          renderItem={({ item }) => (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: sp(14),
              backgroundColor: SURFACE, borderRadius: scale(16), padding: sp(14),
              shadowColor: '#503cb4', shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.07, shadowRadius: 10, elevation: 2,
            }}>
              <LinearGradient
                colors={[BRAND_FROM, BRAND_TO]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{ width: scale(44), height: scale(44), borderRadius: scale(22), alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons
                  name={item.type === 'team' ? 'football-outline' : 'musical-notes-outline'}
                  size={20}
                  color="#fff"
                />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(15), color: FG }} numberOfLines={1}>
                  {item.artist_name}
                </Text>
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(12), color: MUTED, marginTop: 2, textTransform: 'capitalize' }}>
                  {item.type} · alerts on
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handleUnfollow(item.artist_name)}
                style={{ paddingHorizontal: sp(14), paddingVertical: sp(8), borderRadius: 99, borderWidth: 1.5, borderColor: BORDER }}
              >
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(12), color: MUTED }}>Unfollow</Text>
              </TouchableOpacity>
            </View>
          )}
          ListHeaderComponent={
            <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: scaleFont(13), color: MUTED, marginBottom: sp(4) }}>
              {followed.length} {followed.length === 1 ? 'artist' : 'artists'} followed
            </Text>
          }
        />
      )}
    </View>
  );
}
