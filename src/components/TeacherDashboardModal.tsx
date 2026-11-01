import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  createClass,
  getClassStudents,
  getClassSessions,
  getClassAttempts,
  getClassGapReports,
  fetchClassMisconceptionSummary,
  fetchClassMisconceptionDetails,
  fetchAvailableClassCodes,
  createAssignment,
  closeAssignment,
  getClassAssignments,
  getClassDoubts,
  replyToDoubt,
  setDoubtStatus,
  postAnnouncement,
  flagDoubtMessage,
  type ClassMisconceptionSummaryRow,
  type ClassMisconceptionDetailRow,
} from '../services/supabase'
import {
  computeStudentConceptMastery,
  computeClassMasteryGrid,
  getStudentActivityStatus,
  groupStudents,
  deriveClassInsights,
} from '../engine/classInsights'
import {
  setTeacherSession as storeTeacherSession,
  clearTeacherSession,
} from '../services/roleSession'
import { CreateTestWizardModal } from './teacher/CreateTestWizardModal'
import { AssignmentResultsView } from './teacher/AssignmentResultsView'
import { TeacherAiTutorTab } from './teacher/TeacherAiTutorTab'
import rawConcepts from '../data/concepts.json'
import rawQuestions from '../data/questions.json'
import rawActivities from '../data/teacherActivities.json'
import rawMisconceptions from '../data/misconceptions.json'
import type {
  Student,
  Session,
  Attempt,
  GapReport,
  Language,
  Assignment,
  AssignmentSubmission,
  Doubt,
  DoubtStatus,
  Announcement,
} from '../types'

interface TeacherDashboardModalProps {
  isOpen: boolean
  onClose: () => void
  lang: Language
  initialTab?: string
  isFullPage?: boolean
  onTabChange?: (tab: DashboardTab) => void
}

interface TeacherSession {
  classCode: string
  teacherName: string
  pin: string
}

type DashboardTab = 'overview' | 'students' | 'heatmap' | 'groups' | 'tests' | 'doubts' | 'misconceptions' | 'ai-tutor'

const TEACHER_SESSION_KEY = 'pacepath_teacher_session'

const allConcepts = rawConcepts as Array<{
  id: string
  name: { en: string; hi: string }
  grade: number
  prerequisites: string[]
  strand?: string
}>
const conceptMap = new Map(allConcepts.map((c) => [c.id, c]))
const conceptIds = allConcepts.map((c) => c.id)

const allQuestions = rawQuestions as Array<{
  id: string
  conceptId: string
  grade: number
  text: { en: string; hi: string }
  options?: Array<{ en: string; hi: string }>
  correctIndex?: number
  correctAnswer?: string | number
  solution?: { en: string; hi: string }
}>
const questionMap = new Map(allQuestions.map((q) => [q.id, q]))

const allActivities = rawActivities as Array<{
  conceptId: string
  conceptName: { en: string; hi: string }
  teachingTip: { en: string; hi: string }
  misconceptionNote: { en: string; hi: string }
  activities: Array<{
    title: { en: string; hi: string }
    durationMinutes: number
    materials: { en: string; hi: string }
    context: { en: string; hi: string }
    instructions: { en: string[]; hi: string[] }
    mathTakeaway: { en: string; hi: string }
  }>
}>
const activityMap = new Map(allActivities.map((a) => [a.conceptId, a]))

const allMisconceptions = rawMisconceptions as Array<{
  id: string
  name: { en: string; hi: string }
  description: { en: string; hi: string }
  kidFriendlyExplanation: { en: string; hi: string }
  whyItHappens: { en: string; hi: string }
  miniLesson: Array<{ step: number; text: { en: string; hi: string } }>
}>
const miscMap = new Map(allMisconceptions.map((m) => [m.id, m]))

export function TeacherDashboardModal({
  isOpen,
  onClose,
  lang,
  initialTab,
  isFullPage = false,
  onTabChange,
}: TeacherDashboardModalProps) {
  // Session State
  const [session, setSession] = useState<TeacherSession | null>(() => {
    try {
      const saved = localStorage.getItem(TEACHER_SESSION_KEY)
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })

  // Navigation State
  const validTabs: DashboardTab[] = ['overview', 'students', 'heatmap', 'groups', 'tests', 'doubts', 'misconceptions']
  const [activeTab, setActiveTab] = useState<DashboardTab>(() => {
    if (initialTab && validTabs.includes(initialTab as DashboardTab)) {
      return initialTab as DashboardTab
    }
    return 'overview'
  })

  useEffect(() => {
    if (initialTab && validTabs.includes(initialTab as DashboardTab)) {
      setActiveTab(initialTab as DashboardTab)
    }
  }, [initialTab])

  const handleSelectTab = (t: DashboardTab) => {
    setActiveTab(t)
    if (onTabChange) {
      onTabChange(t)
    }
  }

  // Entry Mode (when logged out): 'login' | 'create'
  const [entryMode, setEntryMode] = useState<'login' | 'create'>('login')
  const [newClassName, setNewClassName] = useState('')
  const [newTeacherName, setNewTeacherName] = useState('')
  const [newPin, setNewPin] = useState('')
  const [createdClassCode, setCreatedClassCode] = useState<string | null>(null)
  const [copiedCode, setCopiedCode] = useState(false)
  const [loginCode, setLoginCode] = useState('')
  const [loginPin, setLoginPin] = useState('')
  const [availableCodes, setAvailableCodes] = useState<string[]>([])

  // Dashboard Data State
  const [students, setStudents] = useState<Student[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [gapReports, setGapReports] = useState<GapReport[]>([])
  const [miscSummaries, setMiscSummaries] = useState<ClassMisconceptionSummaryRow[]>([])
  const [miscDetails, setMiscDetails] = useState<ClassMisconceptionDetailRow[]>([])
  const [selectedMiscId, setSelectedMiscId] = useState<string | null>(null)

  // Part B: Assignments & Tests State
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [assignmentSubmissions, setAssignmentSubmissions] = useState<AssignmentSubmission[]>([])
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null)
  const [isCreateTestWizardOpen, setIsCreateTestWizardOpen] = useState(false)

  // Part C: Doubts & Announcements State
  const [classDoubts, setClassDoubts] = useState<Doubt[]>([])
  const [classAnnouncements, setClassAnnouncements] = useState<Announcement[]>([])
  const [doubtFilter, setDoubtFilter] = useState<'all' | 'open' | 'answered' | 'resolved'>('all')
  const [replyTextMap, setReplyTextMap] = useState<Record<string, string>>({})
  const [isSubmittingReply, setIsSubmittingReply] = useState(false)
  const [doubtActionError, setDoubtActionError] = useState<string | null>(null)
  const [isAnnouncementComposerOpen, setIsAnnouncementComposerOpen] = useState(false)
  const [announcementTitle, setAnnouncementTitle] = useState('')
  const [announcementContent, setAnnouncementContent] = useState('')
  const [isPostingAnnouncement, setIsPostingAnnouncement] = useState(false)
  const [announcementMsg, setAnnouncementMsg] = useState<string | null>(null)

  // Drawer & Filter State
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [selectedGroupConcept, setSelectedGroupConcept] = useState<string>(conceptIds[0])
  const [heatmapGradeFilter, setHeatmapGradeFilter] = useState<string>('all')
  const [heatmapHoverCell, setHeatmapHoverCell] = useState<{ studentId: string; conceptId: string } | null>(null)
  const [studentSearchQuery, setStudentSearchQuery] = useState('')

  // UI Status
  const [loading, setLoading] = useState<boolean>(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [isLocalFallback, setIsLocalFallback] = useState<boolean>(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)

  // Load available codes on open
  useEffect(() => {
    if (isOpen) {
      fetchAvailableClassCodes().then((codes) => {
        setAvailableCodes(codes)
        if (codes.length > 0 && !loginCode && !session) {
          setLoginCode(codes[0])
        }
      })
    }
  }, [isOpen, session])

  // Primary Data Loader
  const loadClassData = useCallback(async (code: string, pin: string) => {
    if (!code.trim() || !pin.trim()) return
    setLoading(true)
    setAuthError(null)

    try {
      const [sList, sesList, attList, gapsList, summsRes, detsRes] = await Promise.all([
        getClassStudents(code, pin),
        getClassSessions(code, pin),
        getClassAttempts(code, pin),
        getClassGapReports(code, pin),
        fetchClassMisconceptionSummary(code, pin),
        fetchClassMisconceptionDetails(code, pin),
      ])

      setStudents(sList)
      setSessions(sesList)
      setAttempts(attList)
      setGapReports(gapsList)
      setMiscSummaries(summsRes.summaries)
      setIsLocalFallback(summsRes.isLocalFallback)
      setLastSyncedAt(summsRes.lastSyncedAt || Date.now())
      setMiscDetails(detsRes.details)

      if (summsRes.summaries.length > 0) {
        setSelectedMiscId(summsRes.summaries[0].misconception_id)
      }

      // Load assignments and submissions
      try {
        const assnRes = await getClassAssignments(code, pin)
        setAssignments(assnRes.assignments || [])
        setAssignmentSubmissions(assnRes.submissions || [])
      } catch {
        // non-blocking
      }

      // Load doubts
      try {
        const doubtsRes = await getClassDoubts(code, pin)
        setClassDoubts(doubtsRes || [])
      } catch {
        // non-blocking
      }
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Invalid class code or teacher PIN')
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-load on session or open
  useEffect(() => {
    if (isOpen && session) {
      loadClassData(session.classCode, session.pin)
    }
  }, [isOpen, session, loadClassData])

  // Periodic 30s auto-refresh
  useEffect(() => {
    if (!isOpen || !session) return
    const interval = setInterval(() => {
      loadClassData(session.classCode, session.pin)
    }, 30000)
    return () => clearInterval(interval)
  }, [isOpen, session, loadClassData])

  // Derived Analytics via Pure Engine
  const activeGapsByStudent = useMemo(() => {
    const map: Record<string, number> = {}
    for (const g of gapReports) {
      if (!g.resolvedAt) {
        map[g.studentId] = (map[g.studentId] || 0) + 1
      }
    }
    return map
  }, [gapReports])

  const classInsights = useMemo(() => {
    return deriveClassInsights(students, conceptIds, attempts, activeGapsByStudent)
  }, [students, attempts, activeGapsByStudent])

  const classGrid = useMemo(() => {
    return computeClassMasteryGrid(students, conceptIds, attempts)
  }, [students, attempts])

  // Auth Handlers
  const handleCreateClassSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newClassName.trim() || !newTeacherName.trim() || !newPin.trim()) return
    setLoading(true)
    setAuthError(null)

    try {
      const code = await createClass(newClassName, newTeacherName, newPin)
      setCreatedClassCode(code)
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Failed to create class')
    } finally {
      setLoading(false)
    }
  }

  const handleEnterDashboardWithCreatedClass = () => {
    if (!createdClassCode) return
    const newSession: TeacherSession = {
      classCode: createdClassCode,
      teacherName: newTeacherName.trim(),
      pin: newPin.trim(),
    }
    setSession(newSession)
    storeTeacherSession(newSession)
    localStorage.setItem(TEACHER_SESSION_KEY, JSON.stringify(newSession))
    setCreatedClassCode(null)
    loadClassData(newSession.classCode, newSession.pin)
  }

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!loginCode.trim() || !loginPin.trim()) return
    setLoading(true)
    setAuthError(null)

    try {
      const code = loginCode.trim().toUpperCase()
      const pin = loginPin.trim()
      await loadClassData(code, pin)
      const newSession: TeacherSession = {
        classCode: code,
        teacherName: 'Teacher',
        pin,
      }
      setSession(newSession)
      storeTeacherSession(newSession)
      localStorage.setItem(TEACHER_SESSION_KEY, JSON.stringify(newSession))
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Invalid class code or teacher PIN')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    setSession(null)
    clearTeacherSession()
    localStorage.removeItem(TEACHER_SESSION_KEY)
    setStudents([])
    setSessions([])
    setAttempts([])
    setGapReports([])
    setMiscSummaries([])
    setMiscDetails([])
    setAssignments([])
    setAssignmentSubmissions([])
    setSelectedAssignmentId(null)
    setIsCreateTestWizardOpen(false)
    setAuthError(null)
    setCreatedClassCode(null)
    setSelectedStudentId(null)
  }

  const handleCopyCode = (code: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code)
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 2000)
    }
  }

  const openDoubtsCount = classDoubts.filter((d) => d.status === 'open').length

  const handleReplyToDoubt = async (doubtId: string) => {
    if (!session) return
    const text = (replyTextMap[doubtId] || '').trim()
    if (!text) return
    setIsSubmittingReply(true)
    setDoubtActionError(null)
    try {
      const msg = await replyToDoubt({
        classCode: session.classCode,
        pin: session.pin,
        doubtId,
        content: text,
      })
      setClassDoubts((prev) =>
        prev.map((d) => {
          if (d.id === doubtId) {
            return {
              ...d,
              status: 'answered',
              updatedAt: msg.createdAt,
              lastMessageAt: msg.createdAt,
              messages: [...d.messages, msg],
            }
          }
          return d
        }),
      )
      setReplyTextMap((prev) => ({ ...prev, [doubtId]: '' }))
    } catch (err: unknown) {
      setDoubtActionError(err instanceof Error ? err.message : 'Failed to reply')
    } finally {
      setIsSubmittingReply(false)
    }
  }

  const handleSetDoubtStatus = async (doubtId: string, status: DoubtStatus) => {
    if (!session) return
    try {
      await setDoubtStatus({
        classCode: session.classCode,
        pin: session.pin,
        doubtId,
        status,
      })
      setClassDoubts((prev) =>
        prev.map((d) => (d.id === doubtId ? { ...d, status, updatedAt: Date.now() } : d)),
      )
    } catch (err: unknown) {
      setDoubtActionError(err instanceof Error ? err.message : 'Failed to update doubt status')
    }
  }

  const handleSuggestedExplanation = (doubt: Doubt) => {
    let suggestion = ''
    if (doubt.misconceptionTag) {
      const tagLower = doubt.misconceptionTag.toLowerCase()
      const misc = allMisconceptions.find(
        (m) =>
          m.id.toLowerCase() === tagLower ||
          m.name[lang].toLowerCase().includes(tagLower) ||
          m.description[lang].toLowerCase().includes(tagLower),
      )
      if (misc) {
        suggestion = `Key Concept Note: ${misc.kidFriendlyExplanation?.[lang] || misc.description[lang]}`
      }
    }
    if (!suggestion && doubt.questionId) {
      const q = allQuestions.find((item) => item.id === doubt.questionId)
      if (q && q.solution) {
        suggestion = `Step-by-step guidance: ${q.solution[lang]}`
      }
    }
    if (!suggestion) {
      suggestion =
        lang === 'hi'
          ? 'आइए इसे चरण-दर-चरण हल करते हैं: पहले चरण में दिए गए मानों को पहचानें...'
          : 'Let us break this down step-by-step together: check the given values first...'
    }
    setReplyTextMap((prev) => ({ ...prev, [doubt.id]: suggestion }))
  }

  const handlePostAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!session || !announcementTitle.trim() || !announcementContent.trim()) return
    setIsPostingAnnouncement(true)
    setAnnouncementMsg(null)
    try {
      const ann = await postAnnouncement({
        classCode: session.classCode,
        pin: session.pin,
        title: announcementTitle.trim(),
        content: announcementContent.trim(),
      })
      setClassAnnouncements((prev) => [ann, ...prev])
      setAnnouncementTitle('')
      setAnnouncementContent('')
      setAnnouncementMsg(
        lang === 'hi'
          ? 'घोषणा कक्षा में सफलतापूर्वक प्रसारित कर दी गई!'
          : 'Announcement broadcast successfully!',
      )
      setTimeout(() => setAnnouncementMsg(null), 3000)
    } catch (err: unknown) {
      setDoubtActionError(err instanceof Error ? err.message : 'Failed to post announcement')
    } finally {
      setIsPostingAnnouncement(false)
    }
  }

  const handleFlagMessage = async (messageId: string) => {
    try {
      await flagDoubtMessage(messageId, 'Flagged by teacher')
      setClassDoubts((prev) =>
        prev.map((d) => ({
          ...d,
          messages: d.messages.map((m) => (m.id === messageId ? { ...m, flagged: true } : m)),
        })),
      )
    } catch {
      // ignore
    }
  }

  if (!isOpen) return null

  // Student Drawer Data
  const drawerStudent = selectedStudentId ? students.find((s) => s.id === selectedStudentId) : null
  const drawerAttempts = selectedStudentId
    ? attempts.filter((a) => a.studentId === selectedStudentId).sort((a, b) => b.timestamp - a.timestamp)
    : []
  const drawerSessions = selectedStudentId ? sessions.filter((s) => s.studentId === selectedStudentId) : []
  const drawerGaps = selectedStudentId ? gapReports.filter((g) => g.studentId === selectedStudentId) : []
  const drawerMiscs = selectedStudentId ? miscDetails.filter((d) => d.student_id === selectedStudentId) : []

  const drawerStudyTimeMins = Math.round(
    drawerSessions.reduce((acc, s) => acc + (s.activeSeconds || 0), 0) / 60,
  )
  const drawerAccuracyPct =
    drawerAttempts.length > 0
      ? Math.round((drawerAttempts.filter((a) => a.correct).length / drawerAttempts.length) * 100)
      : 0

  // 7-day study breakdown for student drawer
  const last7DaysBreakdown = (() => {
    const days: { label: string; minutes: number }[] = []
    const now = Date.now()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 86400000)
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
      const dayEnd = dayStart + 86400000
      const activeSecs = drawerSessions
        .filter((s) => (s.startTime >= dayStart && s.startTime < dayEnd) || (s.endTime && s.endTime >= dayStart && s.endTime < dayEnd))
        .reduce((sum, s) => sum + (s.activeSeconds || 0), 0)
      days.push({
        label: d.toLocaleDateString([], { weekday: 'short' }),
        minutes: Math.round(activeSecs / 60),
      })
    }
    return days
  })()

  // Concept filtered list for Heatmap
  const filteredHeatmapConcepts = allConcepts.filter((c) => {
    if (heatmapGradeFilter === 'all') return true
    return String(c.grade) === heatmapGradeFilter
  })

  // Students list with search
  const displayedStudents = students.filter((s) =>
    s.name.toLowerCase().includes(studentSearchQuery.toLowerCase()) ||
    s.id.toLowerCase().includes(studentSearchQuery.toLowerCase()),
  )

  // Overall class alert status (Strict: >= 3 distinct students AND >= 5 events)
  const totalClassEvents = miscSummaries.reduce((acc, s) => acc + s.total_events, 0)
  const allMiscStudentIds = new Set<string>()
  miscSummaries.forEach((s) => s.student_ids.forEach((id) => allMiscStudentIds.add(id)))
  const isClassAlertActive =
    miscSummaries.some((s) => s.is_alert) || (allMiscStudentIds.size >= 3 && totalClassEvents >= 5)

  // Quick stats for overview
  const activeTodayCount = students.filter(
    (s) => getStudentActivityStatus(s.id, sessions, attempts) === 'active_today',
  ).length
  const joinedLast24hCount = students.filter(
    (s) => s.createdAt && Date.now() - s.createdAt < 24 * 60 * 60 * 1000,
  ).length
  const totalClassAttempts = attempts.length
  const classAccuracyPct =
    totalClassAttempts > 0
      ? Math.round((attempts.filter((a) => a.correct).length / totalClassAttempts) * 100)
      : 0
  const activeGapsTotal = gapReports.filter((g) => !g.resolvedAt).length

  const renderDesktopSidebar = () => {
    if (!session) return null
    return (
      <aside className="teacher-desktop-sidebar" aria-label="Teacher Sidebar">
        <div className="sidebar-brand-card">
          <div className="sidebar-brand-top">
            <span className="teacher-header-badge">🏫 TEACHER</span>
            <button
              type="button"
              className="sidebar-home-link"
              onClick={onClose}
              title={lang === 'hi' ? 'मुख्य पृष्ठ पर वापस' : 'Back to Home'}
            >
              ← Home
            </button>
          </div>
          <div className="sidebar-class-row">
            <span className="sidebar-class-code">{session.classCode}</span>
            <button
              type="button"
              className="chip chip-copy-code"
              onClick={() => handleCopyCode(session.classCode)}
              title="Copy Class Code"
            >
              {copiedCode ? '✓ Copied' : '📋 Copy'}
            </button>
          </div>
          <div className="sidebar-teacher-name">{session.teacherName}</div>
          <div className="sidebar-quick-stats">
            <span className="sq-stat">👥 {students.length} enrolled</span>
            <span className="sq-stat">⚡ {activeTodayCount} active today</span>
          </div>
        </div>

        <nav className="teacher-sidebar-nav" role="tablist">
          <button
            type="button"
            className={`sidebar-nav-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => handleSelectTab('overview')}
            role="tab"
            aria-selected={activeTab === 'overview'}
          >
            <span className="nav-icon">📊</span>
            <span className="nav-label">{lang === 'hi' ? 'सिंहावलोकन' : 'Overview'}</span>
          </button>
          <button
            type="button"
            className={`sidebar-nav-btn ${activeTab === 'students' ? 'active' : ''}`}
            onClick={() => handleSelectTab('students')}
            role="tab"
            aria-selected={activeTab === 'students'}
          >
            <span className="nav-icon">👥</span>
            <span className="nav-label">{lang === 'hi' ? 'विद्यार्थी' : 'Students'}</span>
            <span className="nav-badge">{students.length}</span>
          </button>
          <button
            type="button"
            className={`sidebar-nav-btn ${activeTab === 'heatmap' ? 'active' : ''}`}
            onClick={() => handleSelectTab('heatmap')}
            role="tab"
            aria-selected={activeTab === 'heatmap'}
          >
            <span className="nav-icon">🗺️</span>
            <span className="nav-label">{lang === 'hi' ? 'हीटमैप' : 'Heatmap'}</span>
          </button>
          <button
            type="button"
            className={`sidebar-nav-btn ${activeTab === 'groups' ? 'active' : ''}`}
            onClick={() => handleSelectTab('groups')}
            role="tab"
            aria-selected={activeTab === 'groups'}
          >
            <span className="nav-icon">🎯</span>
            <span className="nav-label">{lang === 'hi' ? 'समूह एवं कार्य' : 'Groups & Action'}</span>
          </button>
          <button
            type="button"
            className={`sidebar-nav-btn ${activeTab === 'tests' ? 'active' : ''}`}
            onClick={() => handleSelectTab('tests')}
            role="tab"
            aria-selected={activeTab === 'tests'}
          >
            <span className="nav-icon">📝</span>
            <span className="nav-label">{lang === 'hi' ? 'टेस्ट एवं असाइनमेंट' : 'Tests & Assignments'}</span>
            {assignments.length > 0 && <span className="nav-badge">{assignments.length}</span>}
          </button>
          <button
            type="button"
            className={`sidebar-nav-btn ${activeTab === 'doubts' ? 'active' : ''}`}
            onClick={() => handleSelectTab('doubts')}
            role="tab"
            aria-selected={activeTab === 'doubts'}
          >
            <span className="nav-icon">💬</span>
            <span className="nav-label">{lang === 'hi' ? 'संदेह' : 'Doubts & Q&A'}</span>
            {openDoubtsCount > 0 && <span className="tab-counter-badge">{openDoubtsCount}</span>}
          </button>
          <button
            type="button"
            className={`sidebar-nav-btn ${activeTab === 'misconceptions' ? 'active' : ''}`}
            onClick={() => handleSelectTab('misconceptions')}
            role="tab"
            aria-selected={activeTab === 'misconceptions'}
          >
            <span className="nav-icon">🧩</span>
            <span className="nav-label">{lang === 'hi' ? 'भ्रांतियां' : 'Misconceptions'}</span>
            {miscSummaries.length > 0 && <span className="tab-counter-badge">{miscSummaries.length}</span>}
          </button>
          <button
            type="button"
            className={`sidebar-nav-btn ${activeTab === 'ai-tutor' ? 'active' : ''}`}
            onClick={() => handleSelectTab('ai-tutor')}
            role="tab"
            aria-selected={activeTab === 'ai-tutor'}
          >
            <span className="nav-icon">🤖</span>
            <span className="nav-label">{lang === 'hi' ? 'एआई ट्यूटर' : 'AI Tutor'}</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-sync-row">
            {isLocalFallback ? (
              <span className="sync-pill fallback" title="Local fallback only">⚠️ Offline / Local</span>
            ) : lastSyncedAt ? (
              <span className="sync-pill online" title={`Last synced: ${new Date(lastSyncedAt).toLocaleTimeString()}`}>🟢 Supabase Live</span>
            ) : (
              <span className="sync-pill">⚪ Pending</span>
            )}
            <button
              type="button"
              className="chip chip-refresh"
              onClick={() => loadClassData(session.classCode, session.pin)}
              disabled={loading}
              title="Refresh synced data"
            >
              🔄 {loading ? '...' : (lang === 'hi' ? 'ताज़ा करें' : 'Refresh')}
            </button>
          </div>
          <button
            type="button"
            className="sidebar-logout-btn"
            onClick={handleLogout}
            title="Log out from this class"
          >
            🚪 {lang === 'hi' ? 'लॉगआउट' : 'Log out'}
          </button>
        </div>
      </aside>
    )
  }

  const renderMobileTopBar = () => {
    if (!session) return null
    return (
      <header className="teacher-mobile-top-bar">
        <div className="mobile-top-header">
          <div className="mobile-class-info">
            <span className="mobile-class-code">{session.classCode}</span>
            <span className="mobile-teacher-name">{session.teacherName}</span>
          </div>
          <div className="mobile-top-actions">
            <button
              type="button"
              className="chip chip-refresh"
              onClick={() => loadClassData(session.classCode, session.pin)}
              disabled={loading}
              title="Refresh"
            >
              🔄
            </button>
            <button
              type="button"
              className="chip chip-logout"
              onClick={handleLogout}
              title="Log out"
            >
              🚪
            </button>
            <button
              type="button"
              className="solve-modal-close"
              onClick={onClose}
              aria-label="Back to home"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="mobile-scrollable-tabs" role="tablist">
          <button
            type="button"
            className={`mobile-scroll-tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => handleSelectTab('overview')}
            role="tab"
            aria-selected={activeTab === 'overview'}
          >
            📊 {lang === 'hi' ? 'सिंहावलोकन' : 'Overview'}
          </button>
          <button
            type="button"
            className={`mobile-scroll-tab ${activeTab === 'students' ? 'active' : ''}`}
            onClick={() => handleSelectTab('students')}
            role="tab"
            aria-selected={activeTab === 'students'}
          >
            👥 {lang === 'hi' ? 'विद्यार्थी' : 'Students'} ({students.length})
          </button>
          <button
            type="button"
            className={`mobile-scroll-tab ${activeTab === 'heatmap' ? 'active' : ''}`}
            onClick={() => handleSelectTab('heatmap')}
            role="tab"
            aria-selected={activeTab === 'heatmap'}
          >
            🗺️ {lang === 'hi' ? 'हीटमैप' : 'Heatmap'}
          </button>
          <button
            type="button"
            className={`mobile-scroll-tab ${activeTab === 'groups' ? 'active' : ''}`}
            onClick={() => handleSelectTab('groups')}
            role="tab"
            aria-selected={activeTab === 'groups'}
          >
            🎯 {lang === 'hi' ? 'समूह' : 'Groups'}
          </button>
          <button
            type="button"
            className={`mobile-scroll-tab ${activeTab === 'tests' ? 'active' : ''}`}
            onClick={() => handleSelectTab('tests')}
            role="tab"
            aria-selected={activeTab === 'tests'}
          >
            📝 {lang === 'hi' ? 'टेस्ट' : 'Tests'}
          </button>
          <button
            type="button"
            className={`mobile-scroll-tab ${activeTab === 'doubts' ? 'active' : ''}`}
            onClick={() => handleSelectTab('doubts')}
            role="tab"
            aria-selected={activeTab === 'doubts'}
          >
            💬 {lang === 'hi' ? 'संदेह' : 'Doubts'}
            {openDoubtsCount > 0 && <span className="tab-counter-badge">{openDoubtsCount}</span>}
          </button>
          <button
            type="button"
            className={`mobile-scroll-tab ${activeTab === 'misconceptions' ? 'active' : ''}`}
            onClick={() => handleSelectTab('misconceptions')}
            role="tab"
            aria-selected={activeTab === 'misconceptions'}
          >
            🧩 {lang === 'hi' ? 'भ्रांतियां' : 'Misconceptions'}
            {miscSummaries.length > 0 && <span className="tab-counter-badge">{miscSummaries.length}</span>}
          </button>
          <button
            type="button"
            className={`mobile-scroll-tab ${activeTab === 'ai-tutor' ? 'active' : ''}`}
            onClick={() => handleSelectTab('ai-tutor')}
            role="tab"
            aria-selected={activeTab === 'ai-tutor'}
          >
            🤖 {lang === 'hi' ? 'एआई ट्यूटर' : 'AI Tutor'}
          </button>
        </div>
      </header>
    )
  }

  const renderEntryView = () => (
    <div className={`teacher-entry-container ${isFullPage ? 'fullpage-entry-card' : ''}`}>
      {createdClassCode ? (
              <div className="teacher-share-card">
                <span className="share-congrats-icon">🎉</span>
                <h3>{lang === 'hi' ? 'कक्षा सफलतापूर्वक बनाई गई!' : 'Class Created Successfully!'}</h3>
                <p className="share-sub">
                  {lang === 'hi'
                    ? 'विद्यार्थी अभ्यास शुरू करते समय इस कोड को दर्ज करेंगे।'
                    : 'Share this unique code with your students to automatically link their practice:'}
                </p>

                <div className="share-code-display">
                  <span className="share-code-text">{createdClassCode}</span>
                  <button
                    type="button"
                    className="share-copy-btn"
                    onClick={() => handleCopyCode(createdClassCode)}
                  >
                    {copiedCode ? '✓ Copied!' : '📋 Copy Code'}
                  </button>
                </div>

                <div className="share-actions-row">
                  <a
                    href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                      `Namaste! Join our Maths class on PacePath using class code: ${createdClassCode}. Start practice at ${typeof window !== 'undefined' ? window.location.origin : ''}`,
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="whatsapp-share-btn"
                  >
                    💬 {lang === 'hi' ? 'व्हाट्सएप पर शेयर करें' : 'Share on WhatsApp'}
                  </a>

                  <button
                    type="button"
                    className="enter-dash-btn"
                    onClick={handleEnterDashboardWithCreatedClass}
                  >
                    🚀 {lang === 'hi' ? 'डैशबोर्ड में प्रवेश करें' : 'Enter Dashboard →'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="teacher-entry-toggle" role="tablist">
                  <button
                    type="button"
                    className={`entry-toggle-btn ${entryMode === 'login' ? 'active' : ''}`}
                    onClick={() => {
                      setEntryMode('login')
                      setAuthError(null)
                    }}
                    role="tab"
                    aria-selected={entryMode === 'login'}
                  >
                    🔐 {lang === 'hi' ? 'कक्षा में लॉग इन करें' : 'Log in to Class'}
                  </button>
                  <button
                    type="button"
                    className={`entry-toggle-btn ${entryMode === 'create' ? 'active' : ''}`}
                    onClick={() => {
                      setEntryMode('create')
                      setAuthError(null)
                    }}
                    role="tab"
                    aria-selected={entryMode === 'create'}
                  >
                    ✨ {lang === 'hi' ? 'नई कक्षा बनाएं' : 'Create a Class'}
                  </button>
                </div>

                {authError && (
                  <div className="teacher-auth-error-banner" style={{ margin: '1rem 0' }}>
                    <span className="error-icon">❌</span>
                    <div>
                      <strong>{lang === 'hi' ? 'त्रुटि' : 'Error'}</strong>
                      <p>{authError}</p>
                    </div>
                  </div>
                )}

                {entryMode === 'create' ? (
                  <form onSubmit={handleCreateClassSubmit} className="teacher-form">
                    <div className="entry-field">
                      <label>{lang === 'hi' ? 'कक्षा का नाम' : 'Class Name'}</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Class 8-A Maths"
                        value={newClassName}
                        onChange={(e) => setNewClassName(e.target.value)}
                        className="entry-input"
                      />
                    </div>

                    <div className="entry-field">
                      <label>{lang === 'hi' ? 'शिक्षक का नाम' : 'Teacher Name'}</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Mrs. Sharma"
                        value={newTeacherName}
                        onChange={(e) => setNewTeacherName(e.target.value)}
                        className="entry-input"
                      />
                    </div>

                    <div className="entry-field">
                      <label>{lang === 'hi' ? 'शिक्षक पिन (4-6 अंक)' : 'Teacher PIN (4-6 digits)'}</label>
                      <input
                        type="password"
                        required
                        pattern="[0-9]{4,6}"
                        maxLength={6}
                        placeholder="4 to 6 digits"
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value)}
                        className="entry-input"
                      />
                      <span className="entry-hint">
                        {lang === 'hi' ? 'यह पिन आपको बाद में डैशबोर्ड में लॉग इन करने के लिए चाहिए।' : 'Keep this PIN safe to securely view student data.'}
                      </span>
                    </div>

                    <button
                      type="submit"
                      className="entry-submit-btn"
                      disabled={loading || !newClassName.trim() || !newTeacherName.trim() || !newPin.trim()}
                    >
                      {loading ? 'Creating...' : '✨ Create Class & Generate Code'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleLoginSubmit} className="teacher-form">
                    <div className="entry-field">
                      <label>{lang === 'hi' ? 'कक्षा कोड' : 'Class Code'}</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. MATH-7K2P"
                        value={loginCode}
                        onChange={(e) => setLoginCode(e.target.value.toUpperCase())}
                        className="entry-input uppercase-input"
                      />
                    </div>

                    <div className="entry-field">
                      <label>{lang === 'hi' ? 'शिक्षक पिन' : 'Teacher PIN'}</label>
                      <input
                        type="password"
                        required
                        maxLength={6}
                        placeholder="4 to 6 digits"
                        value={loginPin}
                        onChange={(e) => setLoginPin(e.target.value)}
                        className="entry-input"
                      />
                    </div>

                    {availableCodes.length > 0 && (
                      <div className="teacher-preset-codes">
                        <span className="preset-label">{lang === 'hi' ? 'सक्रिय कक्षाएं:' : 'Active Classes:'}</span>
                        {availableCodes.map((c) => (
                          <button
                            key={c}
                            type="button"
                            className={`preset-code-chip ${loginCode === c ? 'active' : ''}`}
                            onClick={() => setLoginCode(c)}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    )}

                    <button
                      type="submit"
                      className="entry-submit-btn"
                      disabled={loading || !loginCode.trim() || !loginPin.trim()}
                    >
                      {loading ? 'Verifying PIN...' : '🔐 Log In to Dashboard'}
                    </button>
                  </form>
                )}
              </>
            )}
    </div>
  )

  const renderTabBody = () => {
    if (!session) return null
    return (
      <main className={`teacher-modal-body ${isFullPage ? 'teacher-pane-body' : ''}`}>
            {/* Sync Banners */}
            {authError && (
              <div className="teacher-auth-error-banner">
                <span className="error-icon">❌</span>
                <div>
                  <strong>{lang === 'hi' ? 'प्रमाणीकरण अस्वीकृत' : 'Authentication Failed'}</strong>
                  <p>{authError}. Zero student data returned.</p>
                </div>
              </div>
            )}

            {!authError && isLocalFallback && (
              <div className="teacher-local-fallback-banner">
                <span className="banner-icon">⚠️</span>
                <div>
                  <strong>
                    {lang === 'hi'
                      ? 'केवल इस डिवाइस का डेटा दिखाया जा रहा है, पूरी कक्षा का नहीं।'
                      : 'Showing data from this device only, not the whole class.'}
                  </strong>
                  <p>
                    {lang === 'hi'
                      ? 'सुपाबेस क्लाउड RPC ऑफ़लाइन है। नीचे प्रदर्शित डेटा केवल इस ब्राउज़र के छात्रों का है।'
                      : 'Supabase cloud RPC is offline or unconfigured. Data represents local attempts on this device only.'}
                  </p>
                </div>
              </div>
            )}

            {!authError && !isLocalFallback && lastSyncedAt && (
              <div className="teacher-live-sync-banner">
                <span className="live-dot" />
                <span>
                  {lang === 'hi'
                    ? `सुपाबेस रीयल-टाइम डेटा • अंतिम सिंक: ${new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                    : `Live Supabase RPC Data • Last synced: ${new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
                </span>
              </div>
            )}

            {/* Navigation Tabs Bar (Modal Mode Only) */}
            {!isFullPage && (
              <div className="teacher-nav-tabs" role="tablist">
                <button
                  type="button"
                  className={`teacher-nav-tab ${activeTab === 'overview' ? 'active' : ''}`}
                  onClick={() => handleSelectTab('overview')}
                  role="tab"
                  aria-selected={activeTab === 'overview'}
                >
                  📊 {lang === 'hi' ? 'सिंहावलोकन' : 'Overview'}
                </button>
                <button
                  type="button"
                  className={`teacher-nav-tab ${activeTab === 'students' ? 'active' : ''}`}
                  onClick={() => handleSelectTab('students')}
                  role="tab"
                  aria-selected={activeTab === 'students'}
                >
                  👥 {lang === 'hi' ? 'विद्यार्थी' : 'Students'} ({students.length})
                </button>
                <button
                  type="button"
                  className={`teacher-nav-tab ${activeTab === 'heatmap' ? 'active' : ''}`}
                  onClick={() => handleSelectTab('heatmap')}
                  role="tab"
                  aria-selected={activeTab === 'heatmap'}
                >
                  🗺️ {lang === 'hi' ? 'हीटमैप' : 'Heatmap'}
                </button>
                <button
                  type="button"
                  className={`teacher-nav-tab ${activeTab === 'groups' ? 'active' : ''}`}
                  onClick={() => handleSelectTab('groups')}
                  role="tab"
                  aria-selected={activeTab === 'groups'}
                >
                  🎯 {lang === 'hi' ? 'समूह एवं गतिविधियां' : 'Groups & Action'}
                </button>
                <button
                  type="button"
                  className={`teacher-nav-tab ${activeTab === 'tests' ? 'active' : ''}`}
                  onClick={() => handleSelectTab('tests')}
                  role="tab"
                  aria-selected={activeTab === 'tests'}
                >
                  📝 {lang === 'hi' ? 'टेस्ट एवं असाइनमेंट' : 'Tests & Assignments'}
                </button>
                <button
                  type="button"
                  className={`teacher-nav-tab ${activeTab === 'doubts' ? 'active' : ''}`}
                  onClick={() => handleSelectTab('doubts')}
                  role="tab"
                  aria-selected={activeTab === 'doubts'}
                >
                  💬 {lang === 'hi' ? 'संदेह' : 'Doubts & Q&A'}
                  {openDoubtsCount > 0 && <span className="tab-counter-badge">{openDoubtsCount}</span>}
                </button>
                <button
                  type="button"
                  className={`teacher-nav-tab ${activeTab === 'misconceptions' ? 'active' : ''}`}
                  onClick={() => handleSelectTab('misconceptions')}
                  role="tab"
                  aria-selected={activeTab === 'misconceptions'}
                >
                  🧩 {lang === 'hi' ? 'भ्रांतियां' : 'Misconceptions'}
                  {miscSummaries.length > 0 && <span className="tab-counter-badge">{miscSummaries.length}</span>}
                </button>
                <button
                  type="button"
                  className={`teacher-nav-tab ${activeTab === 'ai-tutor' ? 'active' : ''}`}
                  onClick={() => handleSelectTab('ai-tutor')}
                  role="tab"
                  aria-selected={activeTab === 'ai-tutor'}
                >
                  🤖 {lang === 'hi' ? 'एआई ट्यूटर' : 'AI Tutor'}
                </button>
              </div>
            )}

            {/* Loading Skeleton */}
            {loading && students.length === 0 && (
              <div className="teacher-loading-state">
                <div className="shimmer shimmer-line" style={{ width: '40%', margin: '20px auto' }} />
                <div className="shimmer shimmer-block" style={{ height: 180, borderRadius: 12 }} />
              </div>
            )}

            {/* ====================================================================
                TAB 1: OVERVIEW
                ==================================================================== */}
            {activeTab === 'overview' && (
              <div className="tab-pane-content">
                {/* Summary Metrics */}
                <div className="teacher-overview-grid">
                  <div className="teacher-stat-card">
                    <span className="stat-label">{lang === 'hi' ? 'कुल नामांकित' : 'Enrolled Students'}</span>
                    <span className="stat-value">{students.length}</span>
                    <span className="stat-foot">{session.classCode}</span>
                  </div>
                  <div className="teacher-stat-card">
                    <span className="stat-label">{lang === 'hi' ? 'आज सक्रिय' : 'Active Today'}</span>
                    <span className="stat-value text-accent-green">{activeTodayCount}</span>
                    <span className="stat-foot">{students.length > 0 ? `${Math.round((activeTodayCount / students.length) * 100)}% cohort` : '0%'}</span>
                  </div>
                  <div className="teacher-stat-card">
                    <span className="stat-label">{lang === 'hi' ? 'कक्षा सटीकता' : 'Class Accuracy'}</span>
                    <span className="stat-value text-accent-cyan">{classAccuracyPct}%</span>
                    <span className="stat-foot">{totalClassAttempts} total attempts</span>
                  </div>
                  <div className="teacher-stat-card">
                    <span className="stat-label">{lang === 'hi' ? 'सक्रिय गैप्स' : 'Active Concept Gaps'}</span>
                    <span className="stat-value text-accent-amber">{activeGapsTotal}</span>
                    <span className="stat-foot">Real root-cause traces</span>
                  </div>
                  <div className="teacher-stat-card">
                    <span className="stat-label">{lang === 'hi' ? '24 घंटे में जुड़े' : 'Students Joined (24h)'}</span>
                    <span className="stat-value text-accent-purple">{joinedLast24hCount}</span>
                    <span className="stat-foot">{lang === 'hi' ? 'हाल ही में नामांकित' : 'New enrollments'}</span>
                  </div>
                </div>

                {/* Today's Insights Section */}
                <div className="teacher-insights-section">
                  <div className="insights-header">
                    <h4>💡 {lang === 'hi' ? 'आज के मुख्य निष्कर्ष (Today\'s Insights)' : 'Today\'s Class Insights'}</h4>
                    <span className="insights-threshold-tag">Strict threshold: ≥3 students & ≥5 attempts</span>
                  </div>

                  {!classInsights.hasSufficientData ? (
                    <div className="teacher-empty-insights-card">
                      <span className="empty-symbol">🛡️</span>
                      <h5>{lang === 'hi' ? 'पर्याप्त सांख्यिकीय डेटा अभी उपलब्ध नहीं' : 'Not enough data yet for whole-class trends'}</h5>
                      <p>
                        {lang === 'hi'
                          ? 'कक्षा-स्तरीय अंतर्दृष्टि केवल तभी सक्रिय होती है जब कम से कम 3 विद्यार्थी प्रति अवधारणा 5 या अधिक प्रश्न हल करते हैं।'
                          : 'Class-level insight cards activate automatically when at least 3 students complete 5 or more attempts on a concept. This guarantees zero fabricated trends.'}
                      </p>
                    </div>
                  ) : (
                    <div className="insights-cards-row">
                      {/* Weakest Concepts */}
                      {classInsights.weakestConcepts.length > 0 && (
                        <div className="teacher-insight-card insight-weak">
                          <span className="insight-badge badge-weak">⚠️ Needs Class Remediation</span>
                          <h5>{conceptMap.get(classInsights.weakestConcepts[0].conceptId)?.name[lang] || classInsights.weakestConcepts[0].conceptId}</h5>
                          <p>
                            Average cohort mastery is{' '}
                            <strong>{Math.round(classInsights.weakestConcepts[0].averageMastery * 100)}%</strong> across{' '}
                            {classInsights.weakestConcepts[0].studentsWithData} evaluated students ({classInsights.weakestConcepts[0].totalAttempts} attempts).
                          </p>
                          <button
                            type="button"
                            className="insight-action-btn"
                            onClick={() => {
                              setSelectedGroupConcept(classInsights.weakestConcepts[0].conceptId)
                              handleSelectTab('groups')
                            }}
                          >
                            🎯 View Remedial Group & 10-Min Action →
                          </button>
                        </div>
                      )}

                      {/* Ready to Move On */}
                      {classInsights.readyToMoveOn.length > 0 && (
                        <div className="teacher-insight-card insight-strong">
                          <span className="insight-badge badge-strong">🚀 Ready to Advance</span>
                          <h5>{conceptMap.get(classInsights.readyToMoveOn[0].conceptId)?.name[lang] || classInsights.readyToMoveOn[0].conceptId}</h5>
                          <p>
                            <strong>{classInsights.readyToMoveOn[0].masteredPercentage}%</strong> of evaluated students achieved solid mastery (≥0.70). The class is ready to proceed.
                          </p>
                        </div>
                      )}

                      {/* Common Mistake Types */}
                      {classInsights.commonMistakes.length > 0 && (
                        <div className="teacher-insight-card insight-mistake">
                          <span className="insight-badge badge-mistake">🧩 Common Mistake Pattern</span>
                          <h5>Tag: {classInsights.commonMistakes[0].mistakeTag}</h5>
                          <p>
                            Seen in <strong>{classInsights.commonMistakes[0].distinctStudents} students</strong> with{' '}
                            {classInsights.commonMistakes[0].totalOccurrences} occurrences. Check procedural transpositions.
                          </p>
                        </div>
                      )}

                      {/* Students Needing Attention */}
                      {classInsights.studentsNeedingAttention.length > 0 && (
                        <div className="teacher-insight-card insight-attention">
                          <span className="insight-badge badge-attention">🎯 Individual Follow-up</span>
                          <h5>{classInsights.studentsNeedingAttention[0].studentName}</h5>
                          <p>
                            Overall accuracy is {classInsights.studentsNeedingAttention[0].accuracyPct}% with{' '}
                            {classInsights.studentsNeedingAttention[0].activeGapsCount} active diagnostic gaps.
                          </p>
                          <button
                            type="button"
                            className="insight-action-btn"
                            onClick={() => setSelectedStudentId(classInsights.studentsNeedingAttention[0].studentId)}
                          >
                            🔍 Open Student Diagnostic Drawer →
                          </button>
                        </div>
                      )}

                      {/* Overconfidence Index */}
                      {classInsights.overconfidence && (
                        <div className="teacher-insight-card insight-overconfidence">
                          <span className="insight-badge badge-overconf">⚡ Overconfidence Gap</span>
                          <h5>High Confidence Misconception Alert</h5>
                          <p>
                            {Math.round(classInsights.overconfidence.overconfidenceRate * 100)}% of answers marked &quot;Sure&quot; were incorrect across {classInsights.overconfidence.affectedStudentsCount} students.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Cohort Empty State if 0 students */}
                {students.length === 0 && !loading && (
                  <div className="teacher-cohort-empty-state">
                    <span className="empty-symbol">🎒</span>
                    <h4>{lang === 'hi' ? 'कक्षा में अभी कोई विद्यार्थी नहीं जुड़ा है' : 'No students have joined this class yet'}</h4>
                    <p>
                      {lang === 'hi'
                        ? `अपने विद्यार्थियों को क्लास कोड "${session.classCode}" दें। वे ऐप में "Practice" पर क्लिक करके जुड़ सकते हैं।`
                        : `Share class code "${session.classCode}" with your students. As soon as they enter it during practice onboarding, their real live data will appear here.`}
                    </p>
                    <div className="empty-share-actions">
                      <button
                        type="button"
                        className="share-copy-btn"
                        onClick={() => handleCopyCode(session.classCode)}
                      >
                        {copiedCode ? '✓ Copied' : '📋 Copy Class Code'}
                      </button>
                      <a
                        href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                          `Join Maths class with code: ${session.classCode}`,
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="whatsapp-share-btn"
                      >
                        💬 Share on WhatsApp
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ====================================================================
                TAB 2: STUDENTS
                ==================================================================== */}
            {activeTab === 'students' && (
              <div className="tab-pane-content">
                <div className="students-filter-bar">
                  <input
                    type="text"
                    placeholder={lang === 'hi' ? 'विद्यार्थी का नाम खोजें...' : 'Search student by name or ID...'}
                    value={studentSearchQuery}
                    onChange={(e) => setStudentSearchQuery(e.target.value)}
                    className="student-search-input"
                  />
                  <span className="students-count-chip">{displayedStudents.length} Students</span>
                </div>

                {displayedStudents.length === 0 ? (
                  <div className="teacher-empty-state">
                    <span className="empty-symbol">👥</span>
                    <h4>{lang === 'hi' ? 'कोई विद्यार्थी नहीं मिला' : 'No students match your query'}</h4>
                  </div>
                ) : (
                  <div className="teacher-table-wrapper">
                    <table className="teacher-students-table">
                      <thead>
                        <tr>
                          <th>{lang === 'hi' ? 'विद्यार्थी' : 'Student'}</th>
                          <th>{lang === 'hi' ? 'कक्षा' : 'Grade'}</th>
                          <th>{lang === 'hi' ? 'स्थिति' : 'Status'}</th>
                          <th>{lang === 'hi' ? 'कुल अध्ययन समय' : 'Study Time'}</th>
                          <th>{lang === 'hi' ? 'प्रयास' : 'Questions'}</th>
                          <th>{lang === 'hi' ? 'सटीकता' : 'Accuracy'}</th>
                          <th>{lang === 'hi' ? 'सक्रिय गैप्स' : 'Active Gaps'}</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedStudents.map((student) => {
                          const sAtts = attempts.filter((a) => a.studentId === student.id)
                          const sSessions = sessions.filter((s) => s.studentId === student.id)
                          const status = getStudentActivityStatus(student.id, sessions, attempts)
                          const studyMins = Math.round(
                            sSessions.reduce((acc, s) => acc + (s.activeSeconds || 0), 0) / 60,
                          )
                          const accPct =
                            sAtts.length > 0
                              ? Math.round((sAtts.filter((a) => a.correct).length / sAtts.length) * 100)
                              : 0
                          const gaps = activeGapsByStudent[student.id] || 0

                          return (
                            <tr
                              key={student.id}
                              className="teacher-student-row"
                              onClick={() => setSelectedStudentId(student.id)}
                            >
                              <td>
                                <div className="student-name-cell">
                                  <span className="student-avatar-bubble">{student.avatar || '🎓'}</span>
                                  <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                      <span className="student-name-text">{student.name}</span>
                                      {student.createdAt && Date.now() - student.createdAt < 24 * 60 * 60 * 1000 && (
                                        <span className="student-new-badge">NEW</span>
                                      )}
                                    </div>
                                    <span className="student-id-text">{student.id.slice(0, 8)}</span>
                                  </div>
                                </div>
                              </td>
                              <td>Gr {student.grade || 8}</td>
                              <td>
                                <span className={`status-badge status-${status}`}>
                                  {status === 'active_today' && '🟢 Active Today'}
                                  {status === 'active_yesterday' && '🟡 Yesterday'}
                                  {status === 'inactive_3plus_days' && '⚪ Inactive 3+ days'}
                                  {status === 'never_started' && '💤 Never started'}
                                </span>
                              </td>
                              <td>{studyMins}m</td>
                              <td>{sAtts.length}</td>
                              <td>
                                <span className={`acc-pill ${accPct >= 70 ? 'acc-high' : accPct >= 40 ? 'acc-mid' : 'acc-low'}`}>
                                  {accPct}%
                                </span>
                              </td>
                              <td>
                                {gaps > 0 ? (
                                  <span className="gap-alert-chip">⚠️ {gaps} gaps</span>
                                ) : (
                                  <span className="gap-clean-chip">✓ Clean</span>
                                )}
                              </td>
                              <td>
                                <button type="button" className="btn-table-inspect">
                                  Inspect →
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ====================================================================
                TAB 3: HEATMAP
                ==================================================================== */}
            {activeTab === 'heatmap' && (
              <div className="tab-pane-content">
                <div className="heatmap-toolbar">
                  <div className="heatmap-filters">
                    <span className="filter-label">Filter Grade:</span>
                    {['all', '6', '7', '8', '9', '10'].map((g) => (
                      <button
                        key={g}
                        type="button"
                        className={`chip-filter ${heatmapGradeFilter === g ? 'active' : ''}`}
                        onClick={() => setHeatmapGradeFilter(g)}
                      >
                        {g === 'all' ? 'All Concepts (22)' : `Grade ${g}`}
                      </button>
                    ))}
                  </div>

                  <div className="heatmap-legend">
                    <span className="legend-item"><span className="legend-box box-grey" /> No Data (&lt;2 attempts)</span>
                    <span className="legend-item"><span className="legend-box box-red" /> Remedial (&lt;40%)</span>
                    <span className="legend-item"><span className="legend-box box-amber" /> On-Track (40-70%)</span>
                    <span className="legend-item"><span className="legend-box box-green" /> Solid (&gt;70%)</span>
                  </div>
                </div>

                {students.length === 0 ? (
                  <div className="teacher-empty-state">
                    <span className="empty-symbol">🗺️</span>
                    <h4>{lang === 'hi' ? 'हीटमैप के लिए कोई विद्यार्थी डेटा नहीं है' : 'No student data for heatmap'}</h4>
                  </div>
                ) : (
                  <div className="heatmap-scroll-container">
                    <table className="heatmap-matrix-table">
                      <thead>
                        <tr>
                          <th className="sticky-student-col">Student</th>
                          {filteredHeatmapConcepts.map((c) => (
                            <th
                              key={c.id}
                              className={`concept-col-header ${heatmapHoverCell?.conceptId === c.id ? 'highlight-col' : ''}`}
                              title={c.name.en}
                            >
                              <div className="vertical-concept-name">
                                <span>{c.name.en}</span>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {students.map((st) => (
                          <tr
                            key={st.id}
                            className={`heatmap-row ${heatmapHoverCell?.studentId === st.id ? 'highlight-row' : ''}`}
                          >
                            <td
                              className="sticky-student-cell"
                              onClick={() => setSelectedStudentId(st.id)}
                            >
                              <span className="st-avatar">{st.avatar || '🎓'}</span>
                              <span className="st-name">{st.name}</span>
                            </td>

                            {filteredHeatmapConcepts.map((c) => {
                              const cell = classGrid[st.id]?.[c.id]
                              const isNoData = !cell || cell.status === 'no_data' || cell.score === null
                              const score = cell?.score ?? 0

                              let cellClass = 'heatmap-cell-grey'
                              let label = '—'

                              if (!isNoData) {
                                label = `${Math.round(score * 100)}%`
                                if (score < 0.4) cellClass = 'heatmap-cell-red'
                                else if (score <= 0.7) cellClass = 'heatmap-cell-amber'
                                else cellClass = 'heatmap-cell-green'
                              }

                              return (
                                <td
                                  key={c.id}
                                  className={`heatmap-matrix-cell ${cellClass}`}
                                  onMouseEnter={() => setHeatmapHoverCell({ studentId: st.id, conceptId: c.id })}
                                  onMouseLeave={() => setHeatmapHoverCell(null)}
                                  onClick={() => setSelectedStudentId(st.id)}
                                  title={`${st.name} • ${c.name.en}: ${label} (${cell?.attemptsCount || 0} attempts)`}
                                >
                                  {label}
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ====================================================================
                TAB 4: GROUPS & ACTION CARDS
                ==================================================================== */}
            {activeTab === 'groups' && (
              <div className="tab-pane-content">
                <div className="groups-top-bar">
                  <label htmlFor="group-concept-select" style={{ fontWeight: 700 }}>
                    {lang === 'hi' ? 'अवधारणा चुनें:' : 'Select Concept to Group:'}
                  </label>
                  <select
                    id="group-concept-select"
                    value={selectedGroupConcept}
                    onChange={(e) => setSelectedGroupConcept(e.target.value)}
                    className="group-concept-dropdown"
                  >
                    {allConcepts.map((c) => (
                      <option key={c.id} value={c.id}>
                        [Gr {c.grade}] {c.name[lang] || c.name.en}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3 Tier Groups */}
                {(() => {
                  const groups = groupStudents(selectedGroupConcept, students, attempts)
                  const activity = activityMap.get(selectedGroupConcept)

                  return (
                    <div className="groups-container">
                      <div className="groups-three-col">
                        {/* Remedial */}
                        <div className="group-col group-col-remedial">
                          <div className="group-col-header">
                            <span className="group-tag tag-red">🔴 Remedial (&lt;0.40)</span>
                            <span className="group-count">{groups.remedial.length}</span>
                          </div>
                          <div className="group-students-list">
                            {groups.remedial.length === 0 ? (
                              <span className="no-students-text">Zero students in this band</span>
                            ) : (
                              groups.remedial.map((st) => (
                                <button
                                  key={st.id}
                                  type="button"
                                  className="group-student-chip"
                                  onClick={() => setSelectedStudentId(st.id)}
                                >
                                  {st.avatar || '🎓'} {st.name}
                                </button>
                              ))
                            )}
                          </div>
                        </div>

                        {/* On-Track */}
                        <div className="group-col group-col-ontrack">
                          <div className="group-col-header">
                            <span className="group-tag tag-amber">🟡 On-Track (0.40-0.70)</span>
                            <span className="group-count">{groups.on_track.length}</span>
                          </div>
                          <div className="group-students-list">
                            {groups.on_track.length === 0 ? (
                              <span className="no-students-text">Zero students in this band</span>
                            ) : (
                              groups.on_track.map((st) => (
                                <button
                                  key={st.id}
                                  type="button"
                                  className="group-student-chip"
                                  onClick={() => setSelectedStudentId(st.id)}
                                >
                                  {st.avatar || '🎓'} {st.name}
                                </button>
                              ))
                            )}
                          </div>
                        </div>

                        {/* Advanced */}
                        <div className="group-col group-col-advanced">
                          <div className="group-col-header">
                            <span className="group-tag tag-green">🟢 Advanced (&gt;0.70)</span>
                            <span className="group-count">{groups.advanced.length}</span>
                          </div>
                          <div className="group-students-list">
                            {groups.advanced.length === 0 ? (
                              <span className="no-students-text">Zero students in this band</span>
                            ) : (
                              groups.advanced.map((st) => (
                                <button
                                  key={st.id}
                                  type="button"
                                  className="group-student-chip"
                                  onClick={() => setSelectedStudentId(st.id)}
                                >
                                  {st.avatar || '🎓'} {st.name}
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Not Enough Data Pill Row */}
                      {groups.not_enough_data.length > 0 && (
                        <div className="groups-nodata-row">
                          <span className="nodata-label">⚪ Not Enough Data (&lt;2 attempts):</span>
                          {groups.not_enough_data.map((st) => (
                            <span key={st.id} className="nodata-chip">
                              {st.avatar || '🎓'} {st.name}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Real Action Card from teacherActivities.json */}
                      {activity && (
                        <div className="teacher-action-card">
                          <div className="action-card-header">
                            <span className="action-card-badge">⚡ 10-MINUTE NO-DEVICE CLASSROOM ACTION</span>
                            <h4>{activity.activities[0]?.title[lang] || activity.activities[0]?.title.en}</h4>
                            <span className="action-context-tag">Context: {activity.activities[0]?.context[lang] || activity.activities[0]?.context.en}</span>
                          </div>

                          <div className="action-card-grid">
                            <div className="action-card-box">
                              <span className="box-sub">📦 Materials</span>
                              <p>{activity.activities[0]?.materials[lang] || activity.activities[0]?.materials.en}</p>
                            </div>
                            <div className="action-card-box">
                              <span className="box-sub">💡 Teacher's Pro Tip</span>
                              <p>{activity.teachingTip[lang] || activity.teachingTip.en}</p>
                            </div>
                          </div>

                          <div className="action-instructions-box">
                            <span className="box-sub">📋 Step-by-Step Instructions</span>
                            <ol>
                              {(activity.activities[0]?.instructions[lang] || activity.activities[0]?.instructions.en || []).map((step, idx) => (
                                <li key={idx}>{step}</li>
                              ))}
                            </ol>
                          </div>

                          <div className="action-misconception-footer">
                            <strong>⚠️ Misconception Watch: </strong>
                            <span>{activity.misconceptionNote[lang] || activity.misconceptionNote.en}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* ====================================================================
                TAB 5: TESTS & ASSIGNMENTS (PART B)
                ==================================================================== */}
            {activeTab === 'tests' && (
              <div className="tab-pane-content">
                {selectedAssignmentId ? (
                  (() => {
                    const selectedAssn = assignments.find((a) => a.id === selectedAssignmentId)
                    const relevantSubs = assignmentSubmissions.filter(
                      (s) => s.assignmentId === selectedAssignmentId,
                    )
                    if (!selectedAssn) {
                      return (
                        <div>
                          <button
                            type="button"
                            className="btn-back-link"
                            onClick={() => setSelectedAssignmentId(null)}
                          >
                            ← Back to Assignments
                          </button>
                          <p>Assignment not found.</p>
                        </div>
                      )
                    }
                    return (
                      <AssignmentResultsView
                        assignment={selectedAssn}
                        submissions={relevantSubs}
                        totalEnrolled={students.length}
                        lang={lang}
                        onCloseAssignment={async (assnId) => {
                          if (!session) return
                          await closeAssignment(session.classCode, session.pin, assnId)
                          setAssignments((prev) =>
                            prev.map((a) => (a.id === assnId ? { ...a, isClosed: true } : a)),
                          )
                        }}
                        onBack={() => setSelectedAssignmentId(null)}
                      />
                    )
                  })()
                ) : (
                  <div className="teacher-assignments-container">
                    <div className="assignments-top-bar">
                      <div>
                        <h4 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>
                          {lang === 'hi' ? 'कक्षा टेस्ट एवं असाइनमेंट' : 'Class Tests & Assignments'}
                        </h4>
                        <span className="section-subtext">
                          {lang === 'hi'
                            ? 'कमजोर अवधारणाओं से ऑटो-पिक प्रश्न, स्वयं के कस्टम प्रश्न, टेस्ट टाइमर और स्वचालित मूल्यांकन।'
                            : 'Create adaptive diagnostic tests, inspect live submission scores, and uncover distractor misconceptions.'}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn-create-test-trigger"
                        onClick={() => setIsCreateTestWizardOpen(true)}
                      >
                        ✨ {lang === 'hi' ? 'नया टेस्ट बनाएं' : 'Create New Test'}
                      </button>
                    </div>

                    {assignments.length === 0 ? (
                      <div className="teacher-empty-state" style={{ marginTop: '2rem' }}>
                        <span className="empty-symbol">📝</span>
                        <h4>{lang === 'hi' ? 'अभी कोई टेस्ट नहीं बनाया गया है' : 'No tests created yet'}</h4>
                        <p>
                          {lang === 'hi'
                            ? 'कमजोर अवधारणाओं के आधार पर कक्षा के लिए पहला टेस्ट बनाएं।'
                            : 'Create your first class diagnostic test to assess students on their weakest concepts.'}
                        </p>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => setIsCreateTestWizardOpen(true)}
                          style={{ marginTop: '1rem' }}
                        >
                          ✨ Create First Test
                        </button>
                      </div>
                    ) : (
                      <div className="assignments-cards-grid">
                        {assignments.map((assn) => {
                          const subs = assignmentSubmissions.filter((s) => s.assignmentId === assn.id)
                          const totalQ = (assn.questionIds?.length || 0) + (assn.customQuestions?.length || 0)
                          const avgScore =
                            subs.length > 0
                              ? Math.round(subs.reduce((acc, s) => acc + s.score, 0) / subs.length)
                              : 0

                          return (
                            <div
                              key={assn.id}
                              className={`assignment-card-item ${assn.isClosed ? 'assn-closed' : 'assn-active'}`}
                              onClick={() => setSelectedAssignmentId(assn.id)}
                            >
                              <div className="assn-card-top">
                                <span className={`status-pill ${assn.isClosed ? 'pill-closed' : 'pill-active'}`}>
                                  {assn.isClosed ? 'Closed' : 'Active'}
                                </span>
                                {assn.dueDate && (
                                  <span className="assn-due-pill">
                                    Due: {new Date(assn.dueDate).toLocaleDateString()}
                                  </span>
                                )}
                              </div>

                              <h4 className="assn-card-title">{assn.title}</h4>
                              {assn.description && (
                                <p className="assn-card-desc">{assn.description}</p>
                              )}

                              <div className="assn-card-meta">
                                <span>📝 {totalQ} questions</span>
                                <span>⏱️ {assn.timeLimitMinutes ? `${assn.timeLimitMinutes} mins` : 'Untimed'}</span>
                              </div>

                              <div className="assn-card-footer">
                                <div className="assn-subs-progress">
                                  <span>Submissions: <strong>{subs.length} / {students.length}</strong></span>
                                  {subs.length > 0 && (
                                    <span className="assn-avg-badge">Avg: {avgScore}%</span>
                                  )}
                                </div>
                                <span className="assn-view-link">View Results →</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ====================================================================
                TAB 6: DOUBTS & ANNOUNCEMENTS (FULL INBOX & COMPOSER)
                ==================================================================== */}
            {activeTab === 'doubts' && (
              <div className="tab-pane-content doubts-tab-pane">
                {doubtActionError && (
                  <div className="teacher-login-error" style={{ marginBottom: '1rem' }}>
                    ⚠️ {doubtActionError}
                  </div>
                )}

                {/* Top Control Bar: Filters & Announcement Toggle */}
                <div className="teacher-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.2rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                      {lang === 'hi' ? 'फ़िल्टर:' : 'Filter:'}
                    </span>
                    {(['all', 'open', 'answered', 'resolved'] as const).map((f) => {
                      const count =
                        f === 'all'
                          ? classDoubts.length
                          : classDoubts.filter((d) => d.status === f).length
                      return (
                        <button
                          key={f}
                          type="button"
                          className={`btn btn-sm ${doubtFilter === f ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() => setDoubtFilter(f)}
                          style={{ textTransform: 'capitalize' }}
                        >
                          {f === 'all' ? (lang === 'hi' ? 'सभी' : 'All') : f} ({count})
                        </button>
                      )
                    })}
                  </div>

                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setIsAnnouncementComposerOpen((prev) => !prev)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                  >
                    📢 {isAnnouncementComposerOpen
                      ? (lang === 'hi' ? 'घोषणा छुपाएं' : 'Hide Composer')
                      : (lang === 'hi' ? 'कक्षा घोषणा लिखें' : 'Broadcast Announcement')}
                  </button>
                </div>

                {/* Announcement Composer Dropdown / Drawer */}
                <AnimatePresence>
                  {isAnnouncementComposerOpen && (
                    <motion.div
                      className="teacher-announcement-composer-card"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      style={{
                        background: 'linear-gradient(135deg, rgba(110, 231, 255, 0.08), rgba(76, 201, 176, 0.04))',
                        border: '1px solid rgba(110, 231, 255, 0.3)',
                        borderRadius: '10px',
                        padding: '1.2rem',
                        marginBottom: '1.5rem',
                        overflow: 'hidden',
                      }}
                    >
                      <h4 style={{ margin: '0 0 0.8rem 0', fontSize: '1rem', color: '#6ee7ff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        📢 {lang === 'hi' ? 'पूरी कक्षा के लिए नई घोषणा लिखें' : 'Broadcast New Class Announcement'}
                      </h4>

                      {announcementMsg && (
                        <div style={{ color: '#4cc9b0', fontSize: '0.85rem', marginBottom: '0.8rem', fontWeight: 600 }}>
                          ✓ {announcementMsg}
                        </div>
                      )}

                      <form onSubmit={handlePostAnnouncement}>
                        <div className="entry-field" style={{ marginBottom: '0.8rem' }}>
                          <input
                            type="text"
                            placeholder={lang === 'hi' ? 'घोषणा का शीर्षक (उदा. कल की गणित परीक्षा)' : 'Announcement Title (e.g. Wednesday Test Notice)'}
                            value={announcementTitle}
                            onChange={(e) => setAnnouncementTitle(e.target.value)}
                            className="entry-input"
                            required
                          />
                        </div>
                        <div className="entry-field" style={{ marginBottom: '0.8rem' }}>
                          <textarea
                            rows={3}
                            placeholder={lang === 'hi' ? 'घोषणा का विवरण...' : 'Write message to all students in this class...'}
                            value={announcementContent}
                            onChange={(e) => setAnnouncementContent(e.target.value)}
                            className="entry-input"
                            style={{ resize: 'vertical' }}
                            required
                          />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setIsAnnouncementComposerOpen(false)}
                          >
                            {lang === 'hi' ? 'रद्द करें' : 'Cancel'}
                          </button>
                          <button
                            type="submit"
                            className="btn btn-primary btn-sm"
                            disabled={isPostingAnnouncement || !announcementTitle.trim() || !announcementContent.trim()}
                          >
                            {isPostingAnnouncement
                              ? lang === 'hi' ? 'भेजा जा रहा है...' : 'Broadcasting...'
                              : lang === 'hi' ? 'प्रसारित करें 📢' : 'Broadcast Announcement 📢'}
                          </button>
                        </div>
                      </form>

                      {classAnnouncements.length > 0 && (
                        <div style={{ marginTop: '1.2rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.8rem' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                            {lang === 'hi' ? 'हालिया घोषणाएं:' : 'Recent Announcements:'}
                          </span>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.4rem' }}>
                            {classAnnouncements.slice(0, 3).map((a) => (
                              <div key={a.id} style={{ fontSize: '0.85rem', color: 'var(--text-2)', background: 'rgba(0,0,0,0.15)', padding: '0.5rem 0.8rem', borderRadius: '6px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: 'var(--text-1)' }}>
                                  <span>{a.title}</span>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(a.createdAt).toLocaleDateString()}</span>
                                </div>
                                <div>{a.content}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Doubts List */}
                {(() => {
                  const filtered = classDoubts
                    .filter((d) => (doubtFilter === 'all' ? true : d.status === doubtFilter))
                    .sort((a, b) => {
                      if (a.status === 'open' && b.status !== 'open') return -1
                      if (a.status !== 'open' && b.status === 'open') return 1
                      if (a.status === 'open' && b.status === 'open') return a.createdAt - b.createdAt // Oldest open first
                      return b.updatedAt - a.updatedAt
                    })

                  if (filtered.length === 0) {
                    return (
                      <div className="teacher-empty-state-card" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
                        <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.8rem' }}>💬</span>
                        <h4 style={{ margin: '0 0 0.5rem 0' }}>
                          {lang === 'hi' ? 'कोई संदेह नहीं मिला' : 'No Student Doubts in this View'}
                        </h4>
                        <p style={{ color: 'var(--text-muted)', maxWidth: '440px', margin: '0 auto', fontSize: '0.9rem' }}>
                          {lang === 'hi'
                            ? `कक्षा ${session?.classCode} के लिए वर्तमान में कोई संदेह नहीं है। जब विद्यार्थी अभ्यास या टेस्ट के दौरान "शिक्षक से पूछें" दबाएंगे, वे यहाँ प्रश्न संदर्भ और सुझाई गई व्याख्या के साथ दिखाई देंगे।`
                            : `There are currently no inquiries in this view for class ${session?.classCode}. When students ask questions during practice or tests, their doubts will arrive here with full question context.`}
                        </p>
                      </div>
                    )
                  }

                  return (
                    <div className="teacher-doubts-list" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                      {filtered.map((doubt) => {
                        const replyDraft = replyTextMap[doubt.id] || ''
                        const replyLength = replyDraft.trim().length
                        const isReplyingValid = replyLength > 0 && replyLength <= 500

                        return (
                          <div
                            key={doubt.id}
                            className={`teacher-doubt-thread-card status-${doubt.status}`}
                            style={{
                              background: 'rgba(255, 255, 255, 0.03)',
                              border: `1px solid ${
                                doubt.status === 'open'
                                  ? 'rgba(255, 200, 98, 0.4)'
                                  : doubt.status === 'answered'
                                    ? 'rgba(110, 231, 255, 0.3)'
                                    : 'rgba(76, 201, 176, 0.2)'
                              }`,
                              borderRadius: '10px',
                              padding: '1.2rem',
                            }}
                          >
                            {/* Doubt Thread Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <span style={{ fontSize: '1.4rem' }}>{doubt.studentAvatar || '👤'}</span>
                                <div>
                                  <strong style={{ fontSize: '1rem', color: 'var(--text-1)' }}>
                                    {doubt.studentName || 'Student'}
                                  </strong>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                                    {new Date(doubt.createdAt).toLocaleString()}
                                  </span>
                                </div>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <span
                                  style={{
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    padding: '0.25rem 0.6rem',
                                    borderRadius: '12px',
                                    textTransform: 'uppercase',
                                    background:
                                      doubt.status === 'open'
                                        ? 'rgba(255, 200, 98, 0.2)'
                                        : doubt.status === 'answered'
                                          ? 'rgba(110, 231, 255, 0.2)'
                                          : 'rgba(76, 201, 176, 0.2)',
                                    color:
                                      doubt.status === 'open'
                                        ? '#ffc862'
                                        : doubt.status === 'answered'
                                          ? '#6ee7ff'
                                          : '#4cc9b0',
                                    border: `1px solid ${
                                      doubt.status === 'open'
                                        ? '#ffc862'
                                        : doubt.status === 'answered'
                                          ? '#6ee7ff'
                                          : '#4cc9b0'
                                    }`,
                                  }}
                                >
                                  {doubt.status === 'open' && '⏳ Open / Needs Reply'}
                                  {doubt.status === 'answered' && '💬 Answered'}
                                  {doubt.status === 'resolved' && '✓ Resolved'}
                                </span>

                                {doubt.status !== 'resolved' ? (
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => handleSetDoubtStatus(doubt.id, 'resolved')}
                                    title="Mark this doubt as resolved"
                                  >
                                    ✓ {lang === 'hi' ? 'हल हुआ चिह्नित करें' : 'Mark Resolved'}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => handleSetDoubtStatus(doubt.id, 'open')}
                                    title="Reopen doubt"
                                  >
                                    ↺ {lang === 'hi' ? 'पुनः खोलें' : 'Reopen'}
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Attached Question Snapshot & Misconception Match Tag */}
                            {(doubt.questionTitle || doubt.misconceptionTag) && (
                              <div
                                style={{
                                  background: 'rgba(0, 0, 0, 0.25)',
                                  border: '1px solid rgba(255, 255, 255, 0.08)',
                                  borderRadius: '8px',
                                  padding: '0.8rem 1rem',
                                  marginBottom: '1rem',
                                  fontSize: '0.9rem',
                                }}
                              >
                                {doubt.questionTitle && (
                                  <div>
                                    <span style={{ color: 'var(--c2, #ffc862)', fontWeight: 700, fontSize: '0.8rem' }}>
                                      📎 Attached Question:
                                    </span>
                                    <div style={{ fontWeight: 600, color: 'var(--text-1)', marginTop: '0.2rem' }}>
                                      {doubt.questionTitle}
                                    </div>
                                  </div>
                                )}
                                {doubt.studentAnswer && (
                                  <div style={{ marginTop: '0.3rem', fontSize: '0.85rem' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Student chose: </span>
                                    <strong style={{ color: '#ff5470' }}>{doubt.studentAnswer}</strong>
                                  </div>
                                )}
                                {doubt.misconceptionTag && (
                                  <div style={{ marginTop: '0.4rem' }}>
                                    <span
                                      className="tag-misconception"
                                      style={{
                                        fontSize: '0.75rem',
                                        padding: '0.2rem 0.5rem',
                                        background: 'rgba(255, 84, 112, 0.15)',
                                        border: '1px solid rgba(255, 84, 112, 0.4)',
                                        color: '#ff5470',
                                        borderRadius: '4px',
                                      }}
                                    >
                                      💡 Misconception Pattern: <strong>{doubt.misconceptionTag}</strong>
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Chronological Messages Conversation */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1rem' }}>
                              {doubt.messages.map((m) => {
                                const isTeacher = m.senderType === 'teacher'
                                return (
                                  <div
                                    key={m.id}
                                    style={{
                                      alignSelf: isTeacher ? 'flex-end' : 'flex-start',
                                      maxWidth: '85%',
                                      background: isTeacher
                                        ? 'rgba(110, 231, 255, 0.12)'
                                        : 'rgba(255, 255, 255, 0.06)',
                                      border: `1px solid ${
                                        isTeacher ? 'rgba(110, 231, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)'
                                      }`,
                                      borderRadius: isTeacher ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                                      padding: '0.7rem 0.9rem',
                                    }}
                                  >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '0.2rem' }}>
                                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: isTeacher ? '#6ee7ff' : '#ffc862' }}>
                                        {isTeacher ? '🎓 You (Teacher)' : m.senderName}
                                      </span>
                                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                        {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                    </div>
                                    <div style={{ fontSize: '0.9rem', color: 'var(--text-1)', lineHeight: 1.4 }}>
                                      {m.content}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.3rem', gap: '0.4rem' }}>
                                      {m.flagged ? (
                                        <span style={{ fontSize: '0.7rem', color: '#ff5470', fontWeight: 600 }}>
                                          ⚠️ Flagged for safety review
                                        </span>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => handleFlagMessage(m.id)}
                                          style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: 'var(--text-muted)',
                                            fontSize: '0.7rem',
                                            cursor: 'pointer',
                                            padding: 0,
                                          }}
                                          title="Flag inappropriate message"
                                        >
                                          🚩 Flag
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>

                            {/* Reply Box & Suggested Explanation Button */}
                            {doubt.status !== 'resolved' && (
                              <div
                                style={{
                                  background: 'rgba(0, 0, 0, 0.2)',
                                  borderRadius: '8px',
                                  padding: '0.8rem',
                                  border: '1px solid rgba(255, 255, 255, 0.06)',
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                                    onClick={() => handleSuggestedExplanation(doubt)}
                                  >
                                    💡 {lang === 'hi' ? 'सुझाई गई व्याख्या जोड़ें' : 'Prefill Suggested Explanation'}
                                  </button>
                                  <span style={{ fontSize: '0.75rem', color: replyLength > 500 ? '#ff5470' : 'var(--text-muted)' }}>
                                    {replyLength} / 500
                                  </span>
                                </div>

                                <textarea
                                  rows={2}
                                  maxLength={520}
                                  placeholder={lang === 'hi' ? 'विद्यार्थी को उत्तर लिखें...' : 'Type response to student...'}
                                  value={replyDraft}
                                  onChange={(e) =>
                                    setReplyTextMap((prev) => ({ ...prev, [doubt.id]: e.target.value }))
                                  }
                                  className="entry-input"
                                  style={{ resize: 'vertical', width: '100%', marginBottom: '0.5rem' }}
                                  disabled={isSubmittingReply}
                                />

                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                  <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={() => handleReplyToDoubt(doubt.id)}
                                    disabled={!isReplyingValid || isSubmittingReply}
                                  >
                                    {isSubmittingReply
                                      ? lang === 'hi' ? 'भेजा जा रहा है...' : 'Sending...'
                                      : lang === 'hi' ? 'उत्तर भेजें ✉️' : 'Reply ✉️'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* ====================================================================
                TAB 7: MISCONCEPTIONS (EXISTING FULL BOARD)
                ==================================================================== */}
            {activeTab === 'misconceptions' && (
              <div className="tab-pane-content">
                {/* Threshold Alert Status Banner */}
                <div className="teacher-alert-banner">
                  {isClassAlertActive ? (
                    <div className="alert-box alert-box-active">
                      <span className="alert-icon">⚠️</span>
                      <div>
                        <strong>{lang === 'hi' ? 'कक्षा-स्तरीय चेतावनी सक्रिय' : 'Class-Level Remediation Alert Active'}</strong>
                        <p>
                          {lang === 'hi'
                            ? `इस कक्षा में कम से कम 3 अलग-अलग छात्रों और 5 त्रुटि घटनाओं का पता चला है। तत्काल सामूहिक समाधान की अनुशंसा की जाती है।`
                            : `At least 3 distinct students AND 5 events detected across this cohort. Recommended for whole-class concept remediation.`}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="alert-box alert-box-monitoring">
                      <span className="alert-icon">🛡️</span>
                      <div>
                        <strong>{lang === 'hi' ? 'सीमा निगरानी (Monitoring Threshold)' : 'Monitoring Alert Threshold'}</strong>
                        <p>
                          {lang === 'hi'
                            ? `अलर्ट नियम: कक्षा-स्तरीय अलर्ट केवल तभी ट्रिगर होता है जब कम से कम 3 अलग-अलग छात्र AND कम से कम 5 घटनाएं दर्ज हों।`
                            : `Strict rule: Class alert triggers only when at least 3 distinct students AND at least 5 events occur for a pattern.`}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {miscSummaries.length === 0 ? (
                  <div className="teacher-empty-state">
                    <span className="empty-symbol">📋</span>
                    <h4>
                      {lang === 'hi' ? `कक्षा "${session.classCode}" के लिए कोई त्रुटि डेटा नहीं मिला` : `No misconception data found for class "${session.classCode}"`}
                    </h4>
                    <p>
                      {lang === 'hi'
                        ? 'विद्यार्थी जब इस कक्षा कोड के साथ प्रश्नों का अभ्यास करेंगे, उनके वास्तविक विश्लेषित पैटर्न यहाँ रीयल-टाइम दिखाई देंगे।'
                        : 'When students enrolled under this class code practice and encounter tricky patterns, real synchronized events will appear here via Supabase.'}
                    </p>
                  </div>
                ) : (
                  <div className="teacher-board-layout">
                    <div className="teacher-cards-column">
                      <div className="teacher-cards-header">
                        <h4>
                          {lang === 'hi' ? 'पहचाने गए सोच के पैटर्न' : 'Identified Procedural Patterns'}
                          <span className="count-pill">{miscSummaries.length}</span>
                        </h4>
                        <span className="meta-sync-tag">⚡ Synced from Supabase RPC</span>
                      </div>

                      <div className="teacher-cards-list">
                        {miscSummaries.map((s) => {
                          const mObj = miscMap.get(s.misconception_id)
                          const isSelected = selectedMiscId === s.misconception_id

                          return (
                            <div
                              key={s.misconception_id}
                              className={`teacher-card-item ${isSelected ? 'selected' : ''} ${s.is_alert ? 'card-alert' : ''}`}
                              onClick={() => setSelectedMiscId(s.misconception_id)}
                            >
                              <div className="card-item-top">
                                <span className="card-misc-name">
                                  {mObj?.name[lang] || mObj?.name.en || s.misconception_id}
                                </span>
                                {s.is_alert && <span className="card-alert-badge">ALERT</span>}
                              </div>

                              <p className="card-misc-desc">
                                {mObj?.kidFriendlyExplanation[lang] || mObj?.kidFriendlyExplanation.en || ''}
                              </p>

                              <div className="card-item-stats">
                                <span className="stat-pill">👥 {s.distinct_students} students</span>
                                <span className="stat-pill">🔁 {s.total_events} events</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Detail Panel */}
                    <div className="teacher-detail-column">
                      {selectedMiscId && (() => {
                        const mObj = miscMap.get(selectedMiscId)
                        const summary = miscSummaries.find((s) => s.misconception_id === selectedMiscId)
                        const filteredDetails = miscDetails.filter((d) => d.misconception_id === selectedMiscId)

                        return (
                          <div className="teacher-detail-content">
                            <div className="detail-header">
                              <span className="detail-tag">DETAILED ANALYSIS</span>
                              <h3>{mObj?.name[lang] || mObj?.name.en || selectedMiscId}</h3>
                              <p className="detail-desc">{mObj?.description[lang] || mObj?.description.en}</p>
                            </div>

                            <div className="detail-section">
                              <h5>🧠 Why This Happens</h5>
                              <p className="detail-text">{mObj?.whyItHappens[lang] || mObj?.whyItHappens.en}</p>
                            </div>

                            {mObj?.miniLesson && mObj.miniLesson.length > 0 && (
                              <div className="detail-section">
                                <h5>📖 3-Step Remediation Mini Lesson</h5>
                                <div className="mini-lesson-steps">
                                  {mObj.miniLesson.map((step) => (
                                    <div key={step.step} className="mini-lesson-step">
                                      <span className="step-num">{step.step}</span>
                                      <span className="step-text">{step.text[lang] || step.text.en}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="detail-section">
                              <h5>👥 Affected Students ({summary?.distinct_students || 0})</h5>
                              <div className="affected-students-chips">
                                {filteredDetails.map((d) => (
                                  <button
                                    key={d.id}
                                    type="button"
                                    className="affected-student-btn"
                                    onClick={() => setSelectedStudentId(d.student_id)}
                                  >
                                    <span>{d.student_avatar || '🎓'}</span>
                                    <span>{d.student_name}</span>
                                    {d.student_confirmed && <span className="confirmed-dot" title="Student confirmed" />}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'ai-tutor' && (
              <TeacherAiTutorTab
                classCode={session.classCode}
                pin={session.pin}
                lang={lang}
              />
            )}
      </main>
    )
  }

  // ====================================================================
  // STUDENT DRAWER MODAL OVERLAY
  // ====================================================================
  const renderStudentDrawer = () => (
    <AnimatePresence>
      {drawerStudent && (
            <div className="student-drawer-backdrop" onClick={() => setSelectedStudentId(null)}>
              <motion.div
                className="student-drawer-container"
                initial={{ opacity: 0, x: 100 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 100 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="drawer-header">
                  <div className="drawer-student-info">
                    <span className="drawer-avatar">{drawerStudent.avatar || '🎓'}</span>
                    <div>
                      <h4>{drawerStudent.name}</h4>
                      <span className="drawer-meta">Grade {drawerStudent.grade || 8} • ID: {drawerStudent.id.slice(0, 8)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="drawer-close-btn"
                    onClick={() => setSelectedStudentId(null)}
                  >
                    ✕
                  </button>
                </div>

                <div className="drawer-scroll-body">
                  {/* Summary Bar */}
                  <div className="drawer-stats-row">
                    <div className="drawer-stat">
                      <span className="d-label">Study Time</span>
                      <span className="d-val">{drawerStudyTimeMins}m</span>
                    </div>
                    <div className="drawer-stat">
                      <span className="d-label">Questions</span>
                      <span className="d-val">{drawerAttempts.length}</span>
                    </div>
                    <div className="drawer-stat">
                      <span className="d-label">Accuracy</span>
                      <span className="d-val">{drawerAccuracyPct}%</span>
                    </div>
                    <div className="drawer-stat">
                      <span className="d-label">Active Gaps</span>
                      <span className="d-val text-accent-amber">{drawerGaps.filter((g) => !g.resolvedAt).length}</span>
                    </div>
                  </div>

                  {/* 7-Day Study Time Chart */}
                  <div className="drawer-card">
                    <h5>📅 Last 7 Days Study Time (Minutes)</h5>
                    <div className="drawer-bars-row">
                      {last7DaysBreakdown.map((day, idx) => (
                        <div key={idx} className="drawer-bar-col">
                          <div
                            className="drawer-bar-fill"
                            style={{ height: `${Math.min(100, Math.max(10, day.minutes * 4))}px` }}
                            title={`${day.minutes} mins`}
                          />
                          <span className="drawer-bar-label">{day.label}</span>
                          <span className="drawer-bar-min">{day.minutes}m</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Concept Mastery Bars */}
                  <div className="drawer-card">
                    <h5>📊 Concept Mastery Breakdown</h5>
                    <div className="drawer-mastery-list">
                      {allConcepts.map((c) => {
                        const m = computeStudentConceptMastery(drawerAttempts, c.id, drawerStudent.id)
                        if (m.status === 'no_data') return null
                        const score = m.score || 0
                        const pct = Math.round(score * 100)
                        const barColor = score >= 0.7 ? '#10b981' : score >= 0.4 ? '#f59e0b' : '#ef4444'

                        return (
                          <div key={c.id} className="drawer-mastery-item">
                            <div className="drawer-mastery-top">
                              <span className="dm-name">{c.name.en}</span>
                              <span className="dm-score" style={{ color: barColor }}>{pct}%</span>
                            </div>
                            <div className="dm-bar-bg">
                              <div className="dm-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Real Diagnostic Gap Reports */}
                  <div className="drawer-card">
                    <h5>🔍 Diagnostic Gap Reports ({drawerGaps.length})</h5>
                    {drawerGaps.length === 0 ? (
                      <p className="drawer-empty-note">✓ No diagnostic gaps discovered for this student.</p>
                    ) : (
                      <div className="drawer-gaps-list">
                        {drawerGaps.map((g) => {
                          const targetName = conceptMap.get(g.startConceptId)?.name.en || g.startConceptId
                          const rootName = g.rootCauseId ? conceptMap.get(g.rootCauseId)?.name.en || g.rootCauseId : 'Direct'
                          const isResolved = Boolean(g.resolvedAt)

                          return (
                            <div key={g.id} className={`drawer-gap-item ${isResolved ? 'gap-resolved' : 'gap-active'}`}>
                              <div className="d-gap-header">
                                <span className="d-gap-title">{targetName} → {rootName}</span>
                                <span className={`d-gap-badge ${isResolved ? 'badge-res' : 'badge-act'}`}>
                                  {isResolved ? 'RESOLVED' : 'ACTIVE GAP'}
                                </span>
                              </div>
                              <div className="d-gap-path">
                                Path: {g.path.map((p) => conceptMap.get(p.conceptId)?.name.en || p.conceptId).join(' ➔ ')}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Recent Attempts List */}
                  <div className="drawer-card">
                    <h5>📝 Recent Attempts ({drawerAttempts.length})</h5>
                    {drawerAttempts.length === 0 ? (
                      <p className="drawer-empty-note">No attempts recorded yet.</p>
                    ) : (
                      <div className="drawer-attempts-list">
                        {drawerAttempts.slice(0, 10).map((a) => {
                          const q = questionMap.get(a.questionId)
                          const prompt = q ? q.text.en : `Question #${a.questionId}`
                          const timeSec = Math.round(a.timeTakenMs / 1000)

                          return (
                            <div key={a.id} className={`drawer-attempt-item ${a.correct ? 'att-correct' : 'att-wrong'}`}>
                              <div className="d-att-header">
                                <span className="d-att-result">{a.correct ? '✓ Correct' : '✕ Incorrect'}</span>
                                <span className="d-att-time">{timeSec}s • {new Date(a.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                              <p className="d-att-prompt">{prompt}</p>
                              <div className="d-att-meta">
                                {a.confidence && <span className="d-att-pill">Confidence: {a.confidence}</span>}
                                {a.mistakeTag && <span className="d-att-pill pill-tag">Tag: {a.mistakeTag}</span>}
                                {a.hintsUsed > 0 && <span className="d-att-pill">Hints: {a.hintsUsed}</span>}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Misconception Events */}
                  {drawerMiscs.length > 0 && (
                    <div className="drawer-card">
                      <h5>🧩 Misconception Events ({drawerMiscs.length})</h5>
                      <div className="drawer-miscs-list">
                        {drawerMiscs.map((m) => (
                          <div key={m.id} className="drawer-misc-item">
                            <span className="d-misc-name">{miscMap.get(m.misconception_id)?.name.en || m.misconception_id}</span>
                            <span className="d-misc-status">
                              {m.student_confirmed ? '✓ Confirmed by Student' : 'Detected via Rule'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
  )

  const renderTestWizard = () => (
    session && isCreateTestWizardOpen ? (
      <CreateTestWizardModal
        isOpen={isCreateTestWizardOpen}
        onClose={() => setIsCreateTestWizardOpen(false)}
        lang={lang}
        classCode={session.classCode}
        weakestConcepts={classInsights.weakestConcepts}
        onCreateAssignment={async (data) => {
          const res = await createAssignment(session.classCode, session.pin, data)
          setAssignments((prev) => [res, ...prev])
          return res
        }}
      />
    ) : null
  )

  if (isFullPage) {
    if (!session) {
      return (
        <div className="teacher-workspace-page">
          <div className="teacher-fullpage-entry-wrap">
            <header className="teacher-entry-topbar">
              <button type="button" className="btn-back-link" onClick={onClose}>
                ← {lang === 'hi' ? 'मुख्य पृष्ठ पर वापस' : 'Back to Home'}
              </button>
              <span className="teacher-header-badge">🏫 TEACHER DASHBOARD</span>
            </header>
            {renderEntryView()}
          </div>
        </div>
      )
    }

    return (
      <div className="teacher-workspace-layout">
        {renderDesktopSidebar()}
        <div className="teacher-main-pane">
          {renderMobileTopBar()}
          {renderTabBody()}
        </div>
        {renderStudentDrawer()}
        {renderTestWizard()}
      </div>
    )
  }

  // Legacy Modal Mode (!isFullPage)
  return (
    <div className="solve-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <motion.div
        className="solve-modal-container teacher-dashboard-modal"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="solve-modal-header teacher-desktop-header">
          <div className="solve-modal-title-group">
            <span className="teacher-header-badge">🏫 TEACHER DASHBOARD</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>
                {session ? (
                  <>
                    <span className="class-code-highlight">{session.classCode}</span>
                    <span className="teacher-name-sub"> • {session.teacherName}</span>
                  </>
                ) : (
                  lang === 'hi' ? 'शिक्षक प्रवेश एवं कक्षा नियंत्रण' : 'Teacher Access & Class Control'
                )}
              </h3>

              {session && (
                <button
                  type="button"
                  className="chip chip-copy-code"
                  onClick={() => handleCopyCode(session.classCode)}
                  title="Copy Class Code"
                >
                  {copiedCode ? '✓ Copied' : '📋 Copy Code'}
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {session && (
              <>
                <button
                  type="button"
                  className="chip chip-refresh"
                  onClick={() => loadClassData(session.classCode, session.pin)}
                  disabled={loading}
                  title="Refresh synced class data"
                >
                  🔄 {loading ? (lang === 'hi' ? 'लोड हो रहा...' : 'Syncing...') : (lang === 'hi' ? 'ताज़ा करें' : 'Refresh')}
                </button>
                <button
                  type="button"
                  className="chip chip-logout"
                  onClick={handleLogout}
                  title="Log out from this class"
                >
                  🚪 {lang === 'hi' ? 'लॉगआउट' : 'Log out'}
                </button>
              </>
            )}
            <button
              type="button"
              className="solve-modal-close"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </header>

        {!session && renderEntryView()}
        {session && renderTabBody()}
        {renderStudentDrawer()}
        {renderTestWizard()}
      </motion.div>
    </div>
  )
}
