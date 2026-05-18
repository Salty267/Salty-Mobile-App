import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomPad } from '@/lib/useBottomPad';
import { scale } from '@/lib/layout';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSidebar } from '@/lib/SidebarContext';

const BRAND_FROM = '#4f6cf2';
const BRAND_TO   = '#a25cf2';
const FG         = '#1a1530';
const MUTED      = '#6b6a85';
const SURFACE    = '#ffffff';
const SECONDARY  = '#f1eefb';
const BG         = '#eef0fb';

const TRENDING = [
  { id: '1', title: 'Olivia Rodrigo', sub: 'GUTS World Tour', image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=70', tag: 'Concert' },
  { id: '2', title: 'NBA Playoffs', sub: 'Multiple venues', image: 'https://images.unsplash.com/photo-1504450758481-7338eba7524a?w=400&q=70', tag: 'Sports' },
  { id: '3', title: 'Lollapalooza', sub: 'Grant Park, Chicago', image: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=400&q=70', tag: 'Festival' },
  { id: '4', title: 'MoMA Exhibition', sub: 'New York', image: 'https://images.unsplash.com/photo-1531058020387-3be344556be6?w=400&q=70', tag: 'Art' },
];

const CATEGORIES = [
  { icon: 'musical-notes-outline', label: 'Concerts' },
  { icon: 'trophy-outline', label: 'Sports' },
  { icon: 'color-palette-outline', label: 'Arts' },
  { icon: 'restaurant-outline', label: 'Food' },
  { icon: 'airplane-outline', label: 'Travel' },
  { icon: 'game-controller-outline', label: 'Gaming' },
] as const;

export default function DiscoverScreen(): React.JSX.Element {
  const { openSidebar } = useSidebar();
  const bottomPad = useBottomPad();
  const [query, setQuery] = useState('');

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>


      <LinearGradient
        colors={[BRAND_FROM, BRAND_TO]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ paddingBottom: 20, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}
      >
        <SafeAreaView edges={['top']}>
          <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <TouchableOpacity onPress={openSidebar} style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="menu" size={20} color="#fff" />
              </TouchableOpacity>
              <Text style={{ flex: 1, fontFamily: 'BebasNeue_400Regular', fontSize: 28, letterSpacing: 6, color: '#fff', textAlign: 'center' }}>DISCOVER</Text>
              <View style={{ width: 40 }} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, height: scale(48), paddingHorizontal: 16, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.96)' }}>
                <Ionicons name="search-outline" size={16} color={MUTED} />
                <TextInput
                  placeholder="Search events, artists, venues…"
                  placeholderTextColor={MUTED}
                  value={query}
                  onChangeText={setQuery}
                  style={{ flex: 1, fontFamily: 'DMSans_400Regular', fontSize: 14, color: FG }}
                />
              </View>
              <TouchableOpacity style={{ width: scale(48), height: scale(48), borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="options-outline" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad }}>

        {/* Categories */}
        <View style={{ paddingHorizontal: 20, paddingTop: 24 }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, marginBottom: 14, letterSpacing: -0.2 }}>Browse Categories</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {CATEGORIES.map(({ icon, label }) => (
              <TouchableOpacity
                key={label}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: SURFACE, borderRadius: 14, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 }}
              >
                <LinearGradient colors={[BRAND_FROM, BRAND_TO]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: scale(26), height: scale(26), borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={icon} size={13} color="#fff" />
                </LinearGradient>
                <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 12, color: FG }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Trending */}
        <View style={{ paddingHorizontal: 20, paddingTop: 28 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14 }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, letterSpacing: -0.2 }}>Trending Now</Text>
            <TouchableOpacity>
              <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 12, color: BRAND_FROM }}>See all</Text>
            </TouchableOpacity>
          </View>
          <View style={{ gap: 14 }}>
            {TRENDING.map(item => (
              <TouchableOpacity
                key={item.id}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: SURFACE, borderRadius: 18, padding: 12, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 14, elevation: 3 }}
              >
                <Image source={{ uri: item.image }} style={{ width: scale(64), height: scale(64), borderRadius: 14 }} resizeMode="cover" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 15, color: FG }}>{item.title}</Text>
                  <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: MUTED, marginTop: 2 }}>{item.sub}</Text>
                  <View style={{ marginTop: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: SECONDARY }}>
                    <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 10, color: BRAND_FROM }}>{item.tag}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={MUTED} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

      </ScrollView>
    </View>
  );
}
