import { describe, it, expect } from 'vitest'
import {
  studentToSnake,
  studentFromSnake,
  sessionToSnake,
  sessionFromSnake,
  attemptToSnake,
  attemptFromSnake,
  gapReportToSnake,
  gapReportFromSnake,
  misconceptionEventToSnake,
  misconceptionEventFromSnake,
  generateUUID,
} from './syncMappers'
import type { Student, Session, Attempt, GapReport, MisconceptionEvent } from '../types'

describe('Sync Mappers (camelCase <-> snake_case Round-Trip)', () => {
  it('generates valid RFC4122 v4 UUIDs', () => {
    const uuid = generateUUID()
    expect(uuid).toHaveLength(36)
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    expect(uuid).toMatch(uuidV4Regex)
  })

  it('correctly maps Student round-trip', () => {
    const student: Student = {
      id: generateUUID(),
      name: 'Aarav Patel',
      grade: 8,
      avatar: '🦁',
      classCode: 'MATH-7K2P',
      createdAt: 1700000000000,
    }

    const snake = studentToSnake(student)
    expect(snake.class_code).toBe('MATH-7K2P')
    expect(snake.created_at).toBe(1700000000000)

    const back = studentFromSnake(snake)
    expect(back).toEqual(student)
  })

  it('correctly maps Student without classCode', () => {
    const student: Student = {
      id: generateUUID(),
      name: 'Priya Sharma',
      grade: 7,
      avatar: '🦊',
      createdAt: 1700000000000,
    }

    const snake = studentToSnake(student)
    expect(snake.class_code).toBeNull()

    const back = studentFromSnake(snake)
    expect(back).toEqual(student)
  })

  it('correctly maps Session round-trip', () => {
    const session: Session = {
      id: generateUUID(),
      studentId: generateUUID(),
      startTime: 1700000000000,
      endTime: 1700000500000,
      activeSeconds: 480,
    }

    const snake = sessionToSnake(session)
    expect(snake.started_at).toBe(1700000000000)
    expect(snake.ended_at).toBe(1700000500000)
    expect(snake.active_seconds).toBe(480)

    const back = sessionFromSnake(snake)
    expect(back).toEqual(session)
  })

  it('correctly maps Attempt round-trip with all option and numeric fields', () => {
    const attempt: Attempt = {
      id: generateUUID(),
      studentId: generateUUID(),
      sessionId: generateUUID(),
      questionId: 'num01',
      conceptId: 'balancing-equations',
      correct: false,
      chosenIndex: 1,
      userAnswer: '10',
      mistakeTag: 'sign_error',
      hintsUsed: 2,
      timeTakenMs: 14200,
      confidence: 'sure',
      attemptType: 'misconception',
      timestamp: 1700001000000,
    }

    const snake = attemptToSnake(attempt)
    expect(snake.attempted_at).toBe(1700001000000)
    expect(snake.time_taken_ms).toBe(14200)
    expect(snake.attempt_type).toBe('misconception')
    expect(snake.mistake_tag).toBe('sign_error')

    const back = attemptFromSnake(snake)
    expect(back).toEqual(attempt)

    // Test backward compatibility when row has legacy "timestamp" instead of "attempted_at"
    const legacyRow = { ...snake }
    delete legacyRow.attempted_at
    legacyRow.timestamp = 1700001000000
    const fromLegacy = attemptFromSnake(legacyRow)
    expect(fromLegacy.timestamp).toBe(1700001000000)
  })

  it('correctly maps GapReport round-trip', () => {
    const report: GapReport = {
      id: generateUUID(),
      studentId: generateUUID(),
      startConceptId: 'linear-equations-distributive',
      rootCauseId: 'integers',
      confidence: 'high',
      triggerReason: 'consecutive_wrong',
      path: [
        { conceptId: 'integers', status: 'weak', mastery: 0.25, attemptsCount: 3 },
        { conceptId: 'basic-equations', status: 'solid', mastery: 0.85, attemptsCount: 4 },
      ],
      createdAt: 1700002000000,
      resolvedAt: null,
    }

    const snake = gapReportToSnake(report)
    expect(snake.start_concept_id).toBe('linear-equations-distributive')
    expect(snake.root_cause_id).toBe('integers')
    expect(Array.isArray(snake.prereq_chain)).toBe(true)

    const back = gapReportFromSnake(snake)
    expect(back).toEqual(report)
  })

  it('correctly maps MisconceptionEvent round-trip', () => {
    const event: MisconceptionEvent = {
      id: generateUUID(),
      studentId: generateUUID(),
      misconceptionId: 'sign_error_transposing',
      questionId: 'num01',
      attemptId: generateUUID(),
      confidence: 0.92,
      divergenceStep: 2,
      studentConfirmed: true,
      source: 'student_confirmed',
      createdAt: 1700003000000,
    }

    const snake = misconceptionEventToSnake(event)
    expect(snake.divergence_step).toBe(2)
    expect(snake.student_confirmed).toBe(true)

    const back = misconceptionEventFromSnake(snake)
    expect(back).toEqual(event)
  })
})
