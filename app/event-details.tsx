import React, { useState, useEffect, useRef } from 'react';
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
import * as MediaLibrary from 'expo-media-library';
import * as VideoThumbnails from 'expo-video-thumbnails';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import * as Sharing from 'expo-sharing';
import ViewShot from 'react-native-view-shot';
import { useSpotifyExport } from '@/lib/useSpotifyExport';
import { openAppleMusicSearch, openYouTubeMusicSearch } from '@/lib/musicDeepLinks';
import { SCREEN_W, scale, scaleFont, sp } from '@/lib/layout';

WebBrowser.maybeCompleteAuthSession();
import { useBottomPad } from '@/lib/useBottomPad';
import { useSavedEvents } from '@/lib/SavedEventsContext';
import { decode as decodeBase64 } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase/client';
import type { AcceptedFriend } from '@/lib/useFriends';
import { useFollowedArtists } from '@/lib/useFollowedArtists';
import { isEventPast } from '@/lib/parseEventDate';
import { usePhotoLibraryScanner } from '@/lib/usePhotoLibraryScanner';

/* ─────────── constants ─────────── */
const BRAND_FROM = '#4f6cf2';
const BRAND_TO   = '#a25cf2';
const FG         = '#1a1530';
const MUTED      = '#6b6a85';
const SURFACE    = '#ffffff';
const BG         = '#eef0fb';
const DANGER     = '#e63950';

const HERO_H        = Math.round(SCREEN_W * 0.56);
// 3-column media grid. Width math reuses the SAME sp()/scale() calls as the gallery
// container's paddingHorizontal (sp(20), see "Media Gallery" section below) so
// cols * cell + (cols-1) * gap is mathematically guaranteed to fit the real available
// width on any screen size. The old version compared a scaled container against
// hardcoded literal padding/gap values that only matched exactly at the 390dp reference
// width — on larger phones/tablets the row math overflowed by a few px, which is enough
// for flexWrap to bump the 3rd tile down to the next line (silently collapsing to 2 cols).
const MEDIA_COLUMNS = 3;
const MEDIA_GAP     = sp(4);
const MEDIA_PAD_H   = sp(20);
const MEDIA_CELL    = Math.floor((SCREEN_W - MEDIA_PAD_H * 2 - MEDIA_GAP * (MEDIA_COLUMNS - 1)) / MEDIA_COLUMNS);

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
type MediaRow = { id: string; url: string | null; media_type: 'photo' | 'video'; device_asset_id: string | null };
type SetlistSong = { song: string; era?: string; time?: string };

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
  const saved = isSaved(params.id ?? '');
  const { isFollowing, followArtist, unfollowArtist } = useFollowedArtists();
  const { exportToSpotify, status: spotifyStatus, playlistUrl, errorMsg: spotifyError } = useSpotifyExport();
  const setlistCardRef = useRef<ViewShot>(null);
  const { progress: photoScanProgress, startScan: startPhotoScan } = usePhotoLibraryScanner({ singleTicketId: params.id });

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
  const [setlistLoading,  setSetlistLoading]  = useState(false);
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
  const [exportModalVisible,   setExportModalVisible]   = useState(false);
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

  useEffect(() => {
    if (photoScanProgress.state === 'done' && (photoScanProgress.matched > 0 || photoScanProgress.newCandidates > 0)) {
      router.push({ pathname: '/photo-scan-review', params: { ticketId: params.id } } as any);
    }
  }, [photoScanProgress.state]);

  /* ────────── load all data ────────── */
  useEffect(() => {
    if (spotifyStatus === 'done' && playlistUrl) {
      Alert.alert('Playlist Created', 'Your setlist has been added to Spotify.', [
        { text: 'Open in Spotify', onPress: () => Linking.openURL(playlistUrl!) },
        { text: 'OK', style: 'cancel' },
      ]);
    } else if (spotifyStatus === 'error' && spotifyError) {
      Alert.alert('Export Failed', spotifyError);
    }
  }, [spotifyStatus, playlistUrl, spotifyError]);

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
          .select('id, storage_url, media_type, device_asset_id')
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

      if (mediaRes.data) {
        const rows = mediaRes.data.map(r => ({
          id: r.id,
          url: r.storage_url ?? null,
          media_type: (r.media_type ?? 'photo') as 'photo' | 'video',
          device_asset_id: r.device_asset_id ?? null,
        }));
        // Resolve local file:// URIs for library-scan photos (no storage_url, but has device_asset_id).
        // IMPORTANT: chunked, not a single Promise.all over every row. A trip-card approval
        // can auto-link an entire photo cluster at once (100+ items — e.g. "Washington DC
        // Visit" linked 102), and firing 100+ concurrent MediaLibrary native-bridge calls
        // on mount overwhelms it badly enough to crash the screen immediately and on every
        // retry. Resolving in small batches gets the same end result (every item still
        // resolves) with bounded native concurrency, so the screen opens normally.
        const RESOLVE_CHUNK = 12;
        const resolved: typeof rows = [];
        for (let i = 0; i < rows.length; i += RESOLVE_CHUNK) {
          if (!active) break; // unmounted mid-resolution — stop firing native calls, but
                              // still let `load` finish its remaining work below as before
          const chunk = rows.slice(i, i + RESOLVE_CHUNK);
          const done = await Promise.all(chunk.map(async (item) => {
            if (item.url || item.media_type === 'video' || !item.device_asset_id) return item;
            try {
              const info = await MediaLibrary.getAssetInfoAsync(item.device_asset_id);
              return { ...item, url: info?.localUri ?? null };
            } catch { return item; }
          }));
          resolved.push(...done);
        }
        if (active) setMedia(resolved);
      }

      const songs = setlistRes.data?.songs;
      if (Array.isArray(songs) && songs.length > 0) {
        setSetlistSongs(songs as SetlistSong[]);
      } else if (SETLIST_CATEGORIES.has(params.category)) {
        setSetlistLoading(true);
        supabase.functions.invoke('setlist-lookup', {
          body: {
            ticketId: params.id,
            artistName: ticketRes.data?.title ?? params.title,
            dateStr: ticketRes.data?.date_str ?? params.date,
          },
        }).then(({ data }) => {
          if (!active) return;
          if (Array.isArray(data?.songs) && data.songs.length > 0) {
            setSetlistSongs(data.songs as SetlistSong[]);
          }
          setSetlistLoading(false);
        });
      }

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

  const handleShareSetlist = async () => {
    try {
      const uri = await (setlistCardRef.current as any).capture();
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share Setlist' });
      } else {
        await Share.share({ url: uri, title: `${displayTitle} Setlist` });
      }
    } catch {
      Alert.alert('Share Failed', 'Could not generate the setlist image.');
    }
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
    if (item.url) {
      const marker = '/ticket-photos/';
      const idx = item.url.indexOf(marker);
      const path = idx >= 0 ? item.url.slice(idx + marker.length) : null;
      if (path) await supabase.storage.from('ticket-photos').remove([path]);
    }
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
        // base64 → Uint8Array — NOT fetch+blob (that reliably produces empty uploads
        // in this RN setup). decode() from base64-arraybuffer goes straight to an
        // ArrayBuffer, skipping the slow atob()+charCodeAt-loop's intermediate "raw
        // bytes as a UTF-16 JS string" hop (same swap applied to the batch-approve
        // hot path in photo-scan-review.tsx — see approveProposalWork's comment for
        // the full single-JS-thread-bottleneck reasoning).
        const bytes = new Uint8Array(decodeBase64(asset.base64));
        const { error: upErr } = await supabase.storage
          .from('ticket-photos').upload(path, bytes, { contentType });
        if (upErr) throw upErr;
        const { data: { publicUrl } } = supabase.storage.from('ticket-photos').getPublicUrl(path);
        const { data: row } = await supabase.from('photos')
          .insert({ ticket_id: params.id, user_id: currentUserId, storage_url: publicUrl, match_method: 'manual' })
          .select('id').single();
        if (row) setMedia(prev => [{ id: row.id, url: publicUrl, media_type: 'photo', device_asset_id: null }, ...prev]);
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
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: sp(16), paddingTop: sp(4), paddingBottom: sp(14) }}>
            <TouchableOpacity onPress={() => router.back()} style={{ width: scale(36), height: scale(36), alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="arrow-back" size={scale(24)} color="#fff" />
            </TouchableOpacity>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(17), color: '#fff', letterSpacing: -0.2 }}>
              Event Details
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity onPress={toggleSave} style={{ width: scale(36), height: scale(36), alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={saved ? 'heart' : 'heart-outline'} size={scale(22)} color={saved ? '#ff6b8a' : '#fff'} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleTopEllipsis} style={{ width: scale(36), height: scale(36), alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="ellipsis-vertical" size={scale(20)} color="#fff" />
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
        <View style={{ paddingHorizontal: sp(20), paddingTop: sp(18), paddingBottom: sp(18) }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(22), color: FG, letterSpacing: -0.4 }}>
            {displayTitle}
          </Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(14), color: MUTED, marginTop: 5 }}>
            {displayVenue}
          </Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(14), color: MUTED, marginTop: 3 }}>
            {displayDate} • {displayTime}
          </Text>
          {displaySeat ? (
            <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: scaleFont(13), color: BRAND_FROM, marginTop: 5 }}>
              {displaySeat}
            </Text>
          ) : null}
        </View>

        <Divider />

        {/* ── Attendees ── */}
        <View style={{ paddingHorizontal: sp(20), paddingVertical: sp(18) }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(15), color: FG, marginBottom: sp(14) }}>
            Attendees{attendees.length > 0 ? ` (${attendees.length})` : ''}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {/* current user always first */}
            {currentUserProfile?.avatar_url ? (
              <TouchableOpacity activeOpacity={0.9} onPress={() => setLightboxUri(currentUserProfile.avatar_url!)}>
                <Image source={{ uri: currentUserProfile.avatar_url }} style={{ width: scale(38), height: scale(38), borderRadius: scale(19), borderWidth: 2.5, borderColor: SURFACE }} />
              </TouchableOpacity>
            ) : (
              <View style={{ width: scale(38), height: scale(38), borderRadius: scale(19), backgroundColor: BG, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: SURFACE }}>
                <Ionicons name="person" size={scale(18)} color={MUTED} />
              </View>
            )}
            {attendees.map((a, i) => (
              a.avatar_url ? (
                <TouchableOpacity key={a.id} activeOpacity={0.9} onPress={() => setLightboxUri(a.avatar_url!)} style={{ marginLeft: -10 }}>
                  <Image source={{ uri: a.avatar_url }} style={{ width: scale(38), height: scale(38), borderRadius: scale(19), borderWidth: 2.5, borderColor: SURFACE }} />
                </TouchableOpacity>
              ) : (
                <View key={a.id} style={{ width: scale(38), height: scale(38), borderRadius: scale(19), backgroundColor: BG, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: SURFACE, marginLeft: -10 }}>
                  <Ionicons name="person" size={scale(18)} color={MUTED} />
                </View>
              )
            ))}
            <TouchableOpacity
              onPress={() => { loadFriends(); setAttendeeModalVisible(true); }}
              style={{ width: scale(38), height: scale(38), borderRadius: scale(19), borderWidth: 1.5, borderColor: `${FG}22`, alignItems: 'center', justifyContent: 'center', backgroundColor: BG, marginLeft: -10 }}
            >
              <Ionicons name="add" size={scale(16)} color={MUTED} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Action Buttons ── */}
        <View style={{ paddingHorizontal: sp(20), paddingBottom: sp(18), flexDirection: 'row', gap: sp(10) }}>
          <TouchableOpacity onPress={handleShare} activeOpacity={0.85} style={{ flex: 1, borderRadius: scale(12), overflow: 'hidden' }}>
            <LinearGradient colors={[BRAND_FROM, BRAND_TO]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp(7), paddingVertical: sp(15) }}>
              <Ionicons name="share-social-outline" size={scale(16)} color="#fff" />
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(14), color: '#fff' }}>Share</Text>
            </LinearGradient>
          </TouchableOpacity>
          {displayTitle ? (() => {
            const following = isFollowing(displayTitle);
            return (
              <TouchableOpacity
                onPress={() => following ? unfollowArtist(displayTitle) : followArtist(displayTitle)}
                activeOpacity={0.85}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp(7), paddingVertical: sp(13), borderRadius: scale(12), borderWidth: 1.5, borderColor: following ? BRAND_FROM : `${FG}20`, backgroundColor: following ? `${BRAND_FROM}12` : 'transparent' }}
              >
                <Ionicons name={following ? 'notifications' : 'notifications-outline'} size={scale(16)} color={following ? BRAND_FROM : FG} />
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(13), color: following ? BRAND_FROM : FG }}>
                  {following ? 'Following' : 'Follow'}
                </Text>
              </TouchableOpacity>
            );
          })() : null}
          <TouchableOpacity onPress={handleDelete} activeOpacity={0.85}
            style={{ width: scale(48), alignItems: 'center', justifyContent: 'center', paddingVertical: sp(13), borderRadius: scale(12), borderWidth: 1.5, borderColor: `${FG}20` }}>
            <Ionicons name="trash-outline" size={scale(16)} color={FG} />
          </TouchableOpacity>
        </View>

        <Divider />

        {/* ── Tags ── */}
        <View style={{ paddingHorizontal: sp(20), paddingVertical: sp(18) }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(15), color: FG, marginBottom: sp(14) }}>Tags</Text>
          {dataLoading ? <ActivityIndicator size="small" color={BRAND_FROM} /> : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sp(8) }}>
              {tags.map(tag => (
                <View key={tag.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: BG, borderRadius: 99, paddingHorizontal: sp(12), paddingVertical: sp(7), borderWidth: 1, borderColor: `${FG}14` }}>
                  <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: scaleFont(12), color: FG }}>{tag.text}</Text>
                  <TouchableOpacity onPress={() => removeTag(tag.id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Ionicons name="close" size={scale(12)} color={MUTED} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                onPress={() => { setTagInput(''); setTagModalVisible(true); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 99, paddingHorizontal: sp(12), paddingVertical: sp(7), borderWidth: 1.5, borderColor: `${BRAND_FROM}50` }}>
                <Ionicons name="add" size={scale(13)} color={BRAND_FROM} />
                <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: scaleFont(12), color: BRAND_FROM }}>Add Tag</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <Divider />

        {/* ── Media Gallery ── */}
        <View style={{ paddingHorizontal: sp(20), paddingVertical: sp(18) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: sp(14) }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(15), color: FG }}>
              Media Gallery{' '}
              {!dataLoading && <Text style={{ fontFamily: 'DMSans_400Regular', color: MUTED }}>– {media.length} items</Text>}
            </Text>
            {!dataLoading && media.length > 0 && (
              <TouchableOpacity onPress={() => setMediaEditMode(e => !e)}>
                <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: scaleFont(13), color: mediaEditMode ? BRAND_FROM : MUTED }}>
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
                  onPress={() => { if (!mediaEditMode && item.media_type !== 'video') setLightboxUri(item.url); }}
                  style={{ position: 'relative', opacity: mediaEditMode ? 0.75 : 1 }}
                >
                  {item.media_type === 'video' && item.device_asset_id ? (
                    <VideoGalleryCell deviceAssetId={item.device_asset_id} size={MEDIA_CELL} />
                  ) : (
                    <Image
                      source={{ uri: item.url ?? '' }}
                      style={{ width: MEDIA_CELL, height: MEDIA_CELL, borderRadius: 8 }}
                      resizeMode="cover"
                    />
                  )}
                  {mediaEditMode && (
                    <TouchableOpacity
                      onPress={() => deleteMedia(item)}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                      style={{ position: 'absolute', top: 5, right: 5, width: scale(22), height: scale(22), borderRadius: scale(11), backgroundColor: DANGER, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Ionicons name="close" size={scale(13)} color="#fff" />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              ))}
              {!mediaEditMode && isEventPast(displayDate) && (
                <TouchableOpacity onPress={pickMedia} activeOpacity={0.8}
                  style={{ width: MEDIA_CELL, height: MEDIA_CELL, borderRadius: 8, backgroundColor: BG, borderWidth: 1.5, borderColor: `${FG}18`, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  {uploading ? <ActivityIndicator size="small" color={MUTED} /> : (
                    <>
                      <Ionicons name="add" size={scale(22)} color={MUTED} />
                      <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(10), color: MUTED }}>Add Media</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
              {!mediaEditMode && isEventPast(displayDate) && (
                <TouchableOpacity
                  onPress={() => {
                    if (photoScanProgress.state === 'idle' || photoScanProgress.state === 'error') {
                      startPhotoScan();
                    }
                  }}
                  activeOpacity={0.8}
                  style={{ width: MEDIA_CELL, height: MEDIA_CELL, borderRadius: 8, backgroundColor: '#059669' + '18', borderWidth: 1.5, borderColor: '#059669' + '30', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                >
                  {(photoScanProgress.state === 'scanning' || photoScanProgress.state === 'verifying') ? (
                    <ActivityIndicator size="small" color="#059669" />
                  ) : (
                    <>
                      <Ionicons name="images-outline" size={scale(22)} color="#059669" />
                      <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(10), color: '#059669' }}>Find Photos</Text>
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
            <View style={{ paddingHorizontal: sp(20), paddingVertical: sp(18) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: sp(14) }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(15), color: FG }}>Setlist</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(12) }}>
                  {setlistSongs.length > 0 && (
                    <>
                      <TouchableOpacity
                        onPress={handleShareSetlist}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                      >
                        <Ionicons name="share-social-outline" size={scale(14)} color={BRAND_FROM} />
                        <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: scaleFont(12), color: BRAND_FROM }}>Share</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setExportModalVisible(true)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                      >
                        <Ionicons name="musical-notes-outline" size={scale(14)} color={BRAND_FROM} />
                        <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: scaleFont(12), color: BRAND_FROM }}>Export</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  {setlistSongs.length > SETLIST_PREVIEW && (
                    <TouchableOpacity onPress={() => setSetlistExpanded(e => !e)}>
                      <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: scaleFont(12), color: BRAND_FROM }}>
                        {setlistExpanded ? 'Show Less' : `View All (${setlistSongs.length} songs)`}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              {setlistLoading ? (
                <ActivityIndicator size="small" color={BRAND_FROM} />
              ) : setlistSongs.length === 0 ? (
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(13), color: MUTED, textAlign: 'center', paddingVertical: sp(8) }}>
                  No setlist available yet
                </Text>
              ) : (
                <View style={{ gap: sp(14) }}>
                  {visibleSetlist.map((item, index) => (
                    <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: sp(14) }}>
                      <LinearGradient colors={[BRAND_FROM, BRAND_TO]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        style={{ width: scale(28), height: scale(28), borderRadius: 99, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(12), color: '#fff' }}>{index + 1}</Text>
                      </LinearGradient>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(13), color: FG }} numberOfLines={1}>{item.song}</Text>
                        {(item.era || item.time) && (
                          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(11), color: MUTED, marginTop: 2 }}>
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
        <View style={{ paddingHorizontal: sp(20), paddingTop: sp(18), paddingBottom: sp(24) }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(15), color: FG, marginBottom: sp(14) }}>
            Notes & Reflections
          </Text>
          {dataLoading ? <ActivityIndicator size="small" color={BRAND_FROM} style={{ marginBottom: sp(16) }} /> : (
            notes.map(note => (
              <View key={note.id} style={{ marginBottom: sp(16) }}>
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(13), color: FG, lineHeight: 21 }}>
                  {note.text}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: sp(12) }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(8) }}>
                    {note.avatar_url ? (
                      <Image source={{ uri: note.avatar_url }} style={{ width: scale(26), height: scale(26), borderRadius: scale(13) }} />
                    ) : (
                      <View style={{ width: scale(26), height: scale(26), borderRadius: scale(13), backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="person" size={scale(13)} color={MUTED} />
                      </View>
                    )}
                    <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: scaleFont(12), color: MUTED }}>
                      {note.user_id === currentUserId ? 'You' : (note.display_name ?? 'Unknown')} • {timeAgo(note.created_at)}
                    </Text>
                  </View>
                  {note.user_id === currentUserId && (
                    <TouchableOpacity onPress={() => handleNoteEllipsis(note)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="ellipsis-horizontal" size={scale(16)} color={MUTED} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))
          )}
          <TouchableOpacity onPress={() => openNoteModal()} activeOpacity={0.8}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp(6), paddingVertical: sp(14), borderRadius: scale(12), borderWidth: 1.5, borderColor: `${BRAND_FROM}44` }}>
            <Ionicons name="add" size={scale(16)} color={BRAND_FROM} />
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(14), color: BRAND_FROM }}>Add Note</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* ── Off-screen setlist card for sharing ── */}
      <ViewShot
        ref={setlistCardRef}
        options={{ format: 'png', quality: 1 }}
        style={{ position: 'absolute', left: SCREEN_W * 2 }}
      >
        <SetlistShareCard
          title={displayTitle}
          venue={displayVenue}
          date={displayDate}
          songs={setlistSongs}
        />
      </ViewShot>

      {/* ══ Modals ══ */}

      {/* Lightbox */}
      <Modal visible={lightboxUri !== null} transparent animationType="fade" onRequestClose={() => setLightboxUri(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.93)', alignItems: 'center', justifyContent: 'center' }} onPress={() => setLightboxUri(null)}>
          {lightboxUri && <Image source={{ uri: lightboxUri }} style={{ width: SCREEN_W, height: SCREEN_W }} resizeMode="contain" />}
          <TouchableOpacity onPress={() => setLightboxUri(null)}
            style={{ position: 'absolute', top: sp(52), right: sp(20), width: scale(36), height: scale(36), borderRadius: scale(18), backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={scale(20)} color="#fff" />
          </TouchableOpacity>
        </Pressable>
      </Modal>

      {/* Add Tag */}
      <Modal visible={tagModalVisible} transparent animationType="slide" onRequestClose={() => setTagModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setTagModalVisible(false)} />
          <View style={{ backgroundColor: SURFACE, borderTopLeftRadius: scale(24), borderTopRightRadius: scale(24), padding: sp(24), paddingBottom: sp(40) }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(17), color: FG, marginBottom: sp(16) }}>Add Tag</Text>
            <TextInput autoFocus value={tagInput} onChangeText={setTagInput}
              placeholder="e.g. Front Row, Date Night" placeholderTextColor={MUTED}
              returnKeyType="done" onSubmitEditing={submitTag}
              style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(15), color: FG, borderWidth: 1.5, borderColor: `${FG}20`, borderRadius: scale(12), paddingHorizontal: sp(14), paddingVertical: sp(14), marginBottom: sp(16) }} />
            <TouchableOpacity onPress={submitTag} activeOpacity={0.85} style={{ borderRadius: scale(12), overflow: 'hidden' }}>
              <LinearGradient colors={[BRAND_FROM, BRAND_TO]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ alignItems: 'center', paddingVertical: sp(15) }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(15), color: '#fff' }}>Add Tag</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Note */}
      <Modal visible={noteModalVisible} transparent animationType="slide" onRequestClose={() => setNoteModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setNoteModalVisible(false)} />
          <View style={{ backgroundColor: SURFACE, borderTopLeftRadius: scale(24), borderTopRightRadius: scale(24), padding: sp(24), paddingBottom: sp(40) }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(17), color: FG, marginBottom: sp(16) }}>
              {editingNoteId ? 'Edit Note' : 'Add Note'}
            </Text>
            <TextInput autoFocus multiline numberOfLines={5} value={noteInput} onChangeText={setNoteInput}
              placeholder="Share your memories from this event..." placeholderTextColor={MUTED}
              style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(14), color: FG, borderWidth: 1.5, borderColor: `${FG}20`, borderRadius: scale(12), paddingHorizontal: sp(14), paddingVertical: sp(12), marginBottom: sp(16), textAlignVertical: 'top', minHeight: 100 }} />
            <TouchableOpacity onPress={submitNote} activeOpacity={0.85} style={{ borderRadius: scale(12), overflow: 'hidden' }}>
              <LinearGradient colors={[BRAND_FROM, BRAND_TO]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ alignItems: 'center', paddingVertical: sp(15) }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(15), color: '#fff' }}>
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
            style={{ backgroundColor: SURFACE, borderTopLeftRadius: scale(24), borderTopRightRadius: scale(24), maxHeight: SCREEN_W * 1.3 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={{ padding: sp(24), paddingBottom: sp(48) }}>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(17), color: FG, marginBottom: sp(20) }}>Edit Event</Text>
              <FieldLabel>Event Name</FieldLabel>
              <TextInput value={editTitle} onChangeText={setEditTitle} style={inputStyle} placeholderTextColor={MUTED} />
              <FieldLabel>Venue</FieldLabel>
              <TextInput value={editVenue} onChangeText={setEditVenue} style={inputStyle} placeholderTextColor={MUTED} />
              <View style={{ flexDirection: 'row', gap: sp(12) }}>
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
              <TouchableOpacity onPress={handleEditSave} disabled={saving} activeOpacity={0.85} style={{ borderRadius: scale(12), overflow: 'hidden', marginTop: sp(8) }}>
                <LinearGradient colors={[BRAND_FROM, BRAND_TO]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ alignItems: 'center', paddingVertical: sp(15) }}>
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(15), color: '#fff' }}>
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
          <View style={{ backgroundColor: SURFACE, borderTopLeftRadius: scale(24), borderTopRightRadius: scale(24), maxHeight: SCREEN_W * 1.1 }}>
            <View style={{ paddingHorizontal: sp(24), paddingTop: sp(24), paddingBottom: sp(8), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(17), color: FG }}>Tag a Friend</Text>
              <TouchableOpacity onPress={() => setAttendeeModalVisible(false)}>
                <Ionicons name="close" size={scale(22)} color={MUTED} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {friendsLoading && <ActivityIndicator size="small" color={BRAND_FROM} style={{ padding: sp(24) }} />}
              {!friendsLoading && friends.length === 0 && (
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(14), color: MUTED, padding: sp(24) }}>
                  No friends yet. Add some from the Friends tab.
                </Text>
              )}
              {friends.map(friend => {
                const alreadyTagged = attendees.some(a => a.user_id === friend.id);
                return (
                  <TouchableOpacity
                    key={friend.id}
                    onPress={() => { if (!alreadyTagged) { handleAddAttendee(friend); setAttendeeModalVisible(false); } }}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: sp(24), paddingVertical: sp(14), gap: sp(14), opacity: alreadyTagged ? 0.5 : 1 }}>
                    {friend.avatar_url ? (
                      <Image source={{ uri: friend.avatar_url }} style={{ width: scale(42), height: scale(42), borderRadius: scale(21) }} />
                    ) : (
                      <View style={{ width: scale(42), height: scale(42), borderRadius: scale(21), backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="person" size={scale(20)} color={MUTED} />
                      </View>
                    )}
                    <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: scaleFont(15), color: FG, flex: 1 }}>
                      {friend.display_name ?? friend.username ?? 'Unknown'}
                    </Text>
                    {alreadyTagged && <Ionicons name="checkmark-circle" size={scale(20)} color={BRAND_FROM} />}
                  </TouchableOpacity>
                );
              })}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Export to Music App Modal ── */}
      <Modal
        visible={exportModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setExportModalVisible(false)}
      >
        <Pressable style={{ flex: 1 }} onPress={() => setExportModalVisible(false)} />
        <View style={{ backgroundColor: SURFACE, borderTopLeftRadius: scale(24), borderTopRightRadius: scale(24), padding: sp(24), paddingBottom: sp(48) }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(17), color: FG, marginBottom: sp(6) }}>Export Setlist</Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(13), color: MUTED, marginBottom: sp(24) }}>
            {setlistSongs.length} songs • {displayTitle}
          </Text>

          {/* Spotify */}
          <TouchableOpacity
            onPress={async () => { setExportModalVisible(false); await exportToSpotify(setlistSongs, displayTitle); }}
            activeOpacity={0.8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: sp(14), paddingVertical: sp(16), paddingHorizontal: sp(18), borderRadius: scale(14), backgroundColor: '#1DB95415', borderWidth: 1, borderColor: '#1DB95430', marginBottom: sp(10) }}
          >
            <View style={{ width: scale(38), height: scale(38), borderRadius: scale(19), backgroundColor: '#1DB954', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="musical-note" size={scale(18)} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(15), color: FG }}>Spotify</Text>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(12), color: MUTED }}>Create a playlist with all songs</Text>
            </View>
            <Ionicons name="chevron-forward" size={scale(16)} color={MUTED} />
          </TouchableOpacity>

          {/* Apple Music */}
          <TouchableOpacity
            onPress={async () => { setExportModalVisible(false); await openAppleMusicSearch(`${displayTitle} setlist`); }}
            activeOpacity={0.8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: sp(14), paddingVertical: sp(16), paddingHorizontal: sp(18), borderRadius: scale(14), backgroundColor: '#fa2d4815', borderWidth: 1, borderColor: '#fa2d4830', marginBottom: sp(10) }}
          >
            <View style={{ width: scale(38), height: scale(38), borderRadius: scale(19), backgroundColor: '#fa2d48', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="logo-apple" size={scale(20)} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(15), color: FG }}>Apple Music</Text>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(12), color: MUTED }}>Search for songs in Apple Music</Text>
            </View>
            <Ionicons name="chevron-forward" size={scale(16)} color={MUTED} />
          </TouchableOpacity>

          {/* YouTube Music */}
          <TouchableOpacity
            onPress={async () => { setExportModalVisible(false); await openYouTubeMusicSearch(setlistSongs, displayTitle); }}
            activeOpacity={0.8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: sp(14), paddingVertical: sp(16), paddingHorizontal: sp(18), borderRadius: scale(14), backgroundColor: '#FF000015', borderWidth: 1, borderColor: '#FF000030' }}
          >
            <View style={{ width: scale(38), height: scale(38), borderRadius: scale(19), backgroundColor: '#FF0000', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="logo-youtube" size={scale(20)} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(15), color: FG }}>YouTube Music</Text>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(12), color: MUTED }}>Browse songs on YouTube Music</Text>
            </View>
            <Ionicons name="chevron-forward" size={scale(16)} color={MUTED} />
          </TouchableOpacity>
        </View>
      </Modal>

    </View>
  );
}

/* ─────────── sub-components ─────────── */

const CARD_W = 360;
const MAX_CARD_SONGS = 12;

function SetlistShareCard({ title, venue, date, songs }: {
  title: string; venue: string; date: string; songs: SetlistSong[];
}): React.JSX.Element {
  const visible = songs.slice(0, MAX_CARD_SONGS);
  const extra   = songs.length - visible.length;

  return (
    <View style={{ width: CARD_W, backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden' }}>
      {/* Header gradient */}
      <LinearGradient
        colors={['#4f6cf2', '#a25cf2']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ paddingHorizontal: 24, paddingTop: 28, paddingBottom: 22 }}
      >
        <Text style={{ fontFamily: 'BebasNeue_400Regular', fontSize: 13, color: 'rgba(255,255,255,0.7)', letterSpacing: 4 }}>
          SETLIST
        </Text>
        <Text style={{ fontFamily: 'BebasNeue_400Regular', fontSize: 32, color: '#fff', letterSpacing: 1, marginTop: 4 }} numberOfLines={2}>
          {title}
        </Text>
        {(venue || date) && (
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 6 }} numberOfLines={1}>
            {[venue, date].filter(Boolean).join(' · ')}
          </Text>
        )}
      </LinearGradient>

      {/* Song list */}
      <View style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20, gap: 12 }}>
        {visible.map((song, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: '#a25cf2', width: 22, textAlign: 'right' }}>
              {i + 1}
            </Text>
            <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 14, color: '#1a1530', flex: 1 }} numberOfLines={1}>
              {song.song}
            </Text>
            {song.era ? (
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: '#6b6a85' }} numberOfLines={1}>
                {song.era}
              </Text>
            ) : null}
          </View>
        ))}
        {extra > 0 && (
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: '#6b6a85', marginTop: 4, textAlign: 'center' }}>
            +{extra} more songs
          </Text>
        )}
      </View>

      {/* Footer */}
      <View style={{ borderTopWidth: 1, borderTopColor: '#f1eefb', paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: 'BebasNeue_400Regular', fontSize: 18, color: '#4f6cf2', letterSpacing: 3 }}>
          SALTY
        </Text>
        <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: '#6b6a85' }}>
          {songs.length} songs
        </Text>
      </View>
    </View>
  );
}

function Divider(): React.JSX.Element {
  return <View style={{ height: 1, backgroundColor: `${FG}10`, marginHorizontal: sp(20) }} />;
}

function VideoGalleryCell({ deviceAssetId, size }: { deviceAssetId: string; size: number }): React.JSX.Element {
  const [thumbUri, setThumbUri] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const info = await MediaLibrary.getAssetInfoAsync(deviceAssetId);
        if (!info?.localUri || !active) return;
        const { uri } = await VideoThumbnails.getThumbnailAsync(info.localUri, { time: 1000 });
        if (active) setThumbUri(uri);
      } catch { /* video unavailable or not yet downloaded */ }
    })();
    return () => { active = false; };
  }, [deviceAssetId]);

  return (
    <View style={{ width: size, height: size, borderRadius: 8, backgroundColor: '#1a1530', overflow: 'hidden' }}>
      {thumbUri && (
        <Image source={{ uri: thumbUri }} style={{ width: size, height: size }} resizeMode="cover" />
      )}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: scale(28), height: scale(28), borderRadius: scale(14), backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="play" size={scale(13)} color="#fff" />
        </View>
      </View>
    </View>
  );
}

function FieldLabel({ children }: { children: string }): React.JSX.Element {
  return (
    <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: scaleFont(12), color: MUTED, marginBottom: sp(6), marginTop: sp(14) }}>
      {children}
    </Text>
  );
}

const inputStyle = {
  fontFamily: 'DMSans_400Regular' as const,
  fontSize: scaleFont(15),
  color: FG,
  borderWidth: 1.5,
  borderColor: `${FG}20`,
  borderRadius: scale(12),
  paddingHorizontal: sp(14),
  paddingVertical: sp(14),
};
