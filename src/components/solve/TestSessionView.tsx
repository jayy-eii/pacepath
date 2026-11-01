import { useState, useEffect, useRef } from 'react'
import rawConcepts from '../../data/concepts.json'
import { saveAttempt } from '../../services/api'
import { submitAssignment } from '../../services/supabase'
import type {
  Assignment,
  Student,
  Language,
  Question,
  Attempt,
  ConfidenceRating,
  AssignmentSubmission,
  Concept,
} from '../../types'

const allConcepts = rawConcepts as Concept[]
const conceptMap = new Map(allConcepts.map((c) => [c.id, c]))

interface TestSessionViewProps {
  assignment: Assignment
  questions: Question[]
  student: Student
  lang: Language
  onComplete: (submission: AssignmentSubmission) => void
  onExit: () => void
  onAskTeacher?: (context: {
    questionId: string
    questionTitle: string
    studentAnswer?: string
    misconceptionTag?: string
  }) => void
}

export function TestSessionView({
  assignment,
  questions,
  student,
  lang,
  onComplete,
  onExit,
  onAskTeacher,
}: TestSessionViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, { chosenIndex: number; isCorrect: boolean }>>({})
  const [confidenceMap, setConfidenceMap] = useState<Record<string, ConfidenceRating>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submissionResult, setSubmissionResult] = useState<AssignmentSubmission | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Timer countdown
  const hasTimer = Boolean(assignment.timeLimitMinutes && assignment.timeLimitMinutes > 0)
  const initialSeconds = hasTimer ? (assignment.timeLimitMinutes as number) * 60 : null
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(initialSeconds)
  const questionStartTimeRef = useRef<number>(Date.now())

  // Timer tick
  useEffect(() => {
    if (!hasTimer || secondsRemaining === null || submissionResult) return

    if (secondsRemaining <= 0) {
      // Time is up! Auto-submit
      handleFinalSubmit()
      return
    }

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => (prev !== null ? Math.max(0, prev - 1) : null))
    }, 1000)

    return () => clearInterval(timer)
  }, [hasTimer, secondsRemaining, submissionResult])

  const currentQ = questions[currentIndex]
  const currentConcept = currentQ ? conceptMap.get(currentQ.conceptId) : null
  const currentConceptName = currentConcept?.name[lang] || currentQ?.conceptId || ''

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60)
    const secs = totalSeconds % 60
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`
  }

  const handleSelectOption = (optIndex: number) => {
    if (!currentQ || submissionResult) return
    const isCorrect = currentQ.correctIndex === optIndex

    setAnswers((prev) => ({
      ...prev,
      [currentQ.id]: {
        chosenIndex: optIndex,
        isCorrect,
      },
    }))
  }

  const handleNext = async () => {
    if (!currentQ) return

    // Save attempt locally with assignmentId so BKT, Gaps & Misconceptions update!
    const answerInfo = answers[currentQ.id]
    const timeTakenMs = Date.now() - questionStartTimeRef.current

    if (answerInfo) {
      const attemptPayload: Omit<Attempt, 'id'> = {
        studentId: student.id,
        sessionId: `test-${assignment.id}`,
        questionId: currentQ.id,
        conceptId: currentQ.conceptId,
        correct: answerInfo.isCorrect,
        chosenIndex: answerInfo.chosenIndex,
        mistakeTag: answerInfo.isCorrect ? null : (currentQ.wrongTags?.[String(answerInfo.chosenIndex)] || null),
        hintsUsed: 0, // NO hints in test mode
        timeTakenMs,
        confidence: confidenceMap[currentQ.id] || 'sure',
        attemptType: answerInfo.isCorrect ? 'confident_correct' : 'misconception',
        timestamp: Date.now(),
        assignmentId: assignment.id,
      }

      try {
        await saveAttempt(attemptPayload)
      } catch {
        // non-blocking
      }
    }

    questionStartTimeRef.current = Date.now()

    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1)
    } else {
      // Reached the end
      await handleFinalSubmit()
    }
  }

  const handleFinalSubmit = async () => {
    setSubmitting(true)
    setError(null)

    // Format answers for RPC: question_id -> chosen index / correctness
    const answersPayload: Record<string, any> = {}
    for (const [qid, ans] of Object.entries(answers)) {
      answersPayload[qid] = {
        chosenIndex: ans.chosenIndex,
        correct: ans.isCorrect,
      }
    }

    try {
      const clientSubmittedAt = Date.now()
      const sub = await submitAssignment({
        assignmentId: assignment.id,
        studentId: student.id,
        classCode: assignment.classCode,
        answers: answersPayload,
        submittedAt: clientSubmittedAt,
      })

      setSubmissionResult(sub)
      onComplete(sub)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit test')
    } finally {
      setSubmitting(false)
    }
  }

  // Result Screen after submission
  if (submissionResult) {
    const isLate = submissionResult.isLate
    const now = Date.now()
    const isSolutionsUnlocked =
      assignment.showAnswersAfter === 'submit' ||
      (assignment.showAnswersAfter === 'due' && Boolean(assignment.dueDate && now > assignment.dueDate))

    const isAnswersHidden = assignment.showAnswersAfter === 'never'
    const isAnswersLockedUntilDue =
      assignment.showAnswersAfter === 'due' && Boolean(assignment.dueDate && now <= assignment.dueDate)

    return (
      <div className="test-results-container">
        <div className="test-results-header">
          <span className="results-badge-congrats">🎉 {lang === 'hi' ? 'टेस्ट समाप्त!' : 'Test Completed!'}</span>
          <h2>{assignment.title}</h2>
          <p className="results-subtitle">
            {lang === 'hi'
              ? 'आपके उत्तर सफलतापूर्वक शिक्षक को भेज दिए गए हैं।'
              : 'Your responses have been recorded and synced with your teacher.'}
          </p>
        </div>

        <div className="test-score-banner">
          <div className="score-circle-large">
            <span className="score-big-num">{submissionResult.score}%</span>
            <span className="score-sub-label">{lang === 'hi' ? 'कुल अंक' : 'Score'}</span>
          </div>

          <div className="score-details-list">
            <div className="score-detail-row">
              <span>{lang === 'hi' ? 'कक्षा कोड:' : 'Class Code:'}</span>
              <strong>{assignment.classCode}</strong>
            </div>
            <div className="score-detail-row">
              <span>{lang === 'hi' ? 'कुल प्रश्न:' : 'Total Questions:'}</span>
              <strong>{questions.length}</strong>
            </div>
            <div className="score-detail-row">
              <span>{lang === 'hi' ? 'स्थिति:' : 'Status:'}</span>
              {isLate ? (
                <span className="badge-late-submission">⚠️ {lang === 'hi' ? 'विलंबित (LATE)' : 'Late Submission'}</span>
              ) : (
                <span className="badge-ontime-submission">✓ {lang === 'hi' ? 'समय पर (On Time)' : 'On Time'}</span>
              )}
            </div>
            <div className="score-detail-row">
              <span>{lang === 'hi' ? 'जमा करने का समय:' : 'Submitted At:'}</span>
              <strong>{new Date(submissionResult.submittedAt).toLocaleTimeString()}</strong>
            </div>
          </div>
        </div>

        {/* Answer policy banner */}
        {isAnswersHidden && (
          <div
            style={{
              margin: '1.2rem 0',
              padding: '0.9rem 1.2rem',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              textAlign: 'center',
              color: 'var(--text-2)',
            }}
          >
            🔒 {lang === 'hi'
              ? 'उत्तर केवल शिक्षक समीक्षा के लिए सुरक्षित रखे गए हैं।'
              : 'Answers and solutions are kept private by your teacher.'}
          </div>
        )}

        {isAnswersLockedUntilDue && (
          <div
            style={{
              margin: '1.2rem 0',
              padding: '0.9rem 1.2rem',
              background: 'rgba(255, 200, 98, 0.12)',
              border: '1px solid #ffc862',
              borderRadius: '8px',
              textAlign: 'center',
              color: '#ffc862',
            }}
          >
            ⏳ {lang === 'hi'
              ? `सही उत्तर एवं समाधान अंतिम तिथि (${new Date(assignment.dueDate!).toLocaleString()}) के बाद अनलॉक होंगे।`
              : `Solutions will automatically unlock after the assignment due date: ${new Date(assignment.dueDate!).toLocaleString()}.`}
          </div>
        )}

        {/* Question Review List */}
        <div className="test-review-questions-list" style={{ marginTop: '1.5rem', textAlign: 'left' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.8rem' }}>
            {lang === 'hi' ? 'प्रश्नों की समीक्षा' : 'Question Breakdown & Review'}
          </h3>
          {questions.map((q, idx) => {
            const studentAns = answers[q.id]
            const isCorrect = studentAns?.isCorrect
            const chosenIndex = studentAns?.chosenIndex
            const chosenOption = chosenIndex !== undefined && q.options ? q.options[chosenIndex] : null
            const chosenText = chosenOption
              ? chosenOption[lang]
              : chosenIndex !== undefined
                ? `Option ${chosenIndex + 1}`
                : 'Unanswered'
            const correctOption =
              q.options && q.correctIndex !== undefined ? q.options[q.correctIndex] : null
            const correctText = correctOption
              ? correctOption[lang]
              : q.correctIndex !== undefined
                ? `Option ${q.correctIndex + 1}`
                : 'N/A'

            return (
              <div
                key={q.id}
                className="test-review-item-card"
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: `1px solid ${isCorrect ? 'rgba(76, 201, 176, 0.3)' : 'rgba(255, 84, 112, 0.3)'}`,
                  borderRadius: '8px',
                  padding: '1rem',
                  marginBottom: '0.8rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <strong style={{ fontSize: '0.95rem' }}>
                    {idx + 1}. {q.text[lang]}
                  </strong>
                  <span
                    style={{
                      fontSize: '0.8rem',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      background: isCorrect ? 'rgba(76, 201, 176, 0.2)' : 'rgba(255, 84, 112, 0.2)',
                      color: isCorrect ? '#4cc9b0' : '#ff5470',
                      fontWeight: 700,
                    }}
                  >
                    {isCorrect ? '✓ Correct' : '✗ Incorrect'}
                  </span>
                </div>

                <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                  <div>
                    <span style={{ color: 'var(--text-2)' }}>
                      {lang === 'hi' ? 'आपका उत्तर: ' : 'Your answer: '}
                    </span>
                    <strong style={{ color: isCorrect ? '#4cc9b0' : '#ff5470' }}>{chosenText}</strong>
                  </div>

                  {isSolutionsUnlocked && (
                    <div style={{ marginTop: '0.3rem', color: 'var(--text-1)' }}>
                      <div>
                        <span style={{ color: 'var(--text-2)' }}>
                          {lang === 'hi' ? 'सही उत्तर: ' : 'Correct answer: '}
                        </span>
                        <strong style={{ color: '#4cc9b0' }}>{correctText}</strong>
                      </div>
                      {q.solution && (
                        <div
                          style={{
                            marginTop: '0.4rem',
                            padding: '0.5rem',
                            background: 'rgba(0,0,0,0.2)',
                            borderRadius: '4px',
                            color: 'var(--text-2)',
                          }}
                        >
                          <em>{q.solution[lang]}</em>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {onAskTeacher && (
                  <div style={{ marginTop: '0.6rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        const tag =
                          (chosenOption as any)?.mistakeTag ||
                          (chosenIndex !== undefined && q.wrongTags ? q.wrongTags[String(chosenIndex)] : undefined)
                        onAskTeacher({
                          questionId: q.id,
                          questionTitle: q.text[lang],
                          studentAnswer: chosenText,
                          misconceptionTag: tag,
                        })
                      }}
                    >
                      💬 {lang === 'hi' ? 'शिक्षक से पूछें' : 'Ask Teacher'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="test-results-actions" style={{ marginTop: '1.5rem' }}>
          <button type="button" className="btn btn-primary btn-lg" onClick={onExit}>
            {lang === 'hi' ? 'होम स्क्रीन पर लौटें →' : 'Return to Home Screen →'}
          </button>
        </div>
      </div>
    )
  }

  if (!currentQ) return null

  const isLastQuestion = currentIndex === questions.length - 1
  const selectedAnswer = answers[currentQ.id]
  const isTimeWarning = secondsRemaining !== null && secondsRemaining < 120

  return (
    <div className="test-mode-session">
      {/* Test Mode Top Bar */}
      <div className="test-mode-topbar">
        <div className="test-title-group">
          <span className="test-mode-badge">📝 {lang === 'hi' ? 'टेस्ट मोड (No Hints)' : 'TEST MODE'}</span>
          <span className="test-assignment-name">{assignment.title}</span>
        </div>

        <div className="test-top-actions">
          {hasTimer && secondsRemaining !== null && (
            <div className={`test-countdown-chip ${isTimeWarning ? 'timer-warning' : ''}`}>
              ⏱️ {formatTimer(secondsRemaining)}
            </div>
          )}
          <span className="test-q-counter">
            {lang === 'hi' ? `प्रश्न ${currentIndex + 1} / ${questions.length}` : `Question ${currentIndex + 1} of ${questions.length}`}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="test-progress-track">
        <div
          className="test-progress-fill"
          style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
        />
      </div>

      {error && (
        <div className="teacher-auth-error-banner" style={{ margin: '1rem' }}>
          <span>⚠️ {error}</span>
        </div>
      )}

      {/* Question Card (No Hints Ladder) */}
      <div className="test-question-box">
        <div className="test-question-meta">
          <span className="test-concept-chip">{currentConceptName}</span>
          <span className="test-grade-chip">Class {currentQ.grade}</span>
        </div>

        <h3 className="test-question-prompt">
          {currentQ.text[lang] || currentQ.text.en}
        </h3>

        {/* Options */}
        <div className="test-options-grid">
          {(currentQ.options || []).map((opt, i) => {
            const isChosen = selectedAnswer?.chosenIndex === i
            return (
              <button
                key={i}
                type="button"
                className={`test-option-btn ${isChosen ? 'option-chosen' : ''}`}
                onClick={() => handleSelectOption(i)}
              >
                <span className="opt-marker">{String.fromCharCode(65 + i)}</span>
                <span className="opt-text">{opt[lang] || opt.en}</span>
              </button>
            )
          })}
        </div>

        {/* Confidence Check */}
        <div className="test-confidence-row">
          <span className="conf-label">
            {lang === 'hi' ? 'आपका आत्मविश्वास:' : 'Your confidence:'}
          </span>
          {(['sure', 'maybe', 'guess'] as ConfidenceRating[]).map((c) => (
            <button
              key={c}
              type="button"
              className={`test-conf-btn ${(confidenceMap[currentQ.id] || 'sure') === c ? 'conf-active' : ''}`}
              onClick={() => setConfidenceMap((prev) => ({ ...prev, [currentQ.id]: c }))}
            >
              {c === 'sure' && '🎯 Sure'}
              {c === 'maybe' && '🤔 Maybe'}
              {c === 'guess' && '🎲 Guess'}
            </button>
          ))}
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="test-mode-footer">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex((prev) => prev - 1)}
        >
          ← {lang === 'hi' ? 'पिछला' : 'Previous'}
        </button>

        <button
          type="button"
          className={`btn ${isLastQuestion ? 'btn-primary btn-submit-test' : 'btn-primary'}`}
          disabled={submitting || selectedAnswer === undefined}
          onClick={handleNext}
        >
          {submitting
            ? 'Submitting...'
            : isLastQuestion
              ? lang === 'hi'
                ? 'टेस्ट जमा करें 🚀'
                : 'Submit Test 🚀'
              : lang === 'hi'
                ? 'अगला प्रश्न →'
                : 'Next Question →'}
        </button>
      </div>
    </div>
  )
}
