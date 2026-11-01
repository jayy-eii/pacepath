/**
 * syncMappers.ts
 * Pure functions to map between client domain models (camelCase) and Postgres Supabase tables (snake_case).
 * Includes standard RFC4122 v4 UUID generator.
 */

import type { Student, Session, Attempt, GapReport, MisconceptionEvent } from '../types'

/**
 * Standard RFC4122 compliant UUID v4 generator.
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// 1. Student Mapper
export function studentToSnake(student: Student): Record<string, unknown> {
  return {
    id: student.id,
    name: student.name,
    grade: student.grade,
    avatar: student.avatar,
    class_code: student.classCode ? student.classCode.trim().toUpperCase() : null,
    created_at: student.createdAt,
  }
}

export function studentFromSnake(row: Record<string, unknown>): Student {
  return {
    id: String(row.id),
    name: String(row.name),
    grade: Number(row.grade),
    avatar: String(row.avatar),
    classCode: row.class_code ? String(row.class_code) : undefined,
    createdAt: Number(row.created_at),
  }
}

// 2. Session Mapper
export function sessionToSnake(session: Session): Record<string, unknown> {
  return {
    id: session.id,
    student_id: session.studentId,
    started_at: session.startTime,
    ended_at: session.endTime,
    active_seconds: session.activeSeconds,
  }
}

export function sessionFromSnake(row: Record<string, unknown>): Session {
  return {
    id: String(row.id),
    studentId: String(row.student_id),
    startTime: Number(row.started_at),
    endTime: row.ended_at !== null && row.ended_at !== undefined ? Number(row.ended_at) : null,
    activeSeconds: Number(row.active_seconds || 0),
  }
}

// 3. Attempt Mapper
export function attemptToSnake(attempt: Attempt): Record<string, unknown> {
  return {
    id: attempt.id,
    student_id: attempt.studentId,
    session_id: attempt.sessionId,
    question_id: attempt.questionId,
    concept_id: attempt.conceptId,
    correct: Boolean(attempt.correct),
    chosen_index: attempt.chosenIndex !== undefined && attempt.chosenIndex !== null ? attempt.chosenIndex : null,
    user_answer: attempt.userAnswer || null,
    mistake_tag: attempt.mistakeTag || null,
    hints_used: Number(attempt.hintsUsed || 0),
    time_taken_ms: Number(attempt.timeTakenMs),
    confidence: attempt.confidence,
    attempt_type: attempt.attemptType,
    attempted_at: attempt.timestamp,
  }
}

export function attemptFromSnake(row: Record<string, unknown>): Attempt {
  const ts =
    row.attempted_at !== undefined && row.attempted_at !== null
      ? Number(row.attempted_at)
      : Number(row.timestamp)

  return {
    id: String(row.id),
    studentId: String(row.student_id),
    sessionId: String(row.session_id),
    questionId: String(row.question_id),
    conceptId: String(row.concept_id),
    correct: Boolean(row.correct),
    chosenIndex: row.chosen_index !== null && row.chosen_index !== undefined ? Number(row.chosen_index) : -1,
    userAnswer: row.user_answer ? String(row.user_answer) : null,
    mistakeTag: row.mistake_tag ? (row.mistake_tag as Attempt['mistakeTag']) : null,
    hintsUsed: Number(row.hints_used || 0),
    timeTakenMs: Number(row.time_taken_ms),
    confidence: row.confidence as Attempt['confidence'],
    attemptType: row.attempt_type as Attempt['attemptType'],
    timestamp: ts,
  }
}

// 4. GapReport Mapper
export function gapReportToSnake(report: GapReport): Record<string, unknown> {
  const isResolved = Boolean(report.resolvedAt)
  const numericConf =
    report.confidence === 'high' ? 0.9 : report.confidence === 'medium' ? 0.6 : 0.3
  return {
    id: report.id,
    student_id: report.studentId,
    start_concept_id: report.startConceptId,
    target_concept_id: report.startConceptId,
    root_cause_id: report.rootCauseId,
    root_cause_concept_id: report.rootCauseId || '',
    confidence: numericConf,
    trigger_reason: report.triggerReason,
    prereq_chain: report.path.map((p) => p.conceptId),
    path: report.path,
    status: isResolved ? 'resolved' : 'active',
    resolved_at: report.resolvedAt ?? null,
    created_at: report.createdAt,
  }
}

export function gapReportFromSnake(row: Record<string, unknown>): GapReport {
  const rawConf = row.confidence
  let confidence: 'low' | 'medium' | 'high' = 'medium'
  if (rawConf === 'high' || rawConf === 'medium' || rawConf === 'low') {
    confidence = rawConf
  } else if (typeof rawConf === 'number' || !isNaN(Number(rawConf))) {
    const num = Number(rawConf)
    confidence = num >= 0.7 ? 'high' : num >= 0.4 ? 'medium' : 'low'
  }

  const path = Array.isArray(row.path)
    ? (row.path as GapReport['path'])
    : Array.isArray(row.prereq_chain)
      ? (row.prereq_chain as string[]).map((cid) => ({
          conceptId: cid,
          status: 'unknown' as const,
          mastery: null,
          attemptsCount: 0,
        }))
      : []

  const resolvedAt =
    row.resolved_at !== null && row.resolved_at !== undefined
      ? Number(row.resolved_at)
      : row.status === 'resolved'
        ? Number(row.created_at)
        : null

  return {
    id: String(row.id),
    studentId: String(row.student_id),
    startConceptId: String(row.start_concept_id || row.target_concept_id || ''),
    rootCauseId: row.root_cause_id
      ? String(row.root_cause_id)
      : row.root_cause_concept_id
        ? String(row.root_cause_concept_id)
        : null,
    path,
    confidence,
    triggerReason: (row.trigger_reason as GapReport['triggerReason']) || 'low_mastery',
    createdAt: Number(row.created_at),
    resolvedAt,
  }
}

// 5. MisconceptionEvent Mapper
export function misconceptionEventToSnake(event: MisconceptionEvent): Record<string, unknown> {
  return {
    id: event.id,
    student_id: event.studentId,
    misconception_id: event.misconceptionId,
    question_id: event.questionId,
    attempt_id: event.attemptId,
    confidence: Number(event.confidence),
    divergence_step: event.divergenceStep !== undefined && event.divergenceStep !== null ? event.divergenceStep : null,
    student_confirmed: event.studentConfirmed !== undefined && event.studentConfirmed !== null ? event.studentConfirmed : null,
    source: event.source,
    created_at: event.createdAt,
  }
}

export function misconceptionEventFromSnake(row: Record<string, unknown>): MisconceptionEvent {
  return {
    id: String(row.id),
    studentId: String(row.student_id),
    misconceptionId: String(row.misconception_id),
    questionId: String(row.question_id),
    attemptId: String(row.attempt_id),
    confidence: Number(row.confidence),
    divergenceStep: row.divergence_step !== null && row.divergence_step !== undefined ? Number(row.divergence_step) : undefined,
    studentConfirmed: row.student_confirmed !== null && row.student_confirmed !== undefined ? Boolean(row.student_confirmed) : null,
    source: row.source as MisconceptionEvent['source'],
    createdAt: Number(row.created_at),
  }
}
