import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { IconSymbol } from '@/components/ui/icon-symbol'
import { BrandViolet, Colors, Fonts } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import {
  fetchHasWorkoutToday,
  subscribeTodayWorkoutPostedInvalidate,
} from '@/lib/today-workout-tab'

const TAB_ICON_SIZE = 24

/** Leaderboard tab index — plus is inserted immediately after this route. */
const LEADERBOARD_INDEX = 1

type TabBarSlot = { type: 'tab'; routeIndex: number } | { type: 'plus' }

export function MainTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const { session } = useAuthContext()
  const [hasPostedToday, setHasPostedToday] = useState(false)

  const refreshPosted = useCallback(async () => {
    if (!session?.user?.id) {
      setHasPostedToday(false)
      return
    }
    try {
      const posted = await fetchHasWorkoutToday(session.user.id)
      setHasPostedToday(posted)
    } catch {
      setHasPostedToday(false)
    }
  }, [session?.user?.id])

  useEffect(() => {
    refreshPosted()
  }, [refreshPosted])

  useEffect(() => {
    return subscribeTodayWorkoutPostedInvalidate(() => {
      refreshPosted()
    })
  }, [refreshPosted])

  const showPlus = Boolean(session?.user?.id) && !hasPostedToday

  const onTabPress = useCallback(
    (routeKey: string, routeName: string, isFocused: boolean) => {
      const event = navigation.emit({
        type: 'tabPress',
        target: routeKey,
        canPreventDefault: true,
      })
      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(routeName as never)
      }
    },
    [navigation],
  )

  const tabPressIn = useCallback(() => {
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    }
  }, [])

  const onPlusPress = useCallback(() => {
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    }
    router.push('/log-workout')
  }, [])

  const bottomPad = Platform.OS === 'ios' ? Math.max(insets.bottom, 20) : Math.max(insets.bottom, 12)

  const slots: TabBarSlot[] = []
  state.routes.forEach((_, index) => {
    slots.push({ type: 'tab', routeIndex: index })
    if (index === LEADERBOARD_INDEX && showPlus) {
      slots.push({ type: 'plus' })
    }
  })

  return (
    <View
      style={[
        styles.shell,
        {
          paddingBottom: bottomPad,
          paddingTop: 8,
          backgroundColor: colors.tabBarBackground,
          shadowColor: colorScheme === 'dark' ? BrandViolet.primaryOnDark : '#000',
        },
      ]}
    >
      <View style={styles.row}>
        {slots.map((slot) => {
          if (slot.type === 'plus') {
            return (
              <View key="tab-post-plus" style={styles.slot}>
                <Pressable
                  onPress={onPlusPress}
                  onPressIn={tabPressIn}
                  style={({ pressed }) => [styles.plusHit, pressed && { opacity: 0.92 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Post workout"
                >
                  <View style={[styles.plusCircle, { backgroundColor: colors.tint }]}>
                    <IconSymbol name="plus" size={26} color="#fff" />
                  </View>
                </Pressable>
              </View>
            )
          }

          const route = state.routes[slot.routeIndex]!
          const isFocused = state.index === slot.routeIndex
          const { options } = descriptors[route.key]
          const tint = isFocused ? colors.tabIconSelected : colors.tabIconDefault
          const label = options.title ?? route.name

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              onPress={() => onTabPress(route.key, route.name, isFocused)}
              onPressIn={tabPressIn}
              style={({ pressed }) => [styles.slot, pressed && { opacity: 0.85 }]}
            >
              {options.tabBarIcon?.({
                focused: isFocused,
                color: tint,
                size: TAB_ICON_SIZE,
              })}
              <Text
                style={[
                  styles.label,
                  {
                    color: tint,
                    fontFamily: Fonts?.rounded,
                  },
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  shell: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 0,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
  },
  slot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 2,
    paddingBottom: 4,
  },
  label: {
    marginTop: 4,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  /** Reserve the same vertical band as icon + label so the + lines up with neighbors’ icons. */
  plusHit: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 14,
  },
  plusCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
