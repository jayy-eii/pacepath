import { motion, useScroll, useSpring } from 'framer-motion'

/**
 * Top scroll progress bar. scaleX on the compositor — never causes layout.
 */
export function ProgressBar() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 180, damping: 34, mass: 0.4 })

  return (
    <div className="progress-track" aria-hidden="true">
      <motion.div className="progress-fill" style={{ scaleX }} />
    </div>
  )
}
