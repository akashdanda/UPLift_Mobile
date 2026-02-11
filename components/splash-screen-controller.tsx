import { useAuthContext } from '@/hooks/use-auth-context'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect, useRef } from 'react'

// Keep the native splash visible until we're ready
SplashScreen.preventAutoHideAsync()

export function SplashScreenController() {
  const { isLoading } = useAuthContext()
  const didHide = useRef(false)

  useEffect(() => {
    if (isLoading || didHide.current) return
    didHide.current = true
    // Defer so we're on a stable view controller (avoids "No native splash registered" after OAuth redirect).
    const id = setTimeout(() => {
      try {
        void SplashScreen.hideAsync().catch(() => {})
      } catch {
        // Native can throw if splash was never shown for this view controller.
      }
    }, 100)
    return () => clearTimeout(id)
  }, [isLoading])

  return null
}