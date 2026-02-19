import type { Profile, ProfileUpdate } from '@/types/profile'
import { Session } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'

export type AuthData = {
  session: Session | null
  profile: Profile | null
  isLoading: boolean
  isLoggedIn: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>
  signInWithGoogle: () => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error: Error | null }>
  updateProfile: (updates: ProfileUpdate) => Promise<{ error: Error | null }>
  refreshProfile: () => Promise<void>
}

const defaultAuth: AuthData = {
  session: null,
  profile: null,
  isLoading: true,
  isLoggedIn: false,
  signIn: async () => ({ error: new Error('AuthProvider not mounted') }),
  signUp: async () => ({ error: new Error('AuthProvider not mounted') }),
  signInWithGoogle: async () => ({ error: new Error('AuthProvider not mounted') }),
  signOut: async () => {},
  resetPassword: async () => ({ error: new Error('AuthProvider not mounted') }),
  updateProfile: async () => ({ error: new Error('AuthProvider not mounted') }),
  refreshProfile: async () => {},
}

export const AuthContext = createContext<AuthData>(defaultAuth)

export const useAuthContext = () => useContext(AuthContext)