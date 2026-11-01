import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

const SECTIONS = [
  { id: 'hero', label: 'Intro' },
  { id: 'try-it', label: 'Try-it' },
  { id: 'problem', label: 'Problem' },
  { id: 'how-it-works', label: 'How it Works' },
  { id: 'features', label: 'Features' },
  { id: 'pillars', label: '3 Pillars' },
  { id: 'built-for-india', label: 'Built for India' },
  { id: 'start', label: 'Start' },
]

/**
 * Fixed side dots (desktop only — hidden under 1100px). The active dot uses
 * a shared layout animation so the pill slides between entries.
 */
export function SectionDots() {
  const [active, setActive] = useState('hero')

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id)
          }
        }
      },
      { rootMargin: '-35% 0px -35% 0px' },
    )
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [])

  return (
    <nav className="section-dots" aria-label="Page sections">
      {SECTIONS.map(({ id, label }) => (
        <a
          key={id}
          href={`#${id}`}
          className="dot-link"
          aria-label={label}
          aria-current={active === id}
        >
          <span className="dot-label">{label}</span>
          {active === id && (
            <motion.span
              layoutId="dot-pill"
              className="dot-pill"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          <span className="dot" />
        </a>
      ))}
    </nav>
  )
}
