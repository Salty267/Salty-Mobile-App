import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image,
  Share, Alert, Modal, TextInput, KeyboardAvoidingView,
  Platform, Pressable, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { SCREEN_W } from '@/lib/layout';
import { useBottomPad } from '@/lib/useBottomPad';
import { useSavedEvents } from '@/lib/SavedEventsContext';
import { supabase } from '@/lib/supabase/client';
import type { AcceptedFriend } from '@/lib/useFriends';
import { useFollowedArtists } from '@/lib/useFollowedArtists';

/* ─────────── constants ─────────── */
const BRAND_FROM = '#4f6cf2';
const BRAND_TO   = '#a25cf2';
const FG         = '#1a1530';
const MUTED      = '#6b6a85';
const SURFACE    = '#ffffff';
const BG         = '#eef0fb';
const DANGER     = '#e63950';

const HERO_H     = Math.round(SCREEN_W * 0.56);
const MEDIA_GAP  = 4;
const MEDIA_CELL = Math.floor((SCREEN_W - 40 - MEDIA_GAP * 2) / 3);

/* ─────────── types ─────────── */
type AttendeeRow = {
  id: string;
  user_id: string;
  role: string;
  display_name: string | null;
  avatar_url: string | null;
};

type NoteRow = {
  id: string;
  user_id: string;
  text: string;
  created_at: string;
  display_name: string | null;
  avatar_url: string | null;
};

type TagRow  = { id: string; text: string };
type MediaRow = { id: string; url: string };
type SetlistSong = { song: string; era?: string; time?: string };

/* ─────────── fallback setlist ─────────── */
const MOCK_SETLIST: SetlistSong[] = [
  { song: 'Miss Americana & The Heartbreak Prince', era: 'Lover Era',    time: '7:32 PM' },
  { song: 'The Archer',                             era: 'Lover Era',    time: '7:36 PM' },
  { song: 'Lover',                                  era: 'Lover Era',    time: '7:40 PM' },
  { song: 'Cruel Summer',                           era: 'Lover Era',    time: '7:44 PM' },
  { song: 'All Too Well (10 Min Version)',          era: 'Red Era',      time: '7:52 PM' },
  { song: 'We Are Never Getting Back Together',     era: 'Red Era',      time: '8:02 PM' },
  { song: 'Love Story',                             era: 'Fearless Era', time: '8:06 PM' },
  { song: 'You Belong With Me',                     era: 'Fearless Era', time: '8:10 PM' },
];
const SETLIST_PREVIEW = 3;
const SETLIST_CATEGORIES = new Set(['concert', 'festival']);

/* ─────────── helpers ─────────── */
const timeAgo = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

/* ─────────── component ─────────── */
export default function EventDetailsScreen(): React.JSX.Element {
  const router   = useRouter();
  const params   = useLocalSearchParams<{
    id: string; title: string; subtitle?: string; venue: string;
    date: string; time: string; category: string; image: string;
    seat?: string; tint?: string;
  }>();
  const bottomPad = useBottomPad();
  const { saveEvent, unsaveEvent, isSaved } = useSavedEvents();
  const saved = isSaved(params.id);
  const { isFollowing, followArtist, unfollowArtist } = useFollowedArtists();

  /* ── auth ── */
  const [currentUserId,      setCurrentUserId]      = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<{ display_name: string | null; avatar_url: string | null } | null>(null);

  /* ── display fields (editable) ── */
  const [displayTitle, setDisplayTitle] = useState(params.title ?? '');
  const [displayVenue, setDisplayVenue] = useState(params.venue ?? '');
  const [displayDate,  setDisplayDate]  = useState(params.date  ?? '');
  const [displayTime,  setDisplayTime]  = useState(params.time  ?? '');
  const [displaySeat,  setDisplaySeat]  = useState(params.seat  ?? '');

  /* ── data ── */
  const [attendees,       setAttendees]       = useState<AttendeeRow[]>([]);
  const [tags,            setTags]            = useState<TagRow[]>([]);
  const [notes,           setNotes]           = useState<NoteRow[]>([]);
  const [media,           setMedia]           = useState<MediaRow[]>([]);
  const [setlistSongs,    setSetlistSongs]    = useState<SetlistSong[]>([]);
  const [setlistExpanded, setSetlistExpanded] = useState(false);
  const [dataLoading,     setDataLoading]     = useState(true);

  /* ── friends (lazy) ── */
  const [friends,        setFriends]        = useState<AcceptedFriend[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);

  /* ── modals ── */
  const [lightboxUri,        setLightboxUri]        = useState<string | null>(null);
  const [noteModalVisible,   setNoteModalVisible]   = useState(false);
  const [tagModalVisible,    setTagModalVisible]    = useState(false);
  const [editModalVisible,   setEditModalVisible]   = useState(false);
  const [attendeeModalVisible, setAttendeeModalVisible] = useState(false);
  const [editingNoteId,      setEditingNoteId]      = useState<string | null>(null);

  /* ── inputs ── */
  const [noteInput,  setNoteInput]  = useState('');
  const [tagInput,   setTagInput]   = useState('');
  const [editTitle,  setEditTitle]  = useState('');
  const [editVenue,  setEditVenue]  = useState('');
  const [editDate,   setEditDate]   = useState('');
  const [editTime,   setEditTime]   = useState('');
  const [editSeat,   setEditSeat]   = useState('');
  const [saving,     setSaving]     = useState(false);
  const [uploading,    setUploading]    = useState(false);
  const [mediaEditMode, setMediaEditMode] = useState(false);

  /* ────────── load all data ────────── */
  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) { setDataLoading(false); return; }
      setCurrentUserId(user.id);

      const [profileRes, ticketRes, attendeesRes, tagsRes, notesRes, mediaRes, setlistRes] = await Promise.all([
        supabase.from('users').select('display_name, avatar_url').eq('id', user.id).single(),
        supabase.from('tickets').select('title, venue_name, date_str, time_str, seat').eq('id', params.id).single(),
        supabase.from('ticket_attendees')
          .select('id, user_id, role, users(display_name, avatar_url)')
          .eq('ticket_id', params.id),
        supabase.from('ticket_tags')
          .select('id, tag_text')
          .eq('ticket_id', params.id)
          .eq('user_id', user.id),
        supabase.from('ticket_notes')
          .select('id, user_id, text, created_at, users(display_name, avatar_url)')
          .eq('ticket_id', params.id)
          .order('created_at', { ascending: true }),
        supabase.from('photos')
          .select('id, storage_url')
          .eq('ticket_id', params.id)
          .order('taken_at', { ascending: false }),
        supabase.from('setlists').select('songs').eq('ticket_id', params.id).maybeSingle(),
      ]);

      if (!active) return;

      if (profileRes.data) setCurrentUserProfile(profileRes.data);

      if (ticketRes.data) {
        const t = ticketRes.data;
        if (t.title)      setDisplayTitle(t.title);
        if (t.venue_name) setDisplayVenue(t.venue_name);
        if (t.date_str)   setDisplayDate(t.date_str);
        if (t.time_str)   setDisplayTime(t.time_str);
        setDisplaySeat(t.seat ?? '');
      }

      if (attendeesRes.data) {
        setAttendees(attendeesRes.data.map(r => ({
          id: r.id,
          user_id: r.user_id,
          role: r.role ?? 'tagged',
          display_name: (r.users as any)?.display_name ?? null,
          avatar_url:   (r.users as any)?.avatar_url   ?? null,
        })));
      }

      if (tagsRes.data) setTags(tagsRes.data.map(r => ({ id: r.id, text: r.tag_text })));

      if (notesRes.data) {
        setNotes(notesRes.data.map(r => ({
          id: r.id, user_id: r.user_id, text: r.text, created_at: r.created_at,
          display_name: (r.users as any)?.display_name ?? null,
          avatar_url:   (r.users as any)?.avatar_url   ?? null,
        })));
      }

      if (mediaRes.data) setMedia(mediaRes.data.map(r => ({ id: r.id, url: r.storage_url })));

      const songs = setlistRes.data?.songs;
      setSetlistSongs(Array.isArray(songs) && songs.length > 0 ? (songs as SetlistSong[]) : MOCK_SETLIST);

      setDataLoading(false);
    };
    load();
    return () => { active = false; };
  }, [params.id]);

  /* ────────── helpers ────────── */
  const loadFriends = async () => {
    if (friends.length > 0 || friendsLoading) return;
    setFriendsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setFriendsLoading(false); return; }
    const { data } = await supabase
      .from('friendships')
      .select(`
        id, requester_id, addressee_id,
        requester:users!friendships_requester_id_fkey(id,display_name,avatar_url,username),
        addressee:users!friendships_addressee_id_fkey(id,display_name,avatar_url,username)
      `)
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .eq('status', 'accepted');
    if (data) {
      setFriends(data.map(row => {
        const other = row.requester_id === user.id
          ? (row.addressee as any)
          : (row.requester as any);
        return { id: other.id, display_name: other.display_name, avatar_url: other.avatar_url, username: other.username, friendship_id: row.id, mutual_events: 0 };
      }));
    }
    setFriendsLoading(false);
  };

  /* ────────── handlers ────────── */
  const toggleSave = () => {
    if (saved) {
      unsaveEvent(params.id);
    } else {
      saveEvent({
        id: params.id, title: displayTitle, subtitle: params.subtitle,
        venue: displayVenue, date: displayDate, time: displayTime,
        category: params.category, image: params.image, tint: params.tint, seat: displaySeat || undefined,
      });
    }
  };

  const handleShare = () => {
    Share.share({ title: displayTitle, message: `${displayTitle}\n${displayVenue}\n${displayDate} • ${displayTime}` });
  };

  const handleShareLink = async () => {
    const url = Linking.createURL('/event-details', { queryParams: { id: params.id } });
    Share.share({ title: displayTitle, message: `${displayTitle} – ${url}`, url });
  };

  const submitReport = async (category: string) => {
    if (!currentUserId) return;
    await supabase.from('feedback').insert({
      user_id: currentUserId,
      category,
      message: `Event: ${displayTitle} (ticket_id: ${params.id})`,
    });
    Alert.alert('Report Submitted', 'Thanks for letting us know.');
  };

  const handleReport = () => {
    Alert.alert('Report Event', "What's the issue?", [
      { text: 'Incorrect Info',         onPress: () => submitReport('incorrect_info') },
      { text: 'Inappropriate Content',  onPress: () => submitReport('inappropriate') },
      { text: 'Spam',                   onPress: () => submitReport('spam') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleTopEllipsis = () => {
    Alert.alert('Event Options', undefined, [
      { text: 'Edit Event', onPress: () => {
        setEditTitle(displayTitle); setEditVenue(displayVenue);
        setEditDate(displayDate);   setEditTime(displayTime);
        setEditSeat(displaySeat);   setEditModalVisible(true);
      }},
      { text: 'Share Link', onPress: handleShareLink },
      { text: 'Report', style: 'destructive', onPress: handleReport },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleEditSave = async () => {
    if (!editTitle.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('tickets').update({
      title: editTitle.trim(), venue_name: editVenue.trim(),
      date_str: editDate.trim(), time_str: editTime.trim(),
      seat: editSeat.trim() || null,
    }).eq('id', params.id);
    setSaving(false);
    if (error) { Alert.alert('Save failed', 'Could not save your changes. Please try again.'); return; }
    setDisplayTitle(editTitle.trim()); setDisplayVenue(editVenue.trim());
    setDisplayDate(editDate.trim());   setDisplayTime(editTime.trim());
    setDisplaySeat(editSeat.trim());
    setEditModalVisible(false);
  };

  const handleDelete = () => {
    Alert.alert('Delete Event', 'Remove this event from your collection?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        unsaveEvent(params.id);
        await supabase.from('tickets').update({ status: 'archived' }).eq('id', params.id);
        router.back();
      }},
    ]);
  };

  /* attendees */
  const handleAddAttendee = async (friend: AcceptedFriend) => {
    if (!currentUserId || attendees.some(a => a.user_id === friend.id)) return;
    const tempId = `temp-${Date.now()}`;
    const tempRow: AttendeeRow = { id: tempId, user_id: friend.id, role: 'tagged', display_name: friend.display_name, avatar_url: friend.avatar_url };
    setAttendees(prev => [...prev, tempRow]);
    const { data, error } = await supabase.from('ticket_attendees')
      .insert({ ticket_id: params.id, user_id: friend.id, role: 'tagged', added_by: currentUserId })
      .select('id').single();
    if (data) setAttendees(prev => prev.map(a => a.id === tempId ? { ...a, id: data.id } : a));
    else if (error) setAttendees(prev => prev.filter(a => a.id !== tempId));
  };

  /* tags */
  const removeTag = async (tagId: string) => {
    setTags(prev => prev.filter(t => t.id !== tagId));
    await supabase.from('ticket_tags').delete().eq('id', tagId);
  };

  const submitTag = async () => {
    const trimmed = tagInput.trim();
    if (!trimmed || !currentUserId) return;
    if (tags.some(t => t.text.toLowerCase() === trimmed.toLowerCase())) { setTagModalVisible(false); return; }
    const tempId = `temp-${Date.now()}`;
    setTags(prev => [...prev, { id: tempId, text: trimmed }]);
    setTagInput(''); setTagModalVisible(false);
    const { data, error } = await supabase.from('ticket_tags')
      .insert({ ticket_id: params.id, user_id: currentUserId, tag_text: trimmed })
      .select('id').single();
    if (data) setTags(prev => prev.map(t => t.id === tempId ? { ...t, id: data.id } : t));
    else if (error) setTags(prev => prev.filter(t => t.id !== tempId));
  };

  /* media */
  const deleteMedia = async (item: MediaRow) => {
    setMedia(prev => prev.filter(m => m.id !== item.id));
    const marker = '/ticket-photos/';
    const idx = item.url.indexOf(marker);
    const path = idx >= 0 ? item.url.slice(idx + marker.length) : null;
    if (path) await supabase.storage.from('ticket-photos').remove([path]);
    await supabase.from('photos').delete().eq('id', item.id);
  };

  const pickMedia = async () => {
    if (!currentUserId) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.8, base64: true,
    });
    if (result.canceled) return;
    setUploading(true);
    for (const asset of result.assets) {
      try {
        if (!asset.base64) continue;
        const mime = asset.mimeType ?? 'image/jpeg';
        // HEIC isn't renderable cross-platform — treat as JPEG for storage/display
        const contentType = (mime === 'image/heic' || mime === 'image/heif') ? 'image/jpeg' : mime;
        const ext  = contentType.split('/')[1] ?? 'jpg';
        const path = `${currentUserId}/${params.id}/${Date.now()}.${ext}`;
        // base64 → Uint8Array (reliable in React Native; fetch+blob produces empty uploads)
        const raw   = atob(asset.base64);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        const { error: upErr } = await supabase.storage
          .from('ticket-photos').upload(path, bytes, { contentType });
        if (upErr) throw upErr;
        const { data: { publicUrl } } = supabase.storage.from('ticket-photos').getPublicUrl(path);
        const { data: row } = await supabase.from('photos')
          .insert({ ticket_id: params.id, user_id: currentUserId, storage_url: publicUrl, match_method: 'manual' })
          .select('id').single();
        if (row) setMedia(prev => [{ id: row.id, url: publicUrl }, ...prev]);
      } catch {
        Alert.alert('Upload failed', 'Could not upload one or more photos.');
      }
    }
    setUploading(false);
  };

  /* notes */
  const openNoteModal = (note?: NoteRow) => {
    setEditingNoteId(note?.id ?? null);
    setNoteInput(note?.text ?? '');
    setNoteModalVisible(true);
  };

  const submitNote = async () => {
    const trimmed = noteInput.trim();
    if (!trimmed || !currentUserId) return;
    if (editingNoteId) {
      setNotes(prev => prev.map(n => n.id === editingNoteId ? { ...n, text: trimmed } : n));
      setNoteModalVisible(false);
      await supabase.from('ticket_notes')
        .update({ text: trimmed, updated_at: new Date().toISOString() })
        .eq('id', editingNoteId);
    } else {
      const tempNote: NoteRow = {
        id: `temp-${Date.now()}`, user_id: currentUserId, text: trimmed,
        created_at: new Date().toISOString(),
        display_name: currentUserProfile?.display_name ?? null,
        avatar_url:   currentUserProfile?.avatar_url   ?? null,
      };
      setNotes(prev => [...prev, tempNote]);
      setNoteModalVisible(false);
      const { data, error } = await supabase.from('ticket_notes')
        .insert({ ticket_id: params.id, user_id: currentUserId, text: trimmed })
        .select('id').single();
      if (data) setNotes(prev => prev.map(n => n.id === tempNote.id ? { ...n, id: data.id } : n));
      else if (error) setNotes(prev => prev.filter(n => n.id !== tempNote.id));
    }
  };

  const handleNoteEllipsis = (note: NoteRow) => {
    Alert.alert('Note Options', undefined, [
      { text: 'Edit',   onPress: () => openNoteModal(note) },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setNotes(prev => prev.filter(n => n.id !== note.id));
        await supabase.from('ticket_notes').delete().eq('id', note.id);
      }},
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const visibleSetlist = setlistExpanded ? setlistSongs : setlistSongs.slice(0, SETLIST_PREVIEW);

  /* ─────────── render ─────────── */
  return (
    <View style={{ flex: 1, backgroundColor: SURFACE }}>

      {/* ── Header ── */}
      <LinearGradient colors={[BRAND_FROM, BRAND_TO]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <SafeAreaView edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14 }}>
            <TouchableOpacity onPress={() => router.back()} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 17, color: '#fff', letterSpacing: -0.2 }}>
              Event Details
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity onPress={toggleSave} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={saved ? 'heart' : 'heart-outline'} size={22} color={saved ? '#ff6b8a' : '#fff'} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleTopEllipsis} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad }}>

        {/* ── Hero Image ── */}
        <TouchableOpacity activeOpacity={0.95} onPress={() => setLightboxUri(params.image)}>
          <Image source={{ uri: params.image }} style={{ width: SCREEN_W, height: HERO_H }} resizeMode="cover" />
        </TouchableOpacity>

        {/* ── Event Info ── */}
        <View style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 18 }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 22, color: FG, letterSpacing: -0.4 }}>
            {displayTitle}
          </Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 14, color: MUTED, marginTop: 5 }}>
            {displayVenue}
          </Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 14, color: MUTED, marginTop: 3 }}>
            {displayDate} • {displayTime}
          </Text>
          {displaySeat ? (
            <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 13, color: BRAND_FROM, marginTop: 5 }}>
              {displaySeat}
            </Text>
          ) : null}
        </View>

        <Divider />

        {/* ── Attendees ── */}
        <View style={{ paddingHorizontal: 20, paddingVertical: 18 }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 15, color: FG, marginBottom: 14 }}>
            Attendees{attendees.length > 0 ? ` (${attendees.length})` : ''}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {/* current user always first */}
            {currentUserProfile?.avatar_url ? (
              <TouchableOpacity activeOpacity={0.9} onPress={() => setLightboxUri(currentUserProfile.avatar_url!)}>
                <Image source={{ uri: currentUserProfile.avatar_url }} style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 2.5, borderColor: SURFACE }} />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: SURFACE }}>
                <Ionicons name="person" size={18} color={MUTED} />
              </View>
            )}
            {attendees.map((a, i) => (
              a.avatar_url ? (
                <TouchableOpacity key={a.id} activeOpacity={0.9} onPress={() => setLightboxUri(a.avatar_url!)} style={{ marginLeft: -10 }}>
                  <Image source={{ uri: a.avatar_url }} style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 2.5, borderColor: SURFACE }} />
                </TouchableOpacity>
              ) : (
                <View key={a.id} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: SURFACE, marginLeft: -10 }}>
                  <Ionicons name="person" size={18} color={MUTED} />
                </View>
              )
            ))}
            <TouchableOpacity
              onPress={() => { loadFriends(); setAttendeeModalVisible(true); }}
              style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: `${FG}22`, alignItems: 'center', justifyContent: 'center', backgroundColor: BG, marginLeft: -10 }}
            >
              <Ionicons name="add" size={16} color={MUTED} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Action Buttons ── */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 18, flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity onPress={handleShare} activeOpacity={0.85} style={{ flex: 1, borderRadius: 12, overflow: 'hidden' }}>
            <LinearGradient colors={[BRAND_FROM, BRAND_TO]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 15 }}>
              <Ionicons name="share-social-outline" size={16} color="#fff" />
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: '#fff' }}>Share</Text>
            </LinearGradient>
          </TouchableOpacity>
          {displayTitle ? (() => {
            const following = isFollowing(displayTitle);
            return (
              <TouchableOpacity
                onPress={() => following ? unfollowArtist(displayTitle) : followArtist(displayTitle)}
                activeOpacity={0.85}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13, borderRadius: 12, borderWidth: 1.5, borderColor: following ? BRAND_FROM : `${FG}20`, backgroundColor: following ? `${BRAND_FROM}12` : 'transparent' }}
              >
                <Ionicons name={following ? 'notifications' : 'notifications-outline'} size={16} color={following ? BRAND_FROM : FG} />
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: following ? BRAND_FROM : FG }}>
                  {following ? 'Following' : 'Follow'}
                </Text>
              </TouchableOpacity>
            );
          })() : null}
          <TouchableOpacity onPress={handleDelete} activeOpacity={0.85}
            style={{ width: 48, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 12, borderWidth: 1.5, borderColor: `${FG}20` }}>
            <Ionicons name="trash-outline" size={16} color={FG} />
          </TouchableOpacity>
        </View>

        <Divider />

        {/* ── Tags ── */}
        <View style={{ paddingHorizontal: 20, paddingVertical: 18 }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 15, color: FG, marginBottom: 14 }}>Tags</Text>
          {dataLoading ? <ActivityIndicator size="small" color={BRAND_FROM} /> : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {tags.map(tag => (
                <View key={tag.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: BG, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: `${FG}14` }}>
                  <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 12, color: FG }}>{tag.text}</Text>
                  <TouchableOpacity onPress={() => removeTag(tag.id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Ionicons name="close" size={12} color={MUTED} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                onPress={() => { setTagInput(''); setTagModalVisible(true); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1.5, borderColor: `${BRAND_FROM}50` }}>
                <Ionicons name="add" size={13} color={BRAND_FROM} />
                <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 12, color: BRAND_FROM }}>Add Tag</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <Divider />

        {/* ── Media Gallery ── */}
        <View style={{ paddingHorizontal: 20, paddingVertical: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 15, color: FG }}>
              Media Gallery{' '}
              {!dataLoading && <Text style={{ fontFamily: 'DMSans_400Regular', color: MUTED }}>– {media.length} items</Text>}
            </Text>
            {!dataLoading && media.length > 0 && (
              <TouchableOpacity onPress={() => setMediaEditMode(e => !e)}>
                <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 13, color: mediaEditMode ? BRAND_FROM : MUTED }}>
                  {mediaEditMode ? 'Done' : 'Edit'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          {dataLoading ? <ActivityIndicator size="small" color={BRAND_FROM} /> : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: MEDIA_GAP }}>
              {media.map(item => (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={mediaEditMode ? 1 : 0.9}
                  onPress={() => { if (!mediaEditMode) setLightboxUri(item.url); }}
                  style={{ position: 'relative' }}
                >
                  <Image
                    source={{ uri: item.url }}
                    style={{ width: MEDIA_CELL, height: MEDIA_CELL, borderRadius: 8, opacity: mediaEditMode ? 0.75 : 1 }}
                    resizeMode="cover"
                  />
                  {mediaEditMode && (
                    <TouchableOpacity
                      onPress={() => deleteMedia(item)}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                      style={{ position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: 11, backgroundColor: DANGER, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Ionicons name="close" size={13} color="#fff" />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              ))}
              {!mediaEditMode && (
                <TouchableOpacity onPress={pickMedia} activeOpacity={0.8}
                  style={{ width: MEDIA_CELL, height: MEDIA_CELL, borderRadius: 8, backgroundColor: BG, borderWidth: 1.5, borderColor: `${FG}18`, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  {uploading ? <ActivityIndicator size="small" color={MUTED} /> : (
                    <>
                      <Ionicons name="add" size={22} color={MUTED} />
                      <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 10, color: MUTED }}>Add Media</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {SETLIST_CATEGORIES.has(params.category) && (
          <>
            <Divider />

            {/* ── Setlist ── */}
            <View style={{ paddingHorizontal: 20, paddingVertical: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 15, color: FG }}>Setlist</Text>
                {setlistSongs.length > SETLIST_PREVIEW && (
                  <TouchableOpacity onPress={() => setSetlistExpanded(e => !e)}>
                    <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 12, color: BRAND_FROM }}>
                      {setlistExpanded ? 'Show Less' : `View All (${setlistSongs.length} songs)`}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              {dataLoading ? <ActivityIndicator size="small" color={BRAND_FROM} /> : (
                <View style={{ gap: 14 }}>
                  {visibleSetlist.map((item, index) => (
                    <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                      <LinearGradient colors={[BRAND_FROM, BRAND_TO]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        style={{ width: 28, height: 28, borderRadius: 99, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: '#fff' }}>{index + 1}</Text>
                      </LinearGradient>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: FG }} numberOfLines={1}>{item.song}</Text>
                        {(item.era || item.time) && (
                          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: MUTED, marginTop: 2 }}>
                            {[item.era, item.time].filter(Boolean).join(' • ')}
                          </Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </>
        )}

        <Divider />

        {/* ── Notes & Reflections ── */}
        <View style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 24 }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 15, color: FG, marginBottom: 14 }}>
            Notes & Reflections
          </Text>
          {dataLoading ? <ActivityIndicator size="small" color={BRAND_FROM} style={{ marginBottom: 16 }} /> : (
            notes.map(note => (
              <View key={note.id} style={{ marginBottom: 16 }}>
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: FG, lineHeight: 21 }}>
                  {note.text}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {note.avatar_url ? (
                      <Image source={{ uri: note.avatar_url }} style={{ width: 26, height: 26, borderRadius: 13 }} />
                    ) : (
                      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="person" size={13} color={MUTED} />
                      </View>
                    )}
                    <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 12, color: MUTED }}>
                      {note.user_id === currentUserId ? 'You' : (note.display_name ?? 'Unknown')} • {timeAgo(note.created_at)}
                    </Text>
                  </View>
                  {note.user_id === currentUserId && (
                    <TouchableOpacity onPress={() => handleNoteEllipsis(note)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="ellipsis-horizontal" size={16} color={MUTED} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))
          )}
          <TouchableOpacity onPress={() => openNoteModal()} activeOpacity={0.8}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: `${BRAND_FROM}44` }}>
            <Ionicons name="add" size={16} color={BRAND_FROM} />
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: BRAND_FROM }}>Add Note</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* ══ Modals ══ */}

      {/* Lightbox */}
      <Modal visible={lightboxUri !== null} transparent animationType="fade" onRequestClose={() => setLightboxUri(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.93)', alignItems: 'center', justifyContent: 'center' }} onPress={() => setLightboxUri(null)}>
          {lightboxUri && <Image source={{ uri: lightboxUri }} style={{ width: SCREEN_W, height: SCREEN_W }} resizeMode="contain" />}
          <TouchableOpacity onPress={() => setLightboxUri(null)}
            style={{ position: 'absolute', top: 52, right: 20, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>
        </Pressable>
      </Modal>

      {/* Add Tag */}
      <Modal visible={tagModalVisible} transparent animationType="slide" onRequestClose={() => setTagModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setTagModalVisible(false)} />
          <View style={{ backgroundColor: SURFACE, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 17, color: FG, marginBottom: 16 }}>Add Tag</Text>
            <TextInput autoFocus value={tagInput} onChangeText={setTagInput}
              placeholder="e.g. Front Row, Date Night" placeholderTextColor={MUTED}
              returnKeyType="done" onSubmitEditing={submitTag}
              style={{ fontFamily: 'DMSans_400Regular', fontSize: 15, color: FG, borderWidth: 1.5, borderColor: `${FG}20`, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 16 }} />
            <TouchableOpacity onPress={submitTag} activeOpacity={0.85} style={{ borderRadius: 12, overflow: 'hidden' }}>
              <LinearGradient colors={[BRAND_FROM, BRAND_TO]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ alignItems: 'center', paddingVertical: 15 }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 15, color: '#fff' }}>Add Tag</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Note */}
      <Modal visible={noteModalVisible} transparent animationType="slide" onRequestClose={() => setNoteModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setNoteModalVisible(false)} />
          <View style={{ backgroundColor: SURFACE, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 17, color: FG, marginBottom: 16 }}>
              {editingNoteId ? 'Edit Note' : 'Add Note'}
            </Text>
            <TextInput autoFocus multiline numberOfLines={5} value={noteInput} onChangeText={setNoteInput}
              placeholder="Share your memories from this event..." placeholderTextColor={MUTED}
              style={{ fontFamily: 'DMSans_400Regular', fontSize: 14, color: FG, borderWidth: 1.5, borderColor: `${FG}20`, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16, textAlignVertical: 'top', minHeight: 100 }} />
            <TouchableOpacity onPress={submitNote} activeOpacity={0.85} style={{ borderRadius: 12, overflow: 'hidden' }}>
              <LinearGradient colors={[BRAND_FROM, BRAND_TO]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ alignItems: 'center', paddingVertical: 15 }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 15, color: '#fff' }}>
                  {editingNoteId ? 'Save Changes' : 'Save Note'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Event */}
      <Modal visible={editModalVisible} transparent animationType="slide" onRequestClose={() => setEditModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setEditModalVisible(false)} />
          <ScrollView
            style={{ backgroundColor: SURFACE, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: SCREEN_W * 1.3 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={{ padding: 24, paddingBottom: 48 }}>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 17, color: FG, marginBottom: 20 }}>Edit Event</Text>
              <FieldLabel>Event Name</FieldLabel>
              <TextInput value={editTitle} onChangeText={setEditTitle} style={inputStyle} placeholderTextColor={MUTED} />
              <FieldLabel>Venue</FieldLabel>
              <TextInput value={editVenue} onChangeText={setEditVenue} style={inputStyle} placeholderTextColor={MUTED} />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <FieldLabel>Date</FieldLabel>
                  <TextInput value={editDate} onChangeText={setEditDate} style={inputStyle} placeholderTextColor={MUTED} />
                </View>
                <View style={{ flex: 1 }}>
                  <FieldLabel>Time</FieldLabel>
                  <TextInput value={editTime} onChangeText={setEditTime} style={inputStyle} placeholderTextColor={MUTED} />
                </View>
              </View>
              <FieldLabel>Seat / Section</FieldLabel>
              <TextInput value={editSeat} onChangeText={setEditSeat} style={inputStyle} placeholder="e.g. Section 203, Row G" placeholderTextColor={MUTED} />
              <TouchableOpacity onPress={handleEditSave} disabled={saving} activeOpacity={0.85} style={{ borderRadius: 12, overflow: 'hidden', marginTop: 8 }}>
                <LinearGradient colors={[BRAND_FROM, BRAND_TO]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ alignItems: 'center', paddingVertical: 15 }}>
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 15, color: '#fff' }}>
                    {saving ? 'Saving…' : 'Save Changes'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Tag Attendee */}
      <Modal visible={attendeeModalVisible} transparent animationType="slide" onRequestClose={() => setAttendeeModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setAttendeeModalVisible(false)} />
          <View style={{ backgroundColor: SURFACE, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: SCREEN_W * 1.1 }}>
            <View style={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 17, color: FG }}>Tag a Friend</Text>
              <TouchableOpacity onPress={() => setAttendeeModalVisible(false)}>
                <Ionicons name="close" size={22} color={MUTED} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {friendsLoading && <ActivityIndicator size="small" color={BRAND_FROM} style={{ padding: 24 }} />}
              {!friendsLoading && friends.length === 0 && (
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 14, color: MUTED, padding: 24 }}>
                  No friends yet. Add some from the Friends tab.
                </Text>
              )}
              {friends.map(friend => {
                const alreadyTagged = attendees.some(a => a.user_id === friend.id);
                return (
                  <TouchableOpacity
                    key={friend.id}
                    onPress={() => { if (!alreadyTagged) { handleAddAttendee(friend); setAttendeeModalVisible(false); } }}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 14, gap: 14, opacity: alreadyTagged ? 0.5 : 1 }}>
                    {friend.avatar_url ? (
                      <Image source={{ uri: friend.avatar_url }} style={{ width: 42, height: 42, borderRadius: 21 }} />
                    ) : (
                      <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="person" size={20} color={MUTED} />
                      </View>
                    )}
                    <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 15, color: FG, flex: 1 }}>
                      {friend.display_name ?? friend.username ?? 'Unknown'}
                    </Text>
                    {alreadyTagged && <Ionicons name="checkmark-circle" size={20} color={BRAND_FROM} />}
                  </TouchableOpacity>
                );
              })}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

/* ─────────── sub-components ─────────── */
function Divider(): React.JSX.Element {
  return <View style={{ height: 1, backgroundColor: `${FG}10`, marginHorizontal: 20 }} />;
}

function FieldLabel({ children }: { children: string }): React.JSX.Element {
  return (
    <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 12, color: MUTED, marginBottom: 6, marginTop: 14 }}>
      {children}
    </Text>
  );
}

const inputStyle = {
  fontFamily: 'DMSans_400Regular' as const,
  fontSize: 15,
  color: FG,
  borderWidth: 1.5,
  borderColor: `${FG}20`,
  borderRadius: 12,
  paddingHorizontal: 14,
  paddingVertical: 14,
};
