import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Image, TouchableOpacity, Animated, Easing,
  Dimensions, Modal, ScrollView, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scale, scaleFont, sp } from '@/lib/layout';
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

const MENU_BASE: MenuItem[] = [
  { icon: 'film-outline',           label: 'Memories'     },
  { icon: 'heart-outline',          label: 'Saved Events' },
  { icon: 'people-outline',         label: 'Friends'      },
  { icon: 'notifications-outline',  label: 'Following'    },
  { icon: 'settings-outline',       label: 'Settings'     },
  { icon: 'chatbubble-outline',     label: 'Feedback'     },
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

  const [fullName,        setFullName]        = useState('');
  const [email,           setEmail]           = useState('');
  const [initials,        setInitials]        = useState('?');
  const [pendingCount,    setPendingCount]     = useState(0);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setEmail(user.email ?? '');

      const [profileRes, pendingRes] = await Promise.all([
        supabase.from('users').select('display_name').eq('id', user.id).single(),
        supabase.from('friendships').select('id', { count: 'exact', head: true })
          .eq('addressee_id', user.id).eq('status', 'pending'),
      ]);

      const name = profileRes.data?.display_name
        ?? (user.user_metadata?.full_name as string | undefined)
        ?? '';
      setFullName(name);
      setInitials(
        name
          ? name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
          : (user.email?.[0].toUpperCase() ?? '?'),
      );
      setPendingCount(pendingRes.count ?? 0);
    });
  }, []);

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(-SIDEBAR_W);
      fadeAnim.setValue(0);
      setModalVisible(true);
      requestAnimationFrame(() => {
        Animated.parallel([
          Animated.spring(slideAnim, {
            toValue: 0,
            damping: 24,
            stiffness: 220,
            mass: 0.9,
            overshootClamping: true,
            useNativeDriver: true,
          }),
          Animated.timing(fadeAnim, {
            toValue: 1, duration: 220,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]).start();
      });
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -SIDEBAR_W, duration: 200,
          easing: Easing.in(Easing.bezier(0.4, 0, 0.6, 1)),
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0, duration: 180,
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
      hardwareAccelerated
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
        <View style={{ flex: 1, backgroundColor: BG, borderTopRightRadius: scale(28), borderBottomRightRadius: scale(28), overflow: 'hidden' }}>

          {/* ── Header gradient — extends into status bar ── */}
          <LinearGradient
            colors={[BRAND_FROM, BRAND_TO]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ paddingTop: insets.top + sp(20), paddingHorizontal: sp(20), paddingBottom: sp(24) }}
          >
            {/* Avatar + name */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(14) }}>
              <View style={{ width: scale(56), height: scale(56), borderRadius: scale(28), backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)', overflow: 'hidden' }}>
                {avatarUrl
                  ? <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  : <Text style={{ fontFamily: 'BebasNeue_400Regular', fontSize: scaleFont(22), color: '#fff' }}>{initials}</Text>
                }
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(18), color: '#fff', letterSpacing: -0.3 }} numberOfLines={1}>
                  {fullName || 'Hey there'} 👋
                </Text>
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: scaleFont(12), color: 'rgba(255,255,255,0.72)', marginTop: 2 }} numberOfLines={1}>
                  {email}
                </Text>
              </View>
            </View>

          </LinearGradient>

          {/* ── Menu items ── */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingVertical: sp(16), paddingHorizontal: sp(16), gap: sp(4) }}
          >
            {MENU_BASE.map(item => ({
              ...item,
              badge: item.label === 'Friends' && pendingCount > 0 ? pendingCount : undefined,
            })).map(item => (
              <TouchableOpacity
                key={item.label}
                activeOpacity={0.7}
                onPress={() => {
                  if (item.label === 'Memories') { onClose(); router.push('/(tabs)/memories'); }
                  else if (item.label === 'Settings') { onClose(); router.push('/settings'); }
                  else if (item.label === 'Saved Events') { onClose(); router.push('/(tabs)/saved-events'); }
                  else if (item.label === 'Friends') { onClose(); router.push('/(tabs)/friends'); }
                  else if (item.label === 'Following') { onClose(); router.push('/following'); }
                  else if (item.label === 'Feedback') { onClose(); router.push('/feedback'); }
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: sp(14), paddingHorizontal: sp(12), paddingVertical: sp(13), borderRadius: scale(16) }}
              >
                <View style={{ width: scale(42), height: scale(42), borderRadius: scale(21), backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#503cb4', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 2 }}>
                  <Ionicons name={item.icon} size={20} color={BRAND_FROM} />
                </View>
                <Text style={{ flex: 1, fontFamily: 'DMSans_500Medium', fontSize: scaleFont(15), color: FG }}>{item.label}</Text>
                {item.badge !== undefined && (
                  <View style={{ backgroundColor: BRAND_FROM, borderRadius: 99, minWidth: scale(26), height: scale(22), alignItems: 'center', justifyContent: 'center', paddingHorizontal: sp(7) }}>
                    <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(11), color: '#fff' }}>{item.badge}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* ── Log out ── */}
          <TouchableOpacity
            onPress={handleSignOut}
            activeOpacity={0.7}
            style={{ flexDirection: 'row', alignItems: 'center', gap: sp(10), paddingHorizontal: sp(28), paddingBottom: insets.bottom + sp(16), paddingTop: sp(12) }}
          >
            <Ionicons name="log-out-outline" size={20} color="#e55" />
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scaleFont(15), color: '#e55' }}>Log out</Text>
          </TouchableOpacity>

        </View>
      </Animated.View>
    </Modal>
  );
}
