import { describe, it, expect } from 'vitest'
import {
  computeStudentConceptMastery,
  getStudentActivityStatus,
  groupStudents,
  deriveClassInsights,
} from './classInsights'
import type { Student, Attempt } from '../types'

function makeStudent(id: string, name: string): Student {
  return {
    id,
    name,
    grade: 8,
    avatar: '🦊',
    classCode: 'MATH-TEST',
    createdAt: Date.now() - 1000000,
  }
}

function makeAttempt(partial: Partial<Attempt>): Attempt {
  return {
    id: `att-${Math.random().toString(36).substring(2, 9)}`,
    studentId: 's1',
    sessionId: 'ses-1',
    questionId: 'q1',
    conceptId: 'integers',
    correct: true,
    chosenIndex: 0,
    mistakeTag: null,
    hintsUsed: 0,
    timeTakenMs: 5000,
    confidence: null,
    attemptType: 'confident_correct',
    timestamp: Date.now(),
    ...partial,
  }
}

describe('Class Insights Engine', () => {
  describe('computeStudentConceptMastery', () => {
    it('returns no_data when a student has fewer than 2 attempts on that concept', () => {
      const attempts0: Attempt[] = []
      const res0 = computeStudentConceptMastery(attempts0, 'integers', 's1')
      expect(res0.status).toBe('no_data')
      expect(res0.score).toBeNull()
      expect(res0.attemptsCount).toBe(0)

      const attempts1 = [makeAttempt({ studentId: 's1', conceptId: 'integers', correct: true })]
      const res1 = computeStudentConceptMastery(attempts1, 'integers', 's1')
      expect(res1.status).toBe('no_data')
      expect(res1.score).toBeNull()
      expect(res1.attemptsCount).toBe(1)
    })

    it('returns evaluated with BKT mastery score when student has at least 2 attempts', () => {
      const attempts = [
        makeAttempt({ studentId: 's1', conceptId: 'integers', correct: true }),
        makeAttempt({ studentId: 's1', conceptId: 'integers', correct: true }),
      ]
      const res = computeStudentConceptMastery(attempts, 'integers', 's1')
      expect(res.status).toBe('evaluated')
      expect(typeof res.score).toBe('number')
      expect(res.score).toBeGreaterThan(0.5)
      expect(res.attemptsCount).toBe(2)
    })
  })

  describe('getStudentActivityStatus', () => {
    const NOW = new Date(2026, 10, 1, 14, 0, 0).getTime() // Midday Nov 1, 2026
    const TODAY_TIME = new Date(2026, 10, 1, 10, 0, 0).getTime()
    const YESTERDAY_TIME = new Date(2026, 9, 31, 18, 0, 0).getTime()
    const FOUR_DAYS_AGO = new Date(2026, 9, 28, 12, 0, 0).getTime()

    it('returns never_started when student has no sessions or attempts', () => {
      expect(getStudentActivityStatus('s1', [], [], NOW)).toBe('never_started')
    })

    it('returns active_today when attempt or session was completed today', () => {
      const atts = [makeAttempt({ studentId: 's1', timestamp: TODAY_TIME })]
      expect(getStudentActivityStatus('s1', [], atts, NOW)).toBe('active_today')
    })

    it('returns active_yesterday when activity was yesterday', () => {
      const atts = [makeAttempt({ studentId: 's1', timestamp: YESTERDAY_TIME })]
      expect(getStudentActivityStatus('s1', [], atts, NOW)).toBe('active_yesterday')
    })

    it('returns inactive_3plus_days when activity is older than yesterday', () => {
      const atts = [makeAttempt({ studentId: 's1', timestamp: FOUR_DAYS_AGO })]
      expect(getStudentActivityStatus('s1', [], atts, NOW)).toBe('inactive_3plus_days')
    })
  })

  describe('groupStudents', () => {
    const s1 = makeStudent('s1', 'Aarav')
    const s2 = makeStudent('s2', 'Diya')
    const s3 = makeStudent('s3', 'Kabir')
    const s4 = makeStudent('s4', 'Ananya')
    const students = [s1, s2, s3, s4]

    it('correctly categorizes students into remedial, on_track, advanced and not_enough_data', () => {
      const attempts: Attempt[] = [
        // s1: 3 wrong answers -> remedial (< 0.40)
        makeAttempt({ studentId: 's1', conceptId: 'ratios', correct: false }),
        makeAttempt({ studentId: 's1', conceptId: 'ratios', correct: false }),
        makeAttempt({ studentId: 's1', conceptId: 'ratios', correct: false }),

        // s2: 1 correct, 1 wrong -> on_track (0.40 to 0.70)
        makeAttempt({ studentId: 's2', conceptId: 'ratios', correct: true }),
        makeAttempt({ studentId: 's2', conceptId: 'ratios', correct: false }),

        // s3: 4 correct answers -> advanced (> 0.70)
        makeAttempt({ studentId: 's3', conceptId: 'ratios', correct: true }),
        makeAttempt({ studentId: 's3', conceptId: 'ratios', correct: true }),
        makeAttempt({ studentId: 's3', conceptId: 'ratios', correct: true }),
        makeAttempt({ studentId: 's3', conceptId: 'ratios', correct: true }),

        // s4: only 1 attempt -> not_enough_data
        makeAttempt({ studentId: 's4', conceptId: 'ratios', correct: true }),
      ]

      const groups = groupStudents('ratios', students, attempts)
      expect(groups.remedial.map((s) => s.id)).toEqual(['s1'])
      expect(groups.on_track.map((s) => s.id)).toEqual(['s2'])
      expect(groups.advanced.map((s) => s.id)).toEqual(['s3'])
      expect(groups.not_enough_data.map((s) => s.id)).toEqual(['s4'])
    })
  })

  describe('deriveClassInsights (Threshold Enforcement)', () => {
    const s1 = makeStudent('s1', 'Aarav')
    const s2 = makeStudent('s2', 'Diya')
    const s3 = makeStudent('s3', 'Kabir')
    const students = [s1, s2, s3]

    it('ignores concepts with fewer than 5 attempts', () => {
      // 4 attempts total across 3 students
      const attempts = [
        makeAttempt({ studentId: 's1', conceptId: 'decimals', correct: false }),
        makeAttempt({ studentId: 's1', conceptId: 'decimals', correct: false }),
        makeAttempt({ studentId: 's2', conceptId: 'decimals', correct: false }),
        makeAttempt({ studentId: 's3', conceptId: 'decimals', correct: false }),
      ]

      const insights = deriveClassInsights(students, ['decimals'], attempts)
      expect(insights.weakestConcepts.length).toBe(0)
      expect(insights.evaluatedConceptsCount).toBe(0)
    })

    it('ignores concepts where fewer than 3 students have evaluated data (>=2 attempts)', () => {
      // 6 attempts, but only 2 students (s1 with 3, s2 with 3, s3 with 0)
      const attempts = [
        makeAttempt({ studentId: 's1', conceptId: 'fractions-add', correct: false }),
        makeAttempt({ studentId: 's1', conceptId: 'fractions-add', correct: false }),
        makeAttempt({ studentId: 's1', conceptId: 'fractions-add', correct: false }),
        makeAttempt({ studentId: 's2', conceptId: 'fractions-add', correct: false }),
        makeAttempt({ studentId: 's2', conceptId: 'fractions-add', correct: false }),
        makeAttempt({ studentId: 's2', conceptId: 'fractions-add', correct: false }),
      ]

      const insights = deriveClassInsights(students, ['fractions-add'], attempts)
      expect(insights.weakestConcepts.length).toBe(0)
      expect(insights.evaluatedConceptsCount).toBe(0)
    })

    it('triggers weakestConcepts when at least 3 students have data, >=5 attempts, and avg < 0.50', () => {
      const attempts = [
        makeAttempt({ studentId: 's1', conceptId: 'integers', correct: false }),
        makeAttempt({ studentId: 's1', conceptId: 'integers', correct: false }),
        makeAttempt({ studentId: 's2', conceptId: 'integers', correct: false }),
        makeAttempt({ studentId: 's2', conceptId: 'integers', correct: false }),
        makeAttempt({ studentId: 's3', conceptId: 'integers', correct: false }),
        makeAttempt({ studentId: 's3', conceptId: 'integers', correct: false }),
      ]

      const insights = deriveClassInsights(students, ['integers'], attempts)
      expect(insights.weakestConcepts.length).toBe(1)
      expect(insights.weakestConcepts[0].conceptId).toBe('integers')
      expect(insights.weakestConcepts[0].studentsWithData).toBe(3)
      expect(insights.weakestConcepts[0].totalAttempts).toBe(6)
    })

    it('triggers readyToMoveOn when at least 3 students have data, >=5 attempts, and high mastery', () => {
      const attempts = [
        makeAttempt({ studentId: 's1', conceptId: 'whole-numbers', correct: true }),
        makeAttempt({ studentId: 's1', conceptId: 'whole-numbers', correct: true }),
        makeAttempt({ studentId: 's2', conceptId: 'whole-numbers', correct: true }),
        makeAttempt({ studentId: 's2', conceptId: 'whole-numbers', correct: true }),
        makeAttempt({ studentId: 's3', conceptId: 'whole-numbers', correct: true }),
        makeAttempt({ studentId: 's3', conceptId: 'whole-numbers', correct: true }),
      ]

      const insights = deriveClassInsights(students, ['whole-numbers'], attempts)
      expect(insights.readyToMoveOn.length).toBe(1)
      expect(insights.readyToMoveOn[0].conceptId).toBe('whole-numbers')
      expect(insights.readyToMoveOn[0].masteredPercentage).toBe(100)
    })

    it('identifies common mistake tags only when occurring in >= 3 students AND >= 5 times', () => {
      const attempts = [
        // sign_error: 3 students, 5 occurrences -> triggers
        makeAttempt({ studentId: 's1', mistakeTag: 'sign_error', correct: false }),
        makeAttempt({ studentId: 's1', mistakeTag: 'sign_error', correct: false }),
        makeAttempt({ studentId: 's2', mistakeTag: 'sign_error', correct: false }),
        makeAttempt({ studentId: 's2', mistakeTag: 'sign_error', correct: false }),
        makeAttempt({ studentId: 's3', mistakeTag: 'sign_error', correct: false }),

        // calculation_slip: only 2 students, 6 occurrences -> does NOT trigger
        makeAttempt({ studentId: 's1', mistakeTag: 'calculation_slip', correct: false }),
        makeAttempt({ studentId: 's1', mistakeTag: 'calculation_slip', correct: false }),
        makeAttempt({ studentId: 's1', mistakeTag: 'calculation_slip', correct: false }),
        makeAttempt({ studentId: 's2', mistakeTag: 'calculation_slip', correct: false }),
        makeAttempt({ studentId: 's2', mistakeTag: 'calculation_slip', correct: false }),
        makeAttempt({ studentId: 's2', mistakeTag: 'calculation_slip', correct: false }),
      ]

      const insights = deriveClassInsights(students, [], attempts)
      expect(insights.commonMistakes.length).toBe(1)
      expect(insights.commonMistakes[0].mistakeTag).toBe('sign_error')
      expect(insights.commonMistakes[0].distinctStudents).toBe(3)
      expect(insights.commonMistakes[0].totalOccurrences).toBe(5)
    })

    it('identifies students needing attention with >=5 attempts and accuracy < 40% or active gaps >= 2', () => {
      const attempts = [
        // s1: 5 attempts, 1 correct -> 20% accuracy
        makeAttempt({ studentId: 's1', correct: true }),
        makeAttempt({ studentId: 's1', correct: false }),
        makeAttempt({ studentId: 's1', correct: false }),
        makeAttempt({ studentId: 's1', correct: false }),
        makeAttempt({ studentId: 's1', correct: false }),

        // s2: 5 attempts, 4 correct -> 80% accuracy, but has 2 active gaps!
        makeAttempt({ studentId: 's2', correct: true }),
        makeAttempt({ studentId: 's2', correct: true }),
        makeAttempt({ studentId: 's2', correct: true }),
        makeAttempt({ studentId: 's2', correct: true }),
        makeAttempt({ studentId: 's2', correct: false }),
      ]

      const activeGaps = { s1: 0, s2: 2 }
      const insights = deriveClassInsights(students, [], attempts, activeGaps)

      expect(insights.studentsNeedingAttention.length).toBe(2)
      const s1Insight = insights.studentsNeedingAttention.find((x) => x.studentId === 's1')
      const s2Insight = insights.studentsNeedingAttention.find((x) => x.studentId === 's2')

      expect(s1Insight?.reason).toBe('low_accuracy')
      expect(s2Insight?.reason).toBe('active_gaps')
    })

    it('computes overconfidence index when at least 10 sure attempts and >= 25% incorrect', () => {
      const attempts: Attempt[] = []
      // 10 sure attempts: 4 incorrect, 6 correct -> 40% overconfidence rate
      for (let i = 0; i < 4; i++) {
        attempts.push(makeAttempt({ studentId: `s${(i % 3) + 1}`, confidence: 'sure', correct: false }))
      }
      for (let i = 0; i < 6; i++) {
        attempts.push(makeAttempt({ studentId: `s${(i % 3) + 1}`, confidence: 'sure', correct: true }))
      }

      const insights = deriveClassInsights(students, [], attempts)
      expect(insights.overconfidence).not.toBeNull()
      expect(insights.overconfidence?.overconfidenceRate).toBe(0.4)
      expect(insights.overconfidence?.overconfidentAttempts).toBe(4)
      expect(insights.overconfidence?.totalSureAttempts).toBe(10)
    })
  })
})
