import { useState, useEffect } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase/client';

export function useAvatar() {
  const [avatarUrl,  setAvatarUrl]  = useState<string | null>(null);
  const [uploading,  setUploading]  = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const url = user?.user_metadata?.avatar_url as string | undefined;
      if (url) setAvatarUrl(url);
    });
  }, []);

  const pickAndUpload = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled) return;

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const uri   = result.assets[0].uri;
      const ext   = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path  = `${user.id}/avatar.${ext}`;
      const mime  = `image/${ext === 'jpg' ? 'jpeg' : ext}`;

      const res  = await fetch(uri);
      const blob = await res.blob();

      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { upsert: true, contentType: mime });

      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(path);

      // Bust cache so the new image is loaded immediately
      const bustedUrl = `${publicUrl}?t=${Date.now()}`;
      setAvatarUrl(bustedUrl);
      await supabase.auth.updateUser({ data: { avatar_url: bustedUrl } });
    } finally {
      setUploading(false);
    }
  };

  return { avatarUrl, uploading, pickAndUpload };
}
