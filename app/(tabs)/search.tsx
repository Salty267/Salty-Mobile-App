import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  Image, ActivityIndicator, FlatList, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomPad } from '@/lib/useBottomPad';
import { scale, SCREEN_W } from '@/lib/layout';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSidebar } from '@/lib/SidebarContext';
import { useRouter } from 'expo-router';
import { useZipLocation } from '@/lib/useZipLocation';
import { supabase } from '@/lib/supabase/client';

const BRAND_FROM = '#4f6cf2';
const BRAND_TO   = '#a25cf2';
const FG         = '#1a1530';
const MUTED      = '#6b6a85';
const SURFACE    = '#ffffff';
const BG         = '#eef0fb';
const BORDER     = '#e6e4f0';

const CARD_W   = Math.round(SCREEN_W * 0.46);
const CARD_IMG = Math.round(CARD_W * 1.22);

// ── Types ─────────────────────────────────────────────────────────────────────

type CityLocation = {
  city: string;
  country: string;
  countryCode: string;
  emoji: string;
};

const POPULAR_CITIES: CityLocation[] = [
  { city: 'New York',     country: 'United States',  countryCode: 'US', emoji: '🇺🇸' },
  { city: 'Los Angeles',  country: 'United States',  countryCode: 'US', emoji: '🇺🇸' },
  { city: 'Chicago',      country: 'United States',  countryCode: 'US', emoji: '🇺🇸' },
  { city: 'Miami',        country: 'United States',  countryCode: 'US', emoji: '🇺🇸' },
  { city: 'Las Vegas',    country: 'United States',  countryCode: 'US', emoji: '🇺🇸' },
  { city: 'Houston',      country: 'United States',  countryCode: 'US', emoji: '🇺🇸' },
  { city: 'London',       country: 'United Kingdom', countryCode: 'GB', emoji: '🇬🇧' },
  { city: 'Paris',        country: 'France',         countryCode: 'FR', emoji: '🇫🇷' },
  { city: 'Berlin',       country: 'Germany',        countryCode: 'DE', emoji: '🇩🇪' },
  { city: 'Amsterdam',    country: 'Netherlands',    countryCode: 'NL', emoji: '🇳🇱' },
  { city: 'Barcelona',    country: 'Spain',          countryCode: 'ES', emoji: '🇪🇸' },
  { city: 'Tokyo',        country: 'Japan',          countryCode: 'JP', emoji: '🇯🇵' },
  { city: 'Sydney',       country: 'Australia',      countryCode: 'AU', emoji: '🇦🇺' },
  { city: 'Toronto',      country: 'Canada',         countryCode: 'CA', emoji: '🇨🇦' },
  { city: 'Mexico City',  country: 'Mexico',         countryCode: 'MX', emoji: '🇲🇽' },
  { city: 'Singapore',    country: 'Singapore',      countryCode: 'SG', emoji: '🇸🇬' },
  { city: 'Dubai',        country: 'UAE',            countryCode: 'AE', emoji: '🇦🇪' },
  { city: 'Mumbai',       country: 'India',          countryCode: 'IN', emoji: '🇮🇳' },
];

type EventCard = {
  tmId?:        string;
  key:          string;
  title:        string;
  venue:        string;
  dateStr:      string;
  timeStr?:     string;
  category:     string;
  imageUrl:     string | null;
  tint:         string;
  goingCount?:  number;
  goingAvatars?: (string | null)[];
};

// ── Category config ───────────────────────────────────────────────────────────

type Category = { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string };

const CATEGORIES: Category[] = [
  { icon: 'apps-outline',          label: 'All',       value: 'all'      },
  { icon: 'musical-notes-outline', label: 'Concerts',  value: 'concert'  },
  { icon: 'trophy-outline',        label: 'Sports',    value: 'sports'   },
  { icon: 'color-palette-outline', label: 'Theatre',   value: 'theater'  },
  { icon: 'musical-notes-outline', label: 'Festivals', value: 'festival' },
  { icon: 'restaurant-outline',    label: 'Dining',    value: 'dining'   },
  { icon: 'airplane-outline',      label: 'Trips',     value: 'trip'     },
];

const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=500&q=80';
const CATEGORY_IMAGES: Record<string, string> = {
  concert:  'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=500&q=80',
  festival: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=500&q=80',
  sports:   'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=500&q=80',
  theater:  'https://images.unsplash.com/photo-1585699324551-f6c309eedeca?w=500&q=80',
  dining:   'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=500&q=80',
  trip:     'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=500&q=80',
};

function resolveImage(imageUrl: string | null, category: string): string {
  if (imageUrl && imageUrl.startsWith('http')) return imageUrl;
  return CATEGORY_IMAGES[category] ?? DEFAULT_IMAGE;
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function DiscoverScreen(): React.JSX.Element {
  const { openSidebar } = useSidebar();
  const router    = useRouter();
  const bottomPad = useBottomPad();
  const { zipCode } = useZipLocation();
  // customCity overrides zip-based local search for the session
  const [customCity, setCustomCity]       = useState<CityLocation | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);

  const locationLabel = customCity
    ? `${customCity.emoji} ${customCity.city}, ${customCity.country}`
    : zipCode ? `Within 200 mi of ${zipCode}` : 'Set location';

  // Search state
  const [query, setQuery]               = useState('');
  const [searchResults, setSearchResults] = useState<EventCard[]>([]);
  const [searching, setSearching]       = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Browse state
  const [activeCategory, setActiveCategory] = useState('all');
  const [trendingTab, setTrendingTab]       = useState<'local' | 'world'>('local');
  const trendingRef = useRef<FlatList>(null);
  const [friendEvents, setFriendEvents]     = useState<EventCard[]>([]);
  const [trendingLocal, setTrendingLocal]   = useState<EventCard[]>([]);
  const [trendingWorld, setTrendingWorld]   = useState<EventCard[]>([]);
  const [loadingFriends, setLoadingFriends]   = useState(true);
  const [loadingTrending, setLoadingTrending] = useState(true);

  const isSearching = query.trim().length >= 1;

  // ── Load friends' upcoming events ─────────────────────────────────────────

  const loadFriendsEvents = useCallback(async () => {
    setLoadingFriends(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoadingFriends(false); return; }

    const { data: friendships } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .eq('status', 'accepted');

    const friendIds = (friendships ?? []).map(f =>
      f.requester_id === user.id ? f.addressee_id : f.requester_id,
    );

    if (friendIds.length === 0) { setLoadingFriends(false); return; }

    const [ticketsRes, profilesRes] = await Promise.all([
      supabase
        .from('tickets')
        .select('title, venue_name, date_str, category, image_url, tint, user_id')
        .in('user_id', friendIds)
        .eq('is_past', false)
        .eq('status', 'active')
        .order('imported_at', { ascending: false })
        .limit(40),
      supabase.from('users').select('id, avatar_url').in('id', friendIds),
    ]);

    const avatarById: Record<string, string | null> = {};
    for (const p of profilesRes.data ?? []) avatarById[p.id] = p.avatar_url;

    const byTitle: Record<string, { ticket: (typeof ticketsRes.data)[0]; users: string[]; count: number }> = {};
    for (const t of ticketsRes.data ?? []) {
      const key = t.title ?? 'Untitled';
      if (!byTitle[key]) byTitle[key] = { ticket: t, users: [], count: 0 };
      if (!byTitle[key].users.includes(t.user_id)) {
        byTitle[key].users.push(t.user_id);
        byTitle[key].count++;
      }
    }

    setFriendEvents(
      Object.entries(byTitle)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 12)
        .map(([title, { ticket, users, count }]) => ({
          key: `friend_${title}`,
          title,
          venue: ticket.venue_name ?? '',
          dateStr: ticket.date_str ?? '',
          category: ticket.category,
          imageUrl: ticket.image_url,
          tint: ticket.tint ?? '#b0b8e0',
          goingCount: count,
          goingAvatars: users.slice(0, 3).map(uid => avatarById[uid] ?? null),
        })),
    );
    setLoadingFriends(false);
  }, []);

  // ── Trending via edge function ────────────────────────────────────────────

  const fetchTrendingEdge = useCallback(async (
    localParams: { zipCode?: string; city?: string; countryCode?: string } | null,
    category: string | null,
  ): Promise<EventCard[]> => {
    try {
      const { data, error } = await supabase.functions.invoke('trending-events', {
        body: { ...localParams, category, limit: 12 },
      });
      if (error || !data?.events) return [];
      return data.events as EventCard[];
    } catch { return []; }
  }, []);

  const loadTrending = useCallback(async (category?: string) => {
    setLoadingTrending(true);
    try {
      const cat = category === 'all' || !category ? null : category;

      const localParams = customCity
        ? { city: customCity.city, countryCode: customCity.countryCode }
        : zipCode ? { zipCode } : null;

      const [local, world] = await Promise.all([
        fetchTrendingEdge(localParams, cat),
        fetchTrendingEdge(null, cat),
      ]);

      setTrendingLocal(local);
      setTrendingWorld(world);
    } catch {
      setTrendingLocal([]);
      setTrendingWorld([]);
    } finally {
      setLoadingTrending(false);
    }
  }, [fetchTrendingEdge, customCity, zipCode]);

  useEffect(() => { loadFriendsEvents(); }, [loadFriendsEvents]);
  useEffect(() => { loadTrending(activeCategory); }, [activeCategory, loadTrending]);

  // ── Search ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const trimmed = query.trim();
    if (!trimmed) { setSearchResults([]); return; }

    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      const { data: tickets } = await supabase
        .from('tickets')
        .select('title, venue_name, date_str, category, image_url, tint')
        .ilike('title', `%${trimmed}%`)
        .eq('status', 'active')
        .order('imported_at', { ascending: false })
        .limit(30);

      const seen = new Set<string>();
      const cards: EventCard[] = [];
      for (const t of tickets ?? []) {
        const key = t.title ?? 'Untitled';
        if (seen.has(key)) continue;
        seen.add(key);
        cards.push({
          key: `search_${key}`,
          title: key,
          venue: t.venue_name ?? '',
          dateStr: t.date_str ?? '',
          category: t.category,
          imageUrl: t.image_url,
          tint: t.tint ?? '#b0b8e0',
        });
      }
      setSearchResults(cards);
      setSearching(false);
    }, 350);

    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const filteredFriendEvents = activeCategory === 'all'
    ? friendEvents
    : friendEvents.filter(e => e.category === activeCategory);

  const trendingData = trendingTab === 'local' ? trendingLocal : trendingWorld;

  const navigateToEvent = useCallback((item: EventCard) => {
    if (!item.tmId) return;
    router.push({
      pathname: '/discover-event',
      params: {
        tmId:     item.tmId,
        title:    item.title,
        imageUrl: item.imageUrl ?? '',
        category: item.category,
        venue:    item.venue,
        dateStr:  item.dateStr,
        timeStr:  item.timeStr ?? '',
      },
    });
  }, [router]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>

      {/* ── Header ── */}
      <LinearGradient
        colors={[BRAND_FROM, BRAND_TO]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ paddingBottom: 20, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}
      >
        <SafeAreaView edges={['top']}>
          <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16 }}>

            {/* Title row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <TouchableOpacity onPress={openSidebar} style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="menu" size={20} color="#fff" />
              </TouchableOpacity>
              <Text style={{ flex: 1, fontFamily: 'BebasNeue_400Regular', fontSize: 28, letterSpacing: 6, color: '#fff', textAlign: 'center' }}>DISCOVER</Text>
              <View style={{ width: 40 }} />
            </View>

            {/* Search bar */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: scale(48), paddingHorizontal: 16, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.96)' }}>
              <Ionicons name="search-outline" size={16} color={MUTED} />
              <TextInput
                placeholder="Search events, artists, venues…"
                placeholderTextColor={MUTED}
                value={query}
                onChangeText={setQuery}
                returnKeyType="search"
                style={{ flex: 1, fontFamily: 'DMSans_400Regular', fontSize: 14, color: FG }}
              />
              {isSearching && (
                searching
                  ? <ActivityIndicator size="small" color={MUTED} />
                  : <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle" size={18} color={MUTED} />
                    </TouchableOpacity>
              )}
            </View>

            {/* Location bar */}
            <TouchableOpacity
              onPress={() => setPickerVisible(true)}
              activeOpacity={0.8}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 }}
            >
              <Ionicons name="location" size={15} color="#fff" />
              <Text style={{ flex: 1, fontFamily: 'DMSans_500Medium', fontSize: 13, color: '#fff' }} numberOfLines={1}>
                {locationLabel}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 11, color: '#fff' }}>Change</Text>
                <Ionicons name="chevron-down" size={11} color="#fff" />
              </View>
            </TouchableOpacity>

          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* ── Content ── */}
      {isSearching ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: bottomPad, gap: 12 }}
        >
          {searching ? (
            <View style={{ alignItems: 'center', paddingTop: 48 }}>
              <ActivityIndicator size="large" color={BRAND_FROM} />
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 14, color: MUTED, marginTop: 12 }}>Searching…</Text>
            </View>
          ) : searchResults.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 48 }}>
              <Ionicons name="search-outline" size={48} color={MUTED} />
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, marginTop: 16 }}>No results found</Text>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: MUTED, marginTop: 6, textAlign: 'center' }}>
                Try a different search term
              </Text>
            </View>
          ) : (
            <>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: MUTED, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
              </Text>
              {searchResults.map(item => (
                <SearchResultRow key={item.key} item={item} onPress={() => navigateToEvent(item)} />
              ))}
            </>
          )}
        </ScrollView>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad }}>

          {/* ── Category pills ── */}
          <View style={{ paddingTop: 20 }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
            >
              {CATEGORIES.map(cat => {
                const active = activeCategory === cat.value;
                return (
                  <TouchableOpacity
                    key={cat.value}
                    onPress={() => setActiveCategory(cat.value)}
                    activeOpacity={0.8}
                    style={{ overflow: 'hidden', borderRadius: 14 }}
                  >
                    {active
                      ? <LinearGradient
                          colors={[BRAND_FROM, BRAND_TO]}
                          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10 }}
                        >
                          <Ionicons name={cat.icon} size={14} color="#fff" />
                          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: '#fff' }}>{cat.label}</Text>
                        </LinearGradient>
                      : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: SURFACE, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 1 }}>
                          <Ionicons name={cat.icon} size={14} color={MUTED} />
                          <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 13, color: MUTED }}>{cat.label}</Text>
                        </View>
                    }
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* ── Friends are going ── */}
          <View style={{ paddingTop: 28 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, letterSpacing: -0.2 }}>Friends are going</Text>
                {filteredFriendEvents.length > 0 && (
                  <View style={{ backgroundColor: BRAND_FROM, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 10, color: '#fff' }}>{filteredFriendEvents.length}</Text>
                  </View>
                )}
              </View>
            </View>

            {loadingFriends ? (
              <View style={{ height: CARD_IMG + 60, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={BRAND_FROM} />
              </View>
            ) : filteredFriendEvents.length === 0 ? (
              <View style={{ marginHorizontal: 20, backgroundColor: SURFACE, borderRadius: 20, padding: 24, alignItems: 'center', gap: 10, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 10, elevation: 2 }}>
                <Ionicons name="people-outline" size={36} color={MUTED} />
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: FG }}>
                  {activeCategory === 'all' ? 'No friend events yet' : `No friend ${activeCategory} events`}
                </Text>
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: MUTED, textAlign: 'center' }}>
                  Add friends to see what events they're attending
                </Text>
              </View>
            ) : (
              <FlatList
                data={filteredFriendEvents}
                keyExtractor={item => item.key}
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={CARD_W + 14}
                decelerationRate="fast"
                contentContainerStyle={{ paddingLeft: 20, paddingRight: 8, gap: 14 }}
                renderItem={({ item }) => <EventTallCard item={item} onPress={() => navigateToEvent(item)} />}
              />
            )}
          </View>

          {/* ── Trending Now ── */}
          <View style={{ paddingTop: 28 }}>
            <View style={{ paddingHorizontal: 20, marginBottom: 14 }}>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, letterSpacing: -0.2 }}>Trending Now</Text>
            </View>

            {/* Tab toggle */}
            <View style={{ flexDirection: 'row', marginHorizontal: 20, marginBottom: 16, backgroundColor: `${FG}0a`, borderRadius: 14, padding: 3 }}>
              {(['local', 'world'] as const).map(tab => (
                <TouchableOpacity
                  key={tab}
                  onPress={() => { setTrendingTab(tab); trendingRef.current?.scrollToOffset({ offset: 0, animated: false }); }}
                  activeOpacity={0.8}
                  style={{ flex: 1, borderRadius: 11, paddingVertical: 9, alignItems: 'center', overflow: 'hidden' }}
                >
                  {trendingTab === tab && (
                    <LinearGradient colors={[BRAND_FROM, BRAND_TO]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 11 }} />
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Ionicons
                      name={tab === 'local' ? 'location' : 'globe-outline'}
                      size={12}
                      color={trendingTab === tab ? '#fff' : MUTED}
                    />
                    <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: trendingTab === tab ? '#fff' : MUTED }}>
                      {tab === 'local' ? (customCity ? customCity.city : zipCode ? 'Near You' : 'Near Me') : 'Worldwide'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {loadingTrending ? (
              <View style={{ height: CARD_IMG + 60, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={BRAND_FROM} />
              </View>
            ) : trendingData.length === 0 ? (
              <View style={{ marginHorizontal: 20, backgroundColor: SURFACE, borderRadius: 20, padding: 24, alignItems: 'center', gap: 8 }}>
                <Ionicons name="flame-outline" size={32} color={MUTED} />
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: MUTED, textAlign: 'center' }}>
                  {trendingTab === 'local' ? 'No local events found' : 'No worldwide data yet'}
                </Text>
              </View>
            ) : (
              <FlatList
                ref={trendingRef}
                key={trendingTab}
                data={trendingData}
                keyExtractor={item => item.key}
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={CARD_W + 14}
                decelerationRate="fast"
                contentContainerStyle={{ paddingLeft: 20, paddingRight: 8, gap: 14 }}
                renderItem={({ item }) => <EventTallCard item={item} onPress={() => navigateToEvent(item)} />}
              />
            )}
          </View>

        </ScrollView>
      )}
      {/* ── Location Picker Modal ── */}
      <LocationPicker
        visible={pickerVisible}
        currentCity={customCity}
        accountZip={zipCode}
        onClose={() => setPickerVisible(false)}
        onSelect={(city) => { setCustomCity(city); setPickerVisible(false); }}
        onReset={() => { setCustomCity(null); setPickerVisible(false); }}
      />

    </View>
  );
}

// ── Location Picker Modal ─────────────────────────────────────────────────────

function LocationPicker({
  visible, currentCity, accountZip, onClose, onSelect, onReset,
}: {
  visible: boolean;
  currentCity: CityLocation | null;
  accountZip: string | null;
  onClose: () => void;
  onSelect: (city: CityLocation) => void;
  onReset: () => void;
}): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState('');

  const trimmed = searchQuery.trim().toLowerCase();
  const filtered = trimmed.length >= 1
    ? POPULAR_CITIES.filter(c =>
        c.city.toLowerCase().includes(trimmed) ||
        c.country.toLowerCase().includes(trimmed)
      )
    : POPULAR_CITIES;

  const handleClose = () => { setSearchQuery(''); onClose(); };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={{ flex: 1, backgroundColor: BG }}>

          <LinearGradient
            colors={[BRAND_FROM, BRAND_TO]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ paddingBottom: 20, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}
          >
            <SafeAreaView edges={['top']}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 }}>
                <View style={{ width: 40 }} />
                <Text style={{ fontFamily: 'BebasNeue_400Regular', fontSize: 28, letterSpacing: 6, color: '#fff' }}>LOCATION</Text>
                <TouchableOpacity onPress={handleClose} style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="close" size={20} color="#fff" />
                </TouchableOpacity>
              </View>

              {/* Search bar inside header */}
              <View style={{ marginHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 10, height: scale(48), paddingHorizontal: 16, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.96)' }}>
                <Ionicons name="search-outline" size={16} color={MUTED} />
                <TextInput
                  placeholder="Search city or country…"
                  placeholderTextColor={MUTED}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoFocus
                  autoCorrect={false}
                  style={{ flex: 1, fontFamily: 'DMSans_400Regular', fontSize: 15, color: FG }}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={18} color={MUTED} />
                  </TouchableOpacity>
                )}
              </View>
            </SafeAreaView>
          </LinearGradient>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40, gap: 16 }}
          >
            {/* Reset to account zip */}
            {currentCity && accountZip && (
              <TouchableOpacity
                onPress={() => { setSearchQuery(''); onReset(); }}
                activeOpacity={0.8}
                style={{ overflow: 'hidden', borderRadius: 16 }}
              >
                <LinearGradient
                  colors={[BRAND_FROM, BRAND_TO]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="refresh-outline" size={20} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: '#fff' }}>Reset to my location</Text>
                    <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>Within 200 miles of {accountZip}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.7)" />
                </LinearGradient>
              </TouchableOpacity>
            )}

            {/* City list */}
            <View>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: MUTED, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
                {trimmed.length >= 1 ? 'Search Results' : 'Popular Cities'}
              </Text>

              {filtered.length === 0 ? (
                <View style={{ backgroundColor: SURFACE, borderRadius: 20, padding: 24, alignItems: 'center', gap: 8 }}>
                  <Ionicons name="location-outline" size={28} color={MUTED} />
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: FG }}>No cities found</Text>
                  <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: MUTED }}>Try a different search term</Text>
                </View>
              ) : (
                <View style={{ backgroundColor: SURFACE, borderRadius: 20, overflow: 'hidden', shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 14, elevation: 3 }}>
                  {filtered.map((loc, i) => {
                    const isSelected = currentCity?.city === loc.city && currentCity?.country === loc.country;
                    return (
                      <View key={`${loc.city}-${loc.countryCode}`}>
                        {i > 0 && <View style={{ height: 1, backgroundColor: `${FG}08`, marginLeft: 64 }} />}
                        <TouchableOpacity
                          onPress={() => { setSearchQuery(''); onSelect(loc); }}
                          activeOpacity={0.7}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 }}
                        >
                          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: isSelected ? `${BRAND_FROM}18` : `${FG}08`, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 20 }}>{loc.emoji}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: FG }}>{loc.city}</Text>
                            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: MUTED, marginTop: 1 }}>{loc.country}</Text>
                          </View>
                          {isSelected
                            ? <Ionicons name="checkmark-circle" size={20} color={BRAND_FROM} />
                            : <Ionicons name="chevron-forward" size={16} color={MUTED} />
                          }
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Event Tall Card ───────────────────────────────────────────────────────────

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function EventTallCard({ item, onPress }: { item: EventCard; onPress: () => void }): React.JSX.Element {
  const img       = resolveImage(item.imageUrl, item.category);
  const dateLabel = formatDisplayDate(item.dateStr);
  const timeLabel = item.timeStr ?? '';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      style={{ width: CARD_W, borderRadius: 20, overflow: 'hidden', backgroundColor: SURFACE, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.13, shadowRadius: 18, elevation: 5 }}
    >
      <View style={{ height: CARD_IMG }}>
        <Image source={{ uri: img }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        <LinearGradient
          colors={['transparent', 'rgba(26,21,48,0.85)']}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: CARD_IMG * 0.65 }}
        />
        <View style={{ position: 'absolute', top: 10, left: 10, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 99, paddingHorizontal: 9, paddingVertical: 4 }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 9, color: FG, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {item.category}
          </Text>
        </View>
        {(item.goingCount ?? 0) > 0 && (
          <View style={{ position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center' }}>
            {(item.goingAvatars ?? []).slice(0, 3).map((uri, i) => (
              <View key={i} style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#a25cf2', alignItems: 'center', justifyContent: 'center', marginLeft: i > 0 ? -8 : 0, borderWidth: 1.5, borderColor: '#fff', overflow: 'hidden' }}>
                {uri
                  ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  : <Ionicons name="person" size={12} color="#fff" />
                }
              </View>
            ))}
            <View style={{ marginLeft: 5, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 99, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 9, color: '#fff' }}>{item.goingCount} going</Text>
            </View>
          </View>
        )}
        <View style={{ position: 'absolute', bottom: 10, left: 12, right: 12, gap: 4 }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: '#fff', letterSpacing: -0.2 }} numberOfLines={2}>
            {item.title}
          </Text>
          {(dateLabel || timeLabel) && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="calendar-outline" size={10} color="rgba(255,255,255,0.85)" />
              <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 10, color: 'rgba(255,255,255,0.85)' }}>
                {[dateLabel, timeLabel].filter(Boolean).join(' · ')}
              </Text>
            </View>
          )}
        </View>
      </View>
      <View style={{ paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Ionicons name="location-outline" size={11} color={MUTED} />
        <Text style={{ flex: 1, fontFamily: 'DMSans_400Regular', fontSize: 11, color: MUTED }} numberOfLines={1}>
          {item.venue || '—'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Search Result Row ─────────────────────────────────────────────────────────

function SearchResultRow({ item, onPress }: { item: EventCard; onPress: () => void }): React.JSX.Element {
  const img = resolveImage(item.imageUrl, item.category);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: SURFACE, borderRadius: 18, padding: 12, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2 }}
    >
      <View style={{ width: 60, height: 60, borderRadius: 14, overflow: 'hidden', backgroundColor: BORDER }}>
        <Image source={{ uri: img }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: FG }} numberOfLines={1}>{item.title}</Text>
        {item.venue ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
            <Ionicons name="location-outline" size={11} color={MUTED} />
            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: MUTED }} numberOfLines={1}>{item.venue}</Text>
          </View>
        ) : null}
        <View style={{ marginTop: 5, alignSelf: 'flex-start', backgroundColor: '#f1eefb', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
          <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 10, color: BRAND_FROM, textTransform: 'capitalize' }}>{item.category}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={MUTED} />
    </TouchableOpacity>
  );
}
