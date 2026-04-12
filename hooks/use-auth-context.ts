import type { Profile, ProfileUpdate } from '@/types/profile'
import { Session } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'

export type AuthData = {
  session: Session | null
  profile: Profile | null
  isLoading: boolean
  isLoggedIn: boolean
  signInWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>
  signUpWithEmail: (
    email: string,
    password: string
  ) => Promise<{ error: Error | null; needsEmailConfirmation: boolean }>
  signInWithGoogle: () => Promise<{ error: Error | null }>
  signInWithApple: () => Promise<{ error: Error | null }>
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
  signInWithEmail: async () => ({ error: new Error('AuthProvider not mounted') }),
  signUpWithEmail: async () => ({
    error: new Error('AuthProvider not mounted'),
    needsEmailConfirmation: false,
  }),
  signInWithGoogle: async () => ({ error: new Error('AuthProvider not mounted') }),
  signInWithApple: async () => ({ error: new Error('AuthProvider not mounted') }),
  signOut: async () => {},
  resetPassword: async () => ({ error: new Error('AuthProvider not mounted') }),
  updateProfile: async () => ({ error: new Error('AuthProvider not mounted') }),
  refreshProfile: async () => {},
}

export const AuthContext = createContext<AuthData>(defaultAuth)

export const useAuthContext = () => useContext(AuthContext)