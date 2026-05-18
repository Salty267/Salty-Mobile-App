import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Image, TouchableOpacity, Animated, Easing,
  Dimensions, Modal, ScrollView, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scale } from '@/lib/layout';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase/client';
import { useAvatar } from '@/lib/useAvatar';

const { width: SCREEN_W } = Dimensions.get('window');
const SIDEBAR_W = Math.round(SCREEN_W * 0.82);

const BRAND_FROM = '#4f6cf2';
const BRAND_TO   = '#a25cf2';
const FG         = '#1a1530';
const MUTED      = '#6b6a85';
const BG         = '#f0eef8';

type MenuItem = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  badge?: number;
};

const MENU: MenuItem[] = [
  { icon: 'heart-outline',       label: 'Saved Events'             },
  { icon: 'people-outline',      label: 'Friends',      badge: 47 },
  { icon: 'settings-outline',    label: 'Settings'                 },
  { icon: 'chatbubble-outline',  label: 'Feedback'                 },
];

type Props = { visible: boolean; onClose: () => void };

export default function Sidebar({ visible, onClose }: Props): React.JSX.Element {
  const router    = useRouter();
  const insets    = useSafeAreaInsets();
  const { avatarUrl } = useAvatar();
  const slideAnim = useRef(new Animated.Value(-SIDEBAR_W)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  // Separate modal visibility from prop so close animation plays before unmount
  const [modalVisible, setModalVisible] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email,    setEmail]    = useState('');
  const [initials, setInitials] = useState('?');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      const name = (user.user_metadata?.full_name as string | undefined) ?? '';
      setFullName(name);
      setEmail(user.email ?? '');
      setInitials(
        name
          ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
          : (user.email?.[0].toUpperCase() ?? '?')
      );
    });
  }, []);

  useEffect(() => {
    if (visible) {
      // Show modal first, then slide in
      slideAnim.setValue(-SIDEBAR_W);
      fadeAnim.setValue(0);
      setModalVisible(true);
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0, duration: 320,
          easing: Easing.out(Easing.bezier(0.25, 0.46, 0.45, 0.94)),
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1, duration: 280,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Slide out first, then hide modal
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -SIDEBAR_W, duration: 260,
          easing: Easing.in(Easing.bezier(0.55, 0, 0.55, 0.2)),
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0, duration: 220,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setModalVisible(false);
      });
    }
  }, [visible]);

  const handleSignOut = async () => {
    onClose();
    await supabase.auth.signOut();
  };

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Dark overlay */}
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(10,5,30,0.52)' }}
          onPress={onClose}
        />
      </Animated.View>

      {/* Sidebar panel — no overflow:hidden so shadow is visible */}
      <Animated.View
        style={{
          position: 'absolute', top: 0, left: 0, bottom: 0,
          width: SIDEBAR_W,
          transform: [{ translateX: slideAnim }],
          shadowColor: '#000',
          shadowOffset: { width: 8, height: 0 },
          shadowOpacity: 0.22,
          shadowRadius: 24,
          elevation: 20,
        }}
      >
        {/* Inner view handles rounding + clip */}
        <View style={{ flex: 1, backgroundColor: BG, borderTopRightRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden' }}>

          {/* ── Header gradient — extends into status bar ── */}
          <LinearGradient
            colors={[BRAND_FROM, BRAND_TO]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ paddingTop: insets.top + 20, paddingHorizontal: 20, paddingBottom: 24 }}
          >
            {/* Avatar + name */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 }}>
              <View style={{ width: scale(56), height: scale(56), borderRadius: scale(28), backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)', overflow: 'hidden' }}>
                {avatarUrl
                  ? <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  : <Text style={{ fontFamily: 'BebasNeue_400Regular', fontSize: 22, color: '#fff' }}>{initials}</Text>
                }
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 18, color: '#fff', letterSpacing: -0.3 }} numberOfLines={1}>
                  {fullName || 'Hey there'} 👋
                </Text>
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: 'rgba(255,255,255,0.72)', marginTop: 2 }} numberOfLines={1}>
                  {email}
                </Text>
              </View>
            </View>

            {/* Stats pills */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {[['24', 'Events'], ['47', 'Friends'], ['12', 'Shows']].map(([val, label]) => (
                <View key={label} style={{ flex: 1, alignItems: 'center', paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 14 }}>
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 18, color: '#fff' }}>{val}</Text>
                  <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 2 }}>{label}</Text>
                </View>
              ))}
            </View>
          </LinearGradient>

          {/* ── Menu items ── */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingVertical: 16, paddingHorizontal: 16, gap: 4 }}
          >
            {MENU.map(item => (
              <TouchableOpacity
                key={item.label}
                activeOpacity={0.7}
                onPress={() => {
                  if (item.label === 'Settings') { onClose(); router.push('/settings'); }
                  else if (item.label === 'Saved Events') { onClose(); router.push('/(tabs)/saved-events'); }
                  else if (item.label === 'Feedback') { onClose(); router.push('/feedback'); }
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 12, paddingVertical: 13, borderRadius: 16 }}
              >
                <View style={{ width: scale(42), height: scale(42), borderRadius: scale(21), backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#503cb4', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 2 }}>
                  <Ionicons name={item.icon} size={20} color={BRAND_FROM} />
                </View>
                <Text style={{ flex: 1, fontFamily: 'DMSans_500Medium', fontSize: 15, color: FG }}>{item.label}</Text>
                {item.badge !== undefined && (
                  <View style={{ backgroundColor: BRAND_FROM, borderRadius: 99, minWidth: 26, height: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 }}>
                    <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 11, color: '#fff' }}>{item.badge}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* ── Log out ── */}
          <TouchableOpacity
            onPress={handleSignOut}
            activeOpacity={0.7}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 28, paddingBottom: insets.bottom + 16, paddingTop: 12 }}
          >
            <Ionicons name="log-out-outline" size={20} color="#e55" />
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 15, color: '#e55' }}>Log out</Text>
          </TouchableOpacity>

        </View>
      </Animated.View>
    </Modal>
  );
}
