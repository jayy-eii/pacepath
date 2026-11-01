import { useState, useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { Mascot } from './Mascot'
import { detectMisconception } from '../engine/misconceptionDetect'
import rawMisconceptions from '../data/misconceptions.json'
import type { Question, Language } from '../types'

const allMisconceptions = rawMisconceptions as Array<{
  id: string
  name: { en: string; hi: string }
  description: { en: string; hi: string }
  kidFriendlyExplanation: { en: string; hi: string }
  whyItHappens: { en: string; hi: string }
}>

const miscMap = new Map(allMisconceptions.map((m) => [m.id, m]))

const LIVE_QUESTION: Question = {
  id: 'live_try_q',
  conceptId: 'linear-equations-distributive',
  grade: 8,
  difficulty: 2,
  type: 'equation_input',
  text: {
    en: 'Solve for x: 2(x + 3) = 14',
    hi: 'x का मान ज्ञात करें: 2(x + 3) = 14',
  },
  correctAnswer: 4,
  tolerance: 0.01,
  procedure: {
    type: 'linear_bracket',
    variables: { a: 2, b: 1, c: 3, d: 14 },
  },
  hints: [
    'Expand 2(x + 3) to 2x + 6.',
    'Subtract 6 from both sides: 2x = 8.',
    'Divide by 2: x = 4.',
  ],
  solution: {
    en: '2(x + 3) = 14 → 2x + 6 = 14 → 2x = 8 → x = 4.',
    hi: '2(x + 3) = 14 → 2x + 6 = 14 → 2x = 8 → x = 4.',
  },
}

export function MisconceptionShowcase({
  lang = 'en',
  onStartPractice,
}: {
  lang?: Language
  onStartPractice?: () => void
}) {
  const storyRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: storyRef,
    offset: ['start 0.85', 'end 0.3'],
  })

  const yParallax = useTransform(scrollYProgress, [0, 1], [40, -20])
  const opacityFade = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0, 1, 1, 0.9])

  // Live Try-It State
  const [visitorInput, setVisitorInput] = useState<string>('10')

  // Run the REAL offline engine in the browser on user input
  const liveResult = detectMisconception(LIVE_QUESTION, visitorInput)
  const topCandidate = liveResult.candidates[0]
  const matchedMisc = topCandidate ? miscMap.get(topCandidate.misconceptionId) : null

  const PRESET_PILLS = [
    { label: 'x = 10', value: '10', hint: 'Add 6 instead of subtract' },
    { label: 'x = 9', value: '9', hint: 'Subtract 2 instead of divide' },
    { label: 'x = 5.5', value: '5.5', hint: 'Distribute to x only' },
    { label: 'x = 3.5', value: '3.5', hint: 'Calculation slip (14-6=7)' },
    { label: 'x = 4', value: '4', hint: 'Correct answer' },
  ]

  return (
    <section className="misconception-showcase-section" id="try-it">
      {/* 1. Intro Narrative */}
      <div ref={storyRef} className="container scroll-story-container">
        <motion.div
          className="story-narrative-box"
          style={{ y: yParallax, opacity: opacityFade }}
        >
          <div className="story-kicker-badge">
            <span className="badge-glow-dot" />
            <span>{lang === 'hi' ? 'वास्तविक गणित इंजन • ऑफ़लाइन सक्षम' : 'REAL IN-BROWSER ENGINE • OFFLINE CAPABLE'}</span>
          </div>

          <h2 className="story-heading">
            {lang === 'hi' ? (
              <>
                हम केवल &quot;गलत&quot; नहीं कहते।<br />
                <span className="gradient-text">हम पता लगाते हैं: क्यों?</span>
              </>
            ) : (
              <>
                We don&apos;t just say wrong.<br />
                <span className="gradient-text">We find WHY.</span>
              </>
            )}
          </h2>

          <p className="story-subtext">
            {lang === 'hi'
              ? 'अधिकांश छात्र लापरवाह नहीं होते—वे केवल एक अलग, तार्किक लेकिन त्रुटिपूर्ण नियम का पालन कर रहे होते हैं। हमारा नियम-आधारित गणित इंजन प्रत्येक गलती के पीछे की प्रक्रिया का अनुकरण करता है।'
              : 'Most students aren&apos;t careless—they are following an alternate, flawed procedure with complete internal logic. Our rule-based engine simulates their exact steps in real time.'}
          </p>

          <p className="illustration-note">
            {lang === 'hi'
              ? 'वास्तविक इंजन आउटपुट — नीचे दिया गया विजेट आपके ब्राउज़र में सीधे वास्तविक गणित इंजन चलाता है।'
              : 'Real engine output — the interactive widget below runs the actual mathematical engine right inside your browser.'}
          </p>
        </motion.div>
      </div>

      {/* 2. Interactive Live Browser Laboratory Widget */}
      <div className="container live-widget-wrapper">
        <div className="live-lab-card">
          <div className="live-lab-header">
            <div className="lab-title-row">
              <span className="lab-chip-live">● LIVE IN-BROWSER ENGINE</span>
              <h3>
                {lang === 'hi'
                  ? 'स्वयं आज़माएं: जासूस कैसे सोचता है'
                  : 'Try it Live: See how the Detective thinks'}
              </h3>
            </div>
            <p className="lab-description">
              {lang === 'hi'
                ? 'नीचे कोई भी उत्तर टाइप करें (या सुझाव चुनें)। असली शुद्ध गणितीय इंजन तुरंत बिना इंटरनेट के त्रुटि का विश्लेषण करेगा।'
                : 'Type any answer below or click a suggested mistake. The real rule-based engine computes the exact divergence offline.'}
            </p>
          </div>

          <div className="live-lab-interactive-area">
            {/* The Question Box */}
            <div className="lab-equation-display">
              <span className="equation-label">{lang === 'hi' ? 'समीकरण:' : 'Question:'}</span>
              <span className="equation-math">2(x + 3) = 14</span>
              <span className="equation-target">{lang === 'hi' ? 'x का मान खोजें' : 'Solve for x'}</span>
            </div>

            {/* Quick Presets */}
            <div className="lab-presets-row" role="group" aria-label="Preset answers">
              <span className="presets-label">{lang === 'hi' ? 'सुझाए गए उत्तर:' : 'Try these:'}</span>
              {PRESET_PILLS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={`preset-pill ${visitorInput === p.value ? 'active' : ''}`}
                  onClick={() => setVisitorInput(p.value)}
                  title={p.hint}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Custom Input */}
            <div className="lab-input-control">
              <label htmlFor="live-visitor-input">
                {lang === 'hi' ? 'अपना उत्तर टाइप करें:' : 'Or type your own answer:'}
              </label>
              <div className="lab-input-group">
                <span className="input-prefix">x =</span>
                <input
                  id="live-visitor-input"
                  type="text"
                  className="solve-input lab-input-field"
                  placeholder="e.g. 10, 9, 5.5, 4, 3.5..."
                  value={visitorInput}
                  onChange={(e) => setVisitorInput(e.target.value)}
                />
              </div>
            </div>

            {/* Real Engine Output Results Card */}
            <div className="lab-result-display">
              <div className="result-header-row">
                <span className="result-tag-label">{lang === 'hi' ? 'जासूस का वास्तविक निष्कर्ष:' : 'Detective Diagnosis:'}</span>
                {liveResult.status === 'correct' ? (
                  <span className="diagnosis-pill pill-correct">
                    ✓ {lang === 'hi' ? 'बिल्कुल सही (Correct)' : 'Exact Correct Solution'}
                  </span>
                ) : liveResult.status === 'calculation_slip' ? (
                  <span className="diagnosis-pill pill-slip">
                    ⚡ {lang === 'hi' ? 'गणना की फिसलन (Calculation Slip)' : 'Strict Calculation Slip'}
                  </span>
                ) : liveResult.status === 'matched' && matchedMisc ? (
                  <span className="diagnosis-pill pill-matched">
                    ⚠️ {matchedMisc.name[lang]}
                  </span>
                ) : (
                  <span className="diagnosis-pill pill-unmatched">
                    🔍 {lang === 'hi' ? 'अज्ञात पैटर्न (Unmatched Pattern)' : 'Unmatched Pattern (Not a known procedure)'}
                  </span>
                )}
              </div>

              {/* Side-by-Side Steps Comparison */}
              {topCandidate && (
                <div className="lab-paths-grid">
                  {/* Student Simulated Path */}
                  <div className="lab-path-box path-student">
                    <div className="path-box-title">
                      <span>⚠️ {lang === 'hi' ? 'छात्र की सोची गई प्रक्रिया' : 'Simulated Student Steps'}</span>
                      <span className="result-val">x = {visitorInput}</span>
                    </div>
                    <div className="path-steps">
                      {topCandidate.evidence.map((step, idx) => {
                        const isDiverged = idx + 1 === topCandidate.divergenceStep
                        return (
                          <div
                            key={idx}
                            className={`lab-step-row ${isDiverged ? 'step-diverged' : ''}`}
                          >
                            <span className="step-idx">{idx + 1}.</span>
                            <span className="step-text">{step}</span>
                            {isDiverged && (
                              <span className="step-diverged-chip">
                                ⚡ {lang === 'hi' ? 'यहाँ त्रुटि हुई' : 'Diverged here'}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Expected Correct Path */}
                  <div className="lab-path-box path-correct">
                    <div className="path-box-title">
                      <span>✅ {lang === 'hi' ? 'सही गणितीय प्रक्रिया' : 'Correct Math Steps'}</span>
                      <span className="result-val">x = 4</span>
                    </div>
                    <div className="path-steps">
                      <div className="lab-step-row">
                        <span className="step-idx">1.</span>
                        <span className="step-text">2(x + 3) = 14</span>
                      </div>
                      <div className="lab-step-row">
                        <span className="step-idx">2.</span>
                        <span className="step-text">2x + 6 = 14 (distribute 2 to both x and 3)</span>
                      </div>
                      <div className="lab-step-row">
                        <span className="step-idx">3.</span>
                        <span className="step-text">2x = 14 - 6 = 8 (transpose with inverse sign)</span>
                      </div>
                      <div className="lab-step-row">
                        <span className="step-idx">4.</span>
                        <span className="step-text">x = 8 / 2 = 4 (divide by coefficient)</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Calculation Slip Details */}
              {liveResult.status === 'calculation_slip' && liveResult.slipDetails && (
                <div className="lab-slip-callout">
                  <span className="slip-icon">⚡</span>
                  <div>
                    <strong>{lang === 'hi' ? 'प्रक्रिया बिल्कुल सही थी!' : 'The procedure was completely correct!'}</strong>
                    <p>
                      {lang === 'hi'
                        ? `कदम ${liveResult.slipDetails.divergenceStep} पर केवल एक छोटी अंकगणितीय गणना त्रुटि हुई: अपेक्षित था "${liveResult.slipDetails.expectedStep}", लेकिन छात्र ने किया "${liveResult.slipDetails.actualStep}"। यह अवधारणा की कमी नहीं, बल्कि एक सामान्य फिसलन है।`
                        : `At step ${liveResult.slipDetails.divergenceStep}, a single arithmetic calculation slip occurred: expected "${liveResult.slipDetails.expectedStep}", but student computed "${liveResult.slipDetails.actualStep}". This is an arithmetic slip, not a misconception.`}
                    </p>
                  </div>
                </div>
              )}

              {/* Kid-friendly explanation banner */}
              {matchedMisc && (
                <div className="lab-explanation-callout">
                  <div className="expl-speech">
                    <Mascot size={32} mood="detective" />
                    <p className="expl-quote">
                      &ldquo;{matchedMisc.kidFriendlyExplanation[lang]}&rdquo;
                    </p>
                  </div>
                  <div className="expl-why">
                    <strong>{lang === 'hi' ? 'यह क्यों होता है?' : 'Why it happens:'}</strong>{' '}
                    {matchedMisc.whyItHappens[lang]}
                  </div>
                </div>
              )}

              {liveResult.status === 'correct' && (
                <div className="lab-correct-callout">
                  <Mascot size={32} mood="cheer" />
                  <p>
                    {lang === 'hi'
                      ? 'बिल्कुल सही! सभी संक्रियाएं संतुलित और सटीक हैं।'
                      : 'Perfect! All inverse operations and distribution steps were executed flawlessly.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="live-lab-footer">
            <span className="lab-guarantee">
              🔒 <strong>{lang === 'hi' ? 'स्थानीय नियम इंजन:' : 'Local Rule Engine:'}</strong> {lang === 'hi' ? 'शुद्ध टाइपस्क्रिप्ट गणित। पहले लॉगिन के बाद ऑफ़लाइन काम करता है और ऑनलाइन आने पर सिंक होता है।' : 'Pure TypeScript mathematics. Works offline after your first login and syncs when you are online.'}
            </span>
            {onStartPractice && (
              <button type="button" className="btn btn-primary btn-sm" onClick={onStartPractice}>
                {lang === 'hi' ? 'अभ्यास शुरू करें 🎯' : 'Start Practice 🎯'}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
