import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image,
  ActivityIndicator, Linking, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SCREEN_W } from '@/lib/layout';
import { useBottomPad } from '@/lib/useBottomPad';
import { supabase } from '@/lib/supabase/client';

const BRAND_FROM = '#4f6cf2';
const BRAND_TO   = '#a25cf2';
const FG         = '#1a1530';
const MUTED      = '#6b6a85';
const SURFACE    = '#ffffff';
const BG         = '#eef0fb';
const BORDER     = '#e6e4f0';

const HERO_H = Math.round(SCREEN_W * 0.65);

const CATEGORY_COLORS: Record<string, [string, string]> = {
  concert:  ['#4f6cf2', '#a25cf2'],
  sports:   ['#059669', '#34d399'],
  theater:  ['#d97706', '#fbbf24'],
  festival: ['#9333ea', '#e879f9'],
  dining:   ['#ea580c', '#f97316'],
  trip:     ['#0284c7', '#22d3ee'],
  other:    ['#6b6a85', '#b0b8e0'],
};

type VenueDetail = {
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  lat: number | null;
  lng: number | null;
};

type PriceRange = { min: number; max: number; currency: string };

type Attraction = { name: string; imageUrl: string | null };

type EventDetail = {
  tmId:        string;
  title:       string;
  dateStr:     string;
  rawDate:     string;
  timeStr:     string;
  category:    string;
  genre:       string | null;
  subGenre:    string | null;
  imageUrl:    string | null;
  thumbUrl:    string | null;
  ticketUrl:   string | null;
  info:        string | null;
  priceRanges: PriceRange[];
  venue:       VenueDetail | null;
  attractions: Attraction[];
  status:      string | null;
};

const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=85';
const CATEGORY_FALLBACK: Record<string, string> = {
  concert:  'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800&q=85',
  festival: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=800&q=85',
  sports:   'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=800&q=85',
  theater:  'https://images.unsplash.com/photo-1585699324551-f6c309eedeca?w=800&q=85',
};

export default function DiscoverEventScreen(): React.JSX.Element {
  const router    = useRouter();
  const bottomPad = useBottomPad();
  const params    = useLocalSearchParams<{
    tmId:     string;
    title:    string;
    imageUrl: string;
    category: string;
    venue:    string;
    dateStr:  string;
    timeStr:  string;
  }>();

  const [event,   setEvent]   = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const heroImage = params.imageUrl
    || CATEGORY_FALLBACK[params.category]
    || DEFAULT_IMAGE;

  useEffect(() => {
    if (!params.tmId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const { data, error: fnErr } = await supabase.functions.invoke('event-details', {
        body: { tmId: params.tmId },
      });
      if (cancelled) return;
      if (fnErr || !data?.event) {
        setError(fnErr?.message ?? 'Failed to load event');
        setLoading(false);
        return;
      }
      setEvent(data.event as EventDetail);
      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [params.tmId]);

  const [gradFrom, gradTo] = CATEGORY_COLORS[event?.category ?? params.category] ?? [BRAND_FROM, BRAND_TO];

  const fullVenueAddress = event?.venue
    ? [event.venue.address, event.venue.city, event.venue.state, event.venue.postalCode]
        .filter(Boolean).join(', ')
    : null;

  const priceLabel = event?.priceRanges?.length
    ? (() => {
        const p = event.priceRanges[0];
        if (p.min === p.max) return `$${p.min}`;
        return `$${p.min} – $${p.max}`;
      })()
    : null;

  const openMaps = () => {
    if (!event?.venue) return;
    const query = encodeURIComponent(
      [event.venue.name, fullVenueAddress].filter(Boolean).join(', '),
    );
    const url = Platform.OS === 'ios'
      ? `maps://?q=${query}`
      : `geo:0,0?q=${query}`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://www.google.com/maps/search/?q=${query}`),
    );
  };

  const openTickets = () => {
    if (event?.ticketUrl) Linking.openURL(event.ticketUrl);
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad }}>

        {/* ── Hero ── */}
        <View style={{ height: HERO_H }}>
          <Image
            source={{ uri: event?.imageUrl ?? heroImage }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.38)', 'transparent']}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 120 }}
          />
          <LinearGradient
            colors={['transparent', 'rgba(14,10,36,0.82)']}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: HERO_H * 0.55 }}
          />

          {/* Back button */}
          <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 4 }}>
              <TouchableOpacity
                onPress={() => router.back()}
                style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="chevron-back" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </SafeAreaView>

          {/* Category + status badge */}
          <View style={{ position: 'absolute', top: 60, left: 20, flexDirection: 'row', gap: 8 }}>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 }}>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 10, color: FG, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {event?.genre ?? params.category}
              </Text>
            </View>
            {event?.status === 'onsale' && (
              <View style={{ backgroundColor: '#d1fae5', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 10, color: '#059669' }}>On Sale</Text>
              </View>
            )}
            {event?.status === 'offsale' && (
              <View style={{ backgroundColor: '#fdecea', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 10, color: '#e55' }}>Off Sale</Text>
              </View>
            )}
          </View>

          {/* Title block on image */}
          <View style={{ position: 'absolute', bottom: 20, left: 20, right: 20 }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 26, color: '#fff', letterSpacing: -0.5, lineHeight: 32 }} numberOfLines={3}>
              {event?.title ?? params.title}
            </Text>
          </View>
        </View>

        {/* ── Date / Time / Price strip ── */}
        <View style={{
          marginTop: -1, marginHorizontal: 20,
          backgroundColor: SURFACE, borderRadius: 24,
          flexDirection: 'row', paddingVertical: 16,
          shadowColor: '#503cb4', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.13, shadowRadius: 20, elevation: 6,
        }}>
          {([
            { icon: 'calendar-outline', label: 'Date',  value: event?.dateStr  || params.dateStr  || '—' },
            { icon: 'time-outline',     label: 'Time',  value: event?.timeStr  || params.timeStr  || '—' },
            { icon: 'pricetag-outline', label: 'Price', value: priceLabel ?? '—' },
          ] as const).map(({ icon, label, value }, i) => (
            <View key={label} style={{ flex: 1, alignItems: 'center', borderLeftWidth: i > 0 ? 1 : 0, borderLeftColor: BORDER, paddingHorizontal: 4 }}>
              <Ionicons name={icon} size={16} color={BRAND_FROM} />
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 11, color: FG, marginTop: 5, textAlign: 'center' }} numberOfLines={2}>{value}</Text>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 9, color: MUTED, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
            </View>
          ))}
        </View>

        {/* ── Get Tickets button ── */}
        {event?.ticketUrl && (
          <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
            <TouchableOpacity onPress={openTickets} activeOpacity={0.88} style={{ borderRadius: 18, overflow: 'hidden' }}>
              <LinearGradient
                colors={[gradFrom, gradTo]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 }}
              >
                <Ionicons name="ticket-outline" size={20} color="#fff" />
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: '#fff', letterSpacing: -0.2 }}>
                  Get Tickets
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {loading && (
          <View style={{ alignItems: 'center', paddingTop: 32 }}>
            <ActivityIndicator color={BRAND_FROM} />
          </View>
        )}

        {!loading && error && (
          <View style={{ paddingHorizontal: 20, paddingTop: 24, alignItems: 'center' }}>
            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: MUTED, textAlign: 'center' }}>{error}</Text>
          </View>
        )}

        {!loading && event && (
          <>
            {/* ── Venue ── */}
            {event.venue && (
              <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, marginBottom: 12, letterSpacing: -0.2 }}>Venue</Text>
                <TouchableOpacity
                  onPress={openMaps}
                  activeOpacity={0.88}
                  style={{ backgroundColor: SURFACE, borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 }}
                >
                  <LinearGradient
                    colors={[gradFrom, gradTo]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Ionicons name="location" size={22} color="#fff" />
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: FG }}>{event.venue.name}</Text>
                    {fullVenueAddress && (
                      <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: MUTED, marginTop: 2 }}>
                        {fullVenueAddress}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={MUTED} />
                </TouchableOpacity>
              </View>
            )}

            {/* ── Artists / Performers ── */}
            {event.attractions.length > 0 && (
              <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, marginBottom: 12, letterSpacing: -0.2 }}>
                  {event.attractions.length === 1 ? 'Performer' : 'Performers'}
                </Text>
                <View style={{ gap: 10 }}>
                  {event.attractions.map((a, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: SURFACE, borderRadius: 16, padding: 12, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 }}>
                      <View style={{ width: 44, height: 44, borderRadius: 12, overflow: 'hidden', backgroundColor: BORDER }}>
                        {a.imageUrl
                          ? <Image source={{ uri: a.imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                          : <LinearGradient colors={[gradFrom, gradTo]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                              <Ionicons name="musical-note" size={20} color="#fff" />
                            </LinearGradient>
                        }
                      </View>
                      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: FG, flex: 1 }}>{a.name}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* ── Info / Notes ── */}
            {event.info && (
              <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, marginBottom: 12, letterSpacing: -0.2 }}>Info</Text>
                <View style={{ backgroundColor: SURFACE, borderRadius: 20, padding: 16, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 10, elevation: 2 }}>
                  <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: FG, lineHeight: 20 }}>
                    {event.info}
                  </Text>
                </View>
              </View>
            )}
          </>
        )}

      </ScrollView>
    </View>
  );
}
