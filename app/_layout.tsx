import { DarkTheme, DefaultTheme, ThemeProvider, type Theme } from '@react-navigation/native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import 'react-native-reanimated'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { SplashScreenController } from '@/components/splash-screen-controller'
import { RequiredUpdateGate } from '@/components/required-update-gate'

import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import AuthProvider from '@/providers/auth-provider'
import { BrandViolet } from '@/constants/theme'

const UpliftDark: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: BrandViolet.primaryOnDark,
    background: '#08060D',
    card: '#0E0B14',
    text: '#E8E4F0',
    border: 'rgba(255,255,255,0.06)',
    notification: BrandViolet.primaryOnDark,
  },
}

const UpliftLight: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: BrandViolet.primary,
    background: '#FAF9FC',
    card: '#FFFFFF',
    text: '#1A1025',
    border: 'rgba(0,0,0,0.04)',
    notification: BrandViolet.primary,
  },
}

// Separate RootNavigator so we can access the AuthContext
function RootNavigator() {
  const { isLoggedIn } = useAuthContext()

  return (
    <Stack>
      <Stack.Protected guard={isLoggedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="edit-profile"
          options={{ title: 'Edit profile', presentation: 'modal', headerBackTitle: 'Profile' }}
        />
        <Stack.Screen
          name="log-workout"
          options={{ title: 'Log workout', presentation: 'modal', headerBackTitle: 'Profile' }}
        />
        <Stack.Screen
          name="friend-profile"
          options={{ title: 'Profile', presentation: 'modal', headerBackTitle: 'Profile' }}
        />
        <Stack.Screen name="create-duel" options={{ title: '1v1 Challenge', presentation: 'modal', headerBackTitle: 'Profile' }} />
        <Stack.Screen name="duel-detail" options={{ title: 'Challenge', headerBackTitle: 'Profile' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings', headerBackTitle: 'Profile' }} />
      </Stack.Protected>
      <Stack.Protected guard={!isLoggedIn}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="sign-up" options={{ headerShown: false }} />
        <Stack.Screen name="verify-otp" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Screen name="+not-found" />
    </Stack>
  )
}

export default function RootLayout() {
  const colorScheme = useColorScheme()

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={colorScheme === 'dark' ? UpliftDark : UpliftLight}>
          <AuthProvider>
            <SplashScreenController />
            <RequiredUpdateGate />
            <RootNavigator />
            <StatusBar style="auto" />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}