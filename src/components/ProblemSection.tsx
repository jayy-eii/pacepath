import { motion } from 'framer-motion'
import { fadeUp, staggerParent } from '../motion/presets'
import type { Language } from '../types'

interface ProblemSectionProps {
  lang?: Language
}

export function ProblemSection({ lang = 'en' }: ProblemSectionProps) {
  const isHi = lang === 'hi'

  const problems = [
    {
      id: 'fast-learners',
      icon: '⏳',
      title: isHi ? 'तेज छात्र ऊब जाते हैं' : 'Fast learners get bored',
      desc: isHi
        ? 'जब पूरी कक्षा एक ही गति से चलती है, तो जो छात्र पहले ही समझ चुके हैं वे निष्क्रिय हो जाते हैं और अपनी क्षमता के अनुरूप चुनौती नहीं पाते।'
        : 'When the whole class moves at a single rigid speed, students who grasp concepts quickly disengage and miss the stretch challenges they need.',
      badge: isHi ? 'चुनौती की कमी' : 'Lacks challenge',
    },
    {
      id: 'struggling-students',
      icon: '📉',
      title: isHi ? 'कमजोर छात्र पीछे छूट जाते हैं' : 'Struggling students fall behind',
      desc: isHi
        ? 'गणित में हर अवधारणा पिछली पर निर्भर होती है। यदि भिन्नों या चिह्नों में एक छोटी सी दरार रह जाए, तो बीजगणित समझ पाना असंभव हो जाता है।'
        : 'Math is cumulative. When foundational cracks in fractions or negative signs go unnoticed, advanced topics like algebra quickly become impossible.',
      badge: isHi ? 'बुनियादी दरारें' : 'Compounding gaps',
    },
    {
      id: 'invisible-gaps',
      icon: '❓',
      title: isHi ? 'वास्तविक समझ कोई नहीं जान पाता' : 'Nobody knows what was understood',
      desc: isHi
        ? 'परीक्षा के दिन तक किसी को पता नहीं चलता कि छात्र क्यों चूका। एक अंक यह नहीं बता सकता कि गलती सिर्फ एक फिसलन थी या गहरी प्रक्रियात्मक भ्रांति।'
        : 'Test day comes too late. A single numerical score cannot reveal whether a student made a simple calculation slip or held a deep procedural misconception.',
      badge: isHi ? 'देर से निदान' : 'Hidden misconceptions',
    },
  ]

  return (
    <section className="problem-section" id="problem">
      <div className="container problem-inner">
        <motion.div
          className="problem-header"
          variants={staggerParent(0.1)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
        >
          <motion.p variants={fadeUp} className="scene-kicker">
            {isHi ? 'वास्तविक चुनौती' : 'The Classroom Reality'}
          </motion.p>
          <motion.h2 variants={fadeUp} className="scene-title">
            {isHi ? (
              <>एक ही गति, <span className="gradient-text">तीनों का नुकसान।</span></>
            ) : (
              <>One uniform pace <span className="gradient-text">leaves everyone underserved.</span></>
            )}
          </motion.h2>
          <motion.p variants={fadeUp} className="scene-sub">
            {isHi
              ? '40 विद्यार्थियों की कक्षा में शिक्षक प्रत्येक छात्र की व्यक्तिगत मानसिक प्रक्रिया का वास्तविक समय में अनुमान नहीं लगा सकते।'
              : 'In a room of 40 students, a teacher cannot physically trace every individual cognitive step in real time.'}
          </motion.p>
        </motion.div>

        <div className="problem-grid">
          {problems.map((p, idx) => (
            <motion.div
              key={p.id}
              className="problem-card"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.12, duration: 0.45 }}
              whileHover={{ y: -4 }}
            >
              <div className="problem-card-top">
                <span className="problem-icon" aria-hidden="true">{p.icon}</span>
                <span className="problem-badge">{p.badge}</span>
              </div>
              <h3 className="problem-title">{p.title}</h3>
              <p className="problem-desc">{p.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
