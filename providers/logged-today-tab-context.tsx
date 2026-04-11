import { useAuthContext } from '@/hooks/use-auth-context'
import { supabase } from '@/lib/supabase'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

function getTodayLocalDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type Ctx = {
  hasLoggedTodayWorkout: boolean
  setHasLoggedTodayWorkout: (v: boolean) => void
  refetchLoggedToday: () => Promise<void>
}

const LoggedTodayTabCtx = createContext<Ctx | null>(null)

export function LoggedTodayTabProvider({ children }: { children: ReactNode }) {
  const { session } = useAuthContext()
  const [hasLoggedTodayWorkout, setHasLoggedTodayWorkout] = useState(false)

  const refetchLoggedToday = useCallback(async () => {
    if (!session?.user?.id) {
      setHasLoggedTodayWorkout(false)
      return
    }
    const today = getTodayLocalDate()
    const { data } = await supabase
      .from('workouts')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('workout_date', today)
      .maybeSingle()
    setHasLoggedTodayWorkout(!!data)
  }, [session?.user?.id])

  useEffect(() => {
    void refetchLoggedToday()
  }, [refetchLoggedToday])

  const value = useMemo(
    () => ({
      hasLoggedTodayWorkout,
      setHasLoggedTodayWorkout,
      refetchLoggedToday,
    }),
    [hasLoggedTodayWorkout, refetchLoggedToday]
  )

  return <LoggedTodayTabCtx.Provider value={value}>{children}</LoggedTodayTabCtx.Provider>
}

export function useLoggedTodayTab() {
  const c = useContext(LoggedTodayTabCtx)
  if (!c) {
    throw new Error('useLoggedTodayTab must be used within LoggedTodayTabProvider')
  }
  return c
}
