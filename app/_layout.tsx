import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import 'react-native-reanimated'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { SplashScreenController } from '@/components/splash-screen-controller'

import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import AuthProvider from '@/providers/auth-provider'

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
        <Stack.Screen name="friends" options={{ title: 'Friends', headerBackTitle: 'Profile' }} />
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
          options={{ title: 'War Details', headerBackTitle: 'Groups' }}
        />
        <Stack.Screen
          name="highlight-detail"
          options={{ title: 'Highlight', headerBackTitle: 'Profile' }}
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
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
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