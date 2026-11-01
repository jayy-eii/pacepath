/**
 * Reusable motion presets so every animation in the app shares the same
 * character. Only `transform` and `opacity` are ever animated — the browser
 * can run these on the compositor GPU thread, which is what keeps a budget
 * Android phone at 60fps.
 *
 * Reduced motion is handled globally by <MotionConfig> in main.tsx, so
 * variants here stay static and safe.
 */
import type { Variants } from 'framer-motion'

/** Shared easing curves — one cubic-bezier feels "designed" across the app. */
export const ease = {
  out: [0.22, 1, 0.36, 1] as const,
  inOut: [0.65, 0, 0.35, 1] as const,
}

/** Standard spring presets (framer-motion physics, not fixed durations). */
export const spring = {
  pop: { type: 'spring', stiffness: 380, damping: 24, mass: 0.9 } as const,
  soft: { type: 'spring', stiffness: 180, damping: 26 } as const,
  snappy: { type: 'spring', stiffness: 520, damping: 30 } as const,
}

/** Fade + rise: the default entrance for any block entering the viewport. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 32 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: ease.out },
  },
}

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.8, ease: ease.out } },
}

/** Parent wrapper for staggered children (use with staggerChild below). */
export const staggerParent = (stagger = 0.08, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren: delay } },
})

export const staggerChild: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: ease.out } },
}

/** Spring bounce-in for things that "pop" (nodes, badges, mascot). */
export const springPop: Variants = {
  hidden: { opacity: 0, scale: 0.4 },
  show: { opacity: 1, scale: 1, transition: spring.pop },
}

/** SVG path draw. Pair with motion.path initial="hidden" whileInView="show". */
export const pathDraw: Variants = {
  hidden: { pathLength: 0, opacity: 0 },
  show: {
    pathLength: 1,
    opacity: 1,
    transition: {
      pathLength: { duration: 1.4, ease: ease.inOut },
      opacity: { duration: 0.2 },
    },
  },
}

/** Gentle endless drift for background elements. */
export const float = (seconds = 6, distance = 12) => ({
  animate: { y: [`${-distance}px`, `${distance}px`, `${-distance}px`] },
  transition: { duration: seconds, repeat: Infinity, ease: 'easeInOut' as const },
})
