import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

type MotionPreference = 'auto' | 'off'

interface ReducedMotionCtx {
  /** True when animations should be reduced (OS setting or user toggle). */
  reduced: boolean
  /** Current effective OS preference. */
  osPrefersReduced: boolean
  /** What the user chose in settings (auto = follow OS). */
  pref: MotionPreference
  setPref: (p: MotionPreference) => void
}

const Ctx = createContext<ReducedMotionCtx | null>(null)

const STORAGE_KEY = 'motion:reduced'

/**
 * Single source of truth for "should we animate less?".
 * Combines prefers-reduced-motion with a user toggle persisted to
 * localStorage, so any component can consult it in one line.
 */
export function ReducedMotionProvider({ children }: { children: ReactNode }) {
  const [osPrefersReduced, setOs] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const [pref, setPrefState] = useState<MotionPreference>(() => {
    if (typeof window === 'undefined') return 'auto'
    return (localStorage.getItem(STORAGE_KEY) as MotionPreference | null) ?? 'auto'
  })

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (e: MediaQueryListEvent) => setOs(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const value = useMemo<ReducedMotionCtx>(
    () => ({
      osPrefersReduced,
      pref,
      setPref: (p) => {
        setPrefState(p)
        if (p === 'auto') localStorage.removeItem(STORAGE_KEY)
        else localStorage.setItem(STORAGE_KEY, p)
      },
      reduced: pref === 'off' ? false : osPrefersReduced,
    }),
    [osPrefersReduced, pref],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useReducedMotionPref(): boolean {
  const ctx = useContext(Ctx)
  return ctx?.reduced ?? false
}

export function useMotionSettings() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useMotionSettings must be used inside ReducedMotionProvider')
  return ctx
}
