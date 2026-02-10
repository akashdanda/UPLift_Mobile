import { useAuthContext } from '@/hooks/use-auth-context'
import * as SplashScreen from 'expo-splash-screen'

// Keep the native splash visible until we're ready
SplashScreen.preventAutoHideAsync()

export function SplashScreenController() {
  const { isLoading } = useAuthContext()

  if (!isLoading) {
    // Wrap in try/catch: after OAuth redirect the view controller can change and hideAsync may throw
    SplashScreen.hideAsync().catch(() => {})
  }

  return null
}