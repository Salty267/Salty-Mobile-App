import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  Image, ActivityIndicator,
  LayoutAnimation, UIManager, Platform,
} from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const LA = () => LayoutAnimation.configureNext({
  duration: 220,
  create:  { type: 'easeInEaseOut', property: 'opacity' },
  update:  { type: 'easeInEaseOut' },
  delete:  { type: 'easeInEaseOut', property: 'opacity' },
});
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomPad } from '@/lib/useBottomPad';
import { SCREEN_W, scale } from '@/lib/layout';

const TKT_IMG_W = Math.round(SCREEN_W * 0.23); // ~90dp on 390dp screen
const TKT_IMG_H = Math.round(TKT_IMG_W * 1.22); // maintain ~90×110 aspect ratio
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase/client';
import { useSidebar } from '@/lib/SidebarContext';

const YEAR = new Date().getFullYear();

const BRAND_FROM = '#4f6cf2';
const BRAND_TO   = '#a25cf2';
const FG         = '#1a1530';
const MUTED      = '#6b6a85';
const SURFACE    = '#ffffff';
const BG         = '#eef0fb';
const GREEN      = '#059669';

type Ticket = {
  id: string; title: string; venue: string; date: string; time: string;
  category: string; tint: string; image: string; seat?: string;
  status: 'upcoming' | 'past';
};

const TICKETS: Ticket[] = [
  { id: '1', title: 'Taylor Swift — Eras Tour', venue: 'MetLife Stadium',  date: `Aug 15, ${YEAR}`, time: '7:30 PM', category: 'Concert',  tint: '#FAC775', image: 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=400&q=85', seat: 'Sec 114 · Row C · Seat 22', status: 'upcoming' },
  { id: '2', title: 'Lakers vs Warriors',        venue: 'Crypto.com Arena', date: `Aug 10, ${YEAR}`, time: '8:00 PM', category: 'Sports',   tint: '#E8581A', image: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=400&q=85', seat: 'Sec 203 · Row F · Seat 7',  status: 'upcoming' },
  { id: '3', title: 'Jazz Festival',             venue: 'Central Park',     date: `Sep 15, ${YEAR}`, time: '4:00 PM', category: 'Festival', tint: '#A8E6D3', image: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&q=85',                                    status: 'upcoming' },
  { id: '4', title: 'The Strokes',               venue: 'Madison Sq Garden',date: `Mar 12, ${YEAR}`, time: '9:00 PM', category: 'Concert',  tint: '#C8B8FF', image: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=400&q=85', seat: 'Sec 102 · Row A · Seat 14', status: 'past'     },
  { id: '5', title: 'Coachella W2',              venue: 'Empire Polo Club', date: `Apr 20, ${YEAR}`, time: '2:00 PM', category: 'Festival', tint: '#FFCBA4', image: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=400&q=85',                                    status: 'past'     },
  { id: '6', title: 'Lisbon weekend',            venue: 'Alfama district',  date: `Feb 8, ${YEAR}`,  time: 'All day', category: 'Trip',     tint: '#A8E6D3', image: 'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=400&q=85',                                    status: 'past'     },
];

function formatLastScanned(date: Date | null): string {
  if (!date) return 'Never scanned';
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60)   return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function TicketsScreen(): React.JSX.Element {
  const { openSidebar } = useSidebar();
  const bottomPad = useBottomPad();
  const [tab,           setTab]          = useState<'upcoming' | 'past'>('upcoming');
  const [gmailConnected,setGmailConnected] = useState(false);
  const [gmailEmail,    setGmailEmail]   = useState('');
  const [scanning,      setScanning]     = useState(false);
  const [lastScanned,   setLastScanned]  = useState<Date | null>(null);
  const [connecting,    setConnecting]   = useState(false);

  // Auto-connect if user signed up with Google
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      const hasGoogle = user.identities?.some(id => id.provider === 'google');
      const storedEmail = user.user_metadata?.gmail_email as string | undefined;
      if (hasGoogle || storedEmail) {
        LA(); setGmailConnected(true);
        setGmailEmail(storedEmail ?? user.email ?? '');
      }
    });
  }, []);

  const handleConnectGmail = async () => {
    setConnecting(true);
    try {
      const redirectTo = 'salty://auth/callback';
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          scopes: 'https://www.googleapis.com/auth/gmail.readonly',
          queryParams: { access_type: 'offline', prompt: 'consent' },
        },
      });
      if (error || !data.url) return;

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === 'success' && result.url) {
        const parsed = new URL(result.url);
        const hp = new URLSearchParams(parsed.hash.replace(/^#/, ''));
        const at = hp.get('access_token') ?? parsed.searchParams.get('access_token');
        const rt = hp.get('refresh_token') ?? parsed.searchParams.get('refresh_token');
        if (at && rt) {
          await supabase.auth.setSession({ access_token: at, refresh_token: rt });
          const { data: { user } } = await supabase.auth.getUser();
          const email = user?.email ?? '';
          LA(); setGmailConnected(true);
          setGmailEmail(email);
          await supabase.auth.updateUser({ data: { gmail_email: email } });
        }
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleScanGmail = useCallback(async () => {
    if (scanning) return;
    setScanning(true);
    // In production: call supabase edge function that scans Gmail with stored token
    await new Promise(r => setTimeout(r, 2500));
    setLastScanned(new Date());
    setScanning(false);
  }, [scanning]);

  const visible = TICKETS.filter(t => t.status === tab);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* ── Header ── */}
      <LinearGradient
        colors={[BRAND_FROM, BRAND_TO]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ paddingBottom: 20, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}
      >
        <SafeAreaView edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 20 }}>
            <TouchableOpacity onPress={openSidebar} style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="menu" size={20} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>Your vault</Text>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 22, color: '#fff', letterSpacing: -0.4, marginTop: 2 }}>My Tickets</Text>
            </View>
            <TouchableOpacity style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="filter-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', marginHorizontal: 20, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 3 }}>
            {(['upcoming', 'past'] as const).map(t => (
              <TouchableOpacity
                key={t}
                onPress={() => { LA(); setTab(t); }}
                style={{ flex: 1, paddingVertical: 7, borderRadius: 10, alignItems: 'center', backgroundColor: tab === t ? '#fff' : 'transparent' }}
                activeOpacity={0.8}
              >
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: tab === t ? BRAND_FROM : 'rgba(255,255,255,0.8)', textTransform: 'capitalize' }}>
                  {t}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: bottomPad, gap: 14 }}>

        {/* ── Gmail Card ── */}
        {!gmailConnected ? (
          /* Not connected */
          <LinearGradient
            colors={['#f8f7ff', '#eef0fb']}
            style={{ borderRadius: 18, padding: 14, borderWidth: 1.5, borderColor: `${BRAND_FROM}22` }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <View style={{ width: scale(36), height: scale(36), borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3 }}>
                <Ionicons name="mail" size={18} color={BRAND_FROM} />
              </View>
              <View>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: FG }}>Connect Gmail</Text>
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: MUTED, marginTop: 1 }}>
                  Auto-import tickets from your inbox
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={handleConnectGmail}
              disabled={connecting}
              activeOpacity={0.85}
              style={{ overflow: 'hidden', borderRadius: 12 }}
            >
              <LinearGradient
                colors={[BRAND_FROM, BRAND_TO]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 11 }}
              >
                {connecting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                      <Ionicons name="logo-google" size={15} color="#fff" />
                      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: '#fff' }}>Connect Gmail Account</Text>
                    </>
                }
              </LinearGradient>
            </TouchableOpacity>
          </LinearGradient>
        ) : (
          /* Connected */
          <View style={{ backgroundColor: SURFACE, borderRadius: 20, overflow: 'hidden', shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 4 }}>

            {/* Connected header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: `${FG}08` }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: scale(34), height: scale(34), borderRadius: 9, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="mail" size={16} color="#E8581A" />
                </View>
                <View>
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: FG }} numberOfLines={1}>{gmailEmail}</Text>
                  <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: MUTED, marginTop: 1 }}>
                    Last scanned: {formatLastScanned(lastScanned)}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#d1fae5', borderRadius: 99, paddingHorizontal: 9, paddingVertical: 4 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN }} />
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 10, color: GREEN }}>Connected</Text>
              </View>
            </View>

            {/* Scan Now */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11 }}>
              <View>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: FG }}>Scan Gmail</Text>
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: MUTED, marginTop: 2 }}>
                  Find new tickets in your inbox
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleScanGmail}
                disabled={scanning}
                activeOpacity={0.85}
                style={{ overflow: 'hidden', borderRadius: 12 }}
              >
                <LinearGradient
                  colors={[BRAND_FROM, BRAND_TO]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10 }}
                >
                  {scanning
                    ? <ActivityIndicator color="#fff" size="small" style={{ width: 16, height: 16 }} />
                    : <Ionicons name="refresh-outline" size={15} color="#fff" />
                  }
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: '#fff' }}>
                    {scanning ? 'Scanning…' : 'Scan Now'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>

          </View>
        )}

        {/* ── Ticket list ── */}
        {visible.map(ticket => <TicketRow key={ticket.id} ticket={ticket} isPast={tab === 'past'} />)}

        {visible.length === 0 && (
          <View style={{ alignItems: 'center', paddingTop: 40 }}>
            <Ionicons name="ticket-outline" size={48} color={MUTED} />
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, marginTop: 16 }}>No tickets yet</Text>
            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: MUTED, marginTop: 6, textAlign: 'center' }}>
              Your {tab} tickets will appear here.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── Ticket Row ─────────────────────────────────────────────────────────────────
function TicketRow({ ticket, isPast }: { ticket: Ticket; isPast: boolean }): React.JSX.Element {
  return (
    <View style={{ backgroundColor: SURFACE, borderRadius: 20, overflow: 'hidden', shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 4, opacity: isPast ? 0.88 : 1 }}>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: 6, backgroundColor: ticket.tint }} />
        <View style={{ width: TKT_IMG_W, height: TKT_IMG_H }}>
          <Image source={{ uri: ticket.image }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          {isPast && <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)' }} />}
          {isPast && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 9, color: '#fff', letterSpacing: 1 }}>ATTENDED</Text>
              </View>
            </View>
          )}
        </View>
        <View style={{ flex: 1, padding: 14, justifyContent: 'space-between' }}>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ backgroundColor: `${ticket.tint}55`, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 9, color: FG, textTransform: 'uppercase', letterSpacing: 1 }}>{ticket.category}</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={MUTED} />
            </View>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: FG, marginTop: 8, letterSpacing: -0.2 }} numberOfLines={1}>{ticket.title}</Text>
          </View>
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="calendar-outline" size={11} color={MUTED} />
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: MUTED }}>{ticket.date} · {ticket.time}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="location-outline" size={11} color={MUTED} />
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: MUTED }} numberOfLines={1}>{ticket.venue}</Text>
            </View>
            {ticket.seat && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Ionicons name="ticket-outline" size={11} color={BRAND_FROM} />
                <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 11, color: BRAND_FROM }} numberOfLines={1}>{ticket.seat}</Text>
              </View>
            )}
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', marginHorizontal: 10 }}>
        {Array.from({ length: 36 }).map((_, i) => (
          <View key={i} style={{ flex: 1, height: 1, backgroundColor: i % 2 === 0 ? `${FG}18` : 'transparent' }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1.5 }}>
          {[4,8,5,11,4,7,5,10,4,8,5,11,4,7,5,10,4,8,5].map((h, k) => (
            <View key={k} style={{ width: 1.8, height: (h / 11) * 18, backgroundColor: FG, opacity: 0.22, borderRadius: 1 }} />
          ))}
        </View>
        <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 9, color: `${FG}44`, letterSpacing: 1 }}>
          ADMIT ONE · #{(ticket.id.charCodeAt(0) * 3741) % 9000 + 1000}
        </Text>
      </View>
    </View>
  );
}
