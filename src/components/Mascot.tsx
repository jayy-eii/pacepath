import { motion } from 'framer-motion'
import { spring } from '../motion/presets'

interface MascotProps {
  size?: number
  /** 'wave' arm animation on mount, 'cheer' for celebrations, 'detective' for gap hunting. */
  mood?: 'wave' | 'cheer' | 'idle' | 'detective'
}

/**
 * The app mascot as a lightweight inline SVG (flat + gradients, no asset
 * download, no Lottie runtime needed). SVG/CSS transforms only.
 */
export function Mascot({ size = 120, mood = 'wave' }: MascotProps) {
  const waveRotate = mood === 'wave' ? [0, 24, -6, 24, 0] : mood === 'cheer' ? [0, -30, 10, -30, 0] : mood === 'detective' ? [0, -10, 5, -10, 0] : 0

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
      animate={{ rotate: waveRotate }}
      transition={{ duration: mood === 'wave' || mood === 'detective' ? 1.6 : 0, repeat: mood === 'wave' || mood === 'detective' ? 1 : 0, ease: 'easeInOut' }}
    >
      <defs>
        <radialGradient id="mascotBody" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="var(--mascot-light)" />
          <stop offset="100%" stopColor="var(--mascot-dark)" />
        </radialGradient>
      </defs>
      {/* shadow */}
      <ellipse cx="60" cy="110" rx="30" ry="6" fill="currentColor" opacity="0.12" />
      {/* body */}
      <path
        d="M60 24c-22 0-36 16-36 36 0 22 14 44 36 44s36-22 36-44c0-20-14-36-36-36Z"
        fill="url(#mascotBody)"
      />

      {/* Detective Hat (rendered when mood is 'detective') */}
      {mood === 'detective' && (
        <g id="detectiveHat" transform="translate(0, -6)">
          {/* Hat Brim */}
          <ellipse cx="60" cy="28" rx="34" ry="7" fill="#7a4f3b" />
          {/* Hat Crown */}
          <path d="M38 28 C38 12, 82 12, 82 28 Z" fill="#935f47" />
          {/* Hat Band */}
          <path d="M40 27 C50 25, 70 25, 80 27 L80 29 C70 27, 50 27, 40 29 Z" fill="#2d2d3a" />
          {/* Hat Peak visor */}
          <path d="M26 29 C34 33, 46 32, 54 28" stroke="#5a3827" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      )}

      {/* eyes — blink via CSS animation */}
      <g className="mascot-eyes" style={{ transformOrigin: '60px 52px' }}>
        <circle cx="47" cy="52" r="6.5" fill="#1b1b2f" />
        <circle cx="73" cy="52" r="6.5" fill="#1b1b2f" />
        <circle cx="49.4" cy="49.8" r="2" fill="#fff" />
        <circle cx="75.4" cy="49.8" r="2" fill="#fff" />
      </g>
      {/* smile */}
      <path d="M50 68c4 5 16 5 20 0" stroke="#1b1b2f" strokeWidth="3" strokeLinecap="round" />
      {/* cheeks */}
      <circle cx="38" cy="63" r="4" fill="var(--mascot-cheek)" opacity="0.8" />
      <circle cx="82" cy="63" r="4" fill="var(--mascot-cheek)" opacity="0.8" />
      {/* waving arm */}
      <motion.g
        style={{ transformOrigin: '30px 78px' }}
        animate={{ rotate: waveRotate }}
        transition={{ duration: mood === 'idle' ? 0 : 1.6, repeat: mood === 'idle' ? 0 : 1, repeatDelay: mood === 'idle' ? 0 : 1.2, ease: 'easeInOut' }}
      >
        <path
          d="M30 80C22 74 14 66 16 58c1.5-5 7-6 10-3"
          stroke="var(--mascot-arm)"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <circle cx="24" cy="53" r="7.5" fill="var(--mascot-hand)" />
      </motion.g>
      {/* static arm holding magnifying glass if detective */}
      {mood === 'detective' ? (
        <g id="detectiveGlass">
          <path
            d="M92 82c7-7 12-15 10-22"
            stroke="var(--mascot-arm)"
            strokeWidth="9"
            strokeLinecap="round"
            transform="rotate(12 92 82)"
          />
          {/* Magnifying Glass handle */}
          <line x1="102" y1="62" x2="114" y2="50" stroke="#8d5b4c" strokeWidth="4" strokeLinecap="round" />
          {/* Glass rim */}
          <circle cx="114" cy="48" r="9" stroke="#f6c445" strokeWidth="3" fill="rgba(110, 231, 255, 0.35)" />
          {/* Glass glare */}
          <path d="M110 44 A 6 6 0 0 1 117 44" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
        </g>
      ) : (
        <path
          d="M92 82c7-7 12-15 10-22"
          stroke="var(--mascot-arm)"
          strokeWidth="9"
          strokeLinecap="round"
          transform="rotate(12 92 82)"
        />
      )}
    </motion.svg>
  )
}

/** Pop-in wrapper matching the springPop preset, for scene entrances. */
export function PoppingMascot(props: MascotProps) {
  return (
    <motion.div
      initial={{ scale: 0.6, opacity: 0 }}
      whileInView={{ scale: 1, opacity: 1 }}
      viewport={{ once: true, amount: 0.6 }}
      transition={spring.pop}
    >
      <Mascot {...props} />
    </motion.div>
  )
}
