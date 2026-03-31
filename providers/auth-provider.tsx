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
      const userId = session.user.id
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      const profileData = data as Profile | null
      if (!profileData) {
        setProfile(null)
        return
      }

      const now = new Date()
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

      const [allWorkoutsRes, groupsRes, friendsRes] = await Promise.all([
        supabase
          .from('workouts')
          .select('workout_date, workout_type')
          .eq('user_id', userId)
          .order('workout_date', { ascending: true }),
        supabase
          .from('group_members')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId),
        supabase
          .from('friendships')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'accepted')
          .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
      ])

      const workouts = (allWorkoutsRes.data ?? []) as { workout_date: string; workout_type: string | null }[]

      // Build a map: date → workout_type. Prefer non-rest if multiple entries exist on same date.
      const dateMap = new Map<string, string | null>()
      let nonRestCount = 0
      for (const w of workouts) {
        if (w.workout_type !== 'rest') nonRestCount++
        const existing = dateMap.get(w.workout_date)
        if (existing === undefined) {
          dateMap.set(w.workout_date, w.workout_type)
        } else if (w.workout_type !== 'rest') {
          dateMap.set(w.workout_date, w.workout_type)
        }
      }

      // --- Current streak: walk backwards from today ---
      // Rest days pause (don't count, don't break). Missing days break.
      let currentStreak = 0
      {
        const d = new Date(todayStr + 'T00:00:00')
        if (!dateMap.has(todayStr)) {
          d.setDate(d.getDate() - 1)
        }
        while (true) {
          const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          if (!dateMap.has(iso)) break
          if (dateMap.get(iso) !== 'rest') currentStreak++
          d.setDate(d.getDate() - 1)
        }
      }

      // --- Longest streak: walk through all days from first to last workout ---
      let longestStreak = 0
      {
        const sorted = [...dateMap.keys()].sort()
        if (sorted.length > 0) {
          const first = new Date(sorted[0] + 'T00:00:00')
          const last = new Date(sorted[sorted.length - 1] + 'T00:00:00')
          let run = 0
          const d = new Date(first)
          while (d <= last) {
            const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            if (dateMap.has(iso)) {
              if (dateMap.get(iso) !== 'rest') run++
            } else {
              longestStreak = Math.max(longestStreak, run)
              run = 0
            }
            d.setDate(d.getDate() + 1)
          }
          longestStreak = Math.max(longestStreak, run)
        }
      }

      setProfile({
        ...profileData,
        streak: currentStreak,
        longest_streak: longestStreak,
        workouts_count: nonRestCount,
        groups_count: groupsRes.count ?? profileData.groups_count ?? 0,
        friends_count: friendsRes.count ?? profileData.friends_count ?? 0,
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