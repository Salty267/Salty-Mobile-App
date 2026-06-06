import React, { useEffect, useState } from 'react';
import {
  View, Text, Image, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { scale, scaleFont, sp } from '@/lib/layout';
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

type Field = {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder: string;
  keyboard?: 'default' | 'email-address' | 'phone-pad';
  readOnly?: boolean;
  badgeText?: string;
  note?: string;
};

const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length > 7) return `+${digits}`;
  return null;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function formatUnlockDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function EditProfileScreen(): React.JSX.Element {
  const router  = useRouter();
  const { bottom } = useSafeAreaInsets();
  const { avatarUrl, uploading: avatarUploading, pickAndUpload } = useAvatar();

  const [userId,           setUserId]           = useState('');
  const [fullName,         setFullName]         = useState('');
  const [phone,            setPhone]            = useState('');
  const [email,            setEmail]            = useState('');
  const [zipCode,          setZipCode]          = useState('');
  const [username,         setUsername]         = useState('');
  const [savedUsername,    setSavedUsername]    = useState('');
  const [usernameChangedAt, setUsernameChangedAt] = useState<Date | null>(null);
  const [saving,           setSaving]           = useState(false);
  const [saved,            setSaved]            = useState(false);
  const [photoSaved,       setPhotoSaved]       = useState(false);
  const [usernameError,    setUsernameError]    = useState('');
  const [changePwForm,     setChangePwForm]     = useState({ current: '', next: '', confirm: '' });
  const [changingPw,       setChangingPw]       = useState(false);
  const [pwSaved,          setPwSaved]          = useState(false);
  const [pwError,          setPwError]          = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      setFullName((user.user_metadata?.full_name as string | undefined) ?? '');
      setPhone((user.user_metadata?.phone_number as string | undefined) ?? '');
      setEmail(user.email ?? '');
      const { data: profile } = await supabase
        .from('users')
        .select('zip_code, username, username_changed_at')
        .eq('id', user.id)
        .single();
      setZipCode(profile?.zip_code ?? '');
      setUsername(profile?.username ?? '');
      setSavedUsername(profile?.username ?? '');
      setUsernameChangedAt(
        profile?.username_changed_at ? new Date(profile.username_changed_at) : null,
      );
    });
  }, []);

  const unlockDate = usernameChangedAt ? addMonths(usernameChangedAt, 6) : null;
  const usernameIsLocked = unlockDate ? new Date() < unlockDate : false;

  const handleSave = async () => {
    // Validate username if changed
    const newUsername = username.trim().toLowerCase();
    const usernameChanged = newUsername !== savedUsername;

    if (usernameChanged) {
      if (usernameIsLocked) {
        Alert.alert('Username locked', `You can change your username again on ${formatUnlockDate(unlockDate!)}.`);
        return;
      }
      if (!USERNAME_RE.test(newUsername)) {
        setUsernameError('3–30 characters: lowercase letters, numbers, underscores only.');
        return;
      }
      // Check uniqueness
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('username', newUsername)
        .neq('id', userId)
        .maybeSingle();
      if (existing) {
        setUsernameError('That username is already taken.');
        return;
      }
    }

    setUsernameError('');
    setSaving(true);
    setSaved(false);

    const profileUpdate: Record<string, unknown> = {
      zip_code: zipCode.trim() || null,
      phone_number: normalizePhone(phone.trim()),
    };
    if (usernameChanged) {
      profileUpdate.username = newUsername;
      profileUpdate.username_changed_at = new Date().toISOString();
    }

    try {
      await Promise.all([
        supabase.auth.updateUser({
          data: { full_name: fullName.trim(), phone_number: phone.trim() },
        }),
        supabase.from('users').update(profileUpdate).eq('id', userId),
      ]);

      if (usernameChanged) {
        setSavedUsername(newUsername);
        setUsername(newUsername);
        setUsernameChangedAt(new Date());
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      Alert.alert('Save failed', 'Could not save your changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    const { current, next, confirm } = changePwForm;
    if (!current || !next || !confirm) { setPwError('Please fill in all fields.'); return; }
    if (next.length < 8) { setPwError('New password must be at least 8 characters.'); return; }
    if (next !== confirm) { setPwError('New passwords do not match.'); return; }

    setChangingPw(true);
    setPwError('');

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: current });
      if (signInError) { setPwError('Current password is incorrect.'); return; }

      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) { setPwError('Failed to update password. Please try again.'); return; }

      setPwSaved(true);
      setChangePwForm({ current: '', next: '', confirm: '' });
      setTimeout(() => setPwSaved(false), 2500);
    } catch {
      setPwError('Something went wrong. Please try again.');
    } finally {
      setChangingPw(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all your data — tickets, photos, friends, and activity. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account', style: 'destructive',
          onPress: () => Alert.alert(
            'Last chance',
            'Are you absolutely sure? Your data will be gone forever.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Yes, delete everything', style: 'destructive', onPress: confirmDeleteAccount },
            ]
          ),
        },
      ]
    );
  };

  const confirmDeleteAccount = async () => {
    const { error } = await supabase.functions.invoke('delete-account');
    if (error) { Alert.alert('Error', 'Failed to delete account. Please try again.'); return; }
    await supabase.auth.signOut();
  };

  const initials = fullName
    ? fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : email[0]?.toUpperCase() ?? '?';

  const FIELDS: Field[] = [
    {
      label: 'Full Name',
      value: fullName,
      onChange: setFullName,
      placeholder: 'Enter your full name',
    },
    {
      label: 'Username',
      value: username,
      onChange: usernameIsLocked ? undefined : (v) => { setUsername(v.toLowerCase()); setUsernameError(''); },
      placeholder: 'username',
      readOnly: usernameIsLocked,
      badgeText: usernameIsLocked && unlockDate ? `Until ${unlockDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : undefined,
      note: usernameIsLocked && unlockDate
        ? `Can be changed again on ${formatUnlockDate(unlockDate)}`
        : 'Lowercase letters, numbers and underscores only.',
    },
    {
      label: 'Phone Number',
      value: phone,
      onChange: setPhone,
      placeholder: 'Enter your phone number',
      keyboard: 'phone-pad',
    },
    {
      label: 'Zip Code',
      value: zipCode,
      onChange: setZipCode,
      placeholder: 'Enter your zip code',
      keyboard: 'phone-pad',
    },
    {
      label: 'Email',
      value: email,
      onChange: undefined,
      placeholder: 'Email address',
      keyboard: 'email-address',
      readOnly: true,
    },
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={{ flex: 1, backgroundColor: BG }}>

        {/* ── Header ── */}
        <LinearGradient
          colors={[BRAND_FROM, BRAND_TO]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ paddingBottom: sp(20), borderBottomLeftRadius: scale(32), borderBottomRightRadius: scale(32) }}
        >
          <SafeAreaView edges={['top']}>
            {/* Nav row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: sp(20), paddingTop: 4, paddingBottom: 4 }}>
              <TouchableOpacity
                onPress={() => router.back()}
                style={{ width: scale(40), height: scale(40), borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="chevron-back" size={22} color="#fff" />
              </TouchableOpacity>

              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(12), color: 'rgba(255,255,255,0.72)' }}>Your account</Text>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(24), color: '#fff', letterSpacing: -0.4, marginTop: 2 }}>Edit Profile</Text>
              </View>

              <View style={{ width: scale(40) }} />
            </View>

            {/* Avatar */}
            <View style={{ alignItems: 'center' }}>
              <TouchableOpacity onPress={async () => { await pickAndUpload(); setPhotoSaved(true); setTimeout(() => setPhotoSaved(false), 2000); }} activeOpacity={0.85}>
                <View style={{ width: scale(88), height: scale(88), borderRadius: scale(44), backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.5)', overflow: 'hidden' }}>
                  {avatarUrl
                    ? <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    : <Text style={{ fontFamily: 'BebasNeue_400Regular', fontSize: scaleFont(34), color: '#fff' }}>{initials}</Text>
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
              <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: scaleFont(12), color: 'rgba(255,255,255,0.8)', marginTop: sp(10) }}>
                {photoSaved ? '✓ Photo updated' : 'Tap to change photo'}
              </Text>
            </View>
          </SafeAreaView>
        </LinearGradient>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: sp(20), paddingTop: sp(28), paddingBottom: bottom + 32 }}>

          {/* ── Form fields ── */}
          <View style={{ backgroundColor: SURFACE, borderRadius: scale(20), overflow: 'hidden', shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 14, elevation: 3 }}>
            {FIELDS.map((field, i) => (
              <View key={field.label}>
                <View style={{ paddingHorizontal: sp(16), paddingTop: sp(14), paddingBottom: field.note ? sp(6) : sp(12) }}>
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(11), color: MUTED, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: sp(6) }}>
                    {field.label}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(10) }}>
                    <TextInput
                      value={field.value}
                      onChangeText={field.onChange}
                      placeholder={field.placeholder}
                      placeholderTextColor={BORDER}
                      keyboardType={field.keyboard ?? 'default'}
                      editable={!field.readOnly}
                      autoCapitalize={field.label === 'Username' ? 'none' : 'words'}
                      autoCorrect={false}
                      style={{
                        flex: 1,
                        fontFamily: 'DMSans_400Regular',
                        fontSize: scaleFont(15),
                        color: field.readOnly ? MUTED : FG,
                      }}
                    />
                    {field.readOnly && (
                      <View style={{ backgroundColor: SECONDARY, borderRadius: 8, paddingHorizontal: sp(8), paddingVertical: 3 }}>
                        <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(10), color: BRAND_FROM }}>
                          {field.badgeText ?? 'Locked'}
                        </Text>
                      </View>
                    )}
                  </View>
                  {field.note && (
                    <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(11), color: field.label === 'Username' && usernameError ? '#ef4444' : MUTED, marginTop: sp(4), marginBottom: sp(6) }}>
                      {field.label === 'Username' && usernameError ? usernameError : field.note}
                    </Text>
                  )}
                  {field.label === 'Username' && usernameError && !field.note && (
                    <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(11), color: '#ef4444', marginTop: sp(4), marginBottom: sp(6) }}>
                      {usernameError}
                    </Text>
                  )}
                </View>
                {i < FIELDS.length - 1 && (
                  <View style={{ height: 1, backgroundColor: BORDER, marginLeft: 16 }} />
                )}
              </View>
            ))}
          </View>

          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(12), color: MUTED, marginTop: sp(12), paddingHorizontal: 4 }}>
            Email address is managed by your sign-in method and cannot be changed here.
          </Text>

          {/* ── Save button ── */}
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
            style={{ marginTop: sp(28), overflow: 'hidden', borderRadius: scale(16), opacity: saving ? 0.7 : 1 }}
          >
            <LinearGradient
              colors={[BRAND_FROM, BRAND_TO]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ height: scale(54), alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: sp(8) }}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Ionicons name={saved ? 'checkmark-circle' : 'save-outline'} size={18} color="#fff" />
                    <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(15), color: '#fff' }}>
                      {saved ? 'Changes saved!' : 'Save changes'}
                    </Text>
                  </>
              }
            </LinearGradient>
          </TouchableOpacity>

          {/* ── Change Password ── */}
          <View style={{ backgroundColor: SURFACE, borderRadius: scale(20), overflow: 'hidden', shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 14, elevation: 3, marginTop: sp(24) }}>
            <View style={{ paddingHorizontal: sp(16), paddingTop: sp(16), paddingBottom: sp(4) }}>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(15), color: FG }}>Change Password</Text>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(12), color: MUTED, marginTop: 2 }}>
                Must be signed in with email to change your password.
              </Text>
            </View>

            {pwError ? (
              <View style={{ marginHorizontal: sp(16), marginTop: sp(10), backgroundColor: '#FDEBD9', borderRadius: 10, paddingHorizontal: sp(12), paddingVertical: sp(8), borderLeftWidth: 3, borderLeftColor: '#E8581A' }}>
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(12), color: '#E8581A' }}>{pwError}</Text>
              </View>
            ) : null}

            {[
              { key: 'current' as const, label: 'Current Password',  placeholder: 'Enter current password' },
              { key: 'next'    as const, label: 'New Password',       placeholder: 'At least 8 characters' },
              { key: 'confirm' as const, label: 'Confirm New Password', placeholder: 'Re-enter new password' },
            ].map(({ key, label, placeholder }, i) => (
              <View key={key}>
                <View style={{ paddingHorizontal: sp(16), paddingTop: sp(14), paddingBottom: sp(12) }}>
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(11), color: MUTED, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: sp(6) }}>{label}</Text>
                  <TextInput
                    value={changePwForm[key]}
                    onChangeText={v => setChangePwForm(f => ({ ...f, [key]: v }))}
                    placeholder={placeholder}
                    placeholderTextColor={BORDER}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(15), color: FG }}
                  />
                </View>
                {i < 2 && <View style={{ height: 1, backgroundColor: BORDER, marginLeft: sp(16) }} />}
              </View>
            ))}

            <View style={{ paddingHorizontal: sp(16), paddingBottom: sp(16), paddingTop: sp(8) }}>
              <TouchableOpacity
                onPress={handleChangePassword}
                disabled={changingPw}
                activeOpacity={0.85}
                style={{ overflow: 'hidden', borderRadius: scale(14), opacity: changingPw ? 0.7 : 1 }}
              >
                <LinearGradient
                  colors={[BRAND_FROM, BRAND_TO]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ height: scale(48), alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: sp(8) }}
                >
                  {changingPw
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <>
                        <Ionicons name={pwSaved ? 'checkmark-circle' : 'lock-closed-outline'} size={16} color="#fff" />
                        <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(14), color: '#fff' }}>
                          {pwSaved ? 'Password updated!' : 'Update Password'}
                        </Text>
                      </>
                  }
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Delete Account ── */}
          <TouchableOpacity
            onPress={handleDeleteAccount}
            activeOpacity={0.8}
            style={{ marginTop: sp(16), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp(8), paddingVertical: sp(14) }}
          >
            <Ionicons name="trash-outline" size={16} color="#ef4444" />
            <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: scaleFont(14), color: '#ef4444' }}>Delete Account</Text>
          </TouchableOpacity>

        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
