import { useAuthContext } from '@/hooks/use-auth-context'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'

// Keep the native splash visible until we're ready
SplashScreen.preventAutoHideAsync()

const SPLASH_HOLD_MS = 2000
const FADE_OUT_MS = 300

export function SplashScreenController() {
  const { isLoading } = useAuthContext()
  const didHide = useRef(false)
  const [showCustomSplash, setShowCustomSplash] = useState(true)

  const screenOpacity = useSharedValue(1)

  useEffect(() => {
    if (isLoading || didHide.current) return
    didHide.current = true

    const id = setTimeout(() => {
      try {
        void SplashScreen.hideAsync().catch(() => {})
      } catch {
        // Native can throw if splash was never shown
      }

      // Hold, then fade out
      screenOpacity.value = withDelay(
        SPLASH_HOLD_MS,
        withTiming(0, { duration: FADE_OUT_MS, easing: Easing.in(Easing.ease) }, (finished) => {
          if (finished) {
            runOnJS(setShowCustomSplash)(false)
          }
        })
      )
    }, 50)

    return () => clearTimeout(id)
  }, [isLoading])

  const screenStyle = useAnimatedStyle(() => ({
    opacity: screenOpacity.value,
  }))

  if (!showCustomSplash) return null

  return (
    <Animated.View style={[styles.container, screenStyle]} pointerEvents="none">
      <View style={styles.center}>
        <Text style={styles.logo}>UPLIFT</Text>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    zIndex: 9999,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 6,
  },
})
