import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { Mascot } from './Mascot'
import { staggerParent, staggerChild } from '../motion/presets'
import type { Language } from '../types'

const SYMBOLS = [
  { glyph: '+', x: '8%', size: 48 },
  { glyph: '÷', x: '18%', size: 36 },
  { glyph: 'π', x: '82%', size: 44 },
  { glyph: 'x²', x: '92%', size: 40 },
  { glyph: '√', x: '72%', size: 34 },
  { glyph: '∞', x: '28%', size: 32 },
] as const

function buzz(ms = 12) {
  if ('vibrate' in navigator) navigator.vibrate(ms)
}

interface HeroProps {
  onStartPractice?: () => void
  onOpenTeacherDashboard?: () => void
  lang?: Language
}

export function Hero({ onStartPractice, onOpenTeacherDashboard, lang = 'en' }: HeroProps) {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })

  // Gentle, calm parallax fade on scroll
  const ySlow = useTransform(scrollYProgress, [0, 1], [0, 60])
  const fade = useTransform(scrollYProgress, [0, 0.8], [1, 0])

  const isHi = lang === 'hi'

  return (
    <section id="hero" ref={ref} className="hero">
      <div className="hero-gradient" aria-hidden="true" />

      {/* Calm, static decorative layer — no jitter or bobbing */}
      <div className="hero-symbols" aria-hidden="true">
        {SYMBOLS.map((s) => (
          <span
            key={s.glyph}
            className="math-symbol"
            style={{ left: s.x, fontSize: s.size, opacity: 0.18 }}
          >
            {s.glyph}
          </span>
        ))}
      </div>

      <motion.div
        className="container hero-inner"
        style={{ opacity: fade }}
        variants={staggerParent(0.1, 0.1)}
        initial="hidden"
        animate="show"
      >
        <motion.div style={{ y: ySlow }} variants={staggerChild} className="hero-mascot">
          <Mascot size={130} mood="wave" />
        </motion.div>

        <motion.div variants={staggerChild} className="hero-badge-pill">
          <span className="badge-glow-dot" />
          <span>
            {isHi
              ? 'कक्षा 6–10 गणित • पहले लॉगिन के बाद ऑफ़लाइन काम करता है'
              : 'Class 6–10 Maths • Works offline after first login'}
          </span>
        </motion.div>

        <motion.h1 variants={staggerChild} className="hero-title">
          {isHi ? (
            <>
              वह गणित इंजन जो पता लगाता है<br />
              <span className="gradient-text">गलती क्यों हुई।</span>
            </>
          ) : (
            <>
              The adaptive maths engine that finds<br />
              <span className="gradient-text">why you made a mistake.</span>
            </>
          )}
        </motion.h1>

        <motion.p variants={staggerChild} className="hero-sub">
          {isHi
            ? 'बेयसियन नॉलेज ट्रेसिंग और 22-अवधारणा प्री-रेक्विज़िट ग्राफ से संचालित। पहले लॉगिन के बाद ऑफ़लाइन काम करता है और ऑनलाइन आने पर सिंक होता है।'
            : 'Powered by Bayesian Knowledge Tracing and a 22-concept prerequisite DAG. Works offline after your first login and syncs when you are online.'}
        </motion.p>

        {/* Dual Role CTAs */}
        <motion.div variants={staggerChild} className="hero-cta-group">
          <motion.button
            type="button"
            className="btn btn-primary btn-lg"
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.02 }}
            onPointerDown={() => buzz()}
            onClick={onStartPractice}
          >
            <span>🎓</span>
            <span>{isHi ? 'विद्यार्थी अभ्यास शुरू करें' : 'Start Practice (Student)'}</span>
            <span className="btn-arrow" aria-hidden="true">→</span>
          </motion.button>

          <motion.button
            type="button"
            className="btn btn-secondary btn-lg"
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.02 }}
            onClick={onOpenTeacherDashboard}
          >
            <span>🏫</span>
            <span>{isHi ? 'शिक्षक डैशबोर्ड' : 'Teacher Dashboard'}</span>
          </motion.button>
        </motion.div>

        {/* Quick jump to live try-it */}
        <motion.div variants={staggerChild} className="hero-scroll-link">
          <a href="#try-it" className="hero-try-link">
            <span>⚡ {isHi ? 'लाइव समीकरण नीचे आज़माएं' : 'Try the live equation widget below'}</span>
            <span aria-hidden="true">↓</span>
          </a>
        </motion.div>
      </motion.div>
    </section>
  )
}
