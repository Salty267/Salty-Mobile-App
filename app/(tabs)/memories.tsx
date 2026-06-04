import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image, Dimensions, Modal,
  Share, ActivityIndicator, Animated, StyleSheet, Alert,
  LayoutAnimation, UIManager, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useBottomPad } from '@/lib/useBottomPad';
import { scale, scaleFont, sp } from '@/lib/layout';
import { useSidebar } from '@/lib/SidebarContext';
import { supabase } from '@/lib/supabase/client';
import { parseEventDate, isEventPast } from '@/lib/parseEventDate';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
const LA = () => LayoutAnimation.configureNext({
  duration: 220,
  create: { type: 'easeInEaseOut', property: 'opacity' },
  update: { type: 'easeInEaseOut' },
  delete: { type: 'easeInEaseOut', property: 'opacity' },
});

/* ─── constants ─────────────────────────────────────────────────── */
const { width: SCREEN_W }  = Dimensions.get('window');
const CONTENT_W            = SCREEN_W - 40;
const MOSAIC_H             = Math.round(CONTENT_W * 0.64);
const MEMORY_CARD_IMG_H    = Math.round(CONTENT_W * 0.54);

const BRAND_FROM = '#4f6cf2';
const BRAND_TO   = '#a25cf2';
const FG         = '#1a1530';
const MUTED      = '#6b6a85';
const SURFACE    = '#ffffff';
const BG         = '#eef0fb';
const BORDER     = '#e6e4f0';

const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const LONG_MONTHS  = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];

const CATEGORY_MOOD: Record<string, string> = {
  concert: '🎵', sports: '🏆', theater: '🎭',
  dining: '🍽️', festival: '🎉', trip: '✈️', other: '⭐',
};

const absoluteFill = { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 };

/* ─── types ─────────────────────────────────────────────────────── */
type TicketRow = {
  id: string; title: string; venue_name: string; date_str: string;
  time_str: string | null; category: string; image_url: string; tint: string | null;
};

type Memory = {
  id: string; title: string; venue: string; date: string; mood: string;
  photos: number; image: string; caption: string;
  attendeeAvatars: (string | null)[]; month: string;
  // navigation params
  time: string; category: string; tint: string; date_str: string;
};

/* ─── main screen ───────────────────────────────────────────────── */
export default function MemoriesScreen(): React.JSX.Element {
  const { openSidebar } = useSidebar();
  const router = useRouter();
  const bottomPad = useBottomPad();

  const [loading,         setLoading]         = useState(true);
  const [activeReel,      setActiveReel]      = useState<TicketRow | null>(null);
  const [timeline,        setTimeline]        = useState<{ month: string; data: Memory[] }[]>([]);
  const [reelTickets,     setReelTickets]     = useState<TicketRow[]>([]);
  const [mosaicTickets,   setMosaicTickets]   = useState<TicketRow[]>([]);
  const [totalPhotos,     setTotalPhotos]     = useState(0);
  const [allPhotos,       setAllPhotos]       = useState<{ url: string; ticketId: string }[]>([]);
  const [onThisDay,       setOnThisDay]       = useState<{ ticket: TicketRow; label: string } | null>(null);
  const [monthChips,      setMonthChips]      = useState<string[]>(['All']);
  const [activeChip,      setActiveChip]      = useState('All');
  const [userId,          setUserId]          = useState<string | null>(null);
  const [uploadingId,     setUploadingId]     = useState<string | null>(null);

  /* ── load ── */
  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) { setLoading(false); return; }
      if (active) setUserId(user.id);

      const { data: ticketRows } = await supabase
        .from('tickets')
        .select('id, title, venue_name, date_str, time_str, category, image_url, tint')
        .eq('user_id', user.id)
        .neq('status', 'archived');

      if (!ticketRows?.length || !active) { setLoading(false); return; }

      const past = ticketRows.filter(t => isEventPast(t.date_str));
      if (!active) return;

      const ticketIds = past.map(t => t.id);

      const [photosRes, notesRes, attendeesRes] = await Promise.all([
        ticketIds.length > 0
          ? supabase.from('photos').select('id, ticket_id, storage_url').in('ticket_id', ticketIds)
          : Promise.resolve({ data: [] }),
        ticketIds.length > 0
          ? supabase.from('ticket_notes').select('ticket_id, text').in('ticket_id', ticketIds).order('created_at', { ascending: true })
          : Promise.resolve({ data: [] }),
        ticketIds.length > 0
          ? supabase.from('ticket_attendees').select('ticket_id, users(display_name, avatar_url)').in('ticket_id', ticketIds)
          : Promise.resolve({ data: [] }),
      ]);

      if (!active) return;

      /* build lookup maps */
      const photosByTicket = new Map<string, { url: string; ticketId: string }[]>();
      for (const p of (photosRes.data ?? [])) {
        const arr = photosByTicket.get(p.ticket_id) ?? [];
        arr.push({ url: p.storage_url, ticketId: p.ticket_id });
        photosByTicket.set(p.ticket_id, arr);
      }

      const firstNoteByTicket = new Map<string, string>();
      for (const n of (notesRes.data ?? [])) {
        if (!firstNoteByTicket.has(n.ticket_id)) firstNoteByTicket.set(n.ticket_id, n.text);
      }

      const avatarsByTicket = new Map<string, (string | null)[]>();
      for (const a of (attendeesRes.data ?? [])) {
        const arr = avatarsByTicket.get(a.ticket_id) ?? [];
        arr.push((a.users as any)?.avatar_url ?? null);
        avatarsByTicket.set(a.ticket_id, arr);
      }

      /* sort past tickets newest first */
      const sortedPast = [...past].sort((a, b) => {
        const da = parseEventDate(a.date_str)?.getTime() ?? 0;
        const db = parseEventDate(b.date_str)?.getTime() ?? 0;
        return db - da;
      });

      /* build Memory objects */
      const toMemory = (t: TicketRow): Memory => {
        const d        = parseEventDate(t.date_str);
        const month    = d ? SHORT_MONTHS[d.getMonth()] : '?';
        const dateLabel = d ? `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}` : t.date_str;
        const photos   = photosByTicket.get(t.id) ?? [];
        const avatars  = avatarsByTicket.get(t.id) ?? [];
        return {
          id: t.id, title: t.title, venue: t.venue_name, date: dateLabel,
          mood: CATEGORY_MOOD[t.category] ?? '⭐',
          photos: photos.length, image: t.image_url,
          caption: firstNoteByTicket.get(t.id) ?? '',
          attendeeAvatars: avatars, month,
          time: t.time_str ?? '', category: t.category,
          tint: t.tint ?? '#b0b8e0', date_str: t.date_str,
        };
      };

      /* timeline grouped by month */
      const grouped = new Map<string, Memory[]>();
      for (const t of sortedPast) {
        const d = parseEventDate(t.date_str);
        const key = d ? `${LONG_MONTHS[d.getMonth()]} ${d.getFullYear()}` : 'PAST EVENTS';
        const arr = grouped.get(key) ?? [];
        arr.push(toMemory(t));
        grouped.set(key, arr);
      }
      const timelineGroups = Array.from(grouped.entries()).map(([month, data]) => ({ month, data }));

      /* month chips from actual months */
      const chipSet = new Set(sortedPast.map(t => {
        const d = parseEventDate(t.date_str);
        return d ? SHORT_MONTHS[d.getMonth()] : null;
      }).filter(Boolean) as string[]);
      const chips = ['All', ...Array.from(chipSet)];

      /* on this day */
      const today = new Date();
      const onThisDayTicket = ticketRows.find(t => {
        const d = parseEventDate(t.date_str);
        if (!d) return false;
        return d.getMonth() === today.getMonth() && d.getDate() === today.getDate()
          && d.getFullYear() < today.getFullYear();
      });
      const onThisDayLabel = onThisDayTicket
        ? `${today.getFullYear() - (parseEventDate(onThisDayTicket.date_str)?.getFullYear() ?? today.getFullYear())} year${today.getFullYear() - (parseEventDate(onThisDayTicket.date_str)?.getFullYear() ?? today.getFullYear()) !== 1 ? 's' : ''} ago`
        : null;

      /* all photos flat list */
      const flatPhotos = Array.from(photosByTicket.values()).flat();

      setTimeline(timelineGroups);
      setReelTickets(sortedPast.slice(0, 5));
      setMosaicTickets(sortedPast.slice(0, 4));
      setTotalPhotos(flatPhotos.length);
      setAllPhotos(flatPhotos);
      setMonthChips(chips);
      setOnThisDay(onThisDayTicket && onThisDayLabel ? { ticket: onThisDayTicket, label: onThisDayLabel } : null);
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, []);

  const handlePhotoUpload = async (ticketId: string) => {
    if (!userId) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.8, base64: true,
    });
    if (result.canceled) return;
    setUploadingId(ticketId);
    for (const asset of result.assets) {
      try {
        if (!asset.base64) continue;
        const mime = asset.mimeType ?? 'image/jpeg';
        const contentType = (mime === 'image/heic' || mime === 'image/heif') ? 'image/jpeg' : mime;
        const ext  = contentType.split('/')[1] ?? 'jpg';
        const path = `${userId}/${ticketId}/${Date.now()}.${ext}`;
        const raw   = atob(asset.base64);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        const { error: upErr } = await supabase.storage
          .from('ticket-photos').upload(path, bytes, { contentType });
        if (upErr) throw upErr;
        const { data: { publicUrl } } = supabase.storage.from('ticket-photos').getPublicUrl(path);
        await supabase.from('photos').insert({
          ticket_id: ticketId, user_id: userId, storage_url: publicUrl, match_method: 'manual',
        });
        const newPhoto = { url: publicUrl, ticketId };
        setAllPhotos(prev => [newPhoto, ...prev]);
        setTotalPhotos(prev => prev + 1);
        setTimeline(prev => prev.map(group => ({
          ...group,
          data: group.data.map(m => m.id === ticketId ? { ...m, photos: m.photos + 1 } : m),
        })));
      } catch {
        Alert.alert('Upload failed', 'Could not upload one or more photos.');
      }
    }
    setUploadingId(null);
  };

  const reelImages = activeReel
    ? (() => {
        const photos = allPhotos.filter(p => p.ticketId === activeReel.id).map(p => p.url);
        return photos.length > 0 ? photos : [activeReel.image_url];
      })()
    : [];

  const filteredTimeline = activeChip === 'All'
    ? timeline
    : timeline.filter(g => g.data.some(m => m.month === activeChip));

  /* mosaic images: prefer real photos, fall back to ticket covers */
  const mosaicImages = allPhotos.length >= 4
    ? allPhotos.slice(0, 4).map(p => p.url)
    : [
        mosaicTickets[0]?.image_url,
        mosaicTickets[1]?.image_url ?? mosaicTickets[0]?.image_url,
        mosaicTickets[2]?.image_url ?? mosaicTickets[0]?.image_url,
        mosaicTickets[3]?.image_url ?? mosaicTickets[0]?.image_url,
      ].filter(Boolean) as string[];

  const hasPastEvents = timeline.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>

      {/* ── Gradient Header ── */}
      <LinearGradient
        colors={[BRAND_FROM, BRAND_TO]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ borderBottomLeftRadius: scale(32), borderBottomRightRadius: scale(32), paddingBottom: sp(20) }}
      >
        <SafeAreaView edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: sp(20), paddingTop: 4, paddingBottom: sp(16) }}>
            <TouchableOpacity onPress={openSidebar} style={{ width: scale(40), height: scale(40), borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="menu" size={20} color="#fff" />
            </TouchableOpacity>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(12), color: 'rgba(255,255,255,0.72)' }}>Your history</Text>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(24), color: '#fff', letterSpacing: -0.4, marginTop: 2 }}>Memories</Text>
            </View>
            <TouchableOpacity
              onPress={() => router.push('/ask')}
              style={{ width: scale(40), height: scale(40), borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="sparkles-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* On This Day banner */}
          {onThisDay ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(12), marginHorizontal: sp(20), padding: sp(14), borderRadius: scale(18), backgroundColor: 'rgba(255,255,255,0.16)' }}>
              <View style={{ width: scale(44), height: scale(44), borderRadius: scale(14), backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Ionicons name="sparkles" size={20} color="#fff" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: scaleFont(10), color: 'rgba(255,255,255,0.85)', letterSpacing: 1, textTransform: 'uppercase' }}>
                  On this day · {onThisDay.label}
                </Text>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(14), color: '#fff', marginTop: 2 }} numberOfLines={1}>
                  {onThisDay.ticket.title}
                </Text>
              </View>
              <TouchableOpacity style={{ paddingHorizontal: sp(12), paddingVertical: sp(6), borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.95)' }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(11), color: FG }}>View</Text>
              </TouchableOpacity>
            </View>
          ) : hasPastEvents ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(12), marginHorizontal: sp(20), padding: sp(14), borderRadius: scale(18), backgroundColor: 'rgba(255,255,255,0.16)' }}>
              <View style={{ width: scale(44), height: scale(44), borderRadius: scale(14), backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Ionicons name="heart" size={20} color="#fff" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: scaleFont(10), color: 'rgba(255,255,255,0.85)', letterSpacing: 1, textTransform: 'uppercase' }}>
                  Latest memory
                </Text>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(14), color: '#fff', marginTop: 2 }} numberOfLines={1}>
                  {timeline[0]?.data[0]?.title}
                </Text>
              </View>
            </View>
          ) : null}
        </SafeAreaView>
      </LinearGradient>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={BRAND_FROM} />
        </View>
      ) : !hasPastEvents ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: sp(40) }}>
          <Ionicons name="heart-outline" size={48} color={MUTED} style={{ marginBottom: sp(16) }} />
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(18), color: FG, textAlign: 'center' }}>No memories yet</Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(14), color: MUTED, textAlign: 'center', marginTop: sp(8) }}>
            Your past events will show up here after they happen.
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/tickets')}
            activeOpacity={0.85}
            style={{ marginTop: sp(20), overflow: 'hidden', borderRadius: scale(14) }}
          >
            <LinearGradient
              colors={[BRAND_FROM, BRAND_TO]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: sp(8), paddingHorizontal: sp(22), paddingVertical: sp(12) }}
            >
              <Ionicons name="ticket-outline" size={15} color="#fff" />
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(14), color: '#fff' }}>Import your first ticket</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad }}>

          {/* ── Recap Reels ── */}
          {reelTickets.length > 0 && (
            <View style={{ marginTop: sp(24) }}>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(16), color: FG, letterSpacing: -0.2, marginBottom: sp(14), paddingHorizontal: sp(20) }}>Recap reels</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: sp(20), gap: sp(14) }}>
                {reelTickets.map((t, i) => {
                  const d = parseEventDate(t.date_str);
                  const sub = d ? `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}` : t.date_str;
                  const label = t.title.split(' ')[0];
                  return (
                    <ReelItem
                      key={t.id}
                      label={label}
                      sub={sub}
                      image={t.image_url}
                      isYou={i === 0}
                      onPress={() => setActiveReel(t)}
                    />
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* ── Featured Moments ── */}
          {mosaicImages.length > 0 && (
            <View style={{ marginTop: sp(28), paddingHorizontal: sp(20) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: sp(14) }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(16), color: FG, letterSpacing: -0.2 }}>Featured moments</Text>
                <TouchableOpacity>
                  <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: scaleFont(12), color: BRAND_FROM }}>
                    {totalPhotos > 0 ? `${totalPhotos} photo${totalPhotos !== 1 ? 's' : ''}` : 'All events'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', height: MOSAIC_H, gap: 8 }}>
                {/* Left: tall tile */}
                <View style={{ flex: 1, borderRadius: scale(18), overflow: 'hidden' }}>
                  {mosaicImages[0] && <Image source={{ uri: mosaicImages[0] }} style={absoluteFill} resizeMode="cover" />}
                  <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 90 }} />
                  {mosaicTickets[0] && (
                    <View style={{ position: 'absolute', bottom: 10, left: 10, right: 10 }}>
                      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(11), color: '#fff' }} numberOfLines={1}>
                        {mosaicTickets[0].title}
                      </Text>
                      {totalPhotos > 0 && (
                        <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(10), color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>
                          {(allPhotos.filter(p => p.ticketId === mosaicTickets[0]?.id).length)} photos
                        </Text>
                      )}
                    </View>
                  )}
                </View>

                {/* Right: 2 rows */}
                <View style={{ flex: 2, gap: 8 }}>
                  <View style={{ flex: 1, flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1, borderRadius: scale(18), overflow: 'hidden', backgroundColor: BG }}>
                      {mosaicImages[1] && <Image source={{ uri: mosaicImages[1] }} style={absoluteFill} resizeMode="cover" />}
                    </View>
                    <View style={{ flex: 1, borderRadius: scale(18), overflow: 'hidden', backgroundColor: BG }}>
                      {mosaicImages[2] && <Image source={{ uri: mosaicImages[2] }} style={absoluteFill} resizeMode="cover" />}
                    </View>
                  </View>
                  {/* Bottom: count tile */}
                  <View style={{ flex: 1, borderRadius: scale(18), overflow: 'hidden', backgroundColor: BG }}>
                    {mosaicImages[3] && <Image source={{ uri: mosaicImages[3] }} style={absoluteFill} resizeMode="cover" />}
                    <View style={{ ...absoluteFill, backgroundColor: 'rgba(0,0,0,0.42)' }} />
                    <View style={{ ...absoluteFill, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(22), color: '#fff', lineHeight: 24 }}>
                        {totalPhotos > 0 ? `+${totalPhotos}` : `${timeline.reduce((s, g) => s + g.data.length, 0)}`}
                      </Text>
                      <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(11), color: 'rgba(255,255,255,0.9)', marginTop: 3 }}>
                        {totalPhotos > 0 ? 'photos' : 'events'}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* ── Memory Timeline ── */}
          <View style={{ marginTop: sp(28), paddingHorizontal: sp(20) }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(16), color: FG, letterSpacing: -0.2, marginBottom: sp(14) }}>Memory timeline</Text>

            {/* Filter chips */}
            {monthChips.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: sp(8), paddingBottom: 2 }} style={{ marginBottom: sp(20) }}>
                {monthChips.map(chip => (
                  <TouchableOpacity
                    key={chip}
                    onPress={() => { LA(); setActiveChip(chip); }}
                    activeOpacity={0.8}
                    style={{ overflow: 'hidden', borderRadius: 999 }}
                  >
                    {chip === activeChip ? (
                      <LinearGradient colors={[BRAND_FROM, BRAND_TO]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: scale(36), paddingHorizontal: sp(18), justifyContent: 'center' }}>
                        <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(12), color: '#fff' }}>{chip}</Text>
                      </LinearGradient>
                    ) : (
                      <View style={{ height: scale(36), paddingHorizontal: sp(18), justifyContent: 'center', backgroundColor: SURFACE, borderRadius: 999, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 2 }}>
                        <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(12), color: FG }}>{chip}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {filteredTimeline.length === 0 ? (
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(14), color: MUTED, textAlign: 'center', paddingVertical: sp(24) }}>
                No events in {activeChip}.
              </Text>
            ) : (
              filteredTimeline.map((group, gi) => (
                <View key={group.month}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(10), marginBottom: sp(14), marginTop: gi > 0 ? sp(24) : 0 }}>
                    <Ionicons name="calendar-outline" size={13} color={MUTED} />
                    <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(11), color: MUTED, letterSpacing: 1 }}>{group.month}</Text>
                    <View style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
                  </View>
                  {group.data.map(memory => (
                    <MemoryCard
                      key={memory.id}
                      memory={memory}
                      onPhotoUpload={() => handlePhotoUpload(memory.id)}
                      uploading={uploadingId === memory.id}
                    />
                  ))}
                </View>
              ))
            )}
          </View>

        </ScrollView>
      )}
      <ReelViewer
        key={activeReel?.id ?? 'none'}
        visible={activeReel !== null}
        ticket={activeReel}
        images={reelImages}
        onClose={() => setActiveReel(null)}
      />
    </View>
  );
}

/* ─── Reel Item ─────────────────────────────────────────────────── */
function ReelItem({ label, sub, image, isYou, onPress }: { label: string; sub: string; image: string; isYou?: boolean; onPress?: () => void }): React.JSX.Element {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ alignItems: 'center', gap: 6, width: scale(64) }}>
      <LinearGradient colors={[BRAND_FROM, BRAND_TO]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: scale(68), height: scale(68), borderRadius: scale(34), padding: 2.5 }}>
        <View style={{ flex: 1, borderRadius: scale(31), overflow: 'hidden', borderWidth: 2, borderColor: SURFACE }}>
          <Image source={{ uri: image }} style={{ flex: 1 }} resizeMode="cover" />
          <View style={{ ...{ position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 }, backgroundColor: 'rgba(0,0,0,0.22)' }} />
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="play" size={14} color="#fff" />
          </View>
        </View>
      </LinearGradient>
      {isYou && (
        <View style={{ position: 'absolute', top: scale(46), right: 0, width: scale(20), height: scale(20), borderRadius: scale(10), backgroundColor: BRAND_FROM, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: BG }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(12), color: '#fff', lineHeight: 14 }}>+</Text>
        </View>
      )}
      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(11), color: FG, textAlign: 'center' }} numberOfLines={1}>{label}</Text>
      <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(10), color: MUTED, textAlign: 'center', marginTop: -4 }}>{sub}</Text>
    </TouchableOpacity>
  );
}

/* ─── Reel Viewer ───────────────────────────────────────────────── */
function ReelViewer({
  visible, ticket, images, onClose,
}: {
  visible: boolean;
  ticket: TicketRow | null;
  images: string[];
  onClose: () => void;
}): React.JSX.Element {
  const [index, setIndex] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;
  const animRef  = useRef<Animated.CompositeAnimation | null>(null);

  /* restart animation whenever the slide changes */
  useEffect(() => {
    if (!visible || images.length === 0) return;
    progress.setValue(0);
    animRef.current?.stop();
    animRef.current = Animated.timing(progress, {
      toValue: 1, duration: 4000, useNativeDriver: false,
    });
    animRef.current.start(({ finished }) => {
      if (finished) setIndex(prev => prev + 1);
    });
    return () => animRef.current?.stop();
  }, [visible, index, images.length]);

  /* close when we pass the last slide */
  useEffect(() => {
    if (visible && images.length > 0 && index >= images.length) onClose();
  }, [index, images.length, visible, onClose]);

  const goNext = () => {
    animRef.current?.stop();
    setIndex(i => i + 1);
  };
  const goPrev = () => {
    animRef.current?.stop();
    setIndex(i => Math.max(0, i - 1));
  };

  if (!ticket) return <></>;
  const safeIndex = Math.min(index, images.length - 1);

  return (
    <Modal visible={visible} transparent={false} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>

        {/* Background */}
        <Image source={{ uri: images[safeIndex] }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.18)' }]} />
        <LinearGradient colors={['rgba(0,0,0,0.55)', 'transparent']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 180 }} />

        {/* Header */}
        <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
          {/* Progress bars */}
          <View style={{ flexDirection: 'row', gap: 3, paddingHorizontal: sp(12), paddingTop: sp(10), paddingBottom: sp(10) }}>
            {images.map((_, i) => (
              <View key={i} style={{ flex: 1, height: 2.5, backgroundColor: 'rgba(255,255,255,0.35)', borderRadius: 2, overflow: 'hidden' }}>
                {i < index && <View style={{ flex: 1, backgroundColor: '#fff' }} />}
                {i === index && (
                  <Animated.View style={{
                    height: '100%', backgroundColor: '#fff',
                    width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                  }} />
                )}
              </View>
            ))}
          </View>

          {/* Ticket info + close */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: sp(14), paddingBottom: sp(8) }}>
            <Image source={{ uri: ticket.image_url }} style={{ width: scale(38), height: scale(38), borderRadius: scale(19), borderWidth: 2, borderColor: 'rgba(255,255,255,0.75)' }} />
            <View style={{ flex: 1, marginLeft: sp(10) }}>
              <Text style={{ color: '#fff', fontFamily: 'DMSans_700Bold', fontSize: scaleFont(14), letterSpacing: -0.2 }} numberOfLines={1}>
                {ticket.title}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontFamily: 'DMSans_400Regular', fontSize: scaleFont(11), marginTop: 1 }}>
                {ticket.date_str}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ width: scale(36), height: scale(36), alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        {/* Tap zones: left 35% = prev, right 65% = next */}
        <TouchableOpacity style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: '35%' }} onPress={goPrev} activeOpacity={1} />
        <TouchableOpacity style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '65%' }} onPress={goNext} activeOpacity={1} />

        {/* Bottom info */}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingTop: sp(60), paddingBottom: sp(52), paddingHorizontal: sp(22) }}>
          <Text style={{ color: '#fff', fontFamily: 'DMSans_700Bold', fontSize: scaleFont(22), letterSpacing: -0.4 }} numberOfLines={2}>
            {ticket.title}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.72)', fontFamily: 'DMSans_400Regular', fontSize: scaleFont(13), marginTop: 5 }}>
            📍 {ticket.venue_name}
          </Text>
          {images.length > 1 && (
            <Text style={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'DMSans_500Medium', fontSize: scaleFont(11), marginTop: sp(8) }}>
              {safeIndex + 1} / {images.length}
            </Text>
          )}
        </LinearGradient>

      </View>
    </Modal>
  );
}

/* ─── Memory Card ───────────────────────────────────────────────── */
function MemoryCard({ memory, onPhotoUpload, uploading }: {
  memory: Memory;
  onPhotoUpload: () => void;
  uploading: boolean;
}): React.JSX.Element {
  const router = useRouter();

  const navToDetails = () => {
    router.push({
      pathname: '/event-details',
      params: {
        id: memory.id, title: memory.title, venue: memory.venue,
        date: memory.date_str, time: memory.time,
        category: memory.category, image: memory.image, tint: memory.tint,
      },
    });
  };

  const handleShare = () => {
    Share.share({ title: memory.title, message: `${memory.title}\n${memory.venue}\n${memory.date}` });
  };

  return (
    <TouchableOpacity activeOpacity={0.95} onPress={navToDetails} style={{ backgroundColor: SURFACE, borderRadius: scale(24), overflow: 'hidden', shadowColor: '#503cb4', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 20, elevation: 4, marginBottom: sp(16) }}>

      {/* Cover */}
      <View style={{ height: MEMORY_CARD_IMG_H }}>
        <Image source={{ uri: memory.image }} style={absoluteFill} resizeMode="cover" />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.68)']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: scale(100) }} />

        {memory.photos > 0 && (
          <View style={{ position: 'absolute', top: sp(12), left: sp(12), flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: sp(10), paddingVertical: sp(6), borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.42)' }}>
            <Ionicons name="camera-outline" size={12} color="#fff" />
            <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: scaleFont(11), color: '#fff' }}>{memory.photos}</Text>
          </View>
        )}

        <View style={{ position: 'absolute', top: sp(12), right: sp(12), width: scale(36), height: scale(36), borderRadius: scale(18), backgroundColor: 'rgba(0,0,0,0.42)', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: scaleFont(16) }}>{memory.mood}</Text>
        </View>

        <View style={{ position: 'absolute', bottom: sp(12), left: sp(12), right: sp(12) }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(16), color: '#fff', letterSpacing: -0.2 }} numberOfLines={1}>{memory.title}</Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(11), color: 'rgba(255,255,255,0.88)', marginTop: 3 }}>
            📍 {memory.venue} · {memory.date}
          </Text>
        </View>
      </View>

      {/* Body */}
      <View style={{ padding: sp(16) }}>
        {memory.caption ? (
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(14), color: FG, lineHeight: 20 }}>{memory.caption}</Text>
        ) : (
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(14), color: MUTED, lineHeight: 20, fontStyle: 'italic' }}>No notes yet — tap to add a memory.</Text>
        )}

        {/* Attendees */}
        {memory.attendeeAvatars.length > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(8), marginTop: sp(12) }}>
            <View style={{ flexDirection: 'row' }}>
              {memory.attendeeAvatars.slice(0, 4).map((uri, i) => (
                <View key={i} style={{ width: scale(26), height: scale(26), borderRadius: scale(13), overflow: 'hidden', borderWidth: 2, borderColor: SURFACE, marginLeft: i === 0 ? 0 : -8, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
                  {uri ? (
                    <Image source={{ uri }} style={{ flex: 1 }} resizeMode="cover" />
                  ) : (
                    <Ionicons name="person" size={12} color={MUTED} />
                  )}
                </View>
              ))}
            </View>
            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(11), color: MUTED }}>
              with {memory.attendeeAvatars.length} friend{memory.attendeeAvatars.length !== 1 ? 's' : ''}
            </Text>
          </View>
        )}

        {/* Actions */}
        <View style={{ flexDirection: 'row', marginTop: sp(14), paddingTop: sp(12), borderTopWidth: 1, borderTopColor: BORDER }}>
          {([
            { icon: 'musical-notes-outline' as const, label: 'Setlist', onPress: navToDetails },
            { icon: 'pencil-outline' as const,        label: 'Notes',   onPress: navToDetails },
            { icon: 'share-social-outline' as const,  label: 'Share',   onPress: handleShare  },
          ] as const).map(({ icon, label, onPress }) => (
            <TouchableOpacity key={label} onPress={onPress} activeOpacity={0.7} style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: sp(6), borderRadius: 10 }}>
              <Ionicons name={icon} size={16} color={MUTED} />
              <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: scaleFont(10), color: MUTED }}>{label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={onPhotoUpload}
            disabled={uploading}
            activeOpacity={0.7}
            style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: sp(6), borderRadius: 10 }}
          >
            {uploading
              ? <ActivityIndicator size="small" color={BRAND_FROM} />
              : <Ionicons name="camera-outline" size={16} color={MUTED} />
            }
            <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: scaleFont(10), color: uploading ? BRAND_FROM : MUTED }}>
              {uploading ? 'Uploading…' : 'Photos'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}
