import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomPad } from '@/lib/useBottomPad';
import { scale } from '@/lib/layout';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const BRAND_FROM = '#4f6cf2';
const BRAND_TO   = '#a25cf2';
const FG         = '#1a1530';
const MUTED      = '#6b6a85';
const SURFACE    = '#ffffff';
const SECONDARY  = '#f1eefb';
const BG         = '#eef0fb';

const FRIENDS = [
  { id: '1', name: 'Alex Johnson', mutual: 3, avatar: 'https://i.pravatar.cc/128?img=47', going: 'Coachella 2024' },
  { id: '2', name: 'Sam Rivera',   mutual: 5, avatar: 'https://i.pravatar.cc/128?img=12', going: 'Lakers vs Warriors' },
  { id: '3', name: 'Jordan Lee',   mutual: 2, avatar: 'https://i.pravatar.cc/128?img=32', going: 'Taylor Swift Tour' },
  { id: '4', name: 'Casey Morgan', mutual: 7, avatar: 'https://i.pravatar.cc/128?img=5',  going: 'Jazz Festival' },
];

const ACTIVITY = [
  { id: 'a1', avatar: 'https://i.pravatar.cc/64?img=47', name: 'Alex', action: 'is going to', event: 'Coachella 2024',    time: '2h ago' },
  { id: 'a2', avatar: 'https://i.pravatar.cc/64?img=12', name: 'Sam',  action: 'just saved',  event: 'Lakers vs Warriors', time: '5h ago' },
  { id: 'a3', avatar: 'https://i.pravatar.cc/64?img=32', name: 'Jordan', action: 'is going to', event: 'Eras Tour',       time: '1d ago' },
];

export default function FriendsScreen(): React.JSX.Element {
  const bottomPad = useBottomPad();
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <LinearGradient
        colors={[BRAND_FROM, BRAND_TO]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ paddingBottom: 20, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}
      >
        <SafeAreaView edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 4 }}>
            <Text style={{ fontFamily: 'BebasNeue_400Regular', fontSize: 28, letterSpacing: 6, color: '#fff' }}>FRIENDS</Text>
            <TouchableOpacity style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="person-add-outline" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad }}>

        {/* Activity feed */}
        <View style={{ paddingHorizontal: 20, paddingTop: 24 }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, marginBottom: 14, letterSpacing: -0.2 }}>Recent Activity</Text>
          <View style={{ gap: 10 }}>
            {ACTIVITY.map(item => (
              <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: SURFACE, borderRadius: 16, padding: 14, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2 }}>
                <Image source={{ uri: item.avatar }} style={{ width: scale(42), height: scale(42), borderRadius: scale(21) }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: FG, lineHeight: 18 }}>
                    <Text style={{ fontFamily: 'DMSans_700Bold' }}>{item.name}</Text>
                    {' '}{item.action}{' '}
                    <Text style={{ fontFamily: 'DMSans_700Bold', color: BRAND_FROM }}>{item.event}</Text>
                  </Text>
                  <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: MUTED, marginTop: 2 }}>{item.time}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Friends list */}
        <View style={{ paddingHorizontal: 20, paddingTop: 28 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14 }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, letterSpacing: -0.2 }}>Your Friends</Text>
            <TouchableOpacity>
              <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 12, color: BRAND_FROM }}>See all</Text>
            </TouchableOpacity>
          </View>
          <View style={{ gap: 12 }}>
            {FRIENDS.map(friend => (
              <View key={friend.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: SURFACE, borderRadius: 18, padding: 14, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 14, elevation: 3 }}>
                <Image source={{ uri: friend.avatar }} style={{ width: scale(52), height: scale(52), borderRadius: scale(26) }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 15, color: FG }}>{friend.name}</Text>
                  <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: MUTED, marginTop: 2 }}>{friend.mutual} mutual events</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <Ionicons name="ticket-outline" size={11} color={BRAND_FROM} />
                    <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 11, color: BRAND_FROM }}>{friend.going}</Text>
                  </View>
                </View>
                <TouchableOpacity style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: SECONDARY }}>
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: FG }}>View</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>

      </ScrollView>
    </View>
  );
}
