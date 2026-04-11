import Ionicons from '@expo/vector-icons/Ionicons'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { BottomTabBar } from '@react-navigation/bottom-tabs'
import * as Haptics from 'expo-haptics'
import { useRouter } from 'expo-router'
import { Platform, Pressable, StyleSheet, View } from 'react-native'

import { BrandViolet, Colors } from '@/constants/theme'
import { useColorScheme } from '@/hooks/use-color-scheme'

const FAB_SIZE = 56
/** Lifts the + so it overlaps the strip between Map and Leaderboard */
const FAB_LIFT = Platform.OS === 'ios' ? 24 : 18
const FAB_FROM_TAB_BOTTOM = Platform.OS === 'ios' ? 34 : 18

/**
 * Default bottom tab bar plus a center “post” FAB aligned between Map and Leaderboard (50% width).
 */
export function TabBarWithCenterPost(props: BottomTabBarProps) {
  const router = useRouter()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']

  const goLog = () => {
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    }
    router.push('/log-workout')
  }

  return (
    <View style={styles.wrap}>
      <BottomTabBar {...props} />
      <View style={styles.fabLayer} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Log workout"
          onPress={goLog}
          hitSlop={12}
          style={({ pressed }) => [
            styles.fab,
            {
              backgroundColor: colors.tint,
              bottom: FAB_FROM_TAB_BOTTOM,
              transform: [
                { translateY: -FAB_LIFT },
                { scale: pressed ? 0.96 : 1 },
              ],
              shadowColor: colorScheme === 'dark' ? BrandViolet.primaryOnDark : '#000',
            },
            pressed && styles.fabPressed,
          ]}
        >
          <Ionicons name="add" size={30} color="#fff" />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'visible',
    position: 'relative',
  },
  fabLayer: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'box-none',
  },
  fab: {
    position: 'absolute',
    left: '50%',
    width: FAB_SIZE,
    height: FAB_SIZE,
    marginLeft: -FAB_SIZE / 2,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 12,
  },
  fabPressed: {
    opacity: 0.92,
  },
})
