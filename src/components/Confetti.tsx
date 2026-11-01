import { useState, useCallback } from 'react'

interface Particle {
  id: number
  x: number
  rotate: number
  velocity: number
  color: string
  size: number
  delay: number
}

const COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)']

function makeParticles(n: number, seed: number): Particle[] {
  // seeded pseudo-random so each burst is deterministic (no re-render churn)
  const rand = (i: number) => {
    const x = Math.sin(seed * 9301 + i * 49297) * 233280
    return x - Math.floor(x)
  }
  return Array.from({ length: n }, (_, id) => ({
    id,
    x: (rand(id) - 0.5) * 160,
    rotate: rand(id + 1) * 720 - 360,
    velocity: 90 + rand(id + 2) * 110,
    color: COLORS[id % COLORS.length],
    size: 6 + rand(id + 3) * 7,
    delay: rand(id + 4) * 0.12,
  }))
}

/**
 * One-shot confetti bursts. Particles are plain spans animated by a single
 * CSS keyframe (transform/opacity only, GPU-composited), so ~30 particles
 * cost almost nothing on a budget phone. The layer cleans itself up.
 */
export function Confetti({ bursts }: { bursts: number }) {
  const [shots, setShots] = useState<{ key: number; particles: Particle[] }[]>([])

  const fire = useCallback((n: number) => {
    const key = Date.now() + n
    setShots((s) => [...s.slice(-2), { key, particles: makeParticles(30, key) }])
    window.setTimeout(() => setShots((s) => s.filter((shot) => shot.key !== key)), 1700)
  }, [])

  const [firedFor, setFiredFor] = useState(0)
  if (bursts > firedFor) {
    setFiredFor(bursts)
    queueMicrotask(() => fire(bursts))
  }

  return (
    <div className="confetti-layer" aria-hidden="true">
      {shots.map((shot) => (
        <div key={shot.key} className="confetti-shot">
          {shot.particles.map((p) => (
            <span
              key={p.id}
              className="confetti-bit"
              style={{
                background: p.color,
                width: p.size,
                height: p.size * 0.62,
                animationDelay: `${p.delay}s`,
                ['--cx' as string]: `${p.x}vw`,
                ['--cr' as string]: `${p.rotate}deg`,
                ['--cv' as string]: `${p.velocity}px`,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
