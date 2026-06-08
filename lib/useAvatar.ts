import { useState, useEffect } from 'react';
import { Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { decode as decodeBase64 } from 'base64-arraybuffer';
import { supabase } from './supabase/client';

export function useAvatar() {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const url = user?.user_metadata?.avatar_url as string | undefined;
      if (url) setAvatarUrl(url);
    });

    // Keep in sync across screens — fires whenever updateUser is called
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const url = session?.user?.user_metadata?.avatar_url as string | undefined;
      if (url) setAvatarUrl(url);
    });

    return () => subscription.unsubscribe();
  }, []);

  const pickAndUpload = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status === 'denied') {
      Alert.alert(
        'Photos Access Required',
        'Please enable Photos access for Salty in Settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
      return;
    }

    // 'limited' = user granted access to specific photos only (iOS 14+)
    if (status !== 'granted' && (status as string) !== 'limited') return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });

    if (result.canceled || !result.assets?.[0]?.base64) return;

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const asset = result.assets[0];
      const rawExt = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      // HEIC/HEIF from iOS — remap to jpeg since the picker re-encodes it
      const ext  = (rawExt === 'heic' || rawExt === 'heif') ? 'jpg' : rawExt;
      const mime = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      const path = `${user.id}/avatar.${ext}`;

      // Decode base64 → Uint8Array via base64-arraybuffer's decode() — straight to an
      // ArrayBuffer (avoids fetch/blob unreliability on iOS, same as before, but also
      // skips the slow atob()+charCodeAt-loop's intermediate "raw bytes as a UTF-16 JS
      // string" hop — same swap applied across the upload pipeline; see
      // photo-scan-review.tsx's approveProposalWork for the full reasoning).
      const bytes = new Uint8Array(decodeBase64(asset.base64!));

      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, bytes, { upsert: true, contentType: mime });

      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(path);

      const bustedUrl = `${publicUrl}?t=${Date.now()}`;
      setAvatarUrl(bustedUrl);
      await Promise.all([
        supabase.auth.updateUser({ data: { avatar_url: bustedUrl } }),
        supabase.from('users').update({ avatar_url: bustedUrl }).eq('id', user.id),
      ]);
    } catch (e) {
      console.error('Avatar upload failed:', e);
      Alert.alert('Upload failed', 'Could not save your photo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return { avatarUrl, uploading, pickAndUpload };
}
