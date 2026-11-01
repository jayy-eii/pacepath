import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { fadeUp, staggerParent } from '../motion/presets'
import type { Language } from '../types'

interface PillarsShowcaseProps {
  lang?: Language
}

export function PillarsShowcase({ lang = 'en' }: PillarsShowcaseProps) {
  const [activePillar, setActivePillar] = useState<'pacing' | 'dag' | 'teacher'>('pacing')
  const isHi = lang === 'hi'

  return (
    <section className="pillars-section" id="pillars">
      <div className="container pillars-inner">
        <motion.div
          className="pillars-header"
          variants={staggerParent(0.1)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
        >
          <motion.p variants={fadeUp} className="scene-kicker">
            {isHi ? 'मुख्य स्तम्भ' : 'Core Innovations'}
          </motion.p>
          <motion.h2 variants={fadeUp} className="scene-title">
            {isHi ? (
              <>पेसपाथ के <span className="gradient-text">3 बुनियादी स्तम्भ</span></>
            ) : (
              <>The Three Pillars of <span className="gradient-text">PacePath</span></>
            )}
          </motion.h2>
          <motion.p variants={fadeUp} className="scene-sub">
            {isHi
              ? 'पारंपरिक रटने वाली पद्धति के स्थान पर शुद्ध गणितीय मॉडलिंग और संज्ञानात्मक विश्लेषण।'
              : 'Replacing uniform drills with mathematical cognitive modeling and targeted diagnostic repair.'}
          </motion.p>
        </motion.div>

        {/* Tab Navigation for Pillars */}
        <div className="pillar-tabs-nav" role="tablist" aria-label="Core Pillars">
          <button
            type="button"
            role="tab"
            aria-selected={activePillar === 'pacing'}
            className={`pillar-tab-btn ${activePillar === 'pacing' ? 'active' : ''}`}
            onClick={() => setActivePillar('pacing')}
          >
            <span className="tab-icon">⚡</span>
            <span>{isHi ? '1. व्यक्तिगत गति (BKT)' : '1. Adaptive Pacing (BKT)'}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activePillar === 'dag'}
            className={`pillar-tab-btn ${activePillar === 'dag' ? 'active' : ''}`}
            onClick={() => setActivePillar('dag')}
          >
            <span className="tab-icon">🧠</span>
            <span>{isHi ? '2. रूट-कॉज गैप डिटेक्टिव (DAG)' : '2. Gap Detective (DAG)'}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activePillar === 'teacher'}
            className={`pillar-tab-btn ${activePillar === 'teacher' ? 'active' : ''}`}
            onClick={() => setActivePillar('teacher')}
          >
            <span className="tab-icon">🏫</span>
            <span>{isHi ? '3. शिक्षक कमांड सेंटर' : '3. Teacher Command Center'}</span>
          </button>
        </div>

        {/* Pillar Content Showcase Card */}
        <div className="pillar-display-card">
          <AnimatePresence mode="wait">
            {/* PILLAR 1: BKT Adaptive Pacing */}
            {activePillar === 'pacing' && (
              <motion.div
                key="pacing"
                className="pillar-content-layout"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.3 }}
              >
                <div className="pillar-text-col">
                  <div className="pillar-badge">PILLAR 01 • BAYESIAN KNOWLEDGE TRACING</div>
                  <h3 className="pillar-heading">
                    {isHi
                      ? 'एक ही कक्षा, तीन अलग-अलग सीखने की गतियां'
                      : 'Same class, same lesson — three completely different learning speeds'}
                  </h3>
                  <p className="pillar-description">
                    {isHi
                      ? 'पारंपरिक शिक्षा सभी को एक ही गति से पढ़ाती है। पेसपाथ का बेयसियन नॉलेज ट्रेसिंग (BKT) एल्गोरिदम हर प्रश्न के बाद छात्र की महारत प्रायिकता P(L) की गणना करता है। किसी को आगे दौड़ाया नहीं जाता और किसी को रोके बिना चुनौती दी जाती है।'
                      : 'Standard classrooms force every student through the exact same question sequence. PacePath’s BKT engine calculates mastery probability P(L) in real time after every question, adjusting difficulty dynamically without arbitrary countdowns.'}
                  </p>
                  <ul className="pillar-bullet-list">
                    <li>
                      <strong>{isHi ? 'तेज विद्यार्थी:' : 'Fast Movers:'}</strong>{' '}
                      {isHi ? 'उच्च महारत स्तरों पर सीधे उन्नत अनुप्रयोगों की ओर बढ़ते हैं।' : 'Advance straight to challenging multi-step application problems.'}
                    </li>
                    <li>
                      <strong>{isHi ? 'सतत विद्यार्थी:' : 'Steady Pace:'}</strong>{' '}
                      {isHi ? 'मजबूत नींव बनाने के लिए पर्याप्त अभ्यास और संकेत प्राप्त करते हैं।' : 'Receive scaffolded practice to solidify procedural fluency.'}
                    </li>
                    <li>
                      <strong>{isHi ? 'अटकने वाले विद्यार्थी:' : 'Struggling Students:'}</strong>{' '}
                      {isHi ? 'बिना शर्मिंदगी के तत्काल पूर्व-आवश्यकता निदान प्राप्त करते हैं।' : 'Get immediate prerequisite diagnostics before discouragement sets in.'}
                    </li>
                  </ul>
                </div>

                <div className="pillar-visual-col">
                  {/* Strict Honesty Label */}
                  <div className="illustration-banner">
                    <span className="warning-dot">●</span>
                    <span>Illustration, not real data</span>
                  </div>

                  <div className="trajectories-visual-box" aria-label="Student pacing visual">
                    <div className="traj-row">
                      <div className="traj-meta">
                        <span className="traj-name">Aarav (Student A)</span>
                        <span className="traj-speed-tag speed-fast">Fast Acceleration</span>
                      </div>
                      <div className="traj-track">
                        <div className="traj-bar traj-bar--fast" style={{ width: '88%' }}>
                          <span>Level 4 Mastery (88%)</span>
                        </div>
                      </div>
                    </div>

                    <div className="traj-row">
                      <div className="traj-meta">
                        <span className="traj-name">Diya (Student B)</span>
                        <span className="traj-speed-tag speed-mid">Steady Progress</span>
                      </div>
                      <div className="traj-track">
                        <div className="traj-bar traj-bar--mid" style={{ width: '62%' }}>
                          <span>Level 2 Practice (62%)</span>
                        </div>
                      </div>
                    </div>

                    <div className="traj-row">
                      <div className="traj-meta">
                        <span className="traj-name">Rohan (Student C)</span>
                        <span className="traj-speed-tag speed-remedial">Prerequisite Patching</span>
                      </div>
                      <div className="traj-track">
                        <div className="traj-bar traj-bar--slow" style={{ width: '38%' }}>
                          <span>Patching Fractions (38%)</span>
                        </div>
                      </div>
                    </div>

                    <div className="traj-legend">
                      <span>Formula: P(L_t) = P(L_{'{t-1}'} | Obs) + (1 - P(L_{'{t-1}'} | Obs)) · T</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* PILLAR 2: Prerequisite DAG & Gap Detective */}
            {activePillar === 'dag' && (
              <motion.div
                key="dag"
                className="pillar-content-layout"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.3 }}
              >
                <div className="pillar-text-col">
                  <div className="pillar-badge">PILLAR 02 • DIRECTED ACYCLIC GRAPH</div>
                  <h3 className="pillar-heading">
                    {isHi
                      ? 'अवधारणाएं एक-दूसरे पर टिकती हैं: एक दरार ऊपर सब कुछ तोड़ देती है'
                      : 'Concepts stack: one crack breaks everything above it'}
                  </h3>
                  <p className="pillar-description">
                    {isHi
                      ? 'जब कोई छात्र द्वि-चर समीकरण हल नहीं कर पाता, तो अक्सर समस्या समीकरण की नहीं होती—बल्कि कक्षा 6 के भिन्न या ऋणात्मक चिह्नों के नियम की होती है। हमारा 22-अवधारणा निर्देशित अचक्रीय ग्राफ (DAG) दरार को जड़ से ढूंढता है।'
                      : 'When a student fails at Two-Step Equations, the flaw rarely originates in equation algebra itself—it stems from unmastered fraction operations or integer sign rules from prior grades. Our 22-node curriculum DAG walks backwards to fix the root cause.'}
                  </p>
                  <ul className="pillar-bullet-list">
                    <li>
                      <strong>{isHi ? 'शून्य चक्र (Zero Cycles):' : 'Zero Circular Dependencies:'}</strong>{' '}
                      {isHi ? 'गणितीय रूप से प्रमाणित 22-अवधारणा पेड़।' : 'Mathematically verified DAG with zero circular prerequisites.'}
                    </li>
                    <li>
                      <strong>{isHi ? 'गैप डिटेक्टिव ट्रिगर:' : 'Automated Gap Detection:'}</strong>{' '}
                      {isHi ? 'लगातार 2 गलतियों पर स्वतः रूट-कॉज जांच शुरू।' : 'Triggers diagnostic probes when consecutive errors suggest prerequisite defects.'}
                    </li>
                    <li>
                      <strong>{isHi ? 'टारगेटेड पैचिंग:' : 'Targeted Remediation:'}</strong>{' '}
                      {isHi ? 'मूल कारण ठीक होने के बाद छात्र मुख्य पाठ पर लौटता है।' : 'Once the foundational node is patched, the student resumes on-level practice.'}
                    </li>
                  </ul>
                </div>

                <div className="pillar-visual-col">
                  {/* Strict Honesty Label */}
                  <div className="illustration-banner">
                    <span className="warning-dot">●</span>
                    <span>Illustration, not real data</span>
                  </div>

                  <div className="dag-visual-box" aria-label="Curriculum DAG illustration">
                    <div className="dag-chain">
                      <div className="dag-node dag-node--root">
                        <span className="dag-icon">½</span>
                        <span className="dag-label">Fractions Basics</span>
                        <span className="dag-grade">Class 6</span>
                        <span className="dag-status-tag tag-root">★ ROOT CAUSE</span>
                      </div>

                      <div className="dag-connector">
                        <span className="dag-arrow-line" />
                        <span className="dag-arrow-head">→</span>
                        <span className="dag-trace-backward">← Traced Back</span>
                      </div>

                      <div className="dag-node dag-node--mid">
                        <span className="dag-icon">±</span>
                        <span className="dag-label">Integer Signs</span>
                        <span className="dag-grade">Class 7</span>
                      </div>

                      <div className="dag-connector">
                        <span className="dag-arrow-line" />
                        <span className="dag-arrow-head">→</span>
                      </div>

                      <div className="dag-node dag-node--leaf dag-node--cracked">
                        <span className="dag-icon">2x+3</span>
                        <span className="dag-label">Two-Step Eqns</span>
                        <span className="dag-grade">Class 8</span>
                        <span className="dag-status-tag tag-crack">⚡ CRACKED HERE</span>
                      </div>
                    </div>

                    <div className="dag-note-footer">
                      <span>Curriculum Graph: 22 concepts spanning Grades 6–10 Mathematics</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* PILLAR 3: Teacher Command Center */}
            {activePillar === 'teacher' && (
              <motion.div
                key="teacher"
                className="pillar-content-layout"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.3 }}
              >
                <div className="pillar-text-col">
                  <div className="pillar-badge">PILLAR 03 • TEACHER COHORT ANALYTICS</div>
                  <h3 className="pillar-heading">
                    {isHi
                      ? 'शिक्षकों को पूरी कक्षा का एक्स-रे एक नज़र में दिखता है'
                      : 'Teachers see the entire cohort’s cognitive x-ray at a glance'}
                  </h3>
                  <p className="pillar-description">
                    {isHi
                      ? 'शिक्षक को 40 कॉपियां जांचने में घंटे नहीं गंवाने पड़ते। कक्षा हीटमैप तुरंत दिखाता है कि कौन सी अवधारणा में कितने बच्चे संघर्ष कर रहे हैं, और स्वचालित रूप से 10-मिनट के लक्षित उपचारात्मक समूह बनाता है।'
                      : 'Instead of spending hours grading identical mistakes, teachers get an instant color-coded mastery matrix and automated clustering into small remedial groups with 10-minute intervention plans.'}
                  </p>
                  <ul className="pillar-bullet-list">
                    <li>
                      <strong>{isHi ? 'वास्तविक हीटमैप:' : 'Real-Time Heatmap:'}</strong>{' '}
                      {isHi ? 'प्रत्येक छात्र और अवधारणा का 0-100% महारत मैट्रिक्स।' : 'Interactive grid mapping students against syllabus concepts.'}
                    </li>
                    <li>
                      <strong>{isHi ? 'उपचारात्मक क्लस्टर:' : 'Smart Remedial Clusters:'}</strong>{' '}
                      {isHi ? 'समान भ्रांति वाले छात्रों का स्वचालित समूह (जैसे 4 छात्र - कोष्ठक वितरण)।' : 'Identifies groups sharing the exact same procedural flaw.'}
                    </li>
                    <li>
                      <strong>{isHi ? '10-मिनट एक्शन प्लान:' : '10-Minute Action Prompts:'}</strong>{' '}
                      {isHi ? 'कक्षा में तुरंत उपयोग के लिए व्यावहारिक micro-lesson योजनाएं।' : 'Practical pedagogical prompts ready for immediate classroom execution.'}
                    </li>
                  </ul>
                </div>

                <div className="pillar-visual-col">
                  {/* Strict Honesty Label */}
                  <div className="illustration-banner">
                    <span className="warning-dot">●</span>
                    <span>Illustration, not real data</span>
                  </div>

                  <div className="teacher-visual-box" aria-label="Teacher cohort illustration">
                    <div className="demo-heatmap-grid">
                      <div className="demo-grid-row header-row">
                        <span className="col-name">Student</span>
                        <span>Fractions</span>
                        <span>Integers</span>
                        <span>Linear Eq</span>
                        <span>Brackets</span>
                      </div>
                      <div className="demo-grid-row">
                        <span className="col-name">Aarav K.</span>
                        <span className="cell-mastery mastery-high">94%</span>
                        <span className="cell-mastery mastery-high">88%</span>
                        <span className="cell-mastery mastery-mid">76%</span>
                        <span className="cell-mastery mastery-mid">72%</span>
                      </div>
                      <div className="demo-grid-row">
                        <span className="col-name">Diya P.</span>
                        <span className="cell-mastery mastery-mid">72%</span>
                        <span className="cell-mastery mastery-mid">68%</span>
                        <span className="cell-mastery mastery-low">38%</span>
                        <span className="cell-mastery mastery-low">25%</span>
                      </div>
                      <div className="demo-grid-row">
                        <span className="col-name">Rohan S.</span>
                        <span className="cell-mastery mastery-low">32%</span>
                        <span className="cell-mastery mastery-mid">65%</span>
                        <span className="cell-mastery mastery-low">22%</span>
                        <span className="cell-mastery mastery-low">18%</span>
                      </div>
                    </div>

                    <div className="demo-group-card">
                      <div className="group-card-header">
                        <span className="group-tag">⚠️ 10-MIN ACTION GROUP (3 STUDENTS)</span>
                      </div>
                      <p className="group-title">Distributive Sign Errors Group</p>
                      <p className="group-action">
                        Prompt: Draw area models for 2(x + 3) to demonstrate why 2 multiplies both terms before solving.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  )
}
