import type { ReactNode } from 'react'

/**
 * SmoothScroll pass-through wrapper (Lenis dependency removed to reduce bundle size).
 * Uses native browser scrolling for responsive, accessible behavior without scroll-jacking.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  return <>{children}</>
}
