import { useState, useEffect } from 'react';
import { Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
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
      const ext  = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const mime = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      const path = `${user.id}/avatar.${ext}`;

      // Decode base64 → Uint8Array — avoids fetch/blob unreliability on iOS
      const binary = atob(asset.base64!);
      const bytes  = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, bytes.buffer, { upsert: true, contentType: mime });

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
