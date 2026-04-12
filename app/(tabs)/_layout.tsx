import { Tabs } from 'expo-router';
import React from 'react';

import { MainTabBar } from '@/components/main-tab-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const TAB_ICON_SIZE = 24;

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <Tabs
      tabBar={(props) => <MainTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.tabIconSelected,
        tabBarInactiveTintColor: colors.tabIconDefault,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={TAB_ICON_SIZE} name="house.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: 'Leaderboard',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={TAB_ICON_SIZE} name="trophy.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          /** Keep mounted so the WebView does not reload every time you switch to Map. */
          lazy: false,
          tabBarIcon: ({ color }) => (
            <IconSymbol size={TAB_ICON_SIZE} name="map.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={TAB_ICON_SIZE} name="person.fill" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
