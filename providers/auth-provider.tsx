import { AuthContext } from '@/hooks/use-auth-context'
import { signInWithApple as doSignInWithApple, signInWithGoogle as doSignInWithGoogle } from '@/lib/auth-oauth'
import {
  registerForPushNotificationsAsync,
  savePushTokenToProfile,
} from '@/lib/push-notifications'
import { supabase } from '@/lib/supabase'
import type { Profile, ProfileUpdate } from '@/types/profile'
import type { Session } from '@supabase/supabase-js'
import { PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from 'react'

export default function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const fetchProfileRef = useRef<() => Promise<void>>(async () => {})

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed || !password) {
      return { error: new Error('Enter your email and password.') }
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: trimmed,
      password,
    })
    return { error: error ? (error as Error) : null }
  }, [])

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed || !password) {
      return { error: new Error('Enter your email and password.'), needsEmailConfirmation: false }
    }
    if (password.length < 6) {
      return { error: new Error('Password must be at least 6 characters.'), needsEmailConfirmation: false }
    }
    const local = trimmed.split('@')[0]?.trim()
    const label = local && local.length > 0 ? local : 'Athlete'
    const { data, error } = await supabase.auth.signUp({
      email: trimmed,
      password,
      options: {
        data: {
          full_name: label,
          display_name: label,
        },
      },
    })
    if (error) {
      return { error: error as Error, needsEmailConfirmation: false }
    }
    return { error: null, needsEmailConfirmation: !data.session }
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
      const userId = session.user.id
      const { data } = await supabase
        .from('profiles')
        // Avoid pulling large/unneeded columns. This runs in the top-level provider.
        .select(
          [
            'id',
            'created_at',
            'updated_at',
            'full_name',
            'display_name',
            'avatar_url',
            'bio',
            'location_visible',
            'notifications_enabled',
            'streak',
            'longest_streak',
            'workouts_count',
            'groups_count',
            'friends_count',
            'xp',
            'level',
          ].join(',')
        )
        .eq('id', userId)
        .single()
      const profileData = data as Profile | null
      if (!profileData) {
        setProfile(null)
        return
      }

      // Friends count is user-visible and small; keep it accurate without fetching large workout history.
      const friendsRes = await supabase
        .from('friendships')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'accepted')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)

      setProfile({
        ...profileData,
        groups_count: profileData.groups_count ?? 0,
        friends_count: friendsRes.count ?? profileData.friends_count ?? 0,
        streak: profileData.streak ?? 0,
        longest_streak: profileData.longest_streak ?? 0,
        workouts_count: profileData.workouts_count ?? 0,
      })
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
      await fetchProfileRef.current()
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

  const contextValue = useMemo(
    () => ({
      session,
      isLoading,
      profile,
      isLoggedIn: !!session,
      signInWithEmail,
      signUpWithEmail,
      signInWithGoogle,
      signInWithApple,
      signOut,
      resetPassword,
      updateProfile,
      refreshProfile,
    }),
    [
      session,
      isLoading,
      profile,
      signInWithEmail,
      signUpWithEmail,
      signInWithGoogle,
      signInWithApple,
      signOut,
      resetPassword,
      updateProfile,
      refreshProfile,
    ]
  )

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}