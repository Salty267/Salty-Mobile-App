import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  ActivityIndicator, LayoutAnimation, UIManager, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase/client';
import { useBottomPad } from '@/lib/useBottomPad';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const LA = () => LayoutAnimation.configureNext({
  duration: 220,
  create:  { type: 'easeInEaseOut', property: 'opacity' },
  update:  { type: 'easeInEaseOut' },
  delete:  { type: 'easeInEaseOut', property: 'opacity' },
});

const BRAND_FROM = '#4f6cf2';
const BRAND_TO   = '#a25cf2';
const FG         = '#1a1530';
const MUTED      = '#6b6a85';
const SURFACE    = '#ffffff';
const BG         = '#eef0fb';
const GREEN      = '#059669';
const RED        = '#dc2626';

const CATEGORY_DB: Record<string, string> = {
  Concert: 'concert', Sports: 'sports', Festival: 'festival',
  Trip: 'trip', Theatre: 'theater', Other: 'other',
};
const CATEGORY_TINTS: Record<string, string> = {
  Concert: '#FAC775', Sports: '#E8581A', Festival: '#FFCBA4',
  Trip: '#A8E6D3', Theatre: '#C8B8FF', Other: '#b0b8e0',
};
const CATEGORIES = Object.keys(CATEGORY_TINTS);
const DB_TO_DISPLAY: Record<string, string> = {
  concert: 'Concert', sports: 'Sports', festival: 'Festival',
  trip: 'Trip', theater: 'Theatre', dining: 'Other', other: 'Other',
};

type PendingImport = {
  id: string;
  source: string;
  confidence: number;
  raw_data: {
    title: string | null;
    venue: string | null;
    date: string | null;
    time: string | null;
    seat: string | null;
    category: string;
    tint: string;
    image_url: string;
    subject: string;
  };
};

type EditState = {
  title: string; venue: string; date: string;
  time: string; seat: string; category: string;
};

export default function ReviewImportsScreen(): React.JSX.Element {
  const router = useRouter();
  const bottomPad = useBottomPad();
  const [imports, setImports] = useState<PendingImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({
    title: '', venue: '', date: '', time: '', seat: '', category: 'Concert',
  });
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) { setLoading(false); return; }
      const { data } = await supabase
        .from('pending_imports')
        .select('id, source, confidence, raw_data')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (active) { setImports(data ?? []); setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  const startEdit = (item: PendingImport) => {
    const d = item.raw_data;
    LA();
    setEditingId(item.id);
    setEditState({
      title: d.title ?? '',
      venue: d.venue ?? '',
      date: d.date ?? '',
      time: d.time ?? '',
      seat: d.seat ?? '',
      category: DB_TO_DISPLAY[d.category] ?? 'Other',
    });
  };

  const cancelEdit = () => { LA(); setEditingId(null); };

  const handleApprove = async (item: PendingImport) => {
    if (processingId) return;
    setProcessingId(item.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const isEditing = editingId === item.id;
      const d = item.raw_data;
      const title    = isEditing ? editState.title    : (d.title ?? '');
      const venue    = isEditing ? editState.venue    : (d.venue ?? '');
      const date     = isEditing ? editState.date     : (d.date ?? '');
      const time     = isEditing ? editState.time     : (d.time ?? '');
      const seat     = isEditing ? editState.seat     : (d.seat ?? '');
      const dispCat  = isEditing ? editState.category : (DB_TO_DISPLAY[d.category] ?? 'Other');
      const dbCat    = CATEGORY_DB[dispCat] ?? 'other';
      const tint     = CATEGORY_TINTS[dispCat] ?? d.tint ?? '#b0b8e0';

      const hasRealDate  = date.trim() !== '' && date.trim().toLowerCase() !== 'tbd';
      const hasRealVenue = venue.trim() !== '' && venue.trim().toLowerCase() !== 'tbd';

      if (hasRealDate || hasRealVenue) {
        let dupQuery = supabase
          .from('tickets')
          .select('id')
          .eq('user_id', user.id)
          .ilike('title', title || 'Untitled');

        if (hasRealDate) {
          dupQuery = dupQuery.eq('date_str', date);
        } else {
          dupQuery = dupQuery.ilike('venue_name', venue);
        }

        const { data: existing } = await dupQuery.maybeSingle();
        if (existing) {
          Alert.alert('Already saved', 'A ticket with this name and date is already in your vault.');
          return;
        }
      }

      const { error } = await supabase.from('tickets').insert({
        user_id:    user.id,
        title:      title || 'Untitled',
        venue_name: venue || 'TBD',
        date_str:   date  || 'TBD',
        time_str:   time  || 'TBD',
        seat:       seat  || null,
        category:   dbCat,
        tint,
        image_url:  d.image_url,
        confidence: item.confidence,
        source:     item.source ?? 'gmail',
        status:     'active',
        is_past:    false,
      });
      if (error) { Alert.alert('Could not approve', error.message); return; }

      await supabase.from('pending_imports').update({ status: 'approved' }).eq('id', item.id);
      LA();
      setImports(prev => prev.filter(i => i.id !== item.id));
      if (editingId === item.id) setEditingId(null);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (item: PendingImport) => {
    if (processingId) return;
    setProcessingId(item.id);
    try {
      await supabase.from('pending_imports').update({ status: 'rejected' }).eq('id', item.id);
      LA();
      setImports(prev => prev.filter(i => i.id !== item.id));
      if (editingId === item.id) setEditingId(null);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <LinearGradient
        colors={[BRAND_FROM, BRAND_TO]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ paddingBottom: 20, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}
      >
        <SafeAreaView edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 4 }}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="arrow-back" size={20} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>Gmail import</Text>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 22, color: '#fff', letterSpacing: -0.4, marginTop: 2 }}>Review Tickets</Text>
            </View>
            <View style={{ width: 40 }} />
          </View>
        </SafeAreaView>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator color={BRAND_FROM} style={{ marginTop: 60 }} />
      ) : imports.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          <Ionicons name="checkmark-circle-outline" size={64} color={GREEN} />
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 20, color: FG, marginTop: 16, textAlign: 'center' }}>All caught up!</Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 14, color: MUTED, marginTop: 8, textAlign: 'center' }}>No tickets pending review.</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.85}
            style={{ marginTop: 24, overflow: 'hidden', borderRadius: 14 }}
          >
            <LinearGradient
              colors={[BRAND_FROM, BRAND_TO]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ paddingHorizontal: 28, paddingVertical: 13 }}
            >
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: '#fff' }}>Back to Tickets</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: bottomPad + 20, gap: 16 }}
        >
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: MUTED }}>
            {imports.length} ticket{imports.length === 1 ? '' : 's'} found — approve to add to your vault or reject to dismiss.
          </Text>

          {imports.map(item => {
            const isEditing    = editingId === item.id;
            const isProcessing = processingId === item.id;
            const d            = item.raw_data;
            const dispCat      = isEditing ? editState.category : (DB_TO_DISPLAY[d.category] ?? 'Other');
            const tintColor    = isEditing ? (CATEGORY_TINTS[editState.category] ?? '#b0b8e0') : (d.tint ?? '#b0b8e0');
            const confPct      = Math.round(item.confidence * 100);
            const confColor    = item.confidence >= 0.7 ? '#059669' : item.confidence >= 0.4 ? '#d97706' : '#dc2626';

            return (
              <View
                key={item.id}
                style={{
                  backgroundColor: SURFACE, borderRadius: 20, overflow: 'hidden',
                  shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.1, shadowRadius: 16, elevation: 4,
                }}
              >
                <View style={{ height: 5, backgroundColor: tintColor }} />

                <View style={{ padding: 16 }}>
                  {/* Subject + confidence badge */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: MUTED, flex: 1, marginRight: 8 }} numberOfLines={1}>
                      {d.subject}
                    </Text>
                    <View style={{ backgroundColor: `${confColor}18`, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 10, color: confColor }}>{confPct}% match</Text>
                    </View>
                  </View>

                  {isEditing ? (
                    <View style={{ gap: 10 }}>
                      <ReviewField label="Event name" value={editState.title} onChangeText={t => setEditState(s => ({ ...s, title: t }))} placeholder="Event name" />
                      <ReviewField label="Venue" value={editState.venue} onChangeText={t => setEditState(s => ({ ...s, venue: t }))} placeholder="Venue" />
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <View style={{ flex: 1 }}>
                          <ReviewField label="Date" value={editState.date} onChangeText={t => setEditState(s => ({ ...s, date: t }))} placeholder="e.g. Aug 15, 2026" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <ReviewField label="Time" value={editState.time} onChangeText={t => setEditState(s => ({ ...s, time: t }))} placeholder="e.g. 8:00 PM" />
                        </View>
                      </View>
                      <ReviewField label="Seat / Section" value={editState.seat} onChangeText={t => setEditState(s => ({ ...s, seat: t }))} placeholder="Optional" />
                      <View>
                        <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: FG, marginBottom: 6 }}>Category</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {CATEGORIES.map(cat => (
                            <TouchableOpacity
                              key={cat}
                              onPress={() => setEditState(s => ({ ...s, category: cat }))}
                              style={{
                                paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99,
                                backgroundColor: editState.category === cat ? BRAND_FROM : BG,
                              }}
                            >
                              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 11, color: editState.category === cat ? '#fff' : FG }}>{cat}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View style={{ gap: 6 }}>
                      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, letterSpacing: -0.2 }} numberOfLines={2}>
                        {d.title ?? 'Untitled'}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Ionicons name="location-outline" size={12} color={MUTED} />
                        <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: MUTED }} numberOfLines={1}>{d.venue ?? 'TBD'}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Ionicons name="calendar-outline" size={12} color={MUTED} />
                        <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: MUTED }}>
                          {d.date ?? 'TBD'} · {d.time ?? 'TBD'}
                        </Text>
                      </View>
                      {d.seat && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                          <Ionicons name="ticket-outline" size={12} color={BRAND_FROM} />
                          <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 13, color: BRAND_FROM }}>{d.seat}</Text>
                        </View>
                      )}
                      <View style={{ flexDirection: 'row', marginTop: 2 }}>
                        <View style={{ backgroundColor: `${tintColor}55`, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 3 }}>
                          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 10, color: FG, textTransform: 'uppercase', letterSpacing: 0.5 }}>{dispCat}</Text>
                        </View>
                      </View>
                    </View>
                  )}
                </View>

                {/* Action row */}
                <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: `${FG}08` }}>
                  <TouchableOpacity
                    onPress={() => handleReject(item)}
                    disabled={!!isProcessing}
                    style={{ flex: 1, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close-circle-outline" size={17} color={RED} />
                    <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: RED }}>Reject</Text>
                  </TouchableOpacity>

                  <View style={{ width: 1, backgroundColor: `${FG}08` }} />

                  <TouchableOpacity
                    onPress={() => isEditing ? cancelEdit() : startEdit(item)}
                    style={{ flex: 1, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={isEditing ? 'close-outline' : 'create-outline'} size={17} color={MUTED} />
                    <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: MUTED }}>{isEditing ? 'Cancel' : 'Edit'}</Text>
                  </TouchableOpacity>

                  <View style={{ width: 1, backgroundColor: `${FG}08` }} />

                  <TouchableOpacity
                    onPress={() => handleApprove(item)}
                    disabled={!!isProcessing}
                    style={{ flex: 1, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                    activeOpacity={0.7}
                  >
                    {isProcessing
                      ? <ActivityIndicator color={GREEN} size="small" />
                      : <>
                          <Ionicons name="checkmark-circle-outline" size={17} color={GREEN} />
                          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: GREEN }}>Approve</Text>
                        </>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function ReviewField({ label, value, onChangeText, placeholder }: {
  label: string; value: string; onChangeText: (t: string) => void; placeholder: string;
}): React.JSX.Element {
  return (
    <View>
      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 11, color: FG, marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#6b6a85"
        style={{
          backgroundColor: BG, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
          fontFamily: 'DMSans_400Regular', fontSize: 13, color: FG,
        }}
      />
    </View>
  );
}
