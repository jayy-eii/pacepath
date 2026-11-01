import { describe, it, expect } from 'vitest'
import { traceGap, isGapTraceTriggered, getProbeQuestions, getFixQuestions } from './gapTrace'
import type { Attempt, Question, Concept } from '../types'

function makeAttempt(partial: Partial<Attempt>): Attempt {
  return {
    id: 'att_' + Math.random().toString(36).substring(2, 7),
    studentId: 'student_1',
    sessionId: 'session_1',
    questionId: 'q01',
    conceptId: 'balancing-equations',
    correct: true,
    chosenIndex: 1,
    mistakeTag: null,
    hintsUsed: 0,
    timeTakenMs: 4000,
    confidence: 'sure',
    attemptType: 'confident_correct',
    timestamp: Date.now(),
    ...partial,
  }
}

function makeQuestion(partial: Partial<Question>): Question {
  return {
    id: 'q_test',
    conceptId: 'balancing-equations',
    grade: 8,
    difficulty: 2,
    text: { en: 'Solve 2x + 3 = 11', hi: '2x + 3 = 11 हल करें' },
    options: [
      { en: 'x = 4', hi: 'x = 4' },
      { en: 'x = 7', hi: 'x = 7', suspectConceptId: 'integers' },
      { en: 'x = 8', hi: 'x = 8', suspectConceptId: 'basic-equations' },
      { en: 'x = 14', hi: 'x = 14' },
    ],
    correctIndex: 0,
    wrongTags: { '1': 'sign_error', '2': 'concept_gap', '3': 'formula_misuse' },
    hints: ['Hint 1', 'Hint 2', 'Hint 3'],
    solution: { en: 'x = 4', hi: 'x = 4' },
    ...partial,
  }
}

describe('Gap Detective Engine (src/engine/gapTrace.ts)', () => {
  describe('isGapTraceTriggered()', () => {
    it('does not trigger on correct answers', () => {
      const attempt = makeAttempt({ correct: true })
      const question = makeQuestion({})
      const res = isGapTraceTriggered({
        attempt,
        question,
        sessionAttempts: [attempt],
        allStudentAttempts: [attempt],
        triggeredConceptsThisSession: new Set(),
      })
      expect(res.triggered).toBe(false)
    })

    it('triggers immediately on a misconception (sure + wrong)', () => {
      const attempt = makeAttempt({
        correct: false,
        confidence: 'sure',
        attemptType: 'misconception',
      })
      const question = makeQuestion({})
      const res = isGapTraceTriggered({
        attempt,
        question,
        sessionAttempts: [attempt],
        allStudentAttempts: [attempt],
        triggeredConceptsThisSession: new Set(),
      })
      expect(res.triggered).toBe(true)
      expect(res.reason).toBe('misconception')
    })

    it('triggers on 2 consecutive wrong answers in the same concept', () => {
      const att1 = makeAttempt({
        conceptId: 'ratios',
        correct: false,
        confidence: 'maybe',
        attemptType: 'honest_gap',
        timestamp: 1000,
      })
      const att2 = makeAttempt({
        conceptId: 'ratios',
        correct: false,
        confidence: 'maybe',
        attemptType: 'honest_gap',
        timestamp: 2000,
      })
      const question = makeQuestion({ conceptId: 'ratios' })

      const res = isGapTraceTriggered({
        attempt: att2,
        question,
        sessionAttempts: [att1, att2],
        allStudentAttempts: [att1, att2],
        triggeredConceptsThisSession: new Set(),
      })
      expect(res.triggered).toBe(true)
      expect(res.reason).toBe('consecutive_wrong')
    })

    it('triggers when concept mastery falls below 0.35 after >= 3 attempts', () => {
      // Prior session: 3 wrong attempts, so concept mastery is < 0.35
      const priorAttempts = [1, 2, 3].map((i) =>
        makeAttempt({
          conceptId: 'fractions-add',
          correct: false,
          confidence: 'maybe',
          timestamp: 1000 * i,
        }),
      )
      // Current session: 1 correct then 1 wrong (so NOT 2 consecutive wrong in this session)
      const currentAttempt = makeAttempt({
        conceptId: 'fractions-add',
        correct: false,
        confidence: 'maybe',
        attemptType: 'honest_gap',
        timestamp: 5000,
      })
      const sessionAttempts = [
        makeAttempt({ conceptId: 'fractions-add', correct: true, timestamp: 4000 }),
        currentAttempt,
      ]
      const allStudentAttempts = [...priorAttempts, ...sessionAttempts]
      const question = makeQuestion({ conceptId: 'fractions-add' })

      const res = isGapTraceTriggered({
        attempt: currentAttempt,
        question,
        sessionAttempts,
        allStudentAttempts,
        triggeredConceptsThisSession: new Set(),
      })
      expect(res.triggered).toBe(true)
      expect(res.reason).toBe('low_mastery')
    })

    it('does NOT trigger more than once per concept in the same session', () => {
      const attempt = makeAttempt({
        conceptId: 'ratios',
        correct: false,
        confidence: 'sure',
        attemptType: 'misconception',
      })
      const question = makeQuestion({ conceptId: 'ratios' })
      const triggeredSet = new Set(['ratios']) // already triggered in this session

      const res = isGapTraceTriggered({
        attempt,
        question,
        sessionAttempts: [attempt],
        allStudentAttempts: [attempt],
        triggeredConceptsThisSession: triggeredSet,
      })
      expect(res.triggered).toBe(false)
    })
  })

  describe('traceGap() Backwards Traversal', () => {
    // Custom test graph:
    // A (equations-both-sides) -> B (balancing-equations) -> C (basic-equations) -> D (integers) -> E (whole-numbers)
    const testLinearGraph: Concept[] = [
      { id: 'E', name: { en: 'Whole Numbers', hi: 'पूर्ण संख्याएं' }, grade: 6, prerequisites: [] },
      { id: 'D', name: { en: 'Integers', hi: 'पूर्णांक' }, grade: 7, prerequisites: ['E'] },
      { id: 'C', name: { en: 'Basic Equations', hi: 'सरल समीकरण' }, grade: 7, prerequisites: ['D'] },
      { id: 'B', name: { en: 'Balancing Equations', hi: 'दो-चरणीय समीकरण' }, grade: 8, prerequisites: ['C'] },
      { id: 'A', name: { en: 'Variables Both Sides', hi: 'दोनों तरफ चर' }, grade: 9, prerequisites: ['B'] },
    ]

    it('linear chain: walks backwards and stops at root cause D (deep gap 3 levels back)', () => {
      // Student has:
      // A: struggled (start)
      // B: weak (mastery < 0.40)
      // C: weak (mastery < 0.40)
      // D: weak (mastery < 0.40)
      // E: solid (mastery >= 0.70)
      const attempts: Attempt[] = [
        // B: 2 wrong attempts
        makeAttempt({ conceptId: 'B', correct: false, timestamp: 100 }),
        makeAttempt({ conceptId: 'B', correct: false, timestamp: 200 }),
        // C: 2 wrong attempts
        makeAttempt({ conceptId: 'C', correct: false, timestamp: 300 }),
        makeAttempt({ conceptId: 'C', correct: false, timestamp: 400 }),
        // D: 2 wrong attempts
        makeAttempt({ conceptId: 'D', correct: false, timestamp: 500 }),
        makeAttempt({ conceptId: 'D', correct: false, timestamp: 600 }),
        // E: 3 correct attempts (solid >= 0.70)
        makeAttempt({ conceptId: 'E', correct: true, confidence: 'sure', hintsUsed: 0, timestamp: 700 }),
        makeAttempt({ conceptId: 'E', correct: true, confidence: 'sure', hintsUsed: 0, timestamp: 800 }),
        makeAttempt({ conceptId: 'E', correct: true, confidence: 'sure', hintsUsed: 0, timestamp: 900 }),
      ]

      const question = makeQuestion({ conceptId: 'A' })
      const result = traceGap(attempts, question, undefined, testLinearGraph)

      expect(result.startConceptId).toBe('A')
      expect(result.rootCauseId).toBe('D') // deepest weak prerequisite before E (solid)
      expect(result.probesNeeded).toHaveLength(0)

      // Path checks
      const pathIds = result.path.map((n) => n.conceptId)
      expect(pathIds).toContain('A')
      expect(pathIds).toContain('B')
      expect(pathIds).toContain('C')
      expect(pathIds).toContain('D')
      expect(pathIds).toContain('E')

      const nodeE = result.path.find((n) => n.conceptId === 'E')
      expect(nodeE?.status).toBe('solid')
    })

    it('all-solid prerequisites: correctly concludes no prerequisite gap found (issue is concept itself)', () => {
      // Starting at B. Direct prerequisite C is solid.
      const attempts: Attempt[] = [
        makeAttempt({ conceptId: 'C', correct: true, confidence: 'sure', timestamp: 100 }),
        makeAttempt({ conceptId: 'C', correct: true, confidence: 'sure', timestamp: 200 }),
        makeAttempt({ conceptId: 'C', correct: true, confidence: 'sure', timestamp: 300 }),
      ]
      const question = makeQuestion({ conceptId: 'B' })
      const result = traceGap(attempts, question, undefined, testLinearGraph)

      expect(result.startConceptId).toBe('B')
      expect(result.rootCauseId).toBeNull() // no prerequisite gap
      expect(result.probesNeeded).toHaveLength(0)
      expect(result.explanation.en).toContain('prerequisites for "Balancing Equations" are solid')
    })

    it('all-unknown prerequisites: requests probes instead of guessing fake data', () => {
      // Student has 0 attempts in prerequisites
      const attempts: Attempt[] = []
      const question = makeQuestion({ conceptId: 'B' }) // prerequisite is C
      const result = traceGap(attempts, question, undefined, testLinearGraph)

      expect(result.rootCauseId).toBeNull()
      expect(result.probesNeeded).toContain('C')
      expect(result.confidence).toBe('low')
      expect(result.path.find((n) => n.conceptId === 'C')?.status).toBe('unknown')
    })

    it('branching graph: evaluates multiple prerequisite branches correctly', () => {
      // Branching graph:
      // Target P has two prerequisites: Q and R.
      // Q has prerequisite S.
      const branchingGraph: Concept[] = [
        { id: 'S', name: { en: 'S', hi: 'S' }, grade: 6, prerequisites: [] },
        { id: 'Q', name: { en: 'Q', hi: 'Q' }, grade: 7, prerequisites: ['S'] },
        { id: 'R', name: { en: 'R', hi: 'R' }, grade: 7, prerequisites: [] },
        { id: 'P', name: { en: 'P', hi: 'P' }, grade: 8, prerequisites: ['Q', 'R'] },
      ]

      // R is solid (2 correct). Q is weak (2 wrong). S is solid (2 correct).
      const attempts: Attempt[] = [
        makeAttempt({ conceptId: 'R', correct: true, timestamp: 100 }),
        makeAttempt({ conceptId: 'R', correct: true, timestamp: 200 }),
        makeAttempt({ conceptId: 'Q', correct: false, timestamp: 300 }),
        makeAttempt({ conceptId: 'Q', correct: false, timestamp: 400 }),
        makeAttempt({ conceptId: 'S', correct: true, timestamp: 500 }),
        makeAttempt({ conceptId: 'S', correct: true, timestamp: 600 }),
      ]

      const question = makeQuestion({ conceptId: 'P' })
      const result = traceGap(attempts, question, undefined, branchingGraph)

      expect(result.rootCauseId).toBe('Q')
      expect(result.path.find((n) => n.conceptId === 'R')?.status).toBe('solid')
      expect(result.path.find((n) => n.conceptId === 'Q')?.status).toBe('weak')
      expect(result.path.find((n) => n.conceptId === 'S')?.status).toBe('solid')
    })

    it('suspectConceptId prioritization: inspects the flagged suspect first', () => {
      // Question in balancing-equations has option 1 with suspectConceptId: 'integers'
      const question = makeQuestion({
        conceptId: 'balancing-equations',
        options: [
          { en: 'x = 4', hi: 'x = 4' },
          { en: 'x = -7', hi: 'x = -7', suspectConceptId: 'integers' },
          { en: 'x = 8', hi: 'x = 8' },
          { en: 'x = 14', hi: 'x = 14' },
        ],
      })

      // Student has attempts in integers showing weakness
      const attempts: Attempt[] = [
        makeAttempt({ conceptId: 'integers', correct: false, timestamp: 100 }),
        makeAttempt({ conceptId: 'integers', correct: false, timestamp: 200 }),
        makeAttempt({ conceptId: 'whole-numbers', correct: true, timestamp: 300 }),
        makeAttempt({ conceptId: 'whole-numbers', correct: true, timestamp: 400 }),
        makeAttempt({ conceptId: 'whole-numbers', correct: true, timestamp: 500 }),
      ]

      // Student chose option 1 (with suspectConceptId: 'integers')
      const result = traceGap(attempts, question, 1)
      expect(result.path[1].conceptId).toBe('integers') // evaluated right after start concept
      expect(result.rootCauseId).toBe('integers')
    })

    it('cycle protection: safely terminates and prevents infinite loops if a cycle is encountered', () => {
      // Cycle: X -> Y -> Z -> X
      const cyclicGraph: Concept[] = [
        { id: 'X', name: { en: 'X', hi: 'X' }, grade: 8, prerequisites: ['Y'] },
        { id: 'Y', name: { en: 'Y', hi: 'Y' }, grade: 8, prerequisites: ['Z'] },
        { id: 'Z', name: { en: 'Z', hi: 'Z' }, grade: 8, prerequisites: ['X'] },
      ]

      const attempts: Attempt[] = [
        makeAttempt({ conceptId: 'Y', correct: false, timestamp: 100 }),
        makeAttempt({ conceptId: 'Y', correct: false, timestamp: 200 }),
        makeAttempt({ conceptId: 'Z', correct: false, timestamp: 300 }),
        makeAttempt({ conceptId: 'Z', correct: false, timestamp: 400 }),
      ]

      const question = makeQuestion({ conceptId: 'X' })
      // Must not throw or hang
      const result = traceGap(attempts, question, undefined, cyclicGraph)
      expect(result.path.length).toBeLessThanOrEqual(4)
      expect(result.path.map((n) => n.conceptId)).toContain('X')
    })
  })

  describe('getProbeQuestions() and getFixQuestions()', () => {
    it('returns probe questions for an unknown prerequisite without repeats', () => {
      const probes = getProbeQuestions('integers', ['q33'], undefined, 2)
      expect(probes.length).toBeGreaterThan(0)
      expect(probes.length).toBeLessThanOrEqual(2)
      expect(probes.every((q) => q.conceptId === 'integers')).toBe(true)
      expect(probes.some((q) => q.id === 'q33')).toBe(false) // avoided previously answered
    })

    it('returns fix questions ordered with difficulty 1 first', () => {
      const fixQuestions = getFixQuestions('integers', [], undefined, 3)
      expect(fixQuestions).toHaveLength(3)
      expect(fixQuestions[0].difficulty).toBeLessThanOrEqual(fixQuestions[1].difficulty)
      expect(fixQuestions[1].difficulty).toBeLessThanOrEqual(fixQuestions[2].difficulty)
    })
  })
})
