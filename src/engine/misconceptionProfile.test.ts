import { describe, it, expect } from 'vitest'
import {
  computeProfile,
  generateIntervention,
  evaluateClassMisconceptionAlert,
  aggregateClassMisconceptions,
  isRecurringStatus,
} from './misconceptionProfile'
import { selectNextQuestion } from './selector'
import type { MisconceptionEvent, Attempt, Intervention } from '../types'

describe('Misconception Profile Engine & Transitions', () => {
  it('classifies single misconception event as "new"', () => {
    const events: MisconceptionEvent[] = [
      {
        id: 'ev1',
        studentId: 'stu1',
        misconceptionId: 'sign_error_transposing',
        questionId: 'q1',
        attemptId: 'att1',
        source: 'rule',
        confidence: 0.9,
        studentConfirmed: null,
        createdAt: 1000,
      },
    ]

    const attempts: Attempt[] = [
      {
        id: 'att1',
        studentId: 'stu1',
        sessionId: 'sess1',
        questionId: 'q1',
        conceptId: 'balancing-equations',
        correct: false,
        chosenIndex: 0,
        mistakeTag: 'sign_error',
        hintsUsed: 0,
        timeTakenMs: 15000,
        confidence: 'sure',
        attemptType: 'misconception',
        timestamp: 1000,
      },
    ]

    const profile = computeProfile(events, attempts)
    const entry = profile.entries['sign_error_transposing']
    expect(entry).toBeDefined()
    expect(entry.count).toBe(1)
    expect(entry.distinctSessions).toBe(1)
    expect(entry.status).toBe('new')
    expect(profile.recurringCount).toBe(0)
  })

  it('transitions to "recurring" when >= 3 events occur across >= 2 sessions', () => {
    const events: MisconceptionEvent[] = [
      {
        id: 'ev1',
        studentId: 'stu1',
        misconceptionId: 'sign_error_transposing',
        questionId: 'q1',
        attemptId: 'att1',
        source: 'rule',
        confidence: 0.9,
        studentConfirmed: null,
        createdAt: 1000,
      },
      {
        id: 'ev2',
        studentId: 'stu1',
        misconceptionId: 'sign_error_transposing',
        questionId: 'q2',
        attemptId: 'att2',
        source: 'rule',
        confidence: 0.9,
        studentConfirmed: null,
        createdAt: 2000,
      },
      {
        id: 'ev3',
        studentId: 'stu1',
        misconceptionId: 'sign_error_transposing',
        questionId: 'q3',
        attemptId: 'att3',
        source: 'rule',
        confidence: 0.9,
        studentConfirmed: null,
        createdAt: 5000,
      },
    ]

    const attempts: Attempt[] = [
      {
        id: 'att1',
        studentId: 'stu1',
        sessionId: 'sess1',
        questionId: 'q1',
        conceptId: 'balancing-equations',
        correct: false,
        chosenIndex: 0,
        mistakeTag: 'sign_error',
        hintsUsed: 0,
        timeTakenMs: 12000,
        confidence: 'sure',
        attemptType: 'misconception',
        timestamp: 1000,
      },
      {
        id: 'att2',
        studentId: 'stu1',
        sessionId: 'sess1',
        questionId: 'q2',
        conceptId: 'balancing-equations',
        correct: false,
        chosenIndex: 0,
        mistakeTag: 'sign_error',
        hintsUsed: 0,
        timeTakenMs: 14000,
        confidence: 'sure',
        attemptType: 'misconception',
        timestamp: 2000,
      },
      {
        id: 'att3',
        studentId: 'stu1',
        sessionId: 'sess2', // 2nd session
        questionId: 'q3',
        conceptId: 'balancing-equations',
        correct: false,
        chosenIndex: 0,
        mistakeTag: 'sign_error',
        hintsUsed: 0,
        timeTakenMs: 11000,
        confidence: 'sure',
        attemptType: 'misconception',
        timestamp: 5000,
      },
    ]

    const profile = computeProfile(events, attempts)
    const entry = profile.entries['sign_error_transposing']
    expect(entry.count).toBe(3)
    expect(entry.distinctSessions).toBe(2)
    expect(entry.status).toBe('recurring')
    expect(profile.recurringCount).toBe(1)
    expect(profile.topRecurringMisconceptionId).toBe('sign_error_transposing')
  })

  it('transitions to "improving" after 1-2 consecutive correct attempts', () => {
    const events: MisconceptionEvent[] = [
      {
        id: 'ev1',
        studentId: 'stu1',
        misconceptionId: 'fraction_add_denominators',
        questionId: 'q1',
        attemptId: 'att1',
        source: 'rule',
        confidence: 0.9,
        studentConfirmed: null,
        createdAt: 1000,
      },
    ]

    const attempts: Attempt[] = [
      {
        id: 'att1',
        studentId: 'stu1',
        sessionId: 'sess1',
        questionId: 'q1',
        conceptId: 'fractions-add',
        correct: false,
        chosenIndex: 0,
        mistakeTag: 'added_denominators',
        hintsUsed: 0,
        timeTakenMs: 10000,
        confidence: 'sure',
        attemptType: 'misconception',
        timestamp: 1000,
      },
      {
        id: 'att2',
        studentId: 'stu1',
        sessionId: 'sess1',
        questionId: 'q2',
        conceptId: 'fractions-add',
        correct: true, // 1st correct
        chosenIndex: 1,
        mistakeTag: null,
        hintsUsed: 0,
        timeTakenMs: 9000,
        confidence: 'sure',
        attemptType: 'confident_correct',
        timestamp: 2000,
      },
    ]

    const profile = computeProfile(events, attempts)
    const entry = profile.entries['fraction_add_denominators']
    expect(entry.status).toBe('improving')
    expect(entry.consecutiveCorrect).toBe(1)
  })

  it('transitions to "resolved" after 3 consecutive correct attempts in that concept', () => {
    const events: MisconceptionEvent[] = [
      {
        id: 'ev1',
        studentId: 'stu1',
        misconceptionId: 'fraction_add_denominators',
        questionId: 'q1',
        attemptId: 'att1',
        source: 'rule',
        confidence: 0.9,
        studentConfirmed: null,
        createdAt: 1000,
      },
    ]

    const attempts: Attempt[] = [
      {
        id: 'att1',
        studentId: 'stu1',
        sessionId: 'sess1',
        questionId: 'q1',
        conceptId: 'fractions-add',
        correct: false,
        chosenIndex: 0,
        mistakeTag: 'added_denominators',
        hintsUsed: 0,
        timeTakenMs: 10000,
        confidence: 'sure',
        attemptType: 'misconception',
        timestamp: 1000,
      },
      {
        id: 'att2',
        studentId: 'stu1',
        sessionId: 'sess1',
        questionId: 'q2',
        conceptId: 'fractions-add',
        correct: true,
        chosenIndex: 1,
        mistakeTag: null,
        hintsUsed: 0,
        timeTakenMs: 9000,
        confidence: 'sure',
        attemptType: 'confident_correct',
        timestamp: 2000,
      },
      {
        id: 'att3',
        studentId: 'stu1',
        sessionId: 'sess1',
        questionId: 'q3',
        conceptId: 'fractions-add',
        correct: true,
        chosenIndex: 1,
        mistakeTag: null,
        hintsUsed: 0,
        timeTakenMs: 8000,
        confidence: 'sure',
        attemptType: 'confident_correct',
        timestamp: 3000,
      },
      {
        id: 'att4',
        studentId: 'stu1',
        sessionId: 'sess2',
        questionId: 'q4',
        conceptId: 'fractions-add',
        correct: true, // 3rd correct
        chosenIndex: 1,
        mistakeTag: null,
        hintsUsed: 0,
        timeTakenMs: 8500,
        confidence: 'sure',
        attemptType: 'confident_correct',
        timestamp: 4000,
      },
    ]

    const profile = computeProfile(events, attempts)
    const entry = profile.entries['fraction_add_denominators']
    expect(entry.consecutiveCorrect).toBe(3)
    expect(entry.status).toBe('resolved')
  })

  it('generates targeted intervention with 3 questions and schedules re-check', () => {
    const intervention = generateIntervention('stu1', 'sign_error_transposing')
    expect(intervention.studentId).toBe('stu1')
    expect(intervention.misconceptionId).toBe('sign_error_transposing')
    expect(intervention.questions.length).toBeGreaterThanOrEqual(1)
    expect(intervention.recheckScheduledFor).toBeGreaterThan(Date.now())
  })

  it('adaptive selector prioritizes concept of open intervention', () => {
    const openIntervention: Intervention = {
      id: 'int1',
      studentId: 'stu1',
      misconceptionId: 'sign_error_transposing',
      conceptId: 'balancing-equations',
      createdAt: Date.now() - 3600000,
      recheckScheduledFor: Date.now() + 86400000,
      questions: [],
      completedAt: null,
    }

    const mockAttempts: Attempt[] = [
      {
        id: 'a1',
        studentId: 'stu1',
        sessionId: 's1',
        questionId: 'q1',
        conceptId: 'fractions-add',
        correct: true,
        chosenIndex: 0,
        mistakeTag: null,
        hintsUsed: 0,
        timeTakenMs: 10000,
        confidence: 'sure',
        timestamp: 100,
      },
      {
        id: 'a2',
        studentId: 'stu1',
        sessionId: 's1',
        questionId: 'q2',
        conceptId: 'fractions-add',
        correct: true,
        chosenIndex: 0,
        mistakeTag: null,
        hintsUsed: 0,
        timeTakenMs: 10000,
        confidence: 'sure',
        timestamp: 200,
      },
    ]

    const selection = selectNextQuestion({
      studentGrade: 8,
      allAttempts: mockAttempts,
      sessionAttemptedQuestionIds: [],
      openInterventions: [openIntervention],
    })

    expect(selection.conceptId).toBe('balancing-equations')
    expect(selection.reason.en).toContain('Targeted intervention')
  })

  describe('Class Misconception Alert Threshold (Strict AND: >= 3 distinct students AND >= 5 events)', () => {
    it('returns NO alert for 1 student with 6 events (fails distinct students requirement)', () => {
      const events: Array<{ studentId: string; misconceptionId: string }> = [
        { studentId: 'student_1', misconceptionId: 'sign_error_transposing' },
        { studentId: 'student_1', misconceptionId: 'sign_error_transposing' },
        { studentId: 'student_1', misconceptionId: 'sign_error_transposing' },
        { studentId: 'student_1', misconceptionId: 'sign_error_transposing' },
        { studentId: 'student_1', misconceptionId: 'sign_error_transposing' },
        { studentId: 'student_1', misconceptionId: 'sign_error_transposing' },
      ]

      const alert = evaluateClassMisconceptionAlert(events)
      expect(alert.distinctStudents).toBe(1)
      expect(alert.totalEvents).toBe(6)
      expect(alert.isAlert).toBe(false)
    })

    it('returns alert for 3 students with 5 total events (meets both >= 3 students AND >= 5 events)', () => {
      const events: Array<{ studentId: string; misconceptionId: string }> = [
        { studentId: 'student_1', misconceptionId: 'sign_error_transposing' },
        { studentId: 'student_1', misconceptionId: 'sign_error_transposing' },
        { studentId: 'student_1', misconceptionId: 'sign_error_transposing' },
        { studentId: 'student_2', misconceptionId: 'sign_error_transposing' },
        { studentId: 'student_3', misconceptionId: 'sign_error_transposing' },
      ]

      const alert = evaluateClassMisconceptionAlert(events)
      expect(alert.distinctStudents).toBe(3)
      expect(alert.totalEvents).toBe(5)
      expect(alert.isAlert).toBe(true)
    })

    it('returns NO alert for 2 students with 10 total events', () => {
      const events = Array.from({ length: 10 }, (_, i) => ({
        studentId: i % 2 === 0 ? 's1' : 's2',
        misconceptionId: 'sign_error_transposing',
      }))
      const alert = evaluateClassMisconceptionAlert(events)
      expect(alert.distinctStudents).toBe(2)
      expect(alert.totalEvents).toBe(10)
      expect(alert.isAlert).toBe(false)
    })

    it('returns NO alert for 3 students with 4 total events', () => {
      const events = [
        { studentId: 's1', misconceptionId: 'm1' },
        { studentId: 's2', misconceptionId: 'm1' },
        { studentId: 's3', misconceptionId: 'm1' },
        { studentId: 's3', misconceptionId: 'm1' },
      ]
      const alert = evaluateClassMisconceptionAlert(events)
      expect(alert.distinctStudents).toBe(3)
      expect(alert.totalEvents).toBe(4)
      expect(alert.isAlert).toBe(false)
    })
  })

  describe('Recurring Misconception Rule (Strictly >= 3 events across >= 2 sessions)', () => {
    it('verifies helper isRecurringStatus requires count >= 3 AND distinctSessions >= 2', () => {
      expect(isRecurringStatus(2, 2)).toBe(false) // Only 2 events
      expect(isRecurringStatus(3, 1)).toBe(false) // Only 1 session
      expect(isRecurringStatus(3, 2)).toBe(true)  // 3 events across 2 sessions
      expect(isRecurringStatus(5, 3)).toBe(true)
    })

    it('does NOT mark top recurring misconception when student has 2 events across 2 sessions', () => {
      const events: MisconceptionEvent[] = [
        {
          id: 'ev1',
          studentId: 'stu1',
          misconceptionId: 'distribute_first_term_only',
          questionId: 'q1',
          attemptId: 'att1',
          source: 'rule',
          confidence: 0.8,
          studentConfirmed: null,
          createdAt: 1000,
        },
        {
          id: 'ev2',
          studentId: 'stu1',
          misconceptionId: 'distribute_first_term_only',
          questionId: 'q2',
          attemptId: 'att2',
          source: 'rule',
          confidence: 0.8,
          studentConfirmed: null,
          createdAt: 3000,
        },
      ]

      const attempts: Attempt[] = [
        {
          id: 'att1',
          studentId: 'stu1',
          sessionId: 'sess1',
          questionId: 'q1',
          conceptId: 'balancing-equations',
          correct: false,
          chosenIndex: 0,
          mistakeTag: 'concept_gap',
          hintsUsed: 0,
          timeTakenMs: 10000,
          confidence: 'sure',
          attemptType: 'misconception',
          timestamp: 1000,
        },
        {
          id: 'att2',
          studentId: 'stu1',
          sessionId: 'sess2',
          questionId: 'q2',
          conceptId: 'balancing-equations',
          correct: false,
          chosenIndex: 0,
          mistakeTag: 'concept_gap',
          hintsUsed: 0,
          timeTakenMs: 10000,
          confidence: 'sure',
          attemptType: 'misconception',
          timestamp: 3000,
        },
      ]

      const profile = computeProfile(events, attempts)
      expect(profile.entries['distribute_first_term_only'].status).toBe('new')
      expect(profile.recurringCount).toBe(0)
      expect(profile.topRecurringMisconceptionId).toBeNull()
    })

    it('aggregates class misconception events correctly', () => {
      const mockEvents: MisconceptionEvent[] = [
        {
          id: 'e1',
          studentId: 's1',
          misconceptionId: 'sign_error_transposing',
          questionId: 'q1',
          attemptId: 'a1',
          source: 'rule',
          confidence: 0.9,
          studentConfirmed: null,
          createdAt: 100,
        },
        {
          id: 'e2',
          studentId: 's2',
          misconceptionId: 'sign_error_transposing',
          questionId: 'q2',
          attemptId: 'a2',
          source: 'rule',
          confidence: 0.9,
          studentConfirmed: null,
          createdAt: 200,
        },
        {
          id: 'e3',
          studentId: 's3',
          misconceptionId: 'sign_error_transposing',
          questionId: 'q3',
          attemptId: 'a3',
          source: 'rule',
          confidence: 0.9,
          studentConfirmed: null,
          createdAt: 300,
        },
        {
          id: 'e4',
          studentId: 's1',
          misconceptionId: 'sign_error_transposing',
          questionId: 'q4',
          attemptId: 'a4',
          source: 'rule',
          confidence: 0.9,
          studentConfirmed: null,
          createdAt: 400,
        },
        {
          id: 'e5',
          studentId: 's2',
          misconceptionId: 'sign_error_transposing',
          questionId: 'q5',
          attemptId: 'a5',
          source: 'rule',
          confidence: 0.9,
          studentConfirmed: null,
          createdAt: 500,
        },
      ]

      const summaries = aggregateClassMisconceptions(mockEvents)
      expect(summaries).toHaveLength(1)
      expect(summaries[0].misconceptionId).toBe('sign_error_transposing')
      expect(summaries[0].distinctStudents).toBe(3)
      expect(summaries[0].totalEvents).toBe(5)
      expect(summaries[0].isAlert).toBe(true)
    })
  })
})
