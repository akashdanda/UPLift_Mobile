import { AuthContext } from '@/hooks/use-auth-context'
import type { Profile, ProfileUpdate } from '@/types/profile'
import { signInWithGoogle as doSignInWithGoogle } from '@/lib/auth-oauth'
import { supabase } from '@/lib/supabase'
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

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const fetchProfile = useCallback(async () => {
    if (!session) return
    try {
      // Check and reset streak if no workout today
      await supabase.rpc('check_and_reset_streak', { user_id_param: session.user.id })
      
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()
      setProfile((data as Profile) ?? null)
    } catch {
      setProfile(null)
    }
  }, [session])

  fetchProfileRef.current = fetchProfile

  const updateProfile = useCallback(
    async (updates: ProfileUpdate) => {
      if (!session) return { error: new Error('Not signed in') }
      const { error } = await supabase.from('profiles').upsert(
        { id: session.user.id, ...updates, updated_at: new Date().toISOString() },
        { onConflict: 'id' }
      )
      if (error) return { error }
      await fetchProfileRef.current()
      return { error: null }
    },
    [session]
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
        // Check and reset streak if no workout today
        await supabase.rpc('check_and_reset_streak', { user_id_param: session.user.id })
        
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()
        if (!cancelled) setProfile((data as Profile) ?? null)
      } catch {
        if (!cancelled) setProfile(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [session])

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
        signOut,
        updateProfile,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}