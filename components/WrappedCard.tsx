import React from 'react';
import { View, Text, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { scale, scaleFont, sp } from '@/lib/layout';

const CARD_W = Dimensions.get('window').width - 40;
const CARD_H = Math.round(CARD_W * 1.6);

export type WrappedCardProps = {
  username: string;
  year: number;
  totalShows: number;
  topArtists: { name: string; times: number }[];
  topCategory: { label: string; pct: number } | null;
  levelLabel: string;
  levelNum: number;
  earnedBadges: number;
};

export default function WrappedCard({
  username,
  year,
  totalShows,
  topArtists,
  topCategory,
  levelLabel,
  levelNum,
  earnedBadges,
}: WrappedCardProps): React.JSX.Element {
  return (
    <View style={{ width: CARD_W, height: CARD_H, borderRadius: scale(28), overflow: 'hidden' }}>
      <LinearGradient
        colors={['#0d0822', '#1e1154', '#4f1d8f']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ flex: 1, padding: sp(28) }}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: sp(4) }}>
          <Text style={{ fontFamily: 'BebasNeue_400Regular', fontSize: scaleFont(22), color: 'rgba(255,255,255,0.55)', letterSpacing: 2 }}>
            SALTY
          </Text>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 99, paddingHorizontal: sp(10), paddingVertical: sp(4) }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(11), color: 'rgba(255,255,255,0.75)', letterSpacing: 0.5 }}>
              {year} WRAPPED
            </Text>
          </View>
        </View>

        {username ? (
          <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: scaleFont(13), color: 'rgba(255,255,255,0.55)', marginBottom: sp(20) }}>
            @{username}
          </Text>
        ) : (
          <View style={{ marginBottom: sp(20) }} />
        )}

        {/* Big show count */}
        <View style={{ marginBottom: sp(24) }}>
          <Text style={{ fontFamily: 'BebasNeue_400Regular', fontSize: scaleFont(88), color: '#fff', letterSpacing: -2 }}>
            {totalShows}
          </Text>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(15), color: 'rgba(255,255,255,0.65)', marginTop: sp(4), letterSpacing: 1, textTransform: 'uppercase' }}>
            {totalShows === 1 ? 'show attended' : 'shows attended'}
          </Text>
        </View>

        {/* Divider */}
        <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginBottom: sp(24) }} />

        {/* Top Artists */}
        {topArtists.length > 0 && (
          <View style={{ marginBottom: sp(22) }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(11), color: 'rgba(255,255,255,0.45)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: sp(12) }}>
              Top Shows
            </Text>
            {topArtists.slice(0, 3).map((a, i) => (
              <View key={a.name} style={{ flexDirection: 'row', alignItems: 'center', gap: sp(10), marginBottom: sp(8) }}>
                <Text style={{ fontFamily: 'BebasNeue_400Regular', fontSize: scaleFont(16), color: 'rgba(255,255,255,0.35)', width: 18 }}>
                  {i + 1}
                </Text>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(14), color: '#fff', flex: 1 }} numberOfLines={1}>
                  {a.name}
                </Text>
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(12), color: 'rgba(255,255,255,0.45)' }}>
                  {a.times}×
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Taste + Level row */}
        <View style={{ flexDirection: 'row', gap: sp(12), flex: 1, alignItems: 'flex-end' }}>
          {topCategory && (
            <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: scale(16), padding: sp(14) }}>
              <Ionicons name="sparkles" size={scale(18)} color="#a78bfa" style={{ marginBottom: sp(6) }} />
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(18), color: '#fff' }}>
                {topCategory.pct}%
              </Text>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(11), color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
                {topCategory.label}
              </Text>
            </View>
          )}

          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: scale(16), padding: sp(14) }}>
            <Ionicons name="trophy-outline" size={scale(18)} color="#fbbf24" style={{ marginBottom: sp(6) }} />
            <Text style={{ fontFamily: 'BebasNeue_400Regular', fontSize: scaleFont(18), color: '#fff', letterSpacing: 0.5 }}>
              LVL {levelNum}
            </Text>
            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(11), color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
              {levelLabel} · {earnedBadges} badge{earnedBadges !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>

        {/* Footer */}
        <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: scaleFont(10), color: 'rgba(255,255,255,0.25)', textAlign: 'center', marginTop: sp(18), letterSpacing: 1 }}>
          salty.app
        </Text>
      </LinearGradient>
    </View>
  );
}
