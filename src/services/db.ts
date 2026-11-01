import Dexie, { type Table } from 'dexie'
import type {
  Student,
  Session,
  Attempt,
  GapReport,
  MisconceptionEvent,
  Assignment,
  AssignmentSubmission,
  Doubt,
  DoubtMessage,
  Announcement,
} from '../types'

export type SyncTable =
  | 'students'
  | 'sessions'
  | 'attempts'
  | 'gap_reports'
  | 'misconception_events'

export interface SyncOutboxItem {
  id: string
  table: SyncTable
  action: 'UPSERT'
  payload: Record<string, unknown>
  retryCount: number
  lastError?: string
  timestamp: number
}

export class PacePathDB extends Dexie {
  students!: Table<Student, string>
  sessions!: Table<Session, string>
  attempts!: Table<Attempt, string>
  gapReports!: Table<GapReport, string>
  misconceptionEvents!: Table<MisconceptionEvent, string>
  syncOutbox!: Table<SyncOutboxItem, string>
  assignments!: Table<Assignment, string>
  assignmentSubmissions!: Table<AssignmentSubmission, string>
  doubts!: Table<Doubt, string>
  doubtMessages!: Table<DoubtMessage, string>
  announcements!: Table<Announcement, string>

  constructor() {
    super('PacePathDB')
    this.version(1).stores({
      students: 'id, name, grade, createdAt',
      sessions: 'id, studentId, startTime, endTime',
      attempts: 'id, studentId, sessionId, questionId, conceptId, correct, timestamp',
    })
    this.version(2).stores({
      students: 'id, name, grade, createdAt',
      sessions: 'id, studentId, startTime, endTime',
      attempts: 'id, studentId, sessionId, questionId, conceptId, correct, timestamp',
      gapReports: 'id, studentId, startConceptId, rootCauseId, createdAt, resolvedAt',
    })
    this.version(3).stores({
      students: 'id, name, grade, createdAt',
      sessions: 'id, studentId, startTime, endTime',
      attempts: 'id, studentId, sessionId, questionId, conceptId, correct, timestamp',
      gapReports: 'id, studentId, startConceptId, rootCauseId, createdAt, resolvedAt',
      misconceptionEvents: 'id, studentId, misconceptionId, questionId, attemptId, createdAt',
    })
    this.version(4).stores({
      students: 'id, name, grade, createdAt, classCode',
      sessions: 'id, studentId, startTime, endTime',
      attempts: 'id, studentId, sessionId, questionId, conceptId, correct, timestamp',
      gapReports: 'id, studentId, targetConceptId, rootCauseConceptId, createdAt, status',
      misconceptionEvents: 'id, studentId, misconceptionId, questionId, attemptId, createdAt',
      syncOutbox: 'id, table, timestamp, retryCount',
    })
    this.version(5).stores({
      students: 'id, name, grade, createdAt, classCode',
      sessions: 'id, studentId, startTime, endTime',
      attempts: 'id, studentId, sessionId, questionId, conceptId, correct, timestamp, assignmentId',
      gapReports: 'id, studentId, targetConceptId, rootCauseConceptId, createdAt, status',
      misconceptionEvents: 'id, studentId, misconceptionId, questionId, attemptId, createdAt',
      syncOutbox: 'id, table, timestamp, retryCount',
      assignments: 'id, classCode, isClosed, createdAt',
      assignmentSubmissions: 'id, assignmentId, studentId, classCode, isLate, submittedAt',
    })
    this.version(6).stores({
      students: 'id, name, grade, createdAt, classCode',
      sessions: 'id, studentId, startTime, endTime',
      attempts: 'id, studentId, sessionId, questionId, conceptId, correct, timestamp, assignmentId',
      gapReports: 'id, studentId, targetConceptId, rootCauseConceptId, createdAt, status',
      misconceptionEvents: 'id, studentId, misconceptionId, questionId, attemptId, createdAt',
      syncOutbox: 'id, table, timestamp, retryCount',
      assignments: 'id, classCode, isClosed, createdAt',
      assignmentSubmissions: 'id, assignmentId, studentId, classCode, isLate, submittedAt',
      doubts: 'id, classCode, studentId, status, updatedAt',
      doubtMessages: 'id, doubtId, senderType, senderId, createdAt, flagged',
      announcements: 'id, classCode, createdAt',
    })
  }
}

export const db = new PacePathDB()

/**
 * Checks if IndexedDB is supported and accessible in the current browser context.
 */
export async function isIndexedDBAvailable(): Promise<boolean> {
  try {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return false
    }
    await db.open()
    return true
  } catch (err) {
    console.warn('IndexedDB is not available or blocked in this environment:', err)
    return false
  }
}
