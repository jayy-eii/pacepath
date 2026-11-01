import { useState } from 'react'
import { motion } from 'framer-motion'
import { Mascot } from '../Mascot'
import type {
  Question,
  Language,
  CandidateMisconception,
} from '../../types'
import rawMisconceptions from '../../data/misconceptions.json'
import { updateMisconceptionConfirmation } from '../../services/api'
import { parseNumericAnswer, areNumbersClose } from '../../engine/mathCore'

const allMisconceptions = rawMisconceptions as Array<{
  id: string
  conceptId: string
  name: { en: string; hi: string }
  description: { en: string; hi: string }
  kidFriendlyExplanation: { en: string; hi: string }
  whyItHappens: { en: string; hi: string }
  miniLesson: Array<{ step: number; text: { en: string; hi: string } }>
  exampleWrong: { en: string; hi: string }
  exampleRight: { en: string; hi: string }
}>

const miscMap = new Map(allMisconceptions.map((m) => [m.id, m]))

interface MisconceptionDetectiveModalProps {
  isOpen: boolean
  question: Question
  studentAnswer: number | string
  candidate: CandidateMisconception
  eventId?: string
  lang: Language
  onClose: () => void
  onResolvedDiagnostic?: () => void
}

export function MisconceptionDetectiveModal({
  isOpen,
  question,
  studentAnswer,
  candidate,
  eventId,
  lang,
  onClose,
  onResolvedDiagnostic,
}: MisconceptionDetectiveModalProps) {
  const [feedbackState, setFeedbackState] = useState<'pending' | 'confirmed' | 'denied'>('pending')
  const [diagnosticAnswer, setDiagnosticAnswer] = useState<string>('')
  const [diagnosticFeedback, setDiagnosticFeedback] = useState<{
    submitted: boolean
    correct: boolean
  } | null>(null)

  if (!isOpen) return null

  const misc = miscMap.get(candidate.misconceptionId)
  const divergenceStep = candidate.divergenceStep || 2

  // Diagnostic mini question tailored to the misconception
  // For 2(x+3)=14, the quick diagnostic check is: "In 3x + 6 = 21, what is 3x?" (Answer: 15)
  const diagnosticQ = {
    prompt: {
      en: 'Quick check: In the equation 3x + 6 = 21, what should the next line be for 3x?',
      hi: 'त्वरित जांच: समीकरण 3x + 6 = 21 में, 3x का अगला मान क्या होना चाहिए?',
    },
    correctAnswer: 15,
  }

  const handleConfirm = async (confirmed: boolean | null) => {
    if (eventId) {
      await updateMisconceptionConfirmation(eventId, confirmed)
    }
    setFeedbackState(confirmed ? 'confirmed' : 'denied')
  }

  const handleDiagnosticSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const val = parseNumericAnswer(diagnosticAnswer)
    const isCorrect = val !== null && areNumbersClose(val, diagnosticQ.correctAnswer)
    setDiagnosticFeedback({ submitted: true, correct: isCorrect })
    if (isCorrect && onResolvedDiagnostic) {
      onResolvedDiagnostic()
    }
  }

  return (
    <div className="detective-modal-overlay" role="dialog" aria-modal="true">
      <motion.div
        className="detective-modal-card"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.3 }}
      >
        {/* Header */}
        <header className="detective-header">
          <div className="detective-title-area">
            <div className="detective-avatar">
              <Mascot size={42} mood="detective" />
            </div>
            <div>
              <span className="detective-badge">
                🔍 {lang === 'hi' ? 'कारण जासूस' : 'Misconception Detective'}
              </span>
              <h3>
                {lang === 'hi'
                  ? 'मुझे लगता है कि यहाँ यह हुआ होगा...'
                  : 'I think this might have happened...'}
              </h3>
            </div>
          </div>
          <button
            type="button"
            className="detective-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        {/* Content Body */}
        <div className="detective-body">
          {/* Friendly Story Speech */}
          <div className="detective-story-banner">
            <div className="story-speech">
              <p className="story-dialogue">
                {misc
                  ? misc.kidFriendlyExplanation[lang]
                  : lang === 'hi'
                    ? 'आइए देखें कि गणना कहाँ अलग रास्ते पर चली गई।'
                    : "Let's inspect where your steps took a different turn."}
              </p>
              {misc && (
                <p className="story-hint-sub">
                  💡 {misc.whyItHappens[lang]}
                </p>
              )}
            </div>
          </div>

          {/* Side-by-Side Path Comparison */}
          <div className="misc-paths-comparison">
            <div className="misc-path-col path-wrong">
              <div className="path-col-header">
                <span className="path-icon">⚠️</span>
                <span>{lang === 'hi' ? 'आपका सोचा गया रास्ता' : 'Your Thought Path'}</span>
                <span className="path-answer-pill">ans: {studentAnswer}</span>
              </div>
              <div className="path-steps-list">
                {candidate.evidence.map((step, idx) => {
                  const isDiverged = idx + 1 === divergenceStep
                  return (
                    <div
                      key={idx}
                      className={`path-step-item ${isDiverged ? 'step-diverged' : ''}`}
                    >
                      <span className="step-num">{idx + 1}.</span>
                      <span className="step-code">{step}</span>
                      {isDiverged && (
                        <span className="diverge-badge">
                          ⚡ {lang === 'hi' ? 'यहाँ मोड़ आया' : 'Diverged here'}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="misc-path-col path-right">
              <div className="path-col-header">
                <span className="path-icon">✅</span>
                <span>{lang === 'hi' ? 'गणितीय सही रास्ता' : 'Correct Math Path'}</span>
                <span className="path-answer-pill">ans: {question.correctAnswer || 4}</span>
              </div>
              <div className="path-steps-list">
                {question.solution[lang].split('→').map((step, idx) => (
                  <div key={idx} className="path-step-item step-correct">
                    <span className="step-num">{idx + 1}.</span>
                    <span className="step-code">{step.trim()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Student Confirmation Feedback */}
          <div className="misc-confirm-box">
            <div className="confirm-prompt">
              {lang === 'hi'
                ? 'क्या आपने वास्तव में यही किया था?'
                : 'Is this what you did in your mind?'}
            </div>

            {feedbackState === 'pending' ? (
              <div className="confirm-buttons-row">
                <button
                  type="button"
                  className="btn btn-sm btn-confirm"
                  onClick={() => handleConfirm(true)}
                >
                  👍 {lang === 'hi' ? 'हाँ, बिल्कुल!' : 'Yes, exactly!'}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-deny"
                  onClick={() => handleConfirm(false)}
                >
                  👎 {lang === 'hi' ? 'नहीं, कुछ और था' : 'No, something else'}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-maybe"
                  onClick={() => handleConfirm(null)}
                >
                  🤔 {lang === 'hi' ? 'पक्का नहीं' : 'Not sure'}
                </button>
              </div>
            ) : feedbackState === 'confirmed' ? (
              <div className="confirm-thankyou alert-success">
                ✓ {lang === 'hi'
                  ? 'धन्यवाद! आपकी समझ के अनुसार आपका प्रोफ़ाइल अपडेट कर दिया गया है।'
                  : 'Thanks! Your feedback was saved to improve your profile.'}
              </div>
            ) : (
              <div className="confirm-thankyou alert-neutral">
                ℹ️ {lang === 'hi'
                  ? 'कोई बात नहीं! आइए नीचे दिए गए त्वरित प्रश्न से इसकी पुष्टि करें।'
                  : "No worries! Let's verify with the quick diagnostic check below."}
              </div>
            )}
          </div>

          {/* Tiny 1-Question Diagnostic Check */}
          <div className="misc-diagnostic-section">
            <div className="diagnostic-header">
              🎯 <strong>{lang === 'hi' ? 'त्वरित पुष्टि प्रश्न' : 'Tiny Diagnostic Check'}</strong>
            </div>
            <p className="diagnostic-text">{diagnosticQ.prompt[lang]}</p>

            <form onSubmit={handleDiagnosticSubmit} className="diagnostic-form">
              <div className="diagnostic-input-row">
                <input
                  type="text"
                  className="solve-input solve-input-sm"
                  placeholder={lang === 'hi' ? '3x का मान दर्ज करें...' : 'Enter 3x value...'}
                  value={diagnosticAnswer}
                  onChange={(e) => setDiagnosticAnswer(e.target.value)}
                  disabled={diagnosticFeedback?.submitted}
                />
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={diagnosticFeedback?.submitted || !diagnosticAnswer.trim()}
                >
                  {lang === 'hi' ? 'जाँचें' : 'Check'}
                </button>
              </div>

              {diagnosticFeedback && (
                <div
                  className={`diagnostic-feedback-pill ${
                    diagnosticFeedback.correct ? 'feedback-correct' : 'feedback-wrong'
                  }`}
                >
                  {diagnosticFeedback.correct
                    ? lang === 'hi'
                      ? '✨ शाबाश! 21 - 6 = 15! आपने सही प्रक्रिया समझ ली!'
                      : '✨ Excellent! 21 - 6 = 15! You mastered the correct inverse operation!'
                    : lang === 'hi'
                      ? 'याद रखें: 21 में से 6 घटाएं (21 - 6 = 15), जोड़ें नहीं।'
                      : 'Remember: subtract 6 from 21 (21 - 6 = 15), do not add!'}
                </div>
              )}
            </form>
          </div>

          {/* Mini Lesson 3-Steps */}
          {misc && misc.miniLesson && (
            <div className="mini-lesson-card">
              <div className="mini-lesson-title">
                📖 {lang === 'hi' ? '3-कदम का आसान सबक' : '3-Step Mini Lesson'}
              </div>
              <div className="mini-lesson-steps">
                {misc.miniLesson.map((st) => (
                  <div key={st.step} className="mini-step-item">
                    <span className="step-circle">{st.step}</span>
                    <span className="step-desc">{st.text[lang]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer action */}
          <div className="detective-modal-actions">
            <button type="button" className="btn btn-primary btn-md" onClick={onClose}>
              {lang === 'hi' ? 'समझ आ गया, आगे बढ़ें 🚀' : 'Got it, let’s continue 🚀'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
