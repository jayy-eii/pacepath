import type { ReactNode } from 'react'
import { MotionConfig } from 'framer-motion'
import { useMotionSettings } from './reducedMotion'

/**
 * Bridges the reduced-motion preference (OS + in-app toggle) into
 * framer-motion's global <MotionConfig>, so every animated component in
 * the app respects it without each one checking for itself.
 */
export function MotionGate({ children }: { children: ReactNode }) {
  const { reduced } = useMotionSettings()
  return <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>{children}</MotionConfig>
}
