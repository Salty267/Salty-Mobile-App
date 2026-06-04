import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  LayoutAnimation, UIManager, Platform, ActivityIndicator,
} from 'react-native';
import * as ExpoCalendar from 'expo-calendar';
import { useBottomPad } from '@/lib/useBottomPad';
import { scale } from '@/lib/layout';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSidebar } from '@/lib/SidebarContext';
import { supabase } from '@/lib/supabase/client';
import { parseEventDate } from '@/lib/parseEventDate';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
const LA = () => LayoutAnimation.configureNext({
  duration: 200,
  create: { type: 'easeInEaseOut', property: 'opacity' },
  update: { type: 'easeInEaseOut' },
  delete: { type: 'easeInEaseOut', property: 'opacity' },
});

const BRAND_FROM = '#4f6cf2';
const BRAND_TO   = '#a25cf2';
const FG         = '#1a1530';
const MUTED      = '#6b6a85';
const SURFACE    = '#ffffff';
const BG         = '#eef0fb';

const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

type TicketData = {
  id: string;
  title: string | null;
  time_str: string | null;
  category: string;
  tint: string | null;
  date_str: string | null;
};

type DeviceEvent = {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  calendarId: string;
  calendarTitle?: string;
};

const EXCLUDED_CALENDAR_KEYWORDS = ['birthday', 'bday', 'b-day', 'b day', 'holiday', 'holidays', 'national', 'observance', 'public holiday'];

function isExcludedTitle(title: string): boolean {
  const lower = title.toLowerCase();
  return EXCLUDED_CALENDAR_KEYWORDS.some(kw => lower.includes(kw));
}

function isEventCalendar(cal: ExpoCalendar.Calendar): boolean {
  if (cal.type === ExpoCalendar.CalendarType.BIRTHDAYS) return false;
  return !isExcludedTitle(cal.title ?? '');
}

function buildCalendar(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function CalendarScreen(): React.JSX.Element {
  const { openSidebar } = useSidebar();
  const bottomPad = useBottomPad();
  const today  = new Date();

  const [year,         setYear]         = useState(today.getFullYear());
  const [month,        setMonth]        = useState(today.getMonth());
  const [selectedDay,  setSelectedDay]  = useState(today.getDate());
  const [allTickets,   setAllTickets]   = useState<TicketData[]>([]);
  const [deviceEvents, setDeviceEvents] = useState<DeviceEvent[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [calPermission, setCalPermission] = useState(false);

  // ── Load tickets + device calendar ──────────────────────────────────────
  useFocusEffect(useCallback(() => {
    let cancelled = false;

    const loadTickets = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) { setLoading(false); return; }
      const { data } = await supabase
        .from('tickets')
        .select('id, title, time_str, category, tint, date_str')
        .eq('user_id', user.id)
        .eq('status', 'active');
      if (cancelled) return;
      if (data) { LA(); setAllTickets(data); }
      setLoading(false);
    };

    const loadDeviceCalendar = async (): Promise<ExpoCalendar.Calendar[]> => {
      try {
        const { status } = await ExpoCalendar.requestCalendarPermissionsAsync();
        if (status !== 'granted' || cancelled) return [];
        setCalPermission(true);

        const allCalendars = await ExpoCalendar.getCalendarsAsync(ExpoCalendar.EntityTypes.EVENT);
        const calendars = allCalendars.filter(isEventCalendar);
        const calIds = calendars.map(c => c.id);
        if (!calIds.length) return calendars;

        // Full year so dots appear on every month
        const start = new Date(year, 0, 1);
        const end   = new Date(year, 11, 31, 23, 59, 59);
        const events = await ExpoCalendar.getEventsAsync(calIds, start, end);
        if (cancelled) return calendars;

        const mapped: DeviceEvent[] = events
          .filter(e => !isExcludedTitle(e.title ?? ''))
          .map(e => ({
            id: e.id,
            title: e.title ?? 'Untitled',
            startDate: new Date(e.startDate),
            endDate: new Date(e.endDate),
            calendarId: e.calendarId,
            calendarTitle: calendars.find(c => c.id === e.calendarId)?.title,
          }));
        setDeviceEvents(mapped);
        return calendars;
      } catch {
        return [];
      }
    };

    // Silently push new calendar events to pending_imports for the full year
    const autoScanToPending = async (userId: string, calendars: ExpoCalendar.Calendar[]) => {
      try {
        const calIds = calendars.map(c => c.id);
        if (!calIds.length) return;

        const [ticketsRes, pendingRes] = await Promise.all([
          supabase.from('tickets').select('title, date_str').eq('user_id', userId).eq('status', 'active'),
          supabase.from('pending_imports').select('raw_data').eq('user_id', userId).eq('status', 'pending').eq('source', 'calendar'),
        ]);

        const existingTitles = new Set((ticketsRes.data ?? []).map(t => (t.title ?? '').toLowerCase().trim()));
        const pendingTitles  = new Set((pendingRes.data ?? []).map(p => ((p.raw_data as any)?.title ?? '').toLowerCase().trim()));

        const yearStart = new Date(year, 0, 1);
        const yearEnd   = new Date(year, 11, 31, 23, 59, 59);
        const events = await ExpoCalendar.getEventsAsync(calIds, yearStart, yearEnd);

        const filtered = events.filter(e => !isExcludedTitle(e.title ?? ''));
        const keywords = ['concert', 'show', 'game', 'match', 'festival', 'tour', 'live', 'vs', 'playoff', 'championship'];
        const relevant = filtered.filter(e => e.title && keywords.some(kw => e.title.toLowerCase().includes(kw)));
        const candidates = relevant.length > 0 ? relevant : filtered;

        const toImport = candidates.filter(e => {
          const key = (e.title ?? '').toLowerCase().trim();
          return !existingTitles.has(key) && !pendingTitles.has(key);
        });
        if (!toImport.length || cancelled) return;

        const rows = toImport.map(e => {
          const d = new Date(e.startDate);
          return {
            user_id:    userId,
            source:     'calendar',
            status:     'pending',
            confidence: 0.55,
            raw_data: {
              title:     e.title ?? 'Untitled',
              venue:     e.location ?? null,
              date:      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
              time:      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
              seat:      null,
              category:  'other',
              tint:      '#b0b8e0',
              image_url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400&q=85',
              subject:   'Calendar scan',
            },
          };
        });
        await supabase.from('pending_imports').insert(rows);
      } catch {
        // Background scan — fail silently
      }
    };

    loadTickets();
    loadDeviceCalendar().then(async calendars => {
      if (cancelled) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (user && calendars.length) autoScanToPending(user.id, calendars);
    });

    return () => { cancelled = true; };
  }, [year, month]));

  // ── Calendar grid ────────────────────────────────────────────────────────
  const cells = buildCalendar(year, month);

  const monthTickets = allTickets.filter(t => {
    const parsed = parseEventDate(t.date_str);
    return parsed !== null && parsed.getFullYear() === year && parsed.getMonth() === month;
  });

  const monthDeviceEvents = deviceEvents.filter(e =>
    e.startDate.getFullYear() === year && e.startDate.getMonth() === month
  );

  const eventDays = new Set([
    ...monthTickets.map(t => parseEventDate(t.date_str)?.getDate()).filter((d): d is number => d != null),
    ...monthDeviceEvents.map(e => e.startDate.getDate()),
  ]);

  const lowerSearch = search.toLowerCase().trim();

  const dayTickets = monthTickets.filter(t => {
    const parsed = parseEventDate(t.date_str);
    if (!parsed || parsed.getDate() !== selectedDay) return false;
    return !lowerSearch || (t.title ?? '').toLowerCase().includes(lowerSearch);
  });

  const dayDeviceEvents = monthDeviceEvents.filter(e => {
    if (e.startDate.getDate() !== selectedDay) return false;
    return !lowerSearch || e.title.toLowerCase().includes(lowerSearch);
  });

  // ── Month navigation ─────────────────────────────────────────────────────
  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
    setSelectedDay(1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
    setSelectedDay(1);
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* ── Header ── */}
      <LinearGradient
        colors={[BRAND_FROM, BRAND_TO]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ paddingBottom: 20, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}
      >
        <SafeAreaView edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 4 }}>
            <TouchableOpacity onPress={openSidebar} style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="menu" size={20} color="#fff" />
            </TouchableOpacity>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 24, color: '#fff', letterSpacing: -0.4 }}>Calendar</Text>
            </View>
            <View style={{ width: 40 }} />
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad }}>

        {/* ── Year label ── */}
        <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: MUTED, marginTop: 16, marginHorizontal: 20 }}>
          All your events for {year}
        </Text>

        {/* ── Search bar ── */}
        <View style={{ marginHorizontal: 20, marginTop: 16, marginBottom: 4, flexDirection: 'row', alignItems: 'center', backgroundColor: SURFACE, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 }}>
          <Ionicons name="search-outline" size={16} color={MUTED} style={{ marginRight: 8 }} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search events…"
            placeholderTextColor={MUTED}
            style={{ flex: 1, fontFamily: 'DMSans_400Regular', fontSize: 14, color: FG }}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color={MUTED} />
            </TouchableOpacity>
          )}
        </View>

        {/* ── Calendar card ── */}
        <View style={{ margin: 20, marginTop: 12, backgroundColor: SURFACE, borderRadius: 24, padding: 20, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 20, elevation: 5 }}>

          {/* Month nav */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <TouchableOpacity onPress={prevMonth} style={{ width: scale(36), height: scale(36), borderRadius: 12, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="chevron-back" size={18} color={FG} />
            </TouchableOpacity>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 17, color: FG, letterSpacing: -0.3 }}>
              {MONTHS[month]} {year}
            </Text>
            <TouchableOpacity onPress={nextMonth} style={{ width: scale(36), height: scale(36), borderRadius: 12, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="chevron-forward" size={18} color={FG} />
            </TouchableOpacity>
          </View>

          {/* Day headers */}
          <View style={{ flexDirection: 'row', marginBottom: 8 }}>
            {DAYS.map(d => (
              <Text key={d} style={{ flex: 1, textAlign: 'center', fontFamily: 'DMSans_700Bold', fontSize: 11, color: MUTED, letterSpacing: 0.5 }}>
                {d}
              </Text>
            ))}
          </View>

          {/* Grid */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {cells.map((day, i) => {
              const isToday    = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
              const isSelected = day === selectedDay;
              const hasEvent   = day !== null && eventDays.has(day);
              return (
                <TouchableOpacity
                  key={i}
                  onPress={() => { if (day) { LA(); setSelectedDay(day); } }}
                  disabled={!day}
                  activeOpacity={0.7}
                  style={{ width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 }}
                >
                  {isSelected && day ? (
                    <LinearGradient
                      colors={[BRAND_FROM, BRAND_TO]}
                      style={{ width: scale(36), height: scale(36), borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: '#fff' }}>{day}</Text>
                    </LinearGradient>
                  ) : (
                    <View style={{ width: scale(36), height: scale(36), borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: isToday ? `${BRAND_FROM}14` : 'transparent' }}>
                      <Text style={{ fontFamily: isToday ? 'DMSans_700Bold' : 'DMSans_400Regular', fontSize: 14, color: day ? (isToday ? BRAND_FROM : FG) : 'transparent' }}>
                        {day ?? ''}
                      </Text>
                      {hasEvent && !isSelected && (
                        <View style={{ position: 'absolute', bottom: 4, width: 4, height: 4, borderRadius: 2, backgroundColor: BRAND_FROM }} />
                      )}
                    </View>
                  )}
                  {hasEvent && isSelected && (
                    <View style={{ position: 'absolute', bottom: 4, width: 4, height: 4, borderRadius: 2, backgroundColor: '#fff' }} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Events for selected day ── */}
        <View style={{ paddingHorizontal: 20 }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, letterSpacing: -0.3, marginBottom: 14 }}>
            {selectedDay} {MONTHS[month]}
          </Text>

          {loading ? (
            <ActivityIndicator color={BRAND_FROM} style={{ marginTop: 24 }} />
          ) : dayTickets.length === 0 && dayDeviceEvents.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <Ionicons name="calendar-outline" size={40} color={MUTED} />
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: MUTED, marginTop: 12, textAlign: 'center' }}>
                No events on this day
              </Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {/* Imported tickets */}
              {dayTickets.map(ticket => (
                <View
                  key={ticket.id}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: SURFACE, borderRadius: 18, padding: 14, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.09, shadowRadius: 12, elevation: 3 }}
                >
                  <View style={{ width: scale(46), height: scale(46), borderRadius: 14, backgroundColor: `${ticket.tint ?? '#b0b8e0'}44`, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="ticket-outline" size={22} color={FG} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: FG, letterSpacing: -0.2 }} numberOfLines={1}>
                      {ticket.title ?? 'Untitled'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <View style={{ backgroundColor: `${ticket.tint ?? '#b0b8e0'}55`, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2 }}>
                        <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 9, color: FG, textTransform: 'uppercase', letterSpacing: 1 }}>{ticket.category}</Text>
                      </View>
                      {ticket.time_str ? (
                        <>
                          <Ionicons name="time-outline" size={11} color={MUTED} />
                          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: MUTED }}>{ticket.time_str}</Text>
                        </>
                      ) : null}
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={MUTED} />
                </View>
              ))}

              {/* Device calendar events */}
              {dayDeviceEvents.map(evt => (
                <View
                  key={evt.id}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: SURFACE, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: `${BRAND_FROM}22`, opacity: 0.92 }}
                >
                  <View style={{ width: scale(46), height: scale(46), borderRadius: 14, backgroundColor: `${BRAND_FROM}18`, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="calendar-outline" size={20} color={BRAND_FROM} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: FG, letterSpacing: -0.2 }} numberOfLines={1}>
                      {evt.title}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <View style={{ backgroundColor: `${BRAND_FROM}22`, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2 }}>
                        <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 9, color: BRAND_FROM, textTransform: 'uppercase', letterSpacing: 1 }}>
                          {evt.calendarTitle ?? 'Calendar'}
                        </Text>
                      </View>
                      <Ionicons name="time-outline" size={11} color={MUTED} />
                      <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: MUTED }}>
                        {evt.startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

      </ScrollView>
    </View>
  );
}
