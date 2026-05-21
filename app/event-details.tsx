import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SCREEN_W } from '@/lib/layout';
import { useBottomPad } from '@/lib/useBottomPad';
import { useSavedEvents } from '@/lib/SavedEventsContext';

const BRAND_FROM = '#4f6cf2';
const BRAND_TO   = '#a25cf2';
const FG         = '#1a1530';
const MUTED      = '#6b6a85';
const SURFACE    = '#ffffff';
const BG         = '#eef0fb';

const HERO_H     = Math.round(SCREEN_W * 0.56);
const MEDIA_GAP  = 4;
const MEDIA_CELL = Math.floor((SCREEN_W - 40 - MEDIA_GAP * 2) / 3);

const MOCK_ATTENDEES = [
  'https://i.pravatar.cc/150?img=1',
  'https://i.pravatar.cc/150?img=2',
  'https://i.pravatar.cc/150?img=3',
  'https://i.pravatar.cc/150?img=4',
];

const MOCK_TAGS = ['Birthday', 'Date Night', 'Special Occasion'];

const MOCK_MEDIA = [
  'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=300&q=80',
  'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=300&q=80',
  'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&q=80',
  'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80',
  'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=300&q=80',
];

const MOCK_SETLIST = [
  { id: '1', song: 'Miss Americana & The Heartbreak Prince', era: 'Lover Era', time: '7:32 PM' },
  { id: '2', song: 'The Archer',                            era: 'Lover Era', time: '7:36 PM' },
  { id: '3', song: 'Lover',                                 era: 'Lover Era', time: '7:40 PM' },
];

const MOCK_NOTE = {
  text: 'This was absolutely incredible! The surprise songs were "All Too Well" and "State of Grace" – I cried during both. The crowd energy was unmatched and seeing it with my best friends made it even more special. 💜',
  author: 'Emma',
  avatar: 'https://i.pravatar.cc/150?img=5',
  time: '2 hours ago',
};

export default function EventDetailsScreen(): React.JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    title: string;
    subtitle?: string;
    venue: string;
    date: string;
    time: string;
    category: string;
    image: string;
    seat?: string;
    tint?: string;
  }>();
  const bottomPad = useBottomPad();
  const { saveEvent, unsaveEvent, isSaved } = useSavedEvents();
  const saved = isSaved(params.id);
  const [tags, setTags] = useState(MOCK_TAGS);

  const toggleSave = () => {
    if (saved) {
      unsaveEvent(params.id);
    } else {
      saveEvent({
        id: params.id,
        title: params.title,
        subtitle: params.subtitle,
        venue: params.venue,
        date: params.date,
        time: params.time,
        category: params.category,
        image: params.image,
        tint: params.tint,
        seat: params.seat,
      });
    }
  };

  const removeTag = (tag: string) => setTags(prev => prev.filter(t => t !== tag));

  return (
    <View style={{ flex: 1, backgroundColor: SURFACE }}>

      {/* ── Header ── */}
      <LinearGradient
        colors={[BRAND_FROM, BRAND_TO]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      >
        <SafeAreaView edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14 }}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 17, color: '#fff', letterSpacing: -0.2 }}>
              Event Details
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity
                onPress={toggleSave}
                style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name={saved ? 'heart' : 'heart-outline'} size={22} color={saved ? '#ff6b8a' : '#fff'} />
              </TouchableOpacity>
              <TouchableOpacity style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad }}>

        {/* ── Hero Image ── */}
        <Image
          source={{ uri: params.image }}
          style={{ width: SCREEN_W, height: HERO_H }}
          resizeMode="cover"
        />

        {/* ── Event Info ── */}
        <View style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 18 }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 22, color: FG, letterSpacing: -0.4 }}>
            {params.title}
          </Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 14, color: MUTED, marginTop: 5 }}>
            {params.venue}
          </Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 14, color: MUTED, marginTop: 3 }}>
            {params.date} • {params.time}
          </Text>
          {params.seat ? (
            <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 13, color: BRAND_FROM, marginTop: 5 }}>
              {params.seat}
            </Text>
          ) : null}
        </View>

        <Divider />

        {/* ── Attendees ── */}
        <View style={{ paddingHorizontal: 20, paddingVertical: 18 }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 15, color: FG, marginBottom: 14 }}>
            Attendees ({MOCK_ATTENDEES.length})
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {MOCK_ATTENDEES.map((uri, i) => (
              <Image
                key={i}
                source={{ uri }}
                style={{
                  width: 38, height: 38, borderRadius: 19,
                  borderWidth: 2.5, borderColor: SURFACE,
                  marginLeft: i === 0 ? 0 : -10,
                }}
              />
            ))}
            <TouchableOpacity
              style={{
                width: 38, height: 38, borderRadius: 19,
                borderWidth: 1.5, borderColor: `${FG}22`,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: BG, marginLeft: -10,
              }}
            >
              <Ionicons name="add" size={16} color={MUTED} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Action Buttons ── */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 18, flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity 
            activeOpacity={0.85} 
            style={{ flex: 1, borderRadius: 12, overflow: 'hidden' }}>
            <LinearGradient
              colors={[BRAND_FROM, BRAND_TO]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', 
                gap: 7, paddingVertical: 15 }}
            >
              <Ionicons name="share-social-outline" size={16} color="#fff" />
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: '#fff' }}>Share</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.85}
            style={{
              flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
              paddingVertical: 13, borderRadius: 12, borderWidth: 1.5, borderColor: `${FG}20`,
            }}
          >
            <Ionicons name="trash-outline" size={16} color={FG} />
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: FG }}>Delete</Text>
          </TouchableOpacity>
        </View>

        <Divider />

        {/* ── Tags ── */}
        <View style={{ paddingHorizontal: 20, paddingVertical: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 15, color: FG }}>Add Tags</Text>
            <TouchableOpacity>
              <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 13, color: BRAND_FROM }}>View All</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {tags.map(tag => (
              <View
                key={tag}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  backgroundColor: BG, borderRadius: 99,
                  paddingHorizontal: 12, paddingVertical: 7,
                  borderWidth: 1, borderColor: `${FG}14`,
                }}
              >
                <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 12, color: FG }}>{tag}</Text>
                <TouchableOpacity onPress={() => removeTag(tag)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Ionicons name="close" size={12} color={MUTED} />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 5,
                borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7,
                borderWidth: 1.5, borderColor: `${BRAND_FROM}50`,
              }}
            >
              <Ionicons name="add" size={13} color={BRAND_FROM} />
              <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 12, color: BRAND_FROM }}>Add Tag</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Divider />

        {/* ── Media Gallery ── */}
        <View style={{ paddingHorizontal: 20, paddingVertical: 18 }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 15, color: FG, marginBottom: 14 }}>
            Media Gallery{' '}
            <Text style={{ fontFamily: 'DMSans_400Regular', color: MUTED }}>– 8 items</Text>
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: MEDIA_GAP }}>
            {MOCK_MEDIA.map((uri, i) => (
              <TouchableOpacity key={i} activeOpacity={0.9}>
                <Image
                  source={{ uri }}
                  style={{ width: MEDIA_CELL, height: MEDIA_CELL, borderRadius: 8 }}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              activeOpacity={0.8}
              style={{
                width: MEDIA_CELL, height: MEDIA_CELL, borderRadius: 8,
                backgroundColor: BG, borderWidth: 1.5, borderColor: `${FG}18`,
                alignItems: 'center', justifyContent: 'center', gap: 4,
              }}
            >
              <Ionicons name="add" size={22} color={MUTED} />
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 10, color: MUTED }}>Add Media</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Divider />

        {/* ── Setlist ── */}
        <View style={{ paddingHorizontal: 20, paddingVertical: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 15, color: FG }}>Setlist</Text>
            <TouchableOpacity>
              <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 12, color: BRAND_FROM }}>
                View Full Setlist (22 songs)
              </Text>
            </TouchableOpacity>
          </View>
          <View style={{ gap: 14 }}>
            {MOCK_SETLIST.map((item, index) => (
              <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <LinearGradient
                  colors={[BRAND_FROM, BRAND_TO]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={{ width: 28, height: 28, borderRadius: 99, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: '#fff' }}>{index + 1}</Text>
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: FG }} numberOfLines={1}>
                    {item.song}
                  </Text>
                  <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: MUTED, marginTop: 2 }}>
                    {item.era} • {item.time}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <Divider />

        {/* ── Notes & Reflections ── */}
        <View style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 24 }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 15, color: FG, marginBottom: 14 }}>
            Notes & Reflections
          </Text>

          {/* Note card */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: FG, lineHeight: 21 }}>
              {MOCK_NOTE.text}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Image source={{ uri: MOCK_NOTE.avatar }} style={{ width: 26, height: 26, borderRadius: 13 }} />
                <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 12, color: MUTED }}>
                  {MOCK_NOTE.author} • {MOCK_NOTE.time}
                </Text>
              </View>
              <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="ellipsis-horizontal" size={16} color={MUTED} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Add Note button */}
          <TouchableOpacity
            activeOpacity={0.8}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              paddingVertical: 14, borderRadius: 12,
              borderWidth: 1.5, borderColor: `${BRAND_FROM}44`,
            }}
          >
            <Ionicons name="add" size={16} color={BRAND_FROM} />
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: BRAND_FROM }}>Add Note</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
}

function Divider(): React.JSX.Element {
  return <View style={{ height: 1, backgroundColor: `${FG}10`, marginHorizontal: 20 }} />;
}
