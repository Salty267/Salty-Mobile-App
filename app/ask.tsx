import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase/client';

const BRAND_FROM = '#4f6cf2';
const BRAND_TO   = '#a25cf2';
const FG         = '#1a1530';
const MUTED      = '#6b6a85';
const BG         = '#eef0fb';
const SURFACE    = '#ffffff';

type Message = {
  role: 'user' | 'assistant';
  text: string;
};

type TicketRow = {
  title: string | null;
  venue_name: string | null;
  category: string;
  date_str: string | null;
};

function buildSuggestions(tickets: TicketRow[]): string[] {
  if (!tickets.length) return [
    'How many events have I been to?',
    'What was my first event?',
    'Which venue have I visited most?',
    'What categories of events do I attend?',
  ];

  const concerts  = tickets.filter(t => t.category === 'concert');
  const sports    = tickets.filter(t => t.category === 'sports');
  const festivals = tickets.filter(t => t.category === 'festival');

  const suggestions: string[] = [];

  // Artist-specific question from a random concert
  if (concerts.length > 0) {
    const pick = concerts[Math.floor(Math.random() * concerts.length)];
    if (pick.title) suggestions.push(`Have I seen ${pick.title} more than once?`);
  }

  // Venue-specific question
  const venues = tickets.map(t => t.venue_name).filter(Boolean) as string[];
  if (venues.length > 0) {
    const venue = venues[Math.floor(Math.random() * venues.length)];
    suggestions.push(`How many times have I been to ${venue}?`);
  }

  // Category count
  if (concerts.length > 0) suggestions.push(`How many concerts have I been to?`);
  else if (sports.length > 0) suggestions.push(`How many sports games have I attended?`);
  else if (festivals.length > 0) suggestions.push(`Which festivals have I been to?`);
  else suggestions.push(`What types of events do I go to most?`);

  // First/last event
  suggestions.push(`What was my first event ever?`);

  return suggestions.slice(0, 4);
}

export default function AskScreen(): React.JSX.Element {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [input,       setInput]       = useState('');
  const [messages,    setMessages]    = useState<Message[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('tickets')
        .select('title, venue_name, category, date_str')
        .eq('user_id', user.id)
        .order('date_str', { ascending: false })
        .limit(50);
      setSuggestions(buildSuggestions(data ?? []));
    })();
  }, []);

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || loading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: q }]);
    setLoading(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const { data, error } = await supabase.functions.invoke('ask-memory', {
        body: { question: q },
      });
      if (error) throw error;
      setMessages(prev => [...prev, { role: 'assistant', text: data?.answer ?? 'Sorry, I couldn\'t answer that.' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Something went wrong. Please try again.' }]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="light-content" />
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Header ── */}
      <LinearGradient
        colors={[BRAND_FROM, BRAND_TO]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ paddingBottom: 20, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}
      >
        <SafeAreaView edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 4 }}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="arrow-back" size={20} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>Ask your memories</Text>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 24, color: '#fff', letterSpacing: -0.4, marginTop: 2 }}>Fan Memory AI</Text>
            </View>
            <View style={{ width: 40 }} />
          </View>
        </SafeAreaView>
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 20, paddingBottom: 8, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Empty state */}
          {isEmpty && (
            <View style={{ flex: 1, alignItems: 'center', paddingTop: 24 }}>
              <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: `${BRAND_FROM}18`, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <Ionicons name="sparkles" size={32} color={BRAND_FROM} />
              </View>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 20, color: FG, textAlign: 'center', letterSpacing: -0.3 }}>
                Ask anything about{'\n'}your event history
              </Text>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 14, color: MUTED, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
                I know every concert, game, and show{'\n'}you've imported to Salty.
              </Text>

              {/* Suggestions */}
              <View style={{ width: '100%', marginTop: 28, gap: 10 }}>
                {suggestions.map((s, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => send(s)}
                    activeOpacity={0.8}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: SURFACE, borderRadius: 16, padding: 14, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2 }}
                  >
                    <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: `${BRAND_FROM}18`, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="chatbubble-outline" size={15} color={BRAND_FROM} />
                    </View>
                    <Text style={{ flex: 1, fontFamily: 'DMSans_400Regular', fontSize: 14, color: FG }}>{s}</Text>
                    <Ionicons name="arrow-forward" size={14} color={MUTED} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Messages */}
          {messages.map((msg, i) => (
            <View
              key={i}
              style={{
                marginBottom: 12,
                alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              {msg.role === 'assistant' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <LinearGradient colors={[BRAND_FROM, BRAND_TO]} style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="sparkles" size={12} color="#fff" />
                  </LinearGradient>
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 11, color: MUTED, letterSpacing: 0.5 }}>SALTY AI</Text>
                </View>
              )}
              <View style={{
                maxWidth: '85%',
                backgroundColor: msg.role === 'user' ? BRAND_FROM : SURFACE,
                borderRadius: 18,
                borderBottomRightRadius: msg.role === 'user' ? 4 : 18,
                borderBottomLeftRadius: msg.role === 'assistant' ? 4 : 18,
                padding: 14,
                shadowColor: '#503cb4',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: msg.role === 'user' ? 0 : 0.08,
                shadowRadius: 10,
                elevation: msg.role === 'user' ? 0 : 2,
              }}>
                <Text style={{
                  fontFamily: 'DMSans_400Regular',
                  fontSize: 14,
                  color: msg.role === 'user' ? '#fff' : FG,
                  lineHeight: 20,
                }}>
                  {msg.text}
                </Text>
              </View>
            </View>
          ))}

          {loading && (
            <View style={{ alignItems: 'flex-start', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <LinearGradient colors={[BRAND_FROM, BRAND_TO]} style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="sparkles" size={12} color="#fff" />
                </LinearGradient>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 11, color: MUTED, letterSpacing: 0.5 }}>SALTY AI</Text>
              </View>
              <View style={{ backgroundColor: SURFACE, borderRadius: 18, borderBottomLeftRadius: 4, padding: 14 }}>
                <ActivityIndicator size="small" color={BRAND_FROM} />
              </View>
            </View>
          )}
        </ScrollView>

        {/* ── Input bar ── */}
        <View style={{ paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 28 : 16, paddingTop: 8, backgroundColor: BG, borderTopWidth: 1, borderTopColor: `${BRAND_FROM}18` }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, backgroundColor: SURFACE, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 3 }}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask about your events…"
              placeholderTextColor={MUTED}
              multiline
              style={{ flex: 1, fontFamily: 'DMSans_400Regular', fontSize: 14, color: FG, maxHeight: 100 }}
              onSubmitEditing={() => send(input)}
              returnKeyType="send"
              blurOnSubmit
            />
            <TouchableOpacity
              onPress={() => send(input)}
              disabled={!input.trim() || loading}
              style={{ width: 36, height: 36, borderRadius: 18, overflow: 'hidden', opacity: !input.trim() || loading ? 0.4 : 1 }}
            >
              <LinearGradient colors={[BRAND_FROM, BRAND_TO]} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="arrow-up" size={18} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
