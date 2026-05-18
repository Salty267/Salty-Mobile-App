import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SidebarProvider } from '@/lib/SidebarContext';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function GradientTabBar(): React.JSX.Element {
  return (
    <LinearGradient
      colors={['#4f6cf2', '#a25cf2']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={{ flex: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}
    />
  );
}

export default function TabLayout(): React.JSX.Element {
  return (
    <SidebarProvider>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarBackground: GradientTabBar,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          height: 88,
          elevation: 16,
          shadowColor: '#4f6cf2',
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.35,
          shadowRadius: 20,
        },
        tabBarActiveTintColor: '#ffffff',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.52)',
        tabBarLabelStyle: {
          fontFamily: 'DMSans_500Medium',
          fontSize: 10,
        },
        tabBarItemStyle: {
          paddingTop: 10,
          paddingBottom: 4,
        },
      }}
    >
      {/* Left: Discover, Tickets — Center: Home — Right: Friends, Profile */}
      <Tabs.Screen
        name="search"
        options={{
          title: 'Discover',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={(focused ? 'compass' : 'compass-outline') as IoniconsName} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tickets"
        options={{
          title: 'Tickets',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={(focused ? 'ticket' : 'ticket-outline') as IoniconsName} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={(focused ? 'home' : 'home-outline') as IoniconsName} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={(focused ? 'calendar' : 'calendar-outline') as IoniconsName} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="memories"
        options={{
          title: 'Memories',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={(focused ? 'heart' : 'heart-outline') as IoniconsName} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="saved-events"
        options={{ href: null }}
      />
    </Tabs>
    </SidebarProvider>
  );
}
