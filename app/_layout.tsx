import { DarkTheme, DefaultTheme, ThemeProvider, type Theme } from '@react-navigation/native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import 'react-native-reanimated'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { SplashScreenController } from '@/components/splash-screen-controller'

import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import AuthProvider from '@/providers/auth-provider'

const UpliftDark: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: '#A78BFA',
    background: '#08060D',
    card: '#0E0B14',
    text: '#E8E4F0',
    border: 'rgba(167,139,250,0.10)',
    notification: '#A78BFA',
  },
}

const UpliftLight: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#7C3AED',
    background: '#FAF9FC',
    card: '#FFFFFF',
    text: '#1A1025',
    border: 'rgba(124,58,237,0.08)',
    notification: '#7C3AED',
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
          options={{ title: 'Profile', presentation: 'modal', headerBackTitle: 'Friends' }}
        />
        <Stack.Screen
          name="create-group"
          options={{ title: 'Create group', presentation: 'modal', headerBackTitle: 'Groups' }}
        />
        <Stack.Screen name="group-detail" options={{ title: 'Group', headerBackTitle: 'Groups' }} />
        <Stack.Screen
          name="group-settings"
          options={{ title: 'Group Settings', presentation: 'modal', headerBackTitle: 'Group' }}
        />
        <Stack.Screen
          name="challenge-group"
          options={{ title: 'Challenge Group', presentation: 'modal', headerBackTitle: 'Groups' }}
        />
        <Stack.Screen
          name="competition-detail"
          options={{ title: 'Competition Details', headerBackTitle: 'Groups' }}
        />
        <Stack.Screen name="create-duel" options={{ title: '1v1 Challenge', presentation: 'modal', headerBackTitle: 'Profile' }} />
        <Stack.Screen name="duel-detail" options={{ title: 'Challenge', headerBackTitle: 'Profile' }} />
        <Stack.Screen
          name="highlight-detail"
          options={{
            headerShown: false,
            presentation: 'fullScreenModal',
            animation: 'fade',
          }}
        />
        <Stack.Screen
          name="manage-highlights"
          options={{ title: 'Highlights', headerBackTitle: 'Profile' }}
        />
        <Stack.Screen
          name="add-workouts-to-highlight"
          options={{ title: 'Add workouts', headerBackTitle: 'Highlights' }}
        />
        <Stack.Screen name="settings" options={{ title: 'Settings', headerBackTitle: 'Profile' }} />
      </Stack.Protected>
      <Stack.Protected guard={!isLoggedIn}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="sign-up" options={{ headerShown: false }} />
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
            <RootNavigator />
            <StatusBar style="auto" />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}