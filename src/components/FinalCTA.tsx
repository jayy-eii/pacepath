import { motion } from 'framer-motion'
import { Mascot } from './Mascot'
import { fadeUp } from '../motion/presets'
import type { Language } from '../types'

interface FinalCTAProps {
  onStartPractice?: () => void
  onOpenTeacherDashboard?: () => void
  lang?: Language
}

export function FinalCTA({ onStartPractice, onOpenTeacherDashboard, lang = 'en' }: FinalCTAProps) {
  const isHi = lang === 'hi'

  return (
    <section className="final-scene" id="start">
      <div className="final-glow" aria-hidden="true" />
      <div className="container final-inner">
        <motion.div
          className="final-mascot"
          initial={{ scale: 0.88, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        >
          <Mascot size={130} mood="cheer" />
        </motion.div>

        <motion.h2 variants={fadeUp} className="scene-title final-title">
          {isHi ? (
            <>अपनी गति से सीखने के लिए <span className="gradient-text">तैयार हैं?</span></>
          ) : (
            <>Ready to learn at <span className="gradient-text">your own pace?</span></>
          )}
        </motion.h2>

        <motion.p variants={fadeUp} className="scene-sub">
          {isHi
            ? 'शुरू करने के लिए पूरी तरह मुफ़्त। पहले लॉगिन के बाद ऑफ़लाइन काम करता है और ऑनलाइन आने पर सिंक होता है।'
            : 'Free to get started. Works offline after your first login and syncs when you are online.'}
        </motion.p>

        <div className="final-cta-buttons">
          <motion.button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={onStartPractice}
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.02 }}
          >
            <span>🎓</span>
            <span>{isHi ? 'विद्यार्थी अभ्यास शुरू करें' : 'Start Practice (Student)'}</span>
            <span className="btn-arrow" aria-hidden="true">→</span>
          </motion.button>

          <motion.button
            type="button"
            className="btn btn-secondary btn-lg"
            onClick={onOpenTeacherDashboard}
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.02 }}
          >
            <span>🏫</span>
            <span>{isHi ? 'शिक्षक डैशबोर्ड खोलें' : 'Open Teacher Dashboard'}</span>
          </motion.button>
        </div>
      </div>
    </section>
  )
}
