import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { SidebarProvider } from '@/lib/SidebarContext';
import { TAB_BAR_H, scale, scaleFont } from '@/lib/layout';

type TabName = 'search' | 'tickets' | 'index' | 'calendar' | 'profile';
type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_CONFIG: Record<TabName, { title: string; icon: IconName }> = {
  search:   { title: 'Discover', icon: 'compass-outline' },
  tickets:  { title: 'Tickets',  icon: 'ticket-outline' },
  index:    { title: 'Home',     icon: 'home-outline' },
  calendar: { title: 'Calendar', icon: 'calendar-outline' },
  profile:  { title: 'Profile',  icon: 'person-outline' },
};

const VISIBLE_TABS = new Set(['search', 'tickets', 'index', 'calendar', 'profile']);

function CustomTabBar({ state, navigation }: BottomTabBarProps): React.JSX.Element {
  const { bottom } = useSafeAreaInsets();
  const visibleRoutes = state.routes.filter(r => VISIBLE_TABS.has(r.name));

  return (
    // Shadow wrapper — no overflow:hidden so iOS shadow renders correctly.
    // backgroundColor matches gradient start so the corner areas don't show white.
    <View style={[styles.shadow, { paddingBottom: bottom }]}>
      <LinearGradient
        colors={['#4f6cf2', '#a25cf2']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradient}
      >
        {visibleRoutes.map(route => {
          const cfg = TAB_CONFIG[route.name as TabName];
          const focused = state.routes[state.index]?.name === route.name;
          const color = focused ? '#fff' : 'rgba(255,255,255,0.52)';

          return (
            <Pressable
              key={route.key}
              style={styles.item}
              android_ripple={{ color: 'rgba(255,255,255,0.15)', borderless: false }}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              }}
              onLongPress={() =>
                navigation.emit({ type: 'tabLongPress', target: route.key })
              }
            >
              <View style={styles.iconWrap}>
                <Ionicons name={cfg.icon} size={scale(22)} color={color} />
              </View>
              <Text
                style={[styles.label, { color }]}
                numberOfLines={1}
                allowFontScaling={false}
              >
                {cfg.title}
              </Text>
            </Pressable>
          );
        })}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: TAB_BAR_H,
    borderTopLeftRadius: scale(24),
    borderTopRightRadius: scale(24),
    backgroundColor: '#4f6cf2',
    shadowColor: '#4f6cf2',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 16,
  },
  gradient: {
    flex: 1,
    flexDirection: 'row',
    borderTopLeftRadius: scale(24),
    borderTopRightRadius: scale(24),
    overflow: 'hidden',
  },
  item: {
    flex: 1,
    paddingTop: scale(10),
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  iconWrap: {
    width: scale(24),
    height: scale(24),
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: 'DMSans_500Medium',
    fontSize: scaleFont(10),
    lineHeight: 14,
    height: 14,
    marginTop: 2,
    includeFontPadding: false,
  },
});

// Defined outside TabLayout so the reference is stable and React Navigation
// never remounts the tab bar.
function renderTabBar(props: BottomTabBarProps): React.JSX.Element {
  return <CustomTabBar {...props} />;
}

export default function TabLayout(): React.JSX.Element {
  return (
    <SidebarProvider>
      <Tabs
        initialRouteName="index"
        screenOptions={{ headerShown: false }}
        tabBar={renderTabBar}
      >
        <Tabs.Screen name="search"      options={{ title: 'Discover' }} />
        <Tabs.Screen name="tickets"     options={{ title: 'Tickets' }} />
        <Tabs.Screen name="index"       options={{ title: 'Home' }} />
        <Tabs.Screen name="friends"     options={{ href: null }} />
        <Tabs.Screen name="calendar"    options={{ title: 'Calendar' }} />
        <Tabs.Screen name="memories"    options={{ href: null }} />
        <Tabs.Screen name="profile"     options={{ title: 'Profile' }} />
        <Tabs.Screen name="saved-events" options={{ href: null }} />
      </Tabs>
    </SidebarProvider>
  );
}
