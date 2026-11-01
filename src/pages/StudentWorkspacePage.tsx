import { useState, useEffect, useCallback, useMemo } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import type {
  Student,
  SessionSummary,
  Language,
  MistakeTag,
  ConfidenceRating,
  AttemptType,
  SelectionResult,
  ConceptMasteryMap,
  Attempt,
  GapReport,
  Question,
  Concept,
  MisconceptionEvent,
  CandidateMisconception,
  DetectionResult,
  StudentAssignmentOverview,
  Assignment,
  Doubt,
  Announcement,
} from '../types'
import {
  getCurrentStudent,
  startSession,
  endSession,
  saveAttempt,
  getAttemptsBySession,
  getAttemptsByStudent,
  getSessionSummary,
  checkAndResolveGaps,
  saveMisconceptionEvent,
  getMisconceptionEventsByStudent,
} from '../services/api'
import { selectNextQuestion } from '../engine/selector'
import { computeAllMastery } from '../engine/mastery'
import { isGapTraceTriggered } from '../engine/gapTrace'
import { computeProfile } from '../engine/misconceptionProfile'
import { getQuestionById } from '../services/questionSelector'
import { setLastSelectorDecision } from '../services/selectorState'
import { StudentAuthModal } from '../components/solve/StudentAuthModal'
import { QuestionCard } from '../components/solve/QuestionCard'
import { ResultView } from '../components/solve/ResultView'
import { DetectiveModal } from '../components/solve/DetectiveModal'
import { MisconceptionDetectiveModal } from '../components/solve/MisconceptionDetectiveModal'
import { TestSessionView } from '../components/solve/TestSessionView'
import { AskTeacherModal } from '../components/solve/AskTeacherModal'
import { AiTutorChat } from '../components/solve/AiTutorChat'
import { getStudentSession, switchRoleOrLogout } from '../services/roleSession'
import {
  getClassInfo,
  getStudentAssignments,
  getMyDoubts,
  addDoubtMessage,
  getAnnouncements,
} from '../services/supabase'
import { SyncStatusChip } from '../components/SyncStatusChip'
import { Mascot } from '../components/Mascot'
import rawConcepts from '../data/concepts.json'
import rawQuestions from '../data/questions.json'

const concepts = rawConcepts as Concept[]
const conceptMap = new Map(concepts.map((c) => [c.id, c]))
const allBankQuestions = rawQuestions as unknown as Question[]
const bankMap = new Map(allBankQuestions.map((q) => [q.id, q]))

const SESSION_STORAGE_KEY = 'pacepath_active_session_state'
const SESSION_TARGET_QUESTIONS = 10

interface ActiveSessionState {
  sessionId: string
  studentId: string
  questionIds: string[]
  currentIndex: number
}

interface StudentWorkspacePageProps {
  lang: Language
  onToggleLang: () => void
  theme?: 'dark' | 'light'
  toggleTheme?: () => void
}

type SolveStep = 'loading' | 'onboarding' | 'ready' | 'practice' | 'result' | 'test'

export function StudentWorkspacePage({ lang, onToggleLang }: StudentWorkspacePageProps) {
  const navigate = useNavigate()
  const location = useLocation()

  // Determine current active subroute
  const pathname = location.pathname
  const currentSubpage = useMemo(() => {
    if (pathname.includes('/practice')) return 'practice'
    if (pathname.includes('/tests')) return 'tests'
    if (pathname.includes('/doubts')) return 'doubts'
    if (pathname.includes('/gaps')) return 'gaps'
    if (pathname.includes('/tutor')) return 'tutor'
    return 'home'
  }, [pathname])

  const [aiTutorContext, setAiTutorContext] = useState<{
    questionId?: string
    questionTitle?: string
    studentAnswer?: string
    conceptId?: string
  } | null>(null)

  const [step, setStep] = useState<SolveStep>('loading')
  const [student, setStudent] = useState<Student | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [studentAttempts, setStudentAttempts] = useState<Attempt[]>([])
  const [studentMisconceptionEvents, setStudentMisconceptionEvents] = useState<MisconceptionEvent[]>([])
  const [sessionQuestionIds, setSessionQuestionIds] = useState<string[]>([])
  const [currentSelection, setCurrentSelection] = useState<SelectionResult | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [summary, setSummary] = useState<SessionSummary | null>(null)
  const [studentMastery, setStudentMastery] = useState<ConceptMasteryMap>({})
  const [studentGapReports, setStudentGapReports] = useState<GapReport[]>([])
  const [classMeta, setClassMeta] = useState<{ name: string; teacherName: string } | null>(null)

  // Part C: Doubts & Announcements State
  const [myDoubts, setMyDoubts] = useState<Doubt[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [selectedDoubtId, setSelectedDoubtId] = useState<string | null>(null)
  const [studentReplyText, setStudentReplyText] = useState('')
  const [isSendingReply, setIsSendingReply] = useState(false)
  const [replyError, setReplyError] = useState<string | null>(null)
  const [isAskTeacherModalOpen, setIsAskTeacherModalOpen] = useState(false)
  const [askTeacherContext, setAskTeacherContext] = useState<{
    questionId?: string | null
    questionTitle?: string | null
    studentAnswer?: string | null
    misconceptionTag?: string | null
  } | null>(null)

  // Part B: Student Assigned Tests
  const [studentAssignments, setStudentAssignments] = useState<StudentAssignmentOverview[]>([])
  const [activeTestAssignment, setActiveTestAssignment] = useState<Assignment | null>(null)
  const [activeTestQuestions, setActiveTestQuestions] = useState<Question[]>([])
  const [triggeredConceptsThisSession, setTriggeredConceptsThisSession] = useState<Set<string>>(new Set())
  const [detectiveState, setDetectiveState] = useState<{
    isOpen: boolean
    triggerQuestion: Question | null
    triggerAttempt: Attempt | null
  }>({
    isOpen: false,
    triggerQuestion: null,
    triggerAttempt: null,
  })
  const [miscDetectiveState, setMiscDetectiveState] = useState<{
    isOpen: boolean
    question: Question | null
    studentAnswer: string | number
    candidate: CandidateMisconception | null
    eventId?: string
  }>({
    isOpen: false,
    question: null,
    studentAnswer: '',
    candidate: null,
  })

  // Unread badge indicator for Doubts
  const hasUnreadDoubts = useMemo(() => {
    const hasUnreadMessages = myDoubts.some((d) => {
      const lastMsg = d.messages[d.messages.length - 1]
      return lastMsg && lastMsg.senderType === 'teacher'
    })
    return hasUnreadMessages || announcements.length > 0
  }, [myDoubts, announcements])

  // Initialize or restore session
  const initialize = useCallback(async () => {
    setStep('loading')
    const currentStudent = await getCurrentStudent()
    setStudent(currentStudent)

    if (!currentStudent) {
      setClassMeta(null)
      setStep('onboarding')
      return
    }

    if (currentStudent.classCode) {
      const sSession = getStudentSession()
      if (sSession?.className && sSession?.teacherName) {
        setClassMeta({ name: sSession.className, teacherName: sSession.teacherName })
      } else {
        getClassInfo(currentStudent.classCode)
          .then((info) => {
            if (info) setClassMeta({ name: info.name, teacherName: info.teacherName })
          })
          .catch(() => {})
      }

      getStudentAssignments(currentStudent.classCode, currentStudent.id)
        .then(setStudentAssignments)
        .catch(() => {})

      getMyDoubts(currentStudent.classCode, currentStudent.id)
        .then(setMyDoubts)
        .catch(() => {})

      getAnnouncements(currentStudent.classCode, currentStudent.id)
        .then(setAnnouncements)
        .catch(() => {})
    } else {
      setClassMeta(null)
      setStudentAssignments([])
      setMyDoubts([])
      setAnnouncements([])
    }

    const allAttempts = await getAttemptsByStudent(currentStudent.id)
    setStudentAttempts(allAttempts)
    const mastery = computeAllMastery(allAttempts)
    setStudentMastery(mastery)

    const gaps = await checkAndResolveGaps(currentStudent.id)
    setStudentGapReports(gaps)

    const miscEvents = await getMisconceptionEventsByStudent(currentStudent.id)
    setStudentMisconceptionEvents(miscEvents)

    // Compute profile for analysis
    computeProfile(miscEvents, allAttempts)

    // Check for an active session that can be resumed
    const savedStateStr = localStorage.getItem(SESSION_STORAGE_KEY)
    if (savedStateStr) {
      try {
        const savedState: ActiveSessionState = JSON.parse(savedStateStr)
        if (savedState.studentId === currentStudent.id && savedState.sessionId) {
          const sessionAttempts = await getAttemptsBySession(savedState.sessionId)
          const answeredIds = new Set(sessionAttempts.map((a) => a.questionId))

          if (savedState.questionIds.length > 0) {
            const unansweredId = savedState.questionIds.find((id) => !answeredIds.has(id))
            const targetQuestion = unansweredId ? getQuestionById(unansweredId) : null

            if (targetQuestion && sessionAttempts.length < SESSION_TARGET_QUESTIONS) {
              setSessionId(savedState.sessionId)
              setSessionQuestionIds(savedState.questionIds)
              setCurrentIndex(sessionAttempts.length)

              const resumedSelection: SelectionResult = {
                question: targetQuestion,
                conceptId: targetQuestion.conceptId,
                targetDifficulty: targetQuestion.difficulty,
                selectionStrategy: 'diagnostic',
                reason: {
                  en: 'Resuming your active practice session.',
                  hi: 'सक्रिय अभ्यास सत्र पुनः प्रारंभ किया गया।',
                },
                detailExplanation: {
                  en: 'Your previously saved attempts are preserved in IndexedDB.',
                  hi: 'आपके पिछले प्रयास सुरक्षित हैं।',
                },
              }
              setCurrentSelection(resumedSelection)
              setLastSelectorDecision(resumedSelection)
              setStep('practice')
              return
            }
          }
        }
      } catch {
        localStorage.removeItem(SESSION_STORAGE_KEY)
      }
    }

    // Default step based on current route
    setStep('ready')
  }, [])

  useEffect(() => {
    initialize()
  }, [initialize])

  const handleStartPractice = async () => {
    if (!student) return
    const newSessionId = await startSession(student.id)
    setSessionId(newSessionId)
    setCurrentIndex(0)
    setSummary(null)
    setTriggeredConceptsThisSession(new Set())

    const recentAttempts = await getAttemptsByStudent(student.id)
    const selection = selectNextQuestion({
      studentGrade: student.grade,
      allAttempts: recentAttempts,
      sessionAttemptedQuestionIds: [],
    })
    setCurrentSelection(selection)
    setLastSelectorDecision(selection)
    setSessionQuestionIds([selection.question.id])

    const savedState: ActiveSessionState = {
      sessionId: newSessionId,
      studentId: student.id,
      questionIds: [selection.question.id],
      currentIndex: 0,
    }
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(savedState))
    setStep('practice')
    navigate('/student/practice')
  }

  const handleAnswerSaved = async (attemptData: {
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
  }) => {
    if (!student || !sessionId || !currentSelection) return

    const newAttempt: Attempt = {
      id: crypto.randomUUID(),
      studentId: student.id,
      questionId: attemptData.questionId,
      conceptId: attemptData.conceptId,
      sessionId,
      correct: attemptData.correct,
      chosenIndex: attemptData.chosenIndex,
      hintsUsed: attemptData.hintsUsed,
      timeTakenMs: attemptData.timeTakenMs,
      confidence: attemptData.confidence,
      attemptType: attemptData.attemptType,
      mistakeTag: attemptData.mistakeTag,
      userAnswer: attemptData.studentAnswer ? String(attemptData.studentAnswer) : null,
      timestamp: Date.now(),
    }

    await saveAttempt(newAttempt)
    const updatedAttempts = [...studentAttempts, newAttempt]
    setStudentAttempts(updatedAttempts)
    setStudentMastery(computeAllMastery(updatedAttempts))

    const isCorrect = attemptData.correct
    const detectionResult = attemptData.detectionResult

    if (!isCorrect && detectionResult && detectionResult.status === 'matched') {
      const topCandidate = detectionResult.candidates[0]
      if (topCandidate) {
        const newEvent: MisconceptionEvent = {
          id: crypto.randomUUID(),
          studentId: student.id,
          questionId: currentSelection.question.id,
          attemptId: newAttempt.id,
          misconceptionId: topCandidate.misconceptionId,
          source: 'rule',
          confidence: topCandidate.confidence,
          divergenceStep: topCandidate.divergenceStep,
          studentConfirmed: null,
          createdAt: Date.now(),
        }
        await saveMisconceptionEvent(newEvent)
        setStudentMisconceptionEvents((prev) => [...prev, newEvent])

        setMiscDetectiveState({
          isOpen: true,
          question: currentSelection.question,
          studentAnswer: attemptData.studentAnswer || '',
          candidate: topCandidate,
          eventId: newEvent.id,
        })
      }
    }

    if (!isCorrect && !triggeredConceptsThisSession.has(currentSelection.conceptId)) {
      const trigger = isGapTraceTriggered({
        attempt: newAttempt,
        question: currentSelection.question,
        sessionAttempts: updatedAttempts,
        allStudentAttempts: updatedAttempts,
        triggeredConceptsThisSession,
      })
      if (trigger.triggered) {
        setTriggeredConceptsThisSession((prev) => new Set(prev).add(currentSelection.conceptId))
        setDetectiveState({
          isOpen: true,
          triggerQuestion: currentSelection.question,
          triggerAttempt: newAttempt,
        })
      }
    }
  }

  const handleNextQuestion = async () => {
    if (!student || !sessionId) return
    const nextIdx = currentIndex + 1

    if (nextIdx >= SESSION_TARGET_QUESTIONS) {
      await endSession(sessionId)
      localStorage.removeItem(SESSION_STORAGE_KEY)
      const sessionSummary = await getSessionSummary(sessionId)
      setSummary(sessionSummary)
      setStep('result')
      return
    }

    setCurrentIndex(nextIdx)
    const recentAttempts = await getAttemptsByStudent(student.id)
    const updatedQuestionIds = [...sessionQuestionIds]
    const selection = selectNextQuestion({
      studentGrade: student.grade,
      allAttempts: recentAttempts,
      sessionAttemptedQuestionIds: updatedQuestionIds,
    })
    setCurrentSelection(selection)
    setLastSelectorDecision(selection)

    updatedQuestionIds.push(selection.question.id)
    setSessionQuestionIds(updatedQuestionIds)

    const savedState: ActiveSessionState = {
      sessionId,
      studentId: student.id,
      questionIds: updatedQuestionIds,
      currentIndex: nextIdx,
    }
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(savedState))
  }

  const handleDetectiveComplete = async (updatedAttempts: Attempt[]) => {
    setDetectiveState({ isOpen: false, triggerQuestion: null, triggerAttempt: null })
    if (student) {
      setStudentAttempts(updatedAttempts)
      setStudentMastery(computeAllMastery(updatedAttempts))
      const gaps = await checkAndResolveGaps(student.id)
      setStudentGapReports(gaps)
    }
  }

  const handleStudentReply = async () => {
    if (!student || !student.classCode || !selectedDoubtId || !studentReplyText.trim()) return
    setIsSendingReply(true)
    setReplyError(null)
    try {
      const newMsg = await addDoubtMessage({
        doubtId: selectedDoubtId,
        studentId: student.id,
        content: studentReplyText.trim(),
      })
      setMyDoubts((prev) =>
        prev.map((d) =>
          d.id === selectedDoubtId ? { ...d, messages: [...d.messages, newMsg] } : d,
        ),
      )
      setStudentReplyText('')
    } catch (err: any) {
      setReplyError(err.message || 'Failed to send reply')
    } finally {
      setIsSendingReply(false)
    }
  }

  const handleSwitchUser = () => {
    switchRoleOrLogout()
    navigate('/')
  }

  const currentQ = currentSelection?.question
  const currentConceptName = currentQ ? conceptMap.get(currentQ.conceptId)?.name[lang] || currentQ.conceptId : 'Mathematics'

  return (
    <div className="student-workspace-shell">
      {/* Workspace Top Bar */}
      <header className="workspace-header">
        <div className="workspace-header-left">
          <Link to="/" className="workspace-back-btn" title="Back to PacePath Home">
            <span aria-hidden="true">←</span>
            <span className="back-text">Home</span>
          </Link>
          <div className="workspace-brand">
            <Mascot size={28} mood="idle" />
            <span className="workspace-title">PacePath Student</span>
          </div>
        </div>

        {student && (
          <div className="workspace-student-badge">
            <span className="student-avatar-chip">{student.avatar}</span>
            <div className="student-info-col">
              <span className="student-name">{student.name}</span>
              <span className="student-class-tag">
                {classMeta ? `${classMeta.name} • Class ${student.grade}` : `Class ${student.grade}`}
              </span>
            </div>
          </div>
        )}

        <div className="workspace-header-right">
          <button
            type="button"
            className="chip chip--compact chip--lang"
            onClick={onToggleLang}
            title={lang === 'hi' ? 'Switch to English' : 'हिंदी में बदलें'}
          >
            <span>{lang === 'hi' ? '🇮🇳 हि' : '🇬🇧 EN'}</span>
          </button>
          <SyncStatusChip />
          <button
            type="button"
            className="workspace-logout-btn"
            onClick={handleSwitchUser}
            title="Switch student profile or role"
          >
            {lang === 'hi' ? 'बदलें' : 'Switch'}
          </button>
        </div>
      </header>

      {/* Workspace Navigation Tabs (Desktop / Tablet) */}
      <nav className="student-desktop-tabs" aria-label="Student Navigation">
        <button
          type="button"
          className={`tab-btn ${currentSubpage === 'home' ? 'active' : ''}`}
          onClick={() => navigate('/student')}
        >
          <span>🏠</span>
          <span>{lang === 'hi' ? 'डैशबोर्ड' : 'Dashboard'}</span>
        </button>
        <button
          type="button"
          className={`tab-btn ${currentSubpage === 'practice' ? 'active' : ''}`}
          onClick={() => {
            if (step !== 'practice') handleStartPractice()
            else navigate('/student/practice')
          }}
        >
          <span>⚡</span>
          <span>{lang === 'hi' ? 'अभ्यास' : 'Practice'}</span>
        </button>
        <button
          type="button"
          className={`tab-btn ${currentSubpage === 'tests' ? 'active' : ''}`}
          onClick={() => navigate('/student/tests')}
        >
          <span>📝</span>
          <span>{lang === 'hi' ? 'कक्षा टेस्ट' : 'Assigned Tests'}</span>
          {studentAssignments.length > 0 && (
            <span className="tab-count-badge">{studentAssignments.length}</span>
          )}
        </button>
        <button
          type="button"
          className={`tab-btn ${currentSubpage === 'doubts' ? 'active' : ''}`}
          onClick={() => navigate('/student/doubts')}
        >
          <span>💬</span>
          <span>{lang === 'hi' ? 'शंकाएं' : 'Doubts'}</span>
          {hasUnreadDoubts && <span className="tab-unread-dot" />}
        </button>
        <button
          type="button"
          className={`tab-btn ${currentSubpage === 'tutor' ? 'active' : ''}`}
          onClick={() => navigate('/student/tutor')}
        >
          <span>🤖</span>
          <span>{lang === 'hi' ? 'एआई ट्यूटर' : 'AI Tutor'}</span>
        </button>
        <button
          type="button"
          className={`tab-btn ${currentSubpage === 'gaps' ? 'active' : ''}`}
          onClick={() => navigate('/student/gaps')}
        >
          <span>🧠</span>
          <span>{lang === 'hi' ? 'गैप डिटेक्टिव' : 'Gap Detective'}</span>
        </button>
      </nav>

      {/* Main Workspace Body */}
      <main className="student-workspace-main container">
        <AnimatePresence mode="wait">
          {step === 'loading' && (
            <div className="scene-skeleton workspace-skeleton" key="loading">
              <div className="shimmer shimmer-line" />
              <div className="shimmer shimmer-block" />
            </div>
          )}

          {step === 'onboarding' && (
            <div className="onboarding-page-container" key="onboarding">
              <StudentAuthModal
                lang={lang}
                onAuthenticated={(st) => {
                  setStudent(st)
                  initialize()
                }}
                onSoloPractice={() => {
                  initialize()
                }}
                onClose={() => navigate('/')}
              />
            </div>
          )}

          {/* Subpage: Practice Mode */}
          {currentSubpage === 'practice' && step === 'practice' && currentQ && (
            <div className="practice-subpage-wrapper" key="practice-q">
              <QuestionCard
                key={currentQ.id}
                question={currentQ}
                questionNumber={currentIndex + 1}
                totalQuestions={SESSION_TARGET_QUESTIONS}
                lang={lang}
                conceptName={currentConceptName}
                selectionResult={currentSelection || undefined}
                studentHistory={studentMisconceptionEvents}
                onAnswerSaved={handleAnswerSaved}
                onAskTeacher={(ctx) => {
                  if (student?.classCode) {
                    setAskTeacherContext(ctx)
                    setIsAskTeacherModalOpen(true)
                  }
                }}
                onAskAITutor={(ctx) => {
                  setAiTutorContext(ctx)
                  navigate('/student/tutor')
                }}
                onNext={handleNextQuestion}
                isLast={currentIndex + 1 === SESSION_TARGET_QUESTIONS}
              />
            </div>
          )}

          {/* Subpage: Result Mode */}
          {step === 'result' && summary && (
            <div className="result-subpage-wrapper" key="result-view">
              <ResultView
                key="result"
                summary={summary}
                student={student}
                lang={lang}
                onRestart={handleStartPractice}
                onClose={() => navigate('/student')}
                onAskTeacher={(ctx) => {
                  if (student?.classCode) {
                    setAskTeacherContext(ctx)
                    setIsAskTeacherModalOpen(true)
                  }
                }}
                onAskAITutor={(ctx) => {
                  setAiTutorContext(ctx)
                  navigate('/student/tutor')
                }}
              />
            </div>
          )}

          {/* Subpage: Active Test Session */}
          {step === 'test' && activeTestAssignment && student && (
            <div className="test-subpage-wrapper" key="test-session">
              <TestSessionView
                key={activeTestAssignment.id}
                assignment={activeTestAssignment}
                questions={activeTestQuestions}
                student={student}
                lang={lang}
                onAskTeacher={(ctx) => {
                  if (student?.classCode) {
                    setAskTeacherContext(ctx)
                    setIsAskTeacherModalOpen(true)
                  }
                }}
                onComplete={async () => {
                  if (student.classCode) {
                    const list = await getStudentAssignments(student.classCode, student.id)
                    setStudentAssignments(list)
                  }
                  const allAttempts = await getAttemptsByStudent(student.id)
                  setStudentAttempts(allAttempts)
                  setStudentMastery(computeAllMastery(allAttempts))
                  const gaps = await checkAndResolveGaps(student.id)
                  setStudentGapReports(gaps)
                  const miscEvents = await getMisconceptionEventsByStudent(student.id)
                  setStudentMisconceptionEvents(miscEvents)
                  setActiveTestAssignment(null)
                  navigate('/student/tests')
                }}
                onExit={() => {
                  setActiveTestAssignment(null)
                  navigate('/student/tests')
                }}
              />
            </div>
          )}

          {/* Subpage: Tests Overview */}
          {currentSubpage === 'tests' && step !== 'test' && (
            <div className="student-tests-view" key="tests-overview">
              <div className="section-title-row">
                <h2>{lang === 'hi' ? 'कक्षा टेस्ट एवं असाइनमेंट' : 'Assigned Tests'}</h2>
                <span className="notice-chip">
                  {lang === 'hi' ? 'ऑफ़लाइन समर्थित • स्वतः सबमिशन' : 'Offline Capable • Auto Sync'}
                </span>
              </div>

              {studentAssignments.length === 0 ? (
                <div className="empty-tests-state">
                  <Mascot size={72} mood="idle" />
                  <h3>{lang === 'hi' ? 'कोई सक्रिय टेस्ट नहीं है' : 'No tests assigned yet'}</h3>
                  <p>
                    {lang === 'hi'
                      ? 'जब आपके शिक्षक कोई टेस्ट असाइन करेंगे, वह यहाँ दिखाई देगा।'
                      : 'When your teacher assigns a timed diagnostic test, it will appear here.'}
                  </p>
                </div>
              ) : (
                <div className="tests-cards-grid">
                  {studentAssignments.map((item) => {
                    const isCompleted = Boolean(item.submission)
                    const isClosed = Boolean(item.assignment.isClosed)
                    return (
                      <div key={item.assignment.id} className="assignment-student-card">
                        <div className="card-top-row">
                          <span className="assignment-title">{item.assignment.title}</span>
                          <span
                            className={`status-pill ${
                              isCompleted
                                ? 'pill-completed'
                                : isClosed
                                ? 'pill-closed'
                                : 'pill-active'
                            }`}
                          >
                            {isCompleted
                              ? lang === 'hi' ? '✓ पूर्ण' : '✓ Completed'
                              : isClosed
                              ? lang === 'hi' ? 'बंद' : 'Closed'
                              : lang === 'hi' ? 'सक्रिय' : 'Active'}
                          </span>
                        </div>
                        <div className="assignment-meta-row">
                          <span>⏱️ {item.assignment.timeLimitMinutes ? `${item.assignment.timeLimitMinutes} min` : 'No limit'}</span>
                          <span>❓ {item.assignment.questionIds.length} questions</span>
                          {item.submission && (
                            <span className="submission-score">
                              Score: {item.submission.score}%
                            </span>
                          )}
                        </div>
                        {!isCompleted && !isClosed && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => {
                              const qList = item.assignment.questionIds
                                .map((id) => bankMap.get(id))
                                .filter((q): q is Question => Boolean(q))
                              setActiveTestAssignment(item.assignment)
                              setActiveTestQuestions(qList)
                              setStep('test')
                            }}
                          >
                            {lang === 'hi' ? 'टेस्ट शुरू करें 🎯' : 'Start Test 🎯'}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Subpage: Doubts Inbox & Thread */}
          {currentSubpage === 'doubts' && (
            <div className="student-doubts-view" key="doubts-view">
              <div className="section-title-row">
                <h2>{lang === 'hi' ? 'शिक्षक से शंकाएं एवं सूचनाएं' : 'Teacher Doubts & Announcements'}</h2>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setIsAskTeacherModalOpen(true)}
                >
                  {lang === 'hi' ? '+ नई शंका पूछें' : '+ Ask New Doubt'}
                </button>
              </div>

              {announcements.length > 0 && (
                <div className="announcements-banner-box">
                  <span className="announcement-icon">📢</span>
                  <div className="announcements-list">
                    {announcements.map((a) => (
                      <div key={a.id} className="announcement-item">
                        <h4>{a.title}</h4>
                        <p>{a.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {myDoubts.length === 0 ? (
                <div className="empty-doubts-state">
                  <Mascot size={64} mood="wave" />
                  <p>{lang === 'hi' ? 'अभी कोई शंका नहीं पूछी गई है।' : 'No doubts asked yet.'}</p>
                </div>
              ) : (
                <div className="doubts-thread-layout">
                  <div className="doubts-sidebar-list">
                    {myDoubts.map((d) => (
                      <div
                        key={d.id}
                        className={`doubt-thread-item ${selectedDoubtId === d.id ? 'active' : ''}`}
                        onClick={() => setSelectedDoubtId(d.id)}
                      >
                        <div className="doubt-item-top">
                          <strong>{d.questionTitle || 'Math Question Doubt'}</strong>
                          <span className={`status-dot status-${d.status}`} />
                        </div>
                        <span className="doubt-meta">{d.messages.length} messages</span>
                      </div>
                    ))}
                  </div>

                  <div className="doubt-chat-pane">
                    {(() => {
                      const activeDoubt = myDoubts.find((d) => d.id === selectedDoubtId) || myDoubts[0]
                      if (!activeDoubt) return null
                      return (
                        <div className="chat-pane-inner">
                          <div className="chat-header">
                            <h4>{activeDoubt.questionTitle || 'Math Question Doubt'}</h4>
                            <span className="chat-status">{activeDoubt.status}</span>
                          </div>
                          <div className="chat-messages-scroll">
                            {activeDoubt.messages.map((m) => (
                              <div
                                key={m.id}
                                className={`chat-bubble ${m.senderType === 'student' ? 'bubble-student' : 'bubble-teacher'}`}
                              >
                                <span className="sender-tag">{m.senderName} ({m.senderType})</span>
                                <p>{m.content}</p>
                              </div>
                            ))}
                          </div>
                          <div className="chat-reply-bar">
                            <input
                              type="text"
                              placeholder={lang === 'hi' ? 'उत्तर टाइप करें...' : 'Type a reply...'}
                              value={studentReplyText}
                              onChange={(e) => setStudentReplyText(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleStudentReply()}
                            />
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={handleStudentReply}
                              disabled={isSendingReply || !studentReplyText.trim()}
                            >
                              Send
                            </button>
                          </div>
                          {replyError && <span className="reply-err">{replyError}</span>}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Subpage: Gaps & DAG */}
          {currentSubpage === 'gaps' && (
            <div className="student-gaps-view" key="gaps-view">
              <div className="section-title-row">
                <h2>{lang === 'hi' ? 'रूट-कॉज गैप डिटेक्टिव' : 'Root-Cause Gap Detective'}</h2>
                <span className="notice-chip">
                  {lang === 'hi' ? '22-अवधारणा ज्ञान ग्राफ' : '22-Node Prerequisite Graph'}
                </span>
              </div>

              {studentGapReports.length === 0 ? (
                <div className="empty-gaps-state">
                  <Mascot size={64} mood="cheer" />
                  <h3>{lang === 'hi' ? 'कोई बुनियादी कमी नहीं मिली!' : 'No prerequisite gaps detected!'}</h3>
                  <p>
                    {lang === 'hi'
                      ? 'आपकी अवधारणात्मक नींव मजबूत है। नए विषयों का अभ्यास जारी रखें।'
                      : 'Your foundations are solid. Continue adaptive practice to level up.'}
                  </p>
                </div>
              ) : (
                <div className="gap-reports-list">
                  {studentGapReports.map((g) => (
                    <div key={g.id} className="gap-report-card">
                      <div className="gap-card-header">
                        <span className="gap-concept-tag">
                          {conceptMap.get(g.startConceptId)?.name[lang] || g.startConceptId}
                        </span>
                        <span className="gap-status-chip">
                          {g.resolvedAt ? 'Resolved' : 'Active Gap'}
                        </span>
                      </div>
                      <p className="gap-diagnosis">
                        {g.rootCauseId && conceptMap.get(g.rootCauseId)
                          ? lang === 'hi'
                            ? `जांच में पाया गया कि समस्या "${conceptMap.get(g.rootCauseId)?.name[lang]}" से जुड़ी थी।`
                            : `Root deficiency traced back to ${conceptMap.get(g.rootCauseId)?.name[lang]}.`
                          : lang === 'hi'
                          ? 'निदान जारी है।'
                          : 'Investigation active.'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Subpage: AI Study Tutor */}
          {currentSubpage === 'tutor' && student && (
            <div className="student-tutor-subpage-view" key="tutor-subpage">
              <AiTutorChat
                classCode={student.classCode || 'DEMO'}
                studentId={student.id}
                lang={lang}
                attachedContext={aiTutorContext || undefined}
                onClearAttachedContext={() => setAiTutorContext(null)}
                onBack={() => navigate('/student')}
              />
            </div>
          )}

          {/* Subpage: Student Home Overview */}
          {currentSubpage === 'home' && step === 'ready' && (
            <div className="student-home-view" key="home-view">
              <div className="student-home-hero">
                <div className="home-hero-copy">
                  <h2>
                    {lang === 'hi' ? `नमस्ते, ${student?.name}!` : `Welcome back, ${student?.name}!`}
                  </h2>
                  <p>
                    {lang === 'hi'
                      ? 'अपनी गति से अभ्यास करें। गलतियों के पीछे का कारण समझें और महारत हासिल करें।'
                      : 'Practice at your own pace. Detect why you make mistakes and build lasting mastery.'}
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary btn-lg"
                    onClick={handleStartPractice}
                  >
                    <span>⚡</span>
                    <span>{lang === 'hi' ? 'नया अभ्यास सत्र शुरू करें' : 'Start Adaptive Round'}</span>
                  </button>
                </div>
                <Mascot size={110} mood="wave" />
              </div>

              {/* AI Tutor Card */}
              <div className="ai-tutor-home-card">
                <div className="tutor-card-mascot">🤖</div>
                <div className="tutor-card-body">
                  <h4>{lang === 'hi' ? 'पेसपाथ एआई ट्यूटर (टेक्स्ट + फ़ोटो)' : 'PacePath AI Study Tutor (Text + Photo)'}</h4>
                  <p>
                    {lang === 'hi'
                      ? 'गणित में कहीं अटके हैं? प्रश्न पूछें या किताब/नोटबुक की फ़ोटो खींचें। सुरक्षित, चरण-दर-चरण संकेत पाएँ!'
                      : 'Stuck on a tricky math problem? Type your question or snap a photo of your notebook for step-by-step guidance.'}
                  </p>
                  <div className="tutor-card-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => navigate('/student/tutor')}
                    >
                      💬 {lang === 'hi' ? 'ट्यूटर से पूछें' : 'Ask Question'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => navigate('/student/tutor')}
                    >
                      📷 {lang === 'hi' ? 'फ़ोटो प्रश्न' : 'Photo Problem'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Mastery Snapshot Grid */}
              <div className="mastery-summary-section">
                <h3>{lang === 'hi' ? 'आपकी महारत स्थिति' : 'Curriculum Mastery Progress'}</h3>
                <div className="mastery-cards-grid">
                  {concepts.map((c) => {
                    const m = studentMastery[c.id]
                    const scorePct = m ? Math.round(m.score * 100) : 10
                    return (
                      <div key={c.id} className="concept-mastery-card">
                        <div className="c-card-top">
                          <span className="c-name">{c.name[lang]}</span>
                          <span className="c-grade">Gr {c.grade}</span>
                        </div>
                        <div className="c-progress-track">
                          <div
                            className={`c-progress-bar ${scorePct >= 85 ? 'bar-mastered' : scorePct >= 50 ? 'bar-progress' : 'bar-start'}`}
                            style={{ width: `${Math.max(8, scorePct)}%` }}
                          />
                        </div>
                        <span className="c-pct">{scorePct}% mastery</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </AnimatePresence>
      </main>

      {/* Mobile Bottom Tab Bar */}
      <nav className="student-mobile-bottom-bar" aria-label="Mobile Navigation">
        <button
          type="button"
          className={`bottom-tab ${currentSubpage === 'home' ? 'active' : ''}`}
          onClick={() => navigate('/student')}
        >
          <span className="tab-icon">🏠</span>
          <span className="tab-text">Home</span>
        </button>

        <button
          type="button"
          className={`bottom-tab ${currentSubpage === 'practice' ? 'active' : ''}`}
          onClick={() => {
            if (step !== 'practice') handleStartPractice()
            else navigate('/student/practice')
          }}
        >
          <span className="tab-icon">⚡</span>
          <span className="tab-text">Practice</span>
        </button>

        <button
          type="button"
          className={`bottom-tab ${currentSubpage === 'tutor' ? 'active' : ''}`}
          onClick={() => navigate('/student/tutor')}
        >
          <span className="tab-icon">🤖</span>
          <span className="tab-text">Tutor</span>
        </button>

        <button
          type="button"
          className={`bottom-tab ${currentSubpage === 'tests' ? 'active' : ''}`}
          onClick={() => navigate('/student/tests')}
        >
          <span className="tab-icon">📝</span>
          <span className="tab-text">Tests</span>
          {studentAssignments.length > 0 && <span className="tab-badge-dot" />}
        </button>

        <button
          type="button"
          className={`bottom-tab ${currentSubpage === 'doubts' ? 'active' : ''}`}
          onClick={() => navigate('/student/doubts')}
        >
          <span className="tab-icon">💬</span>
          <span className="tab-text">Doubts</span>
          {hasUnreadDoubts && <span className="tab-badge-dot" />}
        </button>
      </nav>

      {/* Single Backdrop Dialogs (Quick Forms Only, No Modal-in-Modal) */}
      {isAskTeacherModalOpen && student && student.classCode && (
        <AskTeacherModal
          isOpen={isAskTeacherModalOpen}
          onClose={() => {
            setIsAskTeacherModalOpen(false)
            setAskTeacherContext(null)
          }}
          lang={lang}
          classCode={student.classCode}
          studentId={student.id}
          studentName={student.name}
          context={askTeacherContext}
          onSuccess={(newDoubt) => {
            setMyDoubts((prev) => [newDoubt, ...prev])
            setSelectedDoubtId(newDoubt.id)
            navigate('/student/doubts')
          }}
        />
      )}

      {miscDetectiveState.isOpen && miscDetectiveState.question && miscDetectiveState.candidate && (
        <MisconceptionDetectiveModal
          isOpen={miscDetectiveState.isOpen}
          question={miscDetectiveState.question}
          studentAnswer={miscDetectiveState.studentAnswer}
          candidate={miscDetectiveState.candidate}
          eventId={miscDetectiveState.eventId}
          lang={lang}
          onClose={() =>
            setMiscDetectiveState({
              isOpen: false,
              question: null,
              studentAnswer: '',
              candidate: null,
            })
          }
          onResolvedDiagnostic={() => {
            if (student) {
              getMisconceptionEventsByStudent(student.id).then(setStudentMisconceptionEvents)
            }
          }}
        />
      )}

      {detectiveState.isOpen && detectiveState.triggerQuestion && detectiveState.triggerAttempt && student && (
        <DetectiveModal
          isOpen={detectiveState.isOpen}
          triggerQuestion={detectiveState.triggerQuestion}
          triggerAttempt={detectiveState.triggerAttempt}
          studentId={student.id}
          sessionId={sessionId || ''}
          allStudentAttempts={studentAttempts}
          lang={lang}
          onClose={() => setDetectiveState({ isOpen: false, triggerQuestion: null, triggerAttempt: null })}
          onComplete={handleDetectiveComplete}
        />
      )}
    </div>
  )
}

export default StudentWorkspacePage
