import { describe, it, expect } from 'vitest'
import {
  detectMisconception,
  checkSteps,
  BUGGY_PROCEDURES,
} from './misconceptionDetect'
import {
  parseNumericAnswer,
  solveLinearBracket,
  detectStrictCalculationSlip,
} from './mathCore'
import type { Question, MisconceptionEvent } from '../types'

describe('Math Core & Parsing', () => {
  it('parses numeric answers with fractions and decimals', () => {
    expect(parseNumericAnswer(4)).toBe(4)
    expect(parseNumericAnswer('4')).toBe(4)
    expect(parseNumericAnswer('x = 4')).toBe(4)
    expect(parseNumericAnswer('1/2')).toBe(0.5)
    expect(parseNumericAnswer('3/4')).toBe(0.75)
    expect(parseNumericAnswer('-10')).toBe(-10)
    expect(parseNumericAnswer('invalid')).toBeNull()
  })

  it('correctly solves 2(x + 3) = 14', () => {
    const res = solveLinearBracket({ a: 2, b: 1, c: 3, d: 14 })
    expect(res.solution).toBe(4)
    expect(res.steps).toHaveLength(4)
  })

  it('directly verifies detectStrictCalculationSlip arithmetic perturbation', () => {
    const slip = detectStrictCalculationSlip('linear_bracket', { a: 2, b: 1, c: 3, d: 14 }, 3.5)
    expect(slip.isSlip).toBe(true)
    expect(slip.slipDetails?.divergenceStep).toBeGreaterThanOrEqual(2)
  })

  it('exposes buggy procedures mapping', () => {
    expect(Object.keys(BUGGY_PROCEDURES).length).toBeGreaterThan(10)
    expect(BUGGY_PROCEDURES['sign_error_transposing']).toBeDefined()
  })
})

describe('Misconception Detection Engine (Phase A)', () => {
  const workedExampleQ: Question = {
    id: 'num01',
    conceptId: 'linear-equations-distributive',
    grade: 8,
    difficulty: 2,
    type: 'equation_input',
    text: { en: 'Solve 2(x + 3) = 14', hi: '2(x + 3) = 14 हल करें' },
    correctAnswer: 4,
    procedure: {
      type: 'linear_bracket',
      variables: { a: 2, b: 1, c: 3, d: 14 },
    },
    hints: ['hint 1', 'hint 2', 'hint 3'],
    solution: { en: 'x = 4', hi: 'x = 4' },
  }

  // Worked example tests required in prompt:
  it('detects correct answer x = 4 as correct', () => {
    const res = detectMisconception(workedExampleQ, 4)
    expect(res.status).toBe('correct')
    expect(res.candidates).toHaveLength(0)
  })

  it('detects x = 10 as sign_error_transposing (added 6 instead of subtracted)', () => {
    const res = detectMisconception(workedExampleQ, 10, [], 'sure')
    expect(res.status).toBe('matched')
    expect(res.candidates[0].misconceptionId).toBe('sign_error_transposing')
    expect(res.candidates[0].divergenceStep).toBe(3)
    expect(res.candidates[0].evidence.some((s) => s.includes('Sign error'))).toBe(true)
  })

  it('detects x = 9 as subtract_coefficient_instead_of_divide (subtracted 2 instead of dividing)', () => {
    const res = detectMisconception(workedExampleQ, 9)
    expect(res.status).toBe('matched')
    expect(res.candidates[0].misconceptionId).toBe('subtract_coefficient_instead_of_divide')
    expect(res.candidates[0].divergenceStep).toBe(2)
  })

  it('detects x = 5.5 as distribute_first_term_only (distributed only to x: 2x + 3 = 14)', () => {
    const res = detectMisconception(workedExampleQ, 5.5)
    expect(res.status).toBe('matched')
    expect(res.candidates[0].misconceptionId).toBe('distribute_first_term_only')
    expect(res.candidates[0].divergenceStep).toBe(2)
  })

  it('detects x = 3.5 as strict calculation_slip (arithmetic slip 14 - 6 = 7 => 7/2 = 3.5)', () => {
    const res = detectMisconception(workedExampleQ, 3.5)
    expect(res.status).toBe('calculation_slip')
    expect(res.slipDetails).toBeDefined()
    expect(res.slipDetails?.divergenceStep).toBeGreaterThanOrEqual(2)
  })

  it('returns unmatched for random arbitrary answer x = 100', () => {
    const res = detectMisconception(workedExampleQ, 100)
    expect(res.status).toBe('unmatched')
    expect(res.candidates).toHaveLength(0)
  })

  it('detects fraction add denominators: 1/4 + 2/4 = 3/8 (0.375)', () => {
    const fractionQ: Question = {
      id: 'num08',
      conceptId: 'fractions-add',
      grade: 6,
      difficulty: 1,
      type: 'numeric_input',
      text: { en: '1/4 + 2/4', hi: '1/4 + 2/4' },
      correctAnswer: 0.75,
      procedure: {
        type: 'fraction_add',
        variables: { n1: 1, d1: 4, n2: 2, d2: 4 },
      },
      hints: ['h1', 'h2', 'h3'],
      solution: { en: '3/4 = 0.75', hi: '3/4 = 0.75' },
    }
    const res = detectMisconception(fractionQ, 0.375)
    expect(res.status).toBe('matched')
    expect(res.candidates[0].misconceptionId).toBe('fraction_add_denominators')
  })

  it('detects ratio additive thinking: ratio 2:5 when 2 becomes 6 (+4), student answers 9 instead of 15', () => {
    const ratioQ: Question = {
      id: 'num11',
      conceptId: 'ratios',
      grade: 6,
      difficulty: 1,
      type: 'numeric_input',
      text: { en: '2:5 scaled to 6', hi: '2:5 scaled to 6' },
      correctAnswer: 15,
      procedure: {
        type: 'ratio_scale',
        variables: { a: 2, b: 5, newA: 6 },
      },
      hints: ['h1', 'h2', 'h3'],
      solution: { en: '15', hi: '15' },
    }
    const res = detectMisconception(ratioQ, 9)
    expect(res.status).toBe('matched')
    expect(res.candidates[0].misconceptionId).toBe('ratio_additive_thinking')
  })

  it('detects order of operations error: 5 + 3 * 4 = 32 instead of 17', () => {
    const bodmasQ: Question = {
      id: 'num16',
      conceptId: 'whole-numbers',
      grade: 6,
      difficulty: 2,
      type: 'numeric_input',
      text: { en: '5 + 3 * 4', hi: '5 + 3 * 4' },
      correctAnswer: 17,
      procedure: {
        type: 'order_of_operations',
        variables: { a: 5, b: 3, c: 4 },
      },
      hints: ['h1', 'h2', 'h3'],
      solution: { en: '17', hi: '17' },
    }
    const res = detectMisconception(bodmasQ, 32)
    expect(res.status).toBe('matched')
    expect(res.candidates[0].misconceptionId).toBe('order_of_operations_error')
  })

  it('detects exponent multiply base: 2^4 = 8 instead of 16', () => {
    const expQ: Question = {
      id: 'num15',
      conceptId: 'exponents',
      grade: 8,
      difficulty: 1,
      type: 'numeric_input',
      text: { en: '2^4', hi: '2^4' },
      correctAnswer: 16,
      procedure: {
        type: 'exponent_eval',
        variables: { base: 2, exp: 4 },
      },
      hints: ['h1', 'h2', 'h3'],
      solution: { en: '16', hi: '16' },
    }
    const res = detectMisconception(expQ, 8)
    expect(res.status).toBe('matched')
    expect(res.candidates[0].misconceptionId).toBe('exponent_multiply_base')
  })

  it('uses student history as a Bayesian prior to rank candidates', () => {
    const mockHistory: MisconceptionEvent[] = [
      {
        id: 'ev1',
        studentId: 's1',
        misconceptionId: 'sign_error_transposing',
        questionId: 'q1',
        attemptId: 'a1',
        source: 'rule',
        confidence: 0.9,
        studentConfirmed: true,
        createdAt: Date.now() - 100000,
      },
      {
        id: 'ev2',
        studentId: 's1',
        misconceptionId: 'sign_error_transposing',
        questionId: 'q2',
        attemptId: 'a2',
        source: 'rule',
        confidence: 0.9,
        studentConfirmed: true,
        createdAt: Date.now() - 50000,
      },
    ]

    const res = detectMisconception(workedExampleQ, 10, mockHistory, 'sure')
    expect(res.candidates[0].confidence).toBeGreaterThan(0.95)
  })
})

describe('Show-Your-Work Step Equivalence Checker', () => {
  const workedExampleQ: Question = {
    id: 'num01',
    conceptId: 'linear-equations-distributive',
    grade: 8,
    difficulty: 2,
    type: 'equation_input',
    text: { en: '2(x + 3) = 14', hi: '2(x + 3) = 14' },
    correctAnswer: 4,
    hints: ['h1', 'h2', 'h3'],
    solution: { en: 'x = 4', hi: 'x = 4' },
  }

  it('verifies completely correct line-by-line solution', () => {
    const lines = ['2(x + 3) = 14', '2x + 6 = 14', '2x = 8', 'x = 4']
    const result = checkSteps(lines, workedExampleQ)
    expect(result.valid).toBe(true)
    expect(result.firstInvalidLineIndex).toBeNull()
  })

  it('pinpoints the first invalid step and flags sign_error_transposing', () => {
    const lines = ['2(x + 3) = 14', '2x + 6 = 14', '2x = 20', 'x = 10']
    const result = checkSteps(lines, workedExampleQ)
    expect(result.valid).toBe(false)
    expect(result.firstInvalidLineIndex).toBe(2)
    expect(result.invalidLineText).toBe('2x = 20')
    expect(result.detectedMisconceptionId).toBe('sign_error_transposing')
  })

  it('pinpoints invalid step when student distributes to first term only', () => {
    const lines = ['2(x + 3) = 14', '2x + 3 = 14', '2x = 11', 'x = 5.5']
    const result = checkSteps(lines, workedExampleQ)
    expect(result.valid).toBe(false)
    expect(result.firstInvalidLineIndex).toBe(1)
    expect(result.detectedMisconceptionId).toBe('distribute_first_term_only')
  })
})
