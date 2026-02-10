import { Session } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'

export type AuthData = {
  session: Session | null
  profile: any | null
  isLoading: boolean
  isLoggedIn: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>
  signInWithGoogle: () => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
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
}

export const AuthContext = createContext<AuthData>(defaultAuth)

export const useAuthContext = () => useContext(AuthContext)