import { motion } from 'framer-motion'
import { fadeUp, staggerParent } from '../motion/presets'
import type { Language } from '../types'

interface HowItWorksSectionProps {
  lang?: Language
  onStartPractice?: () => void
}

export function HowItWorksSection({ lang = 'en', onStartPractice }: HowItWorksSectionProps) {
  const isHi = lang === 'hi'

  const stages = [
    {
      step: '01',
      key: 'learn',
      title: isHi ? 'सीखें (Learn)' : 'Learn',
      status: 'coming_soon' as const,
      statusLabel: isHi ? 'जल्द आ रहा है' : 'Coming soon',
      icon: '📘',
      adapts: isHi
        ? 'इंजन द्वारा खोजी गई विशिष्ट पूर्व-आवश्यकता कमी को लक्षित करने वाले संक्षिप्त दृश्य पाठ।'
        : 'Bite-sized visual concept lessons that dynamically target the exact prerequisite gap identified by the engine.',
      description: isHi
        ? 'सिद्धांत को सरल उदाहरणों और परस्पर संवादात्मक चित्रों में समझाया गया है।'
        : 'Focused conceptual lessons designed for 2-minute clarity before jumping into problem solving.',
    },
    {
      step: '02',
      key: 'solve',
      title: isHi ? 'हल करें (Solve)' : 'Solve',
      status: 'live' as const,
      statusLabel: isHi ? 'सक्रिय (Live)' : 'Live',
      icon: '🧩',
      adapts: isHi
        ? 'बेयसियन नॉलेज ट्रेसिंग (BKT) द्वारा संचालित अभ्यास जो आपकी महारत के अनुसार कठिन या सरल प्रश्न चुनता है।'
        : 'Adaptive practice powered by Bayesian Knowledge Tracing (BKT) that automatically adjusts difficulty to match your mastery.',
      description: isHi
        ? 'प्रत्येक प्रश्न आपकी क्षमता को चुनौती देता है। गलती होने पर जासूस तुरंत कारण बताता है।'
        : 'Every question calibrates to your level. If you make a mistake, the detective isolates the procedural bug immediately.',
    },
    {
      step: '03',
      key: 'test',
      title: isHi ? 'परखें (Test)' : 'Test',
      status: 'live' as const,
      statusLabel: isHi ? 'सक्रिय (Live)' : 'Live',
      icon: '🏁',
      adapts: isHi
        ? 'समयबद्ध आकलन जो अगले पाठ्यक्रम स्तर पर जाने से पहले वास्तविक ज्ञान की पुष्टि करते हैं।'
        : 'Timed diagnostic assessments that verify genuine concept mastery before advancing along the curriculum graph.',
      description: isHi
        ? 'शिक्षक द्वारा असाइन किए गए टेस्ट ऑफ़लाइन दिए जा सकते हैं और ऑनलाइन आने पर सबमिट होते हैं।'
        : 'Teacher-assigned assessments run smoothly offline and submit automatically when internet is detected.',
    },
  ]

  return (
    <section className="how-it-works-section" id="how-it-works">
      <div className="container how-it-works-inner">
        <motion.div
          className="how-header"
          variants={staggerParent(0.1)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
        >
          <motion.p variants={fadeUp} className="scene-kicker">
            {isHi ? 'हमारी कार्यप्रणाली' : 'The Learning Loop'}
          </motion.p>
          <motion.h2 variants={fadeUp} className="scene-title">
            {isHi ? (
              <>सीखें. हल करें. <span className="gradient-text">परखें. दोहराएं.</span></>
            ) : (
              <>Learn. Solve. <span className="gradient-text">Test. Repeat.</span></>
            )}
          </motion.h2>
          <motion.p variants={fadeUp} className="scene-sub">
            {isHi
              ? 'एक चक्रीय शिक्षण चक्र जहाँ प्रत्येक कदम छात्र की वास्तविक क्षमता के अनुसार ढलता है।'
              : 'A continuous, evidence-driven loop where every single step adapts to the student&apos;s current cognitive state.'}
          </motion.p>
        </motion.div>

        <div className="how-grid">
          {stages.map((stage, idx) => (
            <motion.div
              key={stage.key}
              className={`how-card how-card--${stage.status}`}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.15, duration: 0.45 }}
              whileHover={{ y: -4 }}
            >
              <div className="how-card-header">
                <span className="how-step-num">{stage.step}</span>
                <span className={`status-chip status-chip--${stage.status}`}>
                  {stage.status === 'live' ? '● ' : '○ '}
                  {stage.statusLabel}
                </span>
              </div>

              <div className="how-card-body">
                <span className="how-icon" aria-hidden="true">{stage.icon}</span>
                <h3 className="how-title">{stage.title}</h3>
                <div className="how-adaptation-box">
                  <span className="adaptation-label">
                    {isHi ? 'अनुकूलन नियम:' : 'How it adapts:'}
                  </span>
                  <p className="adaptation-text">{stage.adapts}</p>
                </div>
                <p className="how-desc">{stage.description}</p>
              </div>

              {stage.key === 'solve' && onStartPractice && (
                <div className="how-card-action">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={onStartPractice}
                  >
                    {isHi ? 'हल करना शुरू करें →' : 'Practice Solve Mode →'}
                  </button>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
