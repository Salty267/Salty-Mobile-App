import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, Alert, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase/client';
import { scale, scaleFont, sp } from '@/lib/layout';

const BRAND_FROM = '#4f6cf2';
const BRAND_TO   = '#a25cf2';
const FG         = '#1a1530';
const MUTED      = '#6b6a85';
const BG         = '#eef0fb';
const SURFACE    = '#ffffff';

type ScanState = 'idle' | 'analyzing';

export default function ScanTicketScreen(): React.JSX.Element {
  const router = useRouter();
  const [scanState, setScanState] = useState<ScanState>('idle');

  async function processImage(result: ImagePicker.ImagePickerResult) {
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    if (!asset.base64) {
      Alert.alert('Error', 'Could not read image data. Please try again.');
      return;
    }

    const mime = asset.mimeType ?? 'image/jpeg';
    const mimeType = (mime === 'image/heic' || mime === 'image/heif') ? 'image/jpeg' : mime;

    setScanState('analyzing');
    try {
      const { data, error } = await supabase.functions.invoke('scan-photo', {
        body: { imageBase64: asset.base64, mimeType },
      });

      if (error) throw error;

      if ((data?.pending ?? 0) === 0) {
        Alert.alert(
          'No ticket detected',
          "We couldn't find ticket information in that image. Try a clearer photo or a different angle.",
          [{ text: 'Try Again', style: 'cancel', onPress: () => setScanState('idle') }],
        );
        return;
      }

      router.replace('/review-imports');
    } catch {
      Alert.alert('Scan failed', 'Something went wrong. Please try again.');
      setScanState('idle');
    }
  }

  async function handleCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Camera Permission Required',
        'Please allow camera access to take a photo of your ticket.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.75,
      base64: true,
    });
    await processImage(result);
  }

  async function handleGallery() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Photo Library Permission Required',
        'Please allow photo library access to pick a ticket image.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.75,
      base64: true,
      allowsMultipleSelection: false,
    });
    await processImage(result);
  }

  const analyzing = scanState === 'analyzing';

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />

      {/* Header */}
      <LinearGradient
        colors={[BRAND_FROM, BRAND_TO]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <SafeAreaView edges={['top']}>
          <View style={styles.headerRow}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={scale(20)} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Scan Ticket</Text>
            <View style={{ width: scale(40) }} />
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* Body */}
      <View style={styles.body}>
        {analyzing ? (
          /* ── Analyzing state ── */
          <View style={styles.analyzingContainer}>
            <View style={styles.spinnerRing}>
              <ActivityIndicator size="large" color={BRAND_FROM} />
            </View>
            <Text style={styles.analyzingTitle}>Analyzing your ticket…</Text>
            <Text style={styles.analyzingSubtitle}>This usually takes a few seconds</Text>
          </View>
        ) : (
          /* ── Idle state ── */
          <View style={styles.idleContainer}>
            <LinearGradient
              colors={[`${BRAND_FROM}18`, `${BRAND_TO}18`]}
              style={styles.iconCircle}
            >
              <Ionicons name="camera" size={scale(52)} color={BRAND_TO} />
            </LinearGradient>

            <Text style={styles.idleTitle}>Scan Your Ticket</Text>
            <Text style={styles.idleSubtitle}>
              Take a photo or choose from your library.{'\n'}
              Works with printed tickets, screenshots, and QR codes.
            </Text>

            {/* Camera button */}
            <TouchableOpacity
              onPress={handleCamera}
              activeOpacity={0.85}
              style={styles.primaryBtn}
            >
              <LinearGradient
                colors={[BRAND_FROM, BRAND_TO]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.primaryBtnGradient}
              >
                <Ionicons name="camera-outline" size={scale(20)} color="#fff" />
                <Text style={styles.primaryBtnLabel}>Take Photo</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Gallery button */}
            <TouchableOpacity
              onPress={handleGallery}
              activeOpacity={0.85}
              style={styles.secondaryBtn}
            >
              <Ionicons name="images-outline" size={scale(20)} color={BRAND_FROM} />
              <Text style={styles.secondaryBtnLabel}>Choose from Library</Text>
            </TouchableOpacity>

            <Text style={styles.hint}>
              <Ionicons name="shield-checkmark-outline" size={scale(12)} color={MUTED} />
              {' '}Your photo is only used for ticket extraction and is not stored.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    paddingBottom: sp(16),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: sp(20),
    paddingTop: sp(8),
    paddingBottom: sp(4),
  },
  backBtn: {
    width: scale(40), height: scale(40), borderRadius: scale(20),
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: scaleFont(18), color: '#fff', letterSpacing: -0.2,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: sp(28),
  },
  /* Analyzing */
  analyzingContainer: {
    alignItems: 'center', gap: sp(16),
  },
  spinnerRing: {
    width: scale(88), height: scale(88), borderRadius: scale(44),
    backgroundColor: SURFACE,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: BRAND_FROM,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18, shadowRadius: 20, elevation: 6,
  },
  analyzingTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: scaleFont(20), color: FG, letterSpacing: -0.3, textAlign: 'center',
  },
  analyzingSubtitle: {
    fontFamily: 'DMSans_400Regular',
    fontSize: scaleFont(14), color: MUTED, textAlign: 'center',
  },
  /* Idle */
  idleContainer: {
    alignItems: 'center', gap: 0, width: '100%',
  },
  iconCircle: {
    width: scale(112), height: scale(112), borderRadius: scale(56),
    alignItems: 'center', justifyContent: 'center',
    marginBottom: sp(28),
  },
  idleTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: scaleFont(26), color: FG, letterSpacing: -0.4,
    textAlign: 'center', marginBottom: sp(12),
  },
  idleSubtitle: {
    fontFamily: 'DMSans_400Regular',
    fontSize: scaleFont(14), color: MUTED, textAlign: 'center', lineHeight: 21,
    marginBottom: sp(36),
  },
  primaryBtn: {
    width: '100%', borderRadius: scale(16), overflow: 'hidden', marginBottom: sp(12),
  },
  primaryBtnGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: sp(10), paddingVertical: sp(17),
  },
  primaryBtnLabel: {
    fontFamily: 'DMSans_700Bold',
    fontSize: scaleFont(15), color: '#fff', letterSpacing: 0.2,
  },
  secondaryBtn: {
    width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: sp(10), paddingVertical: sp(17), borderRadius: scale(16),
    backgroundColor: SURFACE,
    borderWidth: 1.5, borderColor: `${BRAND_FROM}30`,
    shadowColor: BRAND_FROM,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 2,
    marginBottom: sp(28),
  },
  secondaryBtnLabel: {
    fontFamily: 'DMSans_700Bold',
    fontSize: scaleFont(15), color: BRAND_FROM, letterSpacing: 0.2,
  },
  hint: {
    fontFamily: 'DMSans_400Regular',
    fontSize: scaleFont(11), color: MUTED, textAlign: 'center', lineHeight: 17,
  },
});
