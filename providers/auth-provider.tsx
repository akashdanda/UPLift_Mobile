import { AuthContext } from '@/hooks/use-auth-context'
import { signInWithApple as doSignInWithApple, signInWithGoogle as doSignInWithGoogle } from '@/lib/auth-oauth'
import {
  registerForPushNotificationsAsync,
  savePushTokenToProfile,
} from '@/lib/push-notifications'
import { supabase } from '@/lib/supabase'
import type { Profile, ProfileUpdate } from '@/types/profile'
import type { Session } from '@supabase/supabase-js'
import { PropsWithChildren, useCallback, useEffect, useRef, useState } from 'react'

export default function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const fetchProfileRef = useRef<() => Promise<void>>(async () => {})

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ?? null }
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password })
    return { error: error ?? null }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    return doSignInWithGoogle()
  }, [])

  const signInWithApple = useCallback(async () => {
    return doSignInWithApple()
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    return { error: error ?? null }
  }, [])

  const fetchProfile = useCallback(async () => {
    if (!session) return
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()
      const profileData = data as Profile | null
      if (!profileData) {
        setProfile(null)
        return
      }
      // Compute streak from workout history using client's local "today" (avoids UTC vs local bug)
      const now = new Date()
      const refDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const { data: streakData } = await supabase.rpc('get_current_streak', {
        user_id_param: session.user.id,
        reference_date: refDate,
      })
      const raw = Array.isArray(streakData) ? streakData?.[0] : streakData
      const streak = typeof raw === 'number' ? raw : (profileData.streak ?? 0)
      setProfile({ ...profileData, streak })
    } catch {
      setProfile(null)
    }
  }, [session])

  fetchProfileRef.current = fetchProfile

  const updateProfile = useCallback(
    async (updates: ProfileUpdate) => {
      if (!session) return { error: new Error('Not signed in') }
      
      // Check if display_name is being changed and if it's allowed (once per month)
      if (updates.display_name !== undefined && updates.display_name !== profile?.display_name) {
        const { data: canChange } = await supabase.rpc('can_change_display_name', {
          user_id_param: session.user.id,
        })
        if (!canChange) {
          return { error: new Error('Display name can only be changed once per month') }
        }
      }
      
      const { error } = await supabase.from('profiles').upsert(
        { id: session.user.id, ...updates, updated_at: new Date().toISOString() },
        { onConflict: 'id' }
      )
      if (error) return { error }
      await fetchProfileRef.current()
      return { error: null }
    },
    [session, profile]
  )

  const refreshProfile = useCallback(async () => {
    await fetchProfileRef.current()
  }, [])

  // Fetch the session once, and subscribe to auth state changes
  useEffect(() => {
    const fetchSession = async () => {
      const {
        data: { session: s },
        error,
      } = await supabase.auth.getSession()

      if (error) {
        console.error('Error fetching session:', error)
      }
      setSession(s ?? null)
      setIsLoading(false)
    }

    fetchSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Fetch the profile when the session changes (don't block initial load)
  useEffect(() => {
    if (!session) {
      setProfile(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()
        const profileData = data as Profile | null
        if (!cancelled && profileData) {
          const now = new Date()
          const refDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
          const { data: streakData } = await supabase.rpc('get_current_streak', {
            user_id_param: session.user.id,
            reference_date: refDate,
          })
          const raw = Array.isArray(streakData) ? streakData?.[0] : streakData
          const streak = typeof raw === 'number' ? raw : (profileData.streak ?? 0)
          setProfile({ ...profileData, streak })
        } else if (!cancelled) {
          setProfile(null)
        }
      } catch {
        if (!cancelled) setProfile(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [session])

  // Register for push notifications when user is logged in and notifications are enabled
  useEffect(() => {
    if (!session || profile?.notifications_enabled === false) return
    let cancelled = false
    registerForPushNotificationsAsync()
      .then(async (token) => {
        if (cancelled || !token) return
        const { error } = await savePushTokenToProfile(session.user.id, token)
        if (error) console.warn('[Push] Failed to save token:', error.message)
      })
      .catch((e) => console.warn('[Push] Registration failed:', e))
    return () => {
      cancelled = true
    }
  }, [session?.user?.id, profile?.notifications_enabled])

  return (
    <AuthContext.Provider
      value={{
        session,
        isLoading,
        profile,
        isLoggedIn: !!session,
        signIn,
        signUp,
        signInWithGoogle,
        signInWithApple,
        signOut,
        resetPassword,
        updateProfile,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}