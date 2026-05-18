import React, { useEffect, useState } from 'react';
import {
  View, Text, Image, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { scale } from '@/lib/layout';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase/client';
import { useAvatar } from '@/lib/useAvatar';

const BRAND_FROM = '#4f6cf2';
const BRAND_TO   = '#a25cf2';
const FG         = '#1a1530';
const MUTED      = '#6b6a85';
const SURFACE    = '#ffffff';
const BG         = '#eef0fb';
const BORDER     = '#e6e4f0';
const SECONDARY  = '#f1eefb';

type Field = { label: string; value: string; onChange?: (v: string) => void; placeholder: string; keyboard?: 'default' | 'email-address' | 'phone-pad'; readOnly?: boolean };

export default function EditProfileScreen(): React.JSX.Element {
  const router  = useRouter();
  const { bottom } = useSafeAreaInsets();
  const { avatarUrl, uploading: avatarUploading, pickAndUpload } = useAvatar();

  const [fullName, setFullName] = useState('');
  const [phone,    setPhone]    = useState('');
  const [email,    setEmail]    = useState('');
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setFullName((user.user_metadata?.full_name as string | undefined) ?? '');
      setPhone((user.user_metadata?.phone_number as string | undefined) ?? '');
      setEmail(user.email ?? '');
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    await supabase.auth.updateUser({
      data: { full_name: fullName.trim(), phone_number: phone.trim() },
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const initials = fullName
    ? fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : email[0]?.toUpperCase() ?? '?';

  const FIELDS: Field[] = [
    { label: 'Full Name',     value: fullName, onChange: setFullName, placeholder: 'Enter your full name'   },
    { label: 'Phone Number',  value: phone,    onChange: setPhone,    placeholder: 'Enter your phone number', keyboard: 'phone-pad' },
    { label: 'Email',         value: email,    onChange: undefined,   placeholder: 'Email address', keyboard: 'email-address', readOnly: true },
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={{ flex: 1, backgroundColor: BG }}>


        {/* ── Header ── */}
        <LinearGradient
          colors={[BRAND_FROM, BRAND_TO]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ paddingBottom: 24, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}
        >
          <SafeAreaView edges={['top']}>
            {/* Nav row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 20 }}>
              <TouchableOpacity
                onPress={() => router.back()}
                style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="chevron-back" size={22} color="#fff" />
              </TouchableOpacity>

              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 18, color: '#fff', letterSpacing: -0.3 }}>Edit Profile</Text>

              <TouchableOpacity
                onPress={handleSave}
                disabled={saving}
                style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.22)' }}
                activeOpacity={0.8}
              >
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: '#fff' }}>
                      {saved ? '✓ Saved' : 'Save'}
                    </Text>
                }
              </TouchableOpacity>
            </View>

            {/* Avatar */}
            <View style={{ alignItems: 'center' }}>
              <TouchableOpacity onPress={pickAndUpload} activeOpacity={0.85}>
                <View style={{ width: scale(88), height: scale(88), borderRadius: scale(44), backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.5)', overflow: 'hidden' }}>
                  {avatarUrl
                    ? <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    : <Text style={{ fontFamily: 'BebasNeue_400Regular', fontSize: 34, color: '#fff' }}>{initials}</Text>
                  }
                </View>
                {/* Camera badge */}
                <View style={{ position: 'absolute', bottom: 0, right: 0, width: scale(30), height: scale(30), borderRadius: scale(15), backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)' }}>
                  {avatarUploading
                    ? <ActivityIndicator size="small" color={BRAND_FROM} />
                    : <Ionicons name="camera" size={15} color={BRAND_FROM} />
                  }
                </View>
              </TouchableOpacity>
              <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 10 }}>
                Tap to change photo
              </Text>
            </View>
          </SafeAreaView>
        </LinearGradient>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: bottom + 32 }}>

          {/* ── Form fields ── */}
          <View style={{ backgroundColor: SURFACE, borderRadius: 20, overflow: 'hidden', shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 14, elevation: 3 }}>
            {FIELDS.map((field, i) => (
              <View key={field.label}>
                <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 }}>
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 11, color: MUTED, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>
                    {field.label}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <TextInput
                      value={field.value}
                      onChangeText={field.onChange}
                      placeholder={field.placeholder}
                      placeholderTextColor={BORDER}
                      keyboardType={field.keyboard ?? 'default'}
                      editable={!field.readOnly}
                      style={{
                        flex: 1,
                        fontFamily: 'DMSans_400Regular',
                        fontSize: 15,
                        color: field.readOnly ? MUTED : FG,
                      }}
                    />
                    {field.readOnly && (
                      <View style={{ backgroundColor: SECONDARY, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 10, color: BRAND_FROM }}>Locked</Text>
                      </View>
                    )}
                  </View>
                </View>
                {i < FIELDS.length - 1 && (
                  <View style={{ height: 1, backgroundColor: BORDER, marginLeft: 16 }} />
                )}
              </View>
            ))}
          </View>

          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: MUTED, marginTop: 12, paddingHorizontal: 4 }}>
            Email address is managed by your sign-in method and cannot be changed here.
          </Text>

          {/* ── Save button ── */}
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
            style={{ marginTop: 28, overflow: 'hidden', borderRadius: 16, opacity: saving ? 0.7 : 1 }}
          >
            <LinearGradient
              colors={[BRAND_FROM, BRAND_TO]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ height: scale(54), alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Ionicons name={saved ? 'checkmark-circle' : 'save-outline'} size={18} color="#fff" />
                    <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 15, color: '#fff' }}>
                      {saved ? 'Changes saved!' : 'Save changes'}
                    </Text>
                  </>
              }
            </LinearGradient>
          </TouchableOpacity>

        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
