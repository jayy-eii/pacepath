import { db, isIndexedDBAvailable } from './db'
import type {
  Student,
  Session,
  Attempt,
  SessionSummary,
  ConceptAccuracy,
  Concept,
  GapReport,
  MisconceptionEvent,
  Assignment,
  AssignmentSubmission,
} from '../types'
import { computeAllMastery, computeMastery } from '../engine/mastery'
import {
  generateUUID,
  studentToSnake,
  sessionToSnake,
  attemptToSnake,
  gapReportToSnake,
  misconceptionEventToSnake,
} from './syncMappers'
import { enqueueSync, memSyncOutbox } from './syncEngine'
import rawConcepts from '../data/concepts.json'

const concepts = rawConcepts as Concept[]
const conceptMap = new Map(concepts.map((c) => [c.id, c]))

const CURRENT_STUDENT_KEY = 'pacepath_current_student_id'
const ACTIVE_SESSION_KEY = 'pacepath_active_session_id'

// In-memory fallback if IndexedDB is blocked
export const memDb = {
  students: new Map<string, Student>(),
  sessions: new Map<string, Session>(),
  attempts: new Map<string, Attempt>(),
  gapReports: new Map<string, GapReport>(),
  misconceptionEvents: new Map<string, MisconceptionEvent>(),
  assignments: new Map<string, Assignment>(),
  assignmentSubmissions: new Map<string, AssignmentSubmission>(),
}

const inMemoryKeyValueStore = new Map<string, string>()

function safeGetStorage(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      const v = localStorage.getItem(key)
      if (v !== null && v !== undefined) return v
    }
  } catch {
    // Node environment / private mode fallback
  }
  return inMemoryKeyValueStore.get(key) ?? null
}

function safeSetStorage(key: string, val: string): void {
  inMemoryKeyValueStore.set(key, val)
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      localStorage.setItem(key, val)
    }
  } catch {
    // Node environment / private mode fallback
  }
}

function safeRemoveStorage(key: string): void {
  inMemoryKeyValueStore.delete(key)
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      localStorage.removeItem(key)
    }
  } catch {
    // Node environment / private mode fallback
  }
}

let isIdbSupported: boolean | null = null

export async function checkIdb(): Promise<boolean> {
  if (isIdbSupported === null) {
    isIdbSupported = await isIndexedDBAvailable()
  }
  return isIdbSupported
}

function generateId(): string {
  return generateUUID()
}

/**
 * Creates a new student and sets them as the current active student.
 */
export async function createStudent(input: {
  name: string
  grade: number
  avatar: string
  classCode?: string
}): Promise<Student> {
  const student: Student = {
    id: generateId(),
    name: input.name.trim(),
    grade: input.grade,
    avatar: input.avatar,
    classCode: input.classCode?.trim() || undefined,
    createdAt: Date.now(),
  }

  const supported = await checkIdb()
  if (supported) {
    await db.students.put(student)
  } else {
    memDb.students.set(student.id, student)
  }

  await setCurrentStudent(student.id)
  enqueueSync('students', studentToSnake(student))
  return student
}

/**
 * Gets the currently selected student, or null if no student exists.
 */
export async function getCurrentStudent(): Promise<Student | null> {
  const currentId = safeGetStorage(CURRENT_STUDENT_KEY)
  const supported = await checkIdb()

  if (currentId) {
    if (supported) {
      const student = await db.students.get(currentId)
      if (student) return student
    } else {
      const student = memDb.students.get(currentId)
      if (student) return student
    }
  }

  // Fallback: look for the most recently created student
  if (supported) {
    const allStudents = await db.students.orderBy('createdAt').reverse().toArray()
    if (allStudents.length > 0) {
      await setCurrentStudent(allStudents[0].id)
      return allStudents[0]
    }
  } else {
    const all = Array.from(memDb.students.values()).sort((a, b) => b.createdAt - a.createdAt)
    if (all.length > 0) {
      await setCurrentStudent(all[0].id)
      return all[0]
    }
  }

  return null
}

/**
 * Sets the active student ID in local storage.
 */
export async function setCurrentStudent(id: string): Promise<void> {
  safeSetStorage(CURRENT_STUDENT_KEY, id)
}

/**
 * Starts a new practice session for a student.
 */
export async function startSession(studentId: string): Promise<string> {
  const sessionId = generateId()
  const session: Session = {
    id: sessionId,
    studentId,
    startTime: Date.now(),
    endTime: null,
    activeSeconds: 0,
  }

  const supported = await checkIdb()
  if (supported) {
    await db.sessions.put(session)
  } else {
    memDb.sessions.set(session.id, session)
  }

  localStorage.setItem(ACTIVE_SESSION_KEY, sessionId)
  enqueueSync('sessions', sessionToSnake(session))
  return sessionId
}

/**
 * Updates the accumulated active time for an active session.
 */
export async function updateSessionActiveSeconds(sessionId: string, activeSeconds: number): Promise<void> {
  const supported = await checkIdb()
  let updatedSession: Session | undefined

  if (supported) {
    const existing = await db.sessions.get(sessionId)
    if (existing) {
      existing.activeSeconds = activeSeconds
      await db.sessions.update(sessionId, { activeSeconds })
      updatedSession = existing
    }
  } else {
    const existing = memDb.sessions.get(sessionId)
    if (existing) {
      existing.activeSeconds = activeSeconds
      updatedSession = existing
    }
  }

  if (updatedSession) {
    enqueueSync('sessions', sessionToSnake(updatedSession))
  }
}

/**
 * Ends a practice session and records final active seconds.
 */
export async function endSession(sessionId: string, finalActiveSeconds?: number): Promise<void> {
  const supported = await checkIdb()
  const now = Date.now()
  let updatedSession: Session | undefined

  if (supported) {
    const existing = await db.sessions.get(sessionId)
    if (existing) {
      existing.endTime = now
      existing.activeSeconds = finalActiveSeconds !== undefined ? finalActiveSeconds : existing.activeSeconds
      await db.sessions.update(sessionId, {
        endTime: now,
        activeSeconds: existing.activeSeconds,
      })
      updatedSession = existing
    }
  } else {
    const existing = memDb.sessions.get(sessionId)
    if (existing) {
      existing.endTime = now
      if (finalActiveSeconds !== undefined) {
        existing.activeSeconds = finalActiveSeconds
      }
      updatedSession = existing
    }
  }

  if (safeGetStorage(ACTIVE_SESSION_KEY) === sessionId) {
    safeRemoveStorage(ACTIVE_SESSION_KEY)
  }

  if (updatedSession) {
    enqueueSync('sessions', sessionToSnake(updatedSession))
  }
}

/**
 * Gets the current active session ID from localStorage, if any.
 */
export function getActiveSessionId(): string | null {
  return safeGetStorage(ACTIVE_SESSION_KEY)
}

/**
 * Saves a single question attempt with real time and tag data.
 */
export async function saveAttempt(attemptInput: Omit<Attempt, 'id'> | Attempt): Promise<Attempt> {
  const attempt: Attempt = {
    ...attemptInput,
    id: 'id' in attemptInput && attemptInput.id ? attemptInput.id : generateId(),
  }

  const supported = await checkIdb()
  if (supported) {
    await db.attempts.put(attempt)
  } else {
    memDb.attempts.set(attempt.id, attempt)
  }

  enqueueSync('attempts', attemptToSnake(attempt))
  return attempt
}

/**
 * Gets all attempts for a given student ID.
 */
export async function getAttemptsByStudent(studentId: string): Promise<Attempt[]> {
  const supported = await checkIdb()
  if (supported) {
    return await db.attempts.where('studentId').equals(studentId).sortBy('timestamp')
  }
  return Array.from(memDb.attempts.values())
    .filter((a) => a.studentId === studentId)
    .sort((a, b) => a.timestamp - b.timestamp)
}

/**
 * Gets all attempts for a given session ID.
 */
export async function getAttemptsBySession(sessionId: string): Promise<Attempt[]> {
  const supported = await checkIdb()
  if (supported) {
    return await db.attempts.where('sessionId').equals(sessionId).sortBy('timestamp')
  }
  return Array.from(memDb.attempts.values())
    .filter((a) => a.sessionId === sessionId)
    .sort((a, b) => a.timestamp - b.timestamp)
}

/**
 * Computes real summary statistics from actual saved attempts in this session.
 * NO FAKE OR HARDCODED NUMBERS.
 */
export async function getSessionSummary(sessionId: string): Promise<SessionSummary> {
  const supported = await checkIdb()
  let session: Session | undefined

  if (supported) {
    session = await db.sessions.get(sessionId)
  } else {
    session = memDb.sessions.get(sessionId)
  }

  const attempts = await getAttemptsBySession(sessionId)
  const totalQuestions = attempts.length
  const correctCount = attempts.filter((a) => a.correct).length
  const accuracyPct = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0
  const totalActiveSeconds = session?.activeSeconds ?? 0
  const misconceptionsCount = attempts.filter((a) => a.attemptType === 'misconception').length

  const studentId = session?.studentId || (attempts[0]?.studentId ?? '')

  // Compute mastery before this session vs after this session
  let masteryBefore: Record<string, number> = {}
  let masteryAfter: Record<string, number> = {}

  if (studentId) {
    const allStudentAttempts = await getAttemptsByStudent(studentId)
    const priorAttempts = allStudentAttempts.filter(
      (a) => a.sessionId !== sessionId && a.timestamp < (session?.startTime || Infinity),
    )
    const beforeMap = computeAllMastery(priorAttempts)
    const afterMap = computeAllMastery(allStudentAttempts)

    for (const [k, v] of Object.entries(beforeMap)) {
      masteryBefore[k] = v.score
    }
    for (const [k, v] of Object.entries(afterMap)) {
      masteryAfter[k] = v.score
    }
  }

  // Per-concept breakdown from real attempts
  const conceptGroups = new Map<string, Attempt[]>()
  for (const att of attempts) {
    const list = conceptGroups.get(att.conceptId) || []
    list.push(att)
    conceptGroups.set(att.conceptId, list)
  }

  const perConcept: ConceptAccuracy[] = []
  for (const [cId, cAttempts] of conceptGroups.entries()) {
    const cTotal = cAttempts.length
    const cCorrect = cAttempts.filter((a) => a.correct).length
    const cAccuracy = Math.round((cCorrect / cTotal) * 100)
    const conceptObj = conceptMap.get(cId)

    perConcept.push({
      conceptId: cId,
      conceptName: conceptObj?.name || { en: cId, hi: cId },
      total: cTotal,
      correct: cCorrect,
      accuracyPct: cAccuracy,
    })
  }

  // Sort per-concept by accuracy descending
  perConcept.sort((a, b) => b.accuracyPct - a.accuracyPct || b.correct - a.correct)

  let strongestConcept: ConceptAccuracy | null = null
  let needsPracticeConcept: ConceptAccuracy | null = null

  if (perConcept.length > 0) {
    strongestConcept = perConcept[0]

    // Find the concept with the lowest accuracy
    const lowest = perConcept[perConcept.length - 1]
    if (lowest.accuracyPct < 100) {
      needsPracticeConcept = lowest
    } else if (perConcept.length > 1 && lowest.accuracyPct < strongestConcept.accuracyPct) {
      needsPracticeConcept = lowest
    }
  }

  return {
    sessionId,
    studentId,
    totalQuestions,
    correctCount,
    accuracyPct,
    totalActiveSeconds,
    perConcept,
    strongestConcept,
    needsPracticeConcept,
    attempts,
    misconceptionsCount,
    masteryBefore,
    masteryAfter,
  }
}

/**
 * Dev helpers: Get all raw data to verify storage.
 */
export async function getAllStudents(): Promise<Student[]> {
  const supported = await checkIdb()
  if (supported) return await db.students.toArray()
  return Array.from(memDb.students.values())
}

export async function getAllSessions(): Promise<Session[]> {
  const supported = await checkIdb()
  if (supported) return await db.sessions.toArray()
  return Array.from(memDb.sessions.values())
}

export async function getAllAttempts(): Promise<Attempt[]> {
  const supported = await checkIdb()
  if (supported) return await db.attempts.toArray()
  return Array.from(memDb.attempts.values())
}

/**
 * Saves a gap report discovered during diagnostic tracing.
 */
export async function saveGapReport(reportInput: Omit<GapReport, 'id'> | GapReport): Promise<GapReport> {
  const report: GapReport = {
    ...reportInput,
    id: 'id' in reportInput && reportInput.id ? reportInput.id : generateId(),
  }

  const supported = await checkIdb()
  if (supported) {
    await db.gapReports.put(report)
  } else {
    memDb.gapReports.set(report.id, report)
  }

  enqueueSync('gap_reports', gapReportToSnake(report))
  return report
}

/**
 * Gets all gap reports for a student, ordered newest first.
 */
export async function getGapReportsByStudent(studentId: string): Promise<GapReport[]> {
  const supported = await checkIdb()
  if (supported) {
    return await db.gapReports.where('studentId').equals(studentId).reverse().sortBy('createdAt')
  }
  return Array.from(memDb.gapReports.values())
    .filter((g) => g.studentId === studentId)
    .sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * Marks a gap report as resolved with the current timestamp.
 */
export async function markGapResolved(gapId: string): Promise<void> {
  const supported = await checkIdb()
  let resolvedReport: GapReport | undefined

  const now = Date.now()
  if (supported) {
    const existing = await db.gapReports.get(gapId)
    if (existing) {
      existing.resolvedAt = now
      await db.gapReports.update(gapId, { resolvedAt: now })
      resolvedReport = existing
    }
  } else {
    const existing = memDb.gapReports.get(gapId)
    if (existing) {
      existing.resolvedAt = now
      resolvedReport = existing
    }
  }

  if (resolvedReport) {
    enqueueSync('gap_reports', gapReportToSnake(resolvedReport))
  }
}

/**
 * Checks all unresolved gap reports for a student and automatically resolves
 * any gap whose root-cause concept mastery has reached >= 0.70 from real attempts.
 */
export async function checkAndResolveGaps(studentId: string): Promise<GapReport[]> {
  const reports = await getGapReportsByStudent(studentId)
  const studentAttempts = await getAttemptsByStudent(studentId)

  for (const report of reports) {
    if (!report.resolvedAt && report.rootCauseId) {
      const mastery = computeMastery(studentAttempts, report.rootCauseId)
      // Resolved only when real mastery crosses 0.70
      if (mastery.score >= 0.7 && mastery.attemptsCount >= 2) {
        await markGapResolved(report.id)
        report.resolvedAt = Date.now()
      }
    }
  }

  return reports
}

export async function getAllGapReports(): Promise<GapReport[]> {
  const supported = await checkIdb()
  if (supported) return await db.gapReports.toArray()
  return Array.from(memDb.gapReports.values())
}

/**
 * Saves a detected misconception event (offline-first).
 */
export async function saveMisconceptionEvent(
  eventInput: Omit<MisconceptionEvent, 'id'> | MisconceptionEvent,
): Promise<MisconceptionEvent> {
  const event: MisconceptionEvent = {
    ...eventInput,
    id: 'id' in eventInput && eventInput.id ? eventInput.id : generateId(),
  }

  const supported = await checkIdb()
  if (supported) {
    await db.misconceptionEvents.put(event)
  } else {
    memDb.misconceptionEvents.set(event.id, event)
  }

  enqueueSync('misconception_events', misconceptionEventToSnake(event))
  return event
}

/**
 * Gets all misconception events for a student, ordered newest first.
 */
export async function getMisconceptionEventsByStudent(studentId: string): Promise<MisconceptionEvent[]> {
  const supported = await checkIdb()
  if (supported) {
    return await db.misconceptionEvents.where('studentId').equals(studentId).reverse().sortBy('createdAt')
  }
  return Array.from(memDb.misconceptionEvents.values())
    .filter((e) => e.studentId === studentId)
    .sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * Updates student confirmation ('Is this what you did?') on a misconception event.
 */
export async function updateMisconceptionConfirmation(
  eventId: string,
  confirmed: boolean | null,
): Promise<void> {
  const supported = await checkIdb()
  let updatedEvent: MisconceptionEvent | undefined

  if (supported) {
    const existing = await db.misconceptionEvents.get(eventId)
    if (existing) {
      existing.studentConfirmed = confirmed
      existing.source = confirmed === true ? 'student_confirmed' : existing.source
      await db.misconceptionEvents.update(eventId, {
        studentConfirmed: confirmed,
        source: existing.source,
      })
      updatedEvent = existing
    }
  } else {
    const existing = memDb.misconceptionEvents.get(eventId)
    if (existing) {
      existing.studentConfirmed = confirmed
      if (confirmed === true) existing.source = 'student_confirmed'
      updatedEvent = existing
    }
  }

  if (updatedEvent) {
    enqueueSync('misconception_events', misconceptionEventToSnake(updatedEvent))
  }
}

/**
 * Dev/teacher helper: Gets all recorded misconception events across all students.
 */
export async function getAllMisconceptionEvents(): Promise<MisconceptionEvent[]> {
  const supported = await checkIdb()
  if (supported) return await db.misconceptionEvents.toArray()
  return Array.from(memDb.misconceptionEvents.values())
}

/**
 * Clears all local data (IndexedDB and localStorage keys).
 */
export async function clearAllData(): Promise<void> {
  const supported = await checkIdb()
  if (supported) {
    await db.students.clear()
    await db.sessions.clear()
    await db.attempts.clear()
    await db.gapReports.clear()
    await db.misconceptionEvents.clear()
    await db.syncOutbox.clear()
  }
  memDb.students.clear()
  memDb.sessions.clear()
  memDb.attempts.clear()
  memDb.gapReports.clear()
  memDb.misconceptionEvents.clear()
  memSyncOutbox.clear()

  localStorage.removeItem(CURRENT_STUDENT_KEY)
  localStorage.removeItem(ACTIVE_SESSION_KEY)
  localStorage.removeItem('pacepath_active_session_state')
  localStorage.removeItem('pacepath_sync_outbox')
}
