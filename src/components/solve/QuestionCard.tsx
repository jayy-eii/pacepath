import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type {
  Question,
  Language,
  MistakeTag,
  ConfidenceRating,
  AttemptType,
  SelectionResult,
  DetectionResult,
  MisconceptionEvent,
} from '../../types'
import { Mascot } from '../Mascot'
import { speakText, stopSpeaking } from '../../utils/speech'
import { getMistakeMessage } from '../../utils/feedback'
import { classifyAttempt } from '../../engine/mastery'
import { useReducedMotionPref } from '../../motion/reducedMotion'
import { detectMisconception } from '../../engine/misconceptionDetect'

interface QuestionCardProps {
  question: Question
  questionNumber: number
  totalQuestions: number
  lang: Language
  conceptName: string
  selectionResult?: SelectionResult
  studentHistory?: MisconceptionEvent[]
  onAnswerSaved: (attemptData: {
    questionId: string
    conceptId: string
    correct: boolean
    chosenIndex: number
    mistakeTag: MistakeTag | null
    hintsUsed: number
    timeTakenMs: number
    confidence: ConfidenceRating
    attemptType: AttemptType
    studentAnswer?: string | number
    detectionResult?: DetectionResult
  }) => void
  onAskTeacher?: (context: {
    questionId: string
    questionTitle: string
    studentAnswer?: string
    misconceptionTag?: string
  }) => void
  onAskAITutor?: (context: {
    questionId: string
    questionTitle: string
    studentAnswer?: string
    conceptId?: string
  }) => void
  onNext: () => void
  isLast: boolean
}

export function QuestionCard({
  question,
  questionNumber,
  totalQuestions,
  lang,
  conceptName,
  selectionResult,
  studentHistory,
  onAnswerSaved,
  onAskTeacher,
  onAskAITutor,
  onNext,
  isLast,
}: QuestionCardProps) {
  const [selectedConfidence, setSelectedConfidence] = useState<ConfidenceRating | null>(null)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [typedAnswer, setTypedAnswer] = useState<string>('')
  const [inputSubmitted, setInputSubmitted] = useState<boolean>(false)
  const [inputDetection, setInputDetection] = useState<DetectionResult | null>(null)
  const [hintsRevealed, setHintsRevealed] = useState<number>(0)
  const [isSpeakingNow, setIsSpeakingNow] = useState(false)
  const [showWhyReason, setShowWhyReason] = useState(false)
  const [confidencePromptNudge, setConfidencePromptNudge] = useState(false)

  const startTimeRef = useRef<number>(0)
  const reducedMotion = useReducedMotionPref()

  const isInputQuestion = question.type === 'numeric_input' || question.type === 'equation_input'

  // Reset state when new question arrives
  useEffect(() => {
    startTimeRef.current = performance.now()
    setSelectedConfidence(null)
    setSelectedOption(null)
    setTypedAnswer('')
    setInputSubmitted(false)
    setInputDetection(null)
    setHintsRevealed(0)
    setShowWhyReason(false)
    setConfidencePromptNudge(false)
    stopSpeaking()
    setIsSpeakingNow(false)
  }, [question.id])

  useEffect(() => {
    return () => stopSpeaking()
  }, [])

  const handleSpeakerClick = () => {
    if (isSpeakingNow) {
      stopSpeaking()
      setIsSpeakingNow(false)
    } else {
      setIsSpeakingNow(true)
      const optionsText = question.options
        ? `${lang === 'hi' ? 'विकल्प:' : 'Options:'} ${question.options.map((o, i) => `${i + 1}: ${o[lang]}`).join('. ')}`
        : ''
      const textToRead = `${question.text[lang]}. ${optionsText}`

      speakText(
        textToRead,
        lang,
        () => setIsSpeakingNow(false),
        () => setIsSpeakingNow(false),
      )
    }
  }

  const handleSelectConfidence = (rating: ConfidenceRating) => {
    if (selectedOption !== null || inputSubmitted) return // Lock once answered
    setSelectedConfidence(rating)
    setConfidencePromptNudge(false)
  }

  const handleCustomSubmit = () => {
    if (!selectedConfidence) {
      setConfidencePromptNudge(true)
      if ('vibrate' in navigator) navigator.vibrate(20)
      return
    }

    if (inputSubmitted || !typedAnswer.trim()) return

    stopSpeaking()
    setIsSpeakingNow(false)

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const timeTakenMs = Math.max(1, Math.round(now - startTimeRef.current))

    const detection = detectMisconception(question, typedAnswer, studentHistory, selectedConfidence)
    setInputDetection(detection)
    setInputSubmitted(true)

    const isCorrect = detection.status === 'correct'
    const attemptType = classifyAttempt(selectedConfidence, isCorrect)

    let mistakeTag: MistakeTag | null = null
    if (!isCorrect) {
      if (detection.status === 'calculation_slip') {
        mistakeTag = 'calculation_slip'
      } else if (detection.candidates[0]?.misconceptionId === 'sign_error_transposing') {
        mistakeTag = 'sign_error'
      } else if (detection.status === 'matched') {
        mistakeTag = 'concept_gap'
      } else {
        mistakeTag = 'other'
      }
    }

    if (isCorrect) {
      if ('vibrate' in navigator) navigator.vibrate(25)
    } else {
      if ('vibrate' in navigator) navigator.vibrate(40)
    }

    onAnswerSaved({
      questionId: question.id,
      conceptId: question.conceptId,
      correct: isCorrect,
      chosenIndex: -1,
      mistakeTag,
      hintsUsed: hintsRevealed,
      timeTakenMs,
      confidence: selectedConfidence,
      attemptType,
      studentAnswer: typedAnswer,
      detectionResult: detection,
    })
  }

  const handleSelectOption = (index: number) => {
    // If student hasn't picked confidence yet, nudge them to select confidence first
    if (!selectedConfidence) {
      setConfidencePromptNudge(true)
      if ('vibrate' in navigator) navigator.vibrate(20)
      return
    }

    if (selectedOption !== null) return // Prevent double taps

    stopSpeaking()
    setIsSpeakingNow(false)

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const timeTakenMs = Math.max(1, Math.round(now - startTimeRef.current))
    setSelectedOption(index)

    const isCorrect = index === question.correctIndex
    const mistakeTag: MistakeTag | null = isCorrect
      ? null
      : (question.wrongTags?.[String(index)] as MistakeTag) || 'other'

    const attemptType = classifyAttempt(selectedConfidence, isCorrect)

    if (isCorrect) {
      if ('vibrate' in navigator) navigator.vibrate(25)
    } else {
      if ('vibrate' in navigator) navigator.vibrate(40)
    }

    // Run misconception detection for MCQ
    const detection = detectMisconception(question, index, studentHistory, selectedConfidence)

    onAnswerSaved({
      questionId: question.id,
      conceptId: question.conceptId,
      correct: isCorrect,
      chosenIndex: index,
      mistakeTag,
      hintsUsed: hintsRevealed,
      timeTakenMs,
      confidence: selectedConfidence,
      attemptType,
      studentAnswer: index,
      detectionResult: detection,
    })
  }

  const handleRevealHint = () => {
    if (hintsRevealed < 3) {
      setHintsRevealed((prev) => prev + 1)
    }
  }

  const isAnswered = isInputQuestion ? inputSubmitted : selectedOption !== null
  const isCorrect = isInputQuestion
    ? inputDetection?.status === 'correct'
    : selectedOption === question.correctIndex
  const activeMistakeTag =
    isAnswered && !isCorrect
      ? (question.wrongTags ? (question.wrongTags[String(selectedOption)] as MistakeTag) || 'other' : 'other')
      : null

  const activeAttemptType: AttemptType | null =
    isAnswered && selectedConfidence
      ? classifyAttempt(selectedConfidence, isCorrect)
      : null

  const shakeVariants = {
    shake: reducedMotion
      ? {}
      : {
          x: [0, -8, 8, -6, 6, -3, 3, 0],
          transition: { duration: 0.45 },
        },
  }

  const difficultyLevel = selectionResult?.targetDifficulty || question.difficulty || 2

  // Kid-friendly messages for each attempt classification
  const getAttemptTypeMessage = (type: AttemptType | null) => {
    switch (type) {
      case 'misconception':
        return {
          en: "You were sure, but this one is tricky. Let's look at why.",
          hi: 'आपको पूरा यकीन था, पर यह सवाल थोड़ा पेचीदा निकला। आइए देखें क्यों!',
        }
      case 'confident_correct':
        return {
          en: 'Spot on! You knew this with total confidence! 🎯',
          hi: 'बिल्कुल सटीक! आपने पूरे विश्वास के साथ सही हल किया! 🎯',
        }
      case 'lucky_guess':
        return {
          en: "Lucky guess! Let's check the steps below so you can master it for next time. 🍀",
          hi: 'अंदाज़ा सही निकला! आइए नीचे दिए हल को समझें ताकि यह पक्का हो जाए। 🍀',
        }
      case 'maybe_correct':
        return {
          en: 'Great intuition! Your thinking was right on track! 🌟',
          hi: 'बहुत बढ़िया समझ! आपका अंदाज़ा बिल्कुल सही दिशा में था! 🌟',
        }
      case 'honest_gap':
      default:
        return {
          en: 'Honest try! Every mistake is a step toward mastering this concept. 🌱',
          hi: 'ईमानदार प्रयास! हर नई गलती सीखने और आगे बढ़ने का अवसर है। 🌱',
        }
    }
  }

  return (
    <div className="solve-card-container">
      {/* No burst confetti — the feedback card itself carries the celebration */}

      {/* Progress, Difficulty & Concept Header */}
      <div className="solve-card-meta">
        <div className="solve-meta-left">
          <span className="solve-badge">{conceptName}</span>
          <span className={`difficulty-meter diff-level-${difficultyLevel}`} title={`Difficulty Level ${difficultyLevel}`}>
            <span className="diff-dot" />
            <span className="diff-label">
              {difficultyLevel === 1
                ? lang === 'hi' ? 'स्तर 1 🌱' : 'Level 1 🌱'
                : difficultyLevel === 2
                  ? lang === 'hi' ? 'स्तर 2 ⚡' : 'Level 2 ⚡'
                  : lang === 'hi' ? 'स्तर 3 🔥' : 'Level 3 🔥'}
            </span>
          </span>
          <span className="solve-step-count">
            {lang === 'hi'
              ? `प्रश्न ${questionNumber} / ${totalQuestions}`
              : `Question ${questionNumber} of ${totalQuestions}`}
          </span>
        </div>
        <div className="solve-meta-right">
          <button
            type="button"
            className={`solve-speaker-btn ${isSpeakingNow ? 'speaking' : ''}`}
            onClick={handleSpeakerClick}
            aria-label={isSpeakingNow ? 'Stop' : 'Listen'}
          >
            <span aria-hidden="true">{isSpeakingNow ? '🔊' : '🔈'}</span>
            <span className="speaker-label">
              {isSpeakingNow
                ? lang === 'hi' ? 'रुकें' : 'Stop'
                : lang === 'hi' ? 'सुनें' : 'Listen'}
            </span>
          </button>
        </div>
      </div>

      {/* Progress Bar Line */}
      <div className="solve-progress-line" role="progressbar" aria-valuenow={questionNumber} aria-valuemin={1} aria-valuemax={totalQuestions}>
        <div
          className="solve-progress-fill"
          style={{ width: `${(questionNumber / totalQuestions) * 100}%` }}
        />
      </div>

      {/* Main Question Card with Shake */}
      <motion.div
        className="solve-question-card"
        variants={shakeVariants}
        animate={isAnswered && !isCorrect ? 'shake' : undefined}
      >
        <h3 className="solve-question-text">{question.text[lang]}</h3>

        {/* "Why this question?" Chip */}
        {selectionResult && (
          <div className="why-question-wrapper">
            <button
              type="button"
              className="why-question-chip"
              onClick={() => setShowWhyReason((prev) => !prev)}
              aria-expanded={showWhyReason}
            >
              <span className="why-icon">💡</span>
              <span className="why-text">
                {lang === 'hi' ? 'यह प्रश्न क्यों चुना गया?' : 'Why this question?'}
              </span>
              <span className="why-arrow">{showWhyReason ? '▲' : '▼'}</span>
            </button>

            <AnimatePresence>
              {showWhyReason && (
                <motion.div
                  className="why-explanation-card"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <p className="why-main-reason">
                    <strong>{selectionResult.reason[lang]}</strong>
                  </p>
                  <p className="why-sub-detail">{selectionResult.detailExplanation[lang]}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* 1-Tap Confidence Picker */}
        <div className={`confidence-picker-section ${confidencePromptNudge ? 'nudge-pulse' : ''}`}>
          <div className="confidence-header">
            <span className="confidence-title">
              {lang === 'hi'
                ? 'विकल्प चुनने से पहले: आपका आत्मविश्वास कितना है?'
                : 'Before choosing an option: How confident are you?'}
            </span>
            {confidencePromptNudge && !selectedConfidence && (
              <span className="confidence-hint-alert">
                {lang === 'hi' ? 'पहले आत्मविश्वास चुनें 👇' : 'Pick confidence first 👇'}
              </span>
            )}
          </div>
          <div className="confidence-buttons-row" role="radiogroup" aria-label="Confidence Level">
            <button
              type="button"
              className={`confidence-pill ${selectedConfidence === 'sure' ? 'active' : ''}`}
              disabled={isAnswered}
              onClick={() => handleSelectConfidence('sure')}
              aria-pressed={selectedConfidence === 'sure'}
            >
              <span className="conf-emoji">😎</span>
              <span className="conf-text">{lang === 'hi' ? 'पूरा यकीन (Sure)' : 'Sure'}</span>
            </button>

            <button
              type="button"
              className={`confidence-pill ${selectedConfidence === 'maybe' ? 'active' : ''}`}
              disabled={isAnswered}
              onClick={() => handleSelectConfidence('maybe')}
              aria-pressed={selectedConfidence === 'maybe'}
            >
              <span className="conf-emoji">🤔</span>
              <span className="conf-text">{lang === 'hi' ? 'शायद (Maybe)' : 'Maybe'}</span>
            </button>

            <button
              type="button"
              className={`confidence-pill ${selectedConfidence === 'guess' ? 'active' : ''}`}
              disabled={isAnswered}
              onClick={() => handleSelectConfidence('guess')}
              aria-pressed={selectedConfidence === 'guess'}
            >
              <span className="conf-emoji">😕</span>
              <span className="conf-text">{lang === 'hi' ? 'अंदाज़ा (Guess)' : 'Guess'}</span>
            </button>
          </div>
        </div>

        {/* Answer Input or 4 Options Grid */}
        {isInputQuestion ? (
          <div className="solve-typed-input-section">
            <div className="typed-input-row">
              <input
                type="text"
                className={`solve-input solve-input-lg ${!selectedConfidence ? 'locked-for-confidence' : ''}`}
                placeholder={
                  lang === 'hi'
                    ? 'यहाँ अपना उत्तर लिखें (उदा. 4 या 3/4 या x = 4)...'
                    : 'Type your answer (e.g. 4 or 3/4 or x = 4)...'
                }
                value={typedAnswer}
                onChange={(e) => setTypedAnswer(e.target.value)}
                disabled={isAnswered}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCustomSubmit()
                }}
              />
              <button
                type="button"
                className="btn btn-primary btn-submit-typed"
                disabled={isAnswered || !typedAnswer.trim()}
                onClick={handleCustomSubmit}
              >
                {lang === 'hi' ? 'जमा करें ↵' : 'Submit ↵'}
              </button>
            </div>
            {isAnswered && (
              <div
                className={`typed-feedback-banner ${
                  isCorrect ? 'alert-success' : 'alert-wrong'
                }`}
              >
                {isCorrect
                  ? lang === 'hi'
                    ? '✨ बिल्कुल सही उत्तर!'
                    : '✨ Spot on! Exactly correct!'
                  : lang === 'hi'
                    ? `सही उत्तर: ${question.correctAnswer}`
                    : `Correct answer: ${question.correctAnswer}`}
              </div>
            )}
          </div>
        ) : question.options ? (
          <div className={`solve-options-grid ${!selectedConfidence && !isAnswered ? 'waiting-confidence' : ''}`} role="group" aria-label="Answer options">
            {question.options.map((opt, idx) => {
              const isSelected = selectedOption === idx
              const isThisCorrect = idx === question.correctIndex

              let optionClass = 'solve-option-btn'
              if (isAnswered) {
                if (isThisCorrect) {
                  optionClass += ' correct'
                } else if (isSelected) {
                  optionClass += ' wrong'
                } else {
                  optionClass += ' dimmed'
                }
              } else if (!selectedConfidence) {
                optionClass += ' locked-for-confidence'
              }

              const letter = String.fromCharCode(65 + idx)

              return (
                <motion.button
                  key={idx}
                  type="button"
                  className={optionClass}
                  disabled={isAnswered}
                  onClick={() => handleSelectOption(idx)}
                  whileHover={isAnswered ? {} : { scale: 1.015 }}
                  whileTap={isAnswered ? {} : { scale: 0.97 }}
                >
                  <span className="option-badge">{letter}</span>
                  <span className="option-text">{opt[lang]}</span>
                  {isAnswered && isThisCorrect && (
                    <span className="option-status-icon" aria-label="Correct">
                      ✓
                    </span>
                  )}
                  {isAnswered && isSelected && !isThisCorrect && (
                    <span className="option-status-icon" aria-label="Incorrect">
                      ✕
                    </span>
                  )}
                </motion.button>
              )
            })}
          </div>
        ) : null}

        {/* Hint Ladder Section */}
        <div className="solve-hints-section">
          <div className="solve-hints-top">
            <span className="hints-icon">💡</span>
            <span className="hints-title">
              {lang === 'hi' ? 'संकेत सीढ़ी (Hint Ladder)' : 'Hint Ladder'}
            </span>
            {hintsRevealed < 3 && !isAnswered && (
              <button
                type="button"
                className="solve-hint-reveal-btn"
                onClick={handleRevealHint}
              >
                {hintsRevealed === 0
                  ? lang === 'hi' ? 'संकेत चाहिए? (लेवल 1)' : 'Need a hint? (Level 1)'
                  : lang === 'hi'
                    ? `अगला संकेत खोलें (${hintsRevealed + 1}/3)`
                    : `Unlock next hint (${hintsRevealed + 1}/3)`}
              </button>
            )}
          </div>

          {hintsRevealed > 0 && (
            <div className="solve-hints-revealed">
              {question.hints.slice(0, hintsRevealed).map((hint, hIdx) => {
                const hintLabels = [
                  lang === 'hi' ? 'संकेत 1: छोटा इशारा' : 'Hint 1: Gentle Nudge',
                  lang === 'hi' ? 'संकेत 2: मुख्य सूत्र' : 'Hint 2: Key Step',
                  lang === 'hi' ? 'संकेत 3: हल की शुरुआत' : 'Hint 3: Worked Example Start',
                ]
                return (
                  <motion.div
                    key={hIdx}
                    className="solve-hint-item"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <span className="hint-tag">{hintLabels[hIdx]}</span>
                    <p className="hint-body">{hint}</p>
                  </motion.div>
                )
              })}
            </div>
          )}
        </div>

        {/* Feedback & Solution (Revealed on answer) */}
        {isAnswered && (
          <motion.div
            className={`solve-feedback-card ${isCorrect ? 'feedback-correct' : 'feedback-wrong'}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="feedback-banner">
              <div className="feedback-mascot">
                <Mascot size={54} mood={isCorrect ? 'cheer' : 'idle'} />
              </div>
              <div className="feedback-text">
                <div className="feedback-type-badge-row">
                  <span className={`attempt-type-tag type-${activeAttemptType}`}>
                    {activeAttemptType === 'misconception' && '💡 Misconception'}
                    {activeAttemptType === 'confident_correct' && '🎯 Confident & Correct'}
                    {activeAttemptType === 'lucky_guess' && '🍀 Lucky Guess'}
                    {activeAttemptType === 'maybe_correct' && '🌟 Good Instinct'}
                    {activeAttemptType === 'honest_gap' && '🌱 Learning Opportunity'}
                  </span>
                </div>
                <h4 className="feedback-title">
                  {getAttemptTypeMessage(activeAttemptType)[lang]}
                </h4>
                {!isCorrect && (
                  <p className="feedback-mistake-message">
                    {getMistakeMessage(activeMistakeTag)[lang]}
                  </p>
                )}
              </div>
            </div>

            {/* Step-by-step Solution */}
            <div className="feedback-solution">
              <h5>{lang === 'hi' ? 'विस्तृत हल:' : 'Step-by-step Solution:'}</h5>
              <p>{question.solution[lang]}</p>
            </div>

            {/* Next / Finish Button */}
            <div className="feedback-action-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.8rem', flexWrap: 'wrap' }}>
              {onAskAITutor && (
                <button
                  type="button"
                  className="btn btn-secondary ai-tutor-ask-btn"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem' }}
                  onClick={() => {
                    let chosenText = ''
                    if (selectedOption !== null && question.options) {
                      chosenText = question.options[selectedOption]?.[lang] || String(selectedOption)
                    } else if (typedAnswer) {
                      chosenText = typedAnswer
                    }
                    onAskAITutor({
                      questionId: question.id,
                      questionTitle: question.text[lang],
                      studentAnswer: chosenText || undefined,
                      conceptId: question.conceptId,
                    })
                  }}
                >
                  🤖 {lang === 'hi' ? 'एआई ट्यूटर से पूछें' : 'Ask AI Tutor'}
                </button>
              )}
              {onAskTeacher && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem' }}
                  onClick={() => {
                    let chosenText = ''
                    if (selectedOption !== null && question.options) {
                      chosenText = question.options[selectedOption]?.[lang] || String(selectedOption)
                    } else if (typedAnswer) {
                      chosenText = typedAnswer
                    }
                    onAskTeacher({
                      questionId: question.id,
                      questionTitle: question.text[lang],
                      studentAnswer: chosenText || undefined,
                      misconceptionTag: activeMistakeTag || undefined,
                    })
                  }}
                >
                  💬 {lang === 'hi' ? 'शिक्षक से पूछें' : 'Ask Teacher'}
                </button>
              )}
              <motion.button
                type="button"
                className="btn btn-primary btn-lg solve-next-btn"
                onClick={onNext}
                whileTap={{ scale: 0.95 }}
                whileHover={{ scale: 1.02 }}
                autoFocus
              >
                {isLast
                  ? lang === 'hi' ? 'परिणाम देखें 🏁' : 'View Results 🏁'
                  : lang === 'hi' ? 'अगला प्रश्न →' : 'Next Question →'}
              </motion.button>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}
