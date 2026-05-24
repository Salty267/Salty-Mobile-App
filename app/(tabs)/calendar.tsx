import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, LayoutAnimation, UIManager, Platform, ActivityIndicator } from 'react-native';
import { useBottomPad } from '@/lib/useBottomPad';
import { scale } from '@/lib/layout';
import { useFocusEffect } from '@react-navigation/native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
const LA = () => LayoutAnimation.configureNext({ duration: 200, create: { type: 'easeInEaseOut', property: 'opacity' }, update: { type: 'easeInEaseOut' }, delete: { type: 'easeInEaseOut', property: 'opacity' } });
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSidebar } from '@/lib/SidebarContext';
import { supabase } from '@/lib/supabase/client';
import { parseEventDate } from '@/lib/parseEventDate';

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
  const today     = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [allTickets, setAllTickets] = useState<TicketData[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    (async () => {
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
    })();
    return () => { cancelled = true; };
  }, []));

  const cells = buildCalendar(year, month);

  const monthTickets = allTickets.filter(t => {
    const parsed = parseEventDate(t.date_str);
    return parsed !== null && parsed.getFullYear() === year && parsed.getMonth() === month;
  });
  const eventDays = new Set(
    monthTickets
      .map(t => parseEventDate(t.date_str)?.getDate())
      .filter((d): d is number => d !== undefined && d !== null)
  );
  const dayEvents = monthTickets.filter(t => {
    const parsed = parseEventDate(t.date_str);
    return parsed !== null && parsed.getDate() === selectedDay;
  });

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
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 4 }}>
            <TouchableOpacity onPress={openSidebar} style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="menu" size={20} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>Your schedule</Text>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 24, color: '#fff', letterSpacing: -0.4, marginTop: 2 }}>Calendar</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="add" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad }}>

        {/* ── Calendar card ── */}
        <View style={{ margin: 20, backgroundColor: SURFACE, borderRadius: 24, padding: 20, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 20, elevation: 5 }}>

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
          ) : dayEvents.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <Ionicons name="calendar-outline" size={40} color={MUTED} />
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: MUTED, marginTop: 12, textAlign: 'center' }}>
                No events on this day
              </Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {dayEvents.map(ticket => (
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
            </View>
          )}
        </View>

      </ScrollView>
    </View>
  );
}
