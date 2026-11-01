import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mascot } from '../Mascot'
import { useReducedMotionPref } from '../../motion/reducedMotion'
import { computeMastery } from '../../engine/mastery'
import { traceGap, getProbeQuestions, getFixQuestions } from '../../engine/gapTrace'
import { saveAttempt, saveGapReport } from '../../services/api'
import type {
  Question,
  Attempt,
  Language,
  TraceResult,
  ConfidenceRating,
  MistakeTag,
  Concept,
} from '../../types'
import { classifyAttempt } from '../../engine/mastery'
import rawConcepts from '../../data/concepts.json'

const concepts = rawConcepts as Concept[]
const conceptMap = new Map<string, Concept>(concepts.map((c) => [c.id, c]))

interface DetectiveModalProps {
  isOpen: boolean
  triggerQuestion: Question
  triggerAttempt: Attempt
  studentId: string
  sessionId: string
  allStudentAttempts: Attempt[]
  lang: Language
  onClose: () => void
  onComplete: (updatedAttempts: Attempt[]) => void
}

type DetectivePhase =
  | 'intro' // Explaining the detective trace & showing initial graph trail
  | 'probing' // Asking diagnostic probe questions for unknown nodes
  | 'reveal' // "Found it!" root-cause summary
  | 'fixing' // 3-5 questions fix round on root cause
  | 'fixed' // Result of fix round with before/after mastery change
  | 'no_gap' // Solid prerequisites message

export function DetectiveModal({
  isOpen,
  triggerQuestion,
  triggerAttempt,
  studentId,
  sessionId,
  allStudentAttempts,
  lang,
  onClose,
  onComplete,
}: DetectiveModalProps) {
  const reduced = useReducedMotionPref()
  const [phase, setPhase] = useState<DetectivePhase>('intro')
  const [currentAttempts, setCurrentAttempts] = useState<Attempt[]>(allStudentAttempts)
  const [traceResult, setTraceResult] = useState<TraceResult | null>(null)

  // Probing state
  const [probeQuestions, setProbeQuestions] = useState<Question[]>([])
  const [probeIndex, setProbeIndex] = useState(0)
  const [probesAnsweredCount, setProbesAnsweredCount] = useState(0)

  // Fixing state
  const [fixQuestions, setFixQuestions] = useState<Question[]>([])
  const [fixIndex, setFixIndex] = useState(0)
  const [fixMasteryBefore, setFixMasteryBefore] = useState<number>(0)
  const [fixMasteryAfter, setFixMasteryAfter] = useState<number>(0)

  // Current interactive question state (for both probe & fix questions)
  const [selectedConfidence, setSelectedConfidence] = useState<ConfidenceRating | null>(null)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false)
  const questionStartTimeRef = useRef<number>(performance.now())

  // Run initial trace on mount/open
  useEffect(() => {
    if (isOpen) {
      const initialTrace = traceGap(
        allStudentAttempts,
        triggerQuestion,
        triggerAttempt.chosenIndex,
        undefined,
        triggerAttempt.attemptType === 'misconception' ? 'misconception' : 'consecutive_wrong',
      )
      setTraceResult(initialTrace)
      setCurrentAttempts(allStudentAttempts)
      setProbeIndex(0)
      setProbesAnsweredCount(0)
      setIsAnswerSubmitted(false)
      setSelectedConfidence(null)
      setSelectedOption(null)

      if (initialTrace.probesNeeded.length > 0) {
        // Prepare first probe question
        const firstUnknownId = initialTrace.probesNeeded[0]
        const questions = getProbeQuestions(firstUnknownId, [], undefined, 2)
        setProbeQuestions(questions)
        setPhase('intro')
      } else if (initialTrace.rootCauseId) {
        setPhase('reveal')
        // Save gap report to IndexedDB
        saveGapReport({
          studentId,
          startConceptId: initialTrace.startConceptId,
          rootCauseId: initialTrace.rootCauseId,
          path: initialTrace.path,
          confidence: initialTrace.confidence,
          triggerReason: initialTrace.triggerReason,
          createdAt: Date.now(),
          resolvedAt: null,
        }).catch((e) => console.warn('Could not save gap report:', e))
      } else {
        setPhase('no_gap')
      }
    }
  }, [isOpen, triggerQuestion, triggerAttempt, allStudentAttempts, studentId])

  if (!isOpen || !traceResult) return null

  const handleStartProbing = () => {
    if (traceResult.probesNeeded.length > 0) {
      setPhase('probing')
      questionStartTimeRef.current = performance.now()
    } else if (traceResult.rootCauseId) {
      setPhase('reveal')
    } else {
      setPhase('no_gap')
    }
  }

  // Answer handling for probe questions
  const handleProbeAnswer = async (optIdx: number) => {
    if (selectedOption !== null || !selectedConfidence) return
    setSelectedOption(optIdx)
    setIsAnswerSubmitted(true)

    const curQ = probeQuestions[probeIndex]
    const isCorrect = optIdx === curQ.correctIndex
    const timeTaken = Math.round(performance.now() - questionStartTimeRef.current)
    const mistakeTag: MistakeTag | null = isCorrect ? null : ((curQ.wrongTags && curQ.wrongTags[String(optIdx)]) || 'concept_gap')
    const attemptType = classifyAttempt(selectedConfidence, isCorrect)

    const saved = await saveAttempt({
      studentId,
      sessionId,
      questionId: curQ.id,
      conceptId: curQ.conceptId,
      correct: isCorrect,
      chosenIndex: optIdx,
      mistakeTag,
      hintsUsed: 0,
      timeTakenMs: timeTaken,
      confidence: selectedConfidence,
      attemptType,
      timestamp: Date.now(),
      isProbe: true,
    })

    const updatedAttempts = [...currentAttempts, saved]
    setCurrentAttempts(updatedAttempts)
    setProbesAnsweredCount((prev) => prev + 1)
  }

  const handleNextProbeQuestion = () => {
    const nextIdx = probeIndex + 1
    const totalAnswered = probesAnsweredCount

    // Re-run trace with updated attempts
    const newTrace = traceGap(
      currentAttempts,
      triggerQuestion,
      triggerAttempt.chosenIndex,
      undefined,
      traceResult.triggerReason,
    )
    setTraceResult(newTrace)

    // Max 6 probe questions total
    if (newTrace.probesNeeded.length === 0 || totalAnswered >= 6) {
      if (newTrace.rootCauseId) {
        setPhase('reveal')
        saveGapReport({
          studentId,
          startConceptId: newTrace.startConceptId,
          rootCauseId: newTrace.rootCauseId,
          path: newTrace.path,
          confidence: newTrace.confidence,
          triggerReason: newTrace.triggerReason,
          createdAt: Date.now(),
          resolvedAt: null,
        }).catch((e) => console.warn('Could not save gap report:', e))
      } else {
        setPhase('no_gap')
      }
      return
    }

    // Continue probing
    if (nextIdx < probeQuestions.length) {
      setProbeIndex(nextIdx)
    } else {
      // Move to next unknown concept
      const nextConceptId = newTrace.probesNeeded[0]
      const nextBatch = getProbeQuestions(nextConceptId, currentAttempts.map((a) => a.questionId), undefined, 2)
      setProbeQuestions(nextBatch)
      setProbeIndex(0)
    }

    setSelectedConfidence(null)
    setSelectedOption(null)
    setIsAnswerSubmitted(false)
    questionStartTimeRef.current = performance.now()
  }

  // Fix session initiation
  const handleStartFix = () => {
    if (!traceResult.rootCauseId) return
    const rootId = traceResult.rootCauseId

    const beforeMastery = computeMastery(currentAttempts, rootId)
    setFixMasteryBefore(beforeMastery.score)

    const fixQs = getFixQuestions(rootId, currentAttempts.map((a) => a.questionId), undefined, 3)
    setFixQuestions(fixQs)
    setFixIndex(0)
    setSelectedConfidence(null)
    setSelectedOption(null)
    setIsAnswerSubmitted(false)
    questionStartTimeRef.current = performance.now()
    setPhase('fixing')
  }

  // Answer handling for fix questions
  const handleFixAnswer = async (optIdx: number) => {
    if (selectedOption !== null || !selectedConfidence) return
    setSelectedOption(optIdx)
    setIsAnswerSubmitted(true)

    const curQ = fixQuestions[fixIndex]
    const isCorrect = optIdx === curQ.correctIndex
    const timeTaken = Math.round(performance.now() - questionStartTimeRef.current)
    const mistakeTag: MistakeTag | null = isCorrect ? null : ((curQ.wrongTags && curQ.wrongTags[String(optIdx)]) || 'concept_gap')
    const attemptType = classifyAttempt(selectedConfidence, isCorrect)

    const saved = await saveAttempt({
      studentId,
      sessionId,
      questionId: curQ.id,
      conceptId: curQ.conceptId,
      correct: isCorrect,
      chosenIndex: optIdx,
      mistakeTag,
      hintsUsed: 0,
      timeTakenMs: timeTaken,
      confidence: selectedConfidence,
      attemptType,
      timestamp: Date.now(),
    })

    const updatedAttempts = [...currentAttempts, saved]
    setCurrentAttempts(updatedAttempts)
  }

  const handleNextFixQuestion = () => {
    const nextIdx = fixIndex + 1
    if (nextIdx < fixQuestions.length) {
      setFixIndex(nextIdx)
      setSelectedConfidence(null)
      setSelectedOption(null)
      setIsAnswerSubmitted(false)
      questionStartTimeRef.current = performance.now()
    } else {
      // Completed fix round! Calculate real after mastery
      const rootId = traceResult.rootCauseId!
      const afterMastery = computeMastery(currentAttempts, rootId)
      setFixMasteryAfter(afterMastery.score)
      setPhase('fixed')
    }
  }

  const handleFinishAndReturn = () => {
    onComplete(currentAttempts)
    onClose()
  }

  const startConceptName = conceptMap.get(traceResult.startConceptId)?.name[lang] || traceResult.startConceptId
  const rootConcept = traceResult.rootCauseId ? conceptMap.get(traceResult.rootCauseId) : null
  const rootConceptName = rootConcept ? rootConcept.name[lang] : ''

  return (
    <div className="detective-modal-overlay" role="dialog" aria-modal="true">
      <motion.div
        className="detective-modal-card"
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 20 }}
        transition={{ duration: reduced ? 0 : 0.25 }}
      >
        {/* Top Header */}
        <header className="detective-header">
          <div className="detective-header-left">
            <span className="detective-badge">
              <span className="detective-badge-dot" />
              GAP DETECTIVE
            </span>
            <h3>
              {lang === 'hi' ? 'जासूस मोड: आइए कारण खोजें' : 'Detective Mode: Let’s find the root cause'}
            </h3>
          </div>
          <button
            type="button"
            className="detective-skip-btn"
            onClick={onClose}
            title={lang === 'hi' ? 'अभी छोड़ें' : 'Skip for now'}
          >
            {lang === 'hi' ? 'छोड़ें ✕' : 'Skip ✕'}
          </button>
        </header>

        {/* Visual Graph Trail Backwards Breadcrumb */}
        <div className="detective-trail-bar">
          <div className="trail-label">
            {lang === 'hi' ? 'पूर्व-अपेक्षित पथ (Prerequisite Trail):' : 'Tracing Backwards:'}
          </div>
          <div className="detective-node-track">
            {traceResult.path.map((node, i) => {
              const cObj = conceptMap.get(node.conceptId)
              const name = cObj?.name[lang] || node.conceptId
              const isStart = i === 0
              const isRoot = node.conceptId === traceResult.rootCauseId
              const isCurrentProbe =
                phase === 'probing' &&
                probeQuestions[probeIndex]?.conceptId === node.conceptId

              let statusClass = 'node-solid'
              if (node.status === 'weak') statusClass = 'node-weak'
              if (node.status === 'unknown') statusClass = 'node-unknown'
              if (isStart) statusClass = 'node-start'
              if (isRoot) statusClass = 'node-root'

              return (
                <div key={node.conceptId} className="detective-node-wrapper">
                  {i > 0 && <span className="trail-arrow">←</span>}
                  <motion.div
                    className={`detective-node ${statusClass} ${isCurrentProbe ? 'node-probing' : ''}`}
                    animate={
                      isCurrentProbe && !reduced
                        ? { scale: [1, 1.06, 1], boxShadow: ['0 0 0px #ffc862', '0 0 12px #ffc862', '0 0 0px #ffc862'] }
                        : {}
                    }
                    transition={{ repeat: Infinity, duration: 1.5 }}
                  >
                    <div className="node-title">{name}</div>
                    <div className="node-sub">
                      {isStart ? (
                        <span className="badge-struggling">{lang === 'hi' ? 'कठिनाई' : 'Struggled'}</span>
                      ) : node.status === 'solid' ? (
                        <span className="badge-solid">
                          ✓ {node.mastery !== null ? `${Math.round(node.mastery * 100)}%` : 'Solid'}
                        </span>
                      ) : node.status === 'weak' ? (
                        <span className="badge-weak">
                          ! {node.mastery !== null ? `${Math.round(node.mastery * 100)}%` : 'Gap'}
                        </span>
                      ) : (
                        <span className="badge-unknown">{lang === 'hi' ? 'जांच' : 'Probe 🔍'}</span>
                      )}
                    </div>
                  </motion.div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Modal Dynamic Body Content */}
        <div className="detective-body">
          <AnimatePresence mode="wait">
            {/* 1. INTRO PHASE */}
            {phase === 'intro' && (
              <motion.div
                key="intro"
                className="detective-intro-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <div className="detective-hero-mascot">
                  <Mascot mood="detective" size={100} />
                </div>
                <h4>
                  {lang === 'hi'
                    ? `चिंता न करें! आइए देखें कि "${startConceptName}" में क्या अटका।`
                    : `Don't worry! Let's uncover why "${startConceptName}" felt tricky.`}
                </h4>
                <p className="detective-subtext">
                  {lang === 'hi'
                    ? 'गणित में उच्च अवधारणाएं पिछली बुनियादी अवधारणाओं पर निर्भर करती हैं। वास्तविक कारण खोजने के लिए हम पीछे की ओर जांच कर रहे हैं।'
                    : 'In maths, advanced concepts rely on foundational stepping stones. We trace backwards through real prerequisites so you master the exact missing link.'}
                </p>

                {traceResult.probesNeeded.length > 0 ? (
                  <div className="detective-probe-prompt-card">
                    <div className="prompt-icon">🔍</div>
                    <div className="prompt-text">
                      <strong>
                        {lang === 'hi'
                          ? 'त्वरित पूर्व-अपेक्षित जांच (Quick Diagnostic Check)'
                          : 'Quick Diagnostic Probe Needed'}
                      </strong>
                      <p>
                        {lang === 'hi'
                          ? `आपके पास "${
                              conceptMap.get(traceResult.probesNeeded[0])?.name[lang] || traceResult.probesNeeded[0]
                            }" में पर्याप्त डेटा नहीं है। बिना अनुमान लगाए केवल 1-2 त्वरित प्रश्नों से जांचते हैं।`
                          : `We don't have enough data on "${
                              conceptMap.get(traceResult.probesNeeded[0])?.name[lang] || traceResult.probesNeeded[0]
                            }". Instead of guessing, let's run 1 or 2 quick questions to be 100% sure.`}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="detective-ready-line">
                    {lang === 'hi' ? 'जांच पूर्ण हो चुकी है!' : 'Analysis ready!'}
                  </p>
                )}

                <div className="detective-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-lg"
                    onClick={handleStartProbing}
                  >
                    {traceResult.probesNeeded.length > 0
                      ? lang === 'hi'
                        ? 'त्वरित जांच शुरू करें 🔍'
                        : 'Start Quick Probe 🔍'
                      : lang === 'hi'
                        ? 'जांच परिणाम देखें 🎯'
                        : 'See Findings 🎯'}
                  </button>
                </div>
              </motion.div>
            )}

            {/* 2. PROBING PHASE */}
            {phase === 'probing' && probeQuestions[probeIndex] && (
              <motion.div
                key={`probe-${probeQuestions[probeIndex].id}`}
                className="detective-probe-view"
                initial={{ opacity: 0, x: 15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -15 }}
              >
                <div className="probe-header-banner">
                  <span className="probe-tag">
                    {lang === 'hi' ? 'जासूसी प्रश्न' : 'Diagnostic Probe'} #{probesAnsweredCount + 1}
                  </span>
                  <span className="probe-concept-title">
                    {conceptMap.get(probeQuestions[probeIndex].conceptId)?.name[lang]}
                  </span>
                </div>

                <div className="probe-question-box">
                  <div className="probe-question-text">{probeQuestions[probeIndex].text[lang]}</div>

                  {/* Confidence picker before answering */}
                  <div className="probe-confidence-bar">
                    <span className="conf-label">
                      {lang === 'hi' ? 'विश्वास स्तर:' : 'Confidence:'}
                    </span>
                    <button
                      type="button"
                      className={`conf-pill ${selectedConfidence === 'sure' ? 'active' : ''}`}
                      onClick={() => !isAnswerSubmitted && setSelectedConfidence('sure')}
                      disabled={isAnswerSubmitted}
                    >
                      😎 {lang === 'hi' ? 'पक्का' : 'Sure'}
                    </button>
                    <button
                      type="button"
                      className={`conf-pill ${selectedConfidence === 'maybe' ? 'active' : ''}`}
                      onClick={() => !isAnswerSubmitted && setSelectedConfidence('maybe')}
                      disabled={isAnswerSubmitted}
                    >
                      🤔 {lang === 'hi' ? 'शायद' : 'Maybe'}
                    </button>
                    <button
                      type="button"
                      className={`conf-pill ${selectedConfidence === 'guess' ? 'active' : ''}`}
                      onClick={() => !isAnswerSubmitted && setSelectedConfidence('guess')}
                      disabled={isAnswerSubmitted}
                    >
                      😕 {lang === 'hi' ? 'अंदाज़ा' : 'Guess'}
                    </button>
                  </div>

                  {/* 4 Options */}
                  <div className="probe-options-grid">
                    {probeQuestions[probeIndex].options?.map((opt, optIdx) => {
                      const isCorrect = optIdx === probeQuestions[probeIndex].correctIndex
                      const isChosen = selectedOption === optIdx
                      let btnState = ''
                      if (isAnswerSubmitted) {
                        if (isCorrect) btnState = 'opt-correct'
                        else if (isChosen) btnState = 'opt-wrong'
                        else btnState = 'opt-dimmed'
                      }

                      return (
                        <button
                          key={optIdx}
                          type="button"
                          className={`probe-option-btn ${btnState} ${isChosen ? 'selected' : ''}`}
                          onClick={() => handleProbeAnswer(optIdx)}
                          disabled={isAnswerSubmitted || !selectedConfidence}
                        >
                          <span className="opt-letter">
                            {String.fromCharCode(65 + optIdx)}
                          </span>
                          <span className="opt-text">{opt[lang]}</span>
                        </button>
                      )
                    })}
                  </div>

                  {!selectedConfidence && (
                    <p className="confidence-hint-text">
                      {lang === 'hi'
                        ? 'विकल्प चुनने से पहले ऊपर अपना विश्वास चुनें।'
                        : 'Tap your confidence level above before selecting an option.'}
                    </p>
                  )}

                  {isAnswerSubmitted && (
                    <div className="probe-feedback-box">
                      <div className="probe-solution-text">
                        <strong>{lang === 'hi' ? 'समाधान: ' : 'Solution: '}</strong>
                        {probeQuestions[probeIndex].solution[lang]}
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleNextProbeQuestion}
                      >
                        {lang === 'hi' ? 'अगला कदम →' : 'Next Step →'}
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* 3. REVEAL PHASE ("Found it!") */}
            {phase === 'reveal' && rootConcept && (
              <motion.div
                key="reveal"
                className="detective-reveal-view"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <div className="reveal-badge-banner">
                  <span className="reveal-icon">🎯</span>
                  <span className="reveal-title">{lang === 'hi' ? 'कारण मिल गया!' : 'Root Cause Found!'}</span>
                </div>

                <div className="reveal-card">
                  <div className="reveal-root-name">
                    {rootConceptName} (Class {rootConcept.grade})
                  </div>
                  <p className="reveal-explanation">{traceResult.explanation[lang]}</p>

                  <div className="reveal-path-summary">
                    <span className="summary-title">{lang === 'hi' ? 'पथ:' : 'Path:'}</span>
                    <span className="summary-breadcrumbs">
                      {traceResult.path.map((n) => conceptMap.get(n.conceptId)?.name[lang]).join(' ← ')}
                    </span>
                  </div>
                </div>

                <div className="detective-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-lg"
                    onClick={handleStartFix}
                  >
                    {lang === 'hi' ? 'अभी सुधारें (Fix It Now) 🛠️' : 'Fix It Now 🛠️'}
                  </button>
                </div>
              </motion.div>
            )}

            {/* 4. FIXING PHASE (3-5 Practice Questions) */}
            {phase === 'fixing' && fixQuestions[fixIndex] && (
              <motion.div
                key={`fix-${fixQuestions[fixIndex].id}`}
                className="detective-fix-view"
                initial={{ opacity: 0, x: 15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -15 }}
              >
                <div className="fix-header-banner">
                  <span className="fix-step-badge">
                    {lang === 'hi' ? 'अभ्यास' : 'Strengthening'} {fixIndex + 1} / {fixQuestions.length}
                  </span>
                  <span className="fix-concept-title">
                    🛠️ {rootConceptName} (Diff {fixQuestions[fixIndex].difficulty})
                  </span>
                </div>

                <div className="fix-question-box">
                  <div className="fix-question-text">{fixQuestions[fixIndex].text[lang]}</div>

                  <div className="probe-confidence-bar">
                    <span className="conf-label">{lang === 'hi' ? 'विश्वास:' : 'Confidence:'}</span>
                    <button
                      type="button"
                      className={`conf-pill ${selectedConfidence === 'sure' ? 'active' : ''}`}
                      onClick={() => !isAnswerSubmitted && setSelectedConfidence('sure')}
                      disabled={isAnswerSubmitted}
                    >
                      😎 {lang === 'hi' ? 'पक्का' : 'Sure'}
                    </button>
                    <button
                      type="button"
                      className={`conf-pill ${selectedConfidence === 'maybe' ? 'active' : ''}`}
                      onClick={() => !isAnswerSubmitted && setSelectedConfidence('maybe')}
                      disabled={isAnswerSubmitted}
                    >
                      🤔 {lang === 'hi' ? 'शायद' : 'Maybe'}
                    </button>
                    <button
                      type="button"
                      className={`conf-pill ${selectedConfidence === 'guess' ? 'active' : ''}`}
                      onClick={() => !isAnswerSubmitted && setSelectedConfidence('guess')}
                      disabled={isAnswerSubmitted}
                    >
                      😕 {lang === 'hi' ? 'अंदाज़ा' : 'Guess'}
                    </button>
                  </div>

                  <div className="probe-options-grid">
                    {fixQuestions[fixIndex].options?.map((opt, optIdx) => {
                      const isCorrect = optIdx === fixQuestions[fixIndex].correctIndex
                      const isChosen = selectedOption === optIdx
                      let btnState = ''
                      if (isAnswerSubmitted) {
                        if (isCorrect) btnState = 'opt-correct'
                        else if (isChosen) btnState = 'opt-wrong'
                        else btnState = 'opt-dimmed'
                      }

                      return (
                        <button
                          key={optIdx}
                          type="button"
                          className={`probe-option-btn ${btnState} ${isChosen ? 'selected' : ''}`}
                          onClick={() => handleFixAnswer(optIdx)}
                          disabled={isAnswerSubmitted || !selectedConfidence}
                        >
                          <span className="opt-letter">{String.fromCharCode(65 + optIdx)}</span>
                          <span className="opt-text">{opt[lang]}</span>
                        </button>
                      )
                    })}
                  </div>

                  {isAnswerSubmitted && (
                    <div className="probe-feedback-box">
                      <div className="probe-solution-text">
                        <strong>{lang === 'hi' ? 'समाधान: ' : 'Solution: '}</strong>
                        {fixQuestions[fixIndex].solution[lang]}
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleNextFixQuestion}
                      >
                        {fixIndex + 1 < fixQuestions.length
                          ? lang === 'hi'
                            ? 'अगला प्रश्न →'
                            : 'Next Question →'
                          : lang === 'hi'
                            ? 'सुधार परिणाम देखें 🎉'
                            : 'See Progress 🎉'}
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* 5. FIXED PHASE (Before vs After Mastery) */}
            {phase === 'fixed' && (
              <motion.div
                key="fixed"
                className="detective-fixed-view"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <div className="fixed-celebration-mascot">
                  <Mascot mood="cheer" size={90} />
                </div>
                <h4>{lang === 'hi' ? 'शाबाश! बुनियादी समझ मजबूत हुई!' : 'Great job! Prerequisite Strengthened!'}</h4>
                <p className="fixed-subtext">
                  {lang === 'hi'
                    ? `आपने "${rootConceptName}" का सफलतापूर्वक अभ्यास किया। वास्तविक डेटा से आपकी निपुणता में यह बदलाव आया है:`
                    : `You practiced real questions in "${rootConceptName}". Here is your actual computed mastery growth:`}
                </p>

                <div className="mastery-comparison-card">
                  <div className="comp-row">
                    <span className="comp-label">{lang === 'hi' ? 'पहले (Before):' : 'Before:'}</span>
                    <span className="comp-val val-before">{Math.round(fixMasteryBefore * 100)}%</span>
                  </div>
                  <div className="comp-arrow-divider">↓</div>
                  <div className="comp-row">
                    <span className="comp-label">{lang === 'hi' ? 'अब (After):' : 'Now:'}</span>
                    <span className="comp-val val-after">{Math.round(fixMasteryAfter * 100)}%</span>
                  </div>
                  <div className="comp-gain">
                    +{Math.max(0, Math.round((fixMasteryAfter - fixMasteryBefore) * 100))}% {lang === 'hi' ? 'वृद्धि' : 'gain'}
                  </div>
                </div>

                <div className="detective-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-lg"
                    onClick={handleFinishAndReturn}
                  >
                    {lang === 'hi'
                      ? `"${startConceptName}" फिर से हल करने के लिए तैयार 🚀`
                      : `Ready to retry "${startConceptName}" 🚀`}
                  </button>
                </div>
              </motion.div>
            )}

            {/* 6. NO GAP PHASE */}
            {phase === 'no_gap' && (
              <motion.div
                key="no_gap"
                className="detective-nogap-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <div className="nogap-mascot">
                  <Mascot mood="wave" size={80} />
                </div>
                <h4>{lang === 'hi' ? 'अच्छी खबर! आधार मजबूत है।' : 'Good news! Your basics are solid.'}</h4>
                <p className="nogap-text">{traceResult.explanation[lang]}</p>
                <div className="detective-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-lg"
                    onClick={onClose}
                  >
                    {lang === 'hi' ? 'अभ्यास जारी रखें 🎯' : 'Continue Practice 🎯'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}
