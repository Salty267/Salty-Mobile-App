import React from 'react';
import { View, Text, TouchableOpacity, StatusBar } from 'react-native';
import { scaleFont } from '@/lib/layout';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';

const BG   = '#FBF8F1';
const DEEP = '#1A0848';
const MUTED = '#8B8690';

export default function ConfirmedScreen(): React.JSX.Element {
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>

        <Text style={{ fontSize: 72, marginBottom: 24 }}>🎟</Text>

        <Text style={{ fontFamily: 'BebasNeue_400Regular', fontSize: scaleFont(48), letterSpacing: 8, color: DEEP, textAlign: 'center', marginBottom: 12 }}>
          YOU'RE IN.
        </Text>

        <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: MUTED, textAlign: 'center', marginBottom: 40, lineHeight: 20 }}>
          Your ticket vault is ready.
        </Text>

        <TouchableOpacity
          style={{ backgroundColor: DEEP, borderRadius: 14, paddingVertical: 16, width: '100%', alignItems: 'center', justifyContent: 'center' }}
          onPress={() => router.replace('/(tabs)')}
          activeOpacity={0.85}
        >
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, letterSpacing: 2, color: '#fff', textTransform: 'uppercase' }}>
            Start Exploring →
          </Text>
        </TouchableOpacity>

      </View>
    </SafeAreaView>
  );
}
