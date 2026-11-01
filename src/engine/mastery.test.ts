import { describe, it, expect } from 'vitest'
import { computeMastery, computeAllMastery, classifyAttempt, BKT_CONFIG } from './mastery'
import type { Attempt } from '../types'

function makeAttempt(partial: Partial<Attempt>): Attempt {
  return {
    id: 'att_' + Math.random().toString(36).substring(2, 7),
    studentId: 'student_1',
    sessionId: 'session_1',
    questionId: 'q01',
    conceptId: 'fractions-add',
    correct: true,
    chosenIndex: 1,
    mistakeTag: null,
    hintsUsed: 0,
    timeTakenMs: 4500,
    confidence: 'sure',
    attemptType: 'confident_correct',
    timestamp: Date.now(),
    ...partial,
  }
}

describe('Bayesian Knowledge Tracing (BKT) Mastery Engine', () => {
  describe('classifyAttempt()', () => {
    it('classifies sure + correct as confident_correct', () => {
      expect(classifyAttempt('sure', true)).toBe('confident_correct')
    })

    it('classifies maybe + correct as maybe_correct', () => {
      expect(classifyAttempt('maybe', true)).toBe('maybe_correct')
    })

    it('classifies guess + correct as lucky_guess', () => {
      expect(classifyAttempt('guess', true)).toBe('lucky_guess')
    })

    it('classifies sure + wrong as misconception (critical)', () => {
      expect(classifyAttempt('sure', false)).toBe('misconception')
    })

    it('classifies maybe/guess + wrong as honest_gap', () => {
      expect(classifyAttempt('maybe', false)).toBe('honest_gap')
      expect(classifyAttempt('guess', false)).toBe('honest_gap')
    })
  })

  describe('computeMastery()', () => {
    it('handles no attempts: returns prior pInit (0.3) with low confidence', () => {
      const result = computeMastery([], 'fractions-add')
      expect(result.score).toBe(BKT_CONFIG.pInit)
      expect(result.attemptsCount).toBe(0)
      expect(result.confidenceLevel).toBe('low')
    })

    it('hand-calculated single clean confident correct answer', () => {
      /**
       * Hand Calculation:
       * L0 = 0.3, S = 0.1, G = 0.25, T = 0.15
       * Numerator = 0.3 * (1 - 0.1) = 0.27
       * Denominator = 0.27 + (1 - 0.3) * 0.25 = 0.27 + 0.175 = 0.445
       * Posterior = 0.27 / 0.445 = 0.60674
       * L1 = 0.60674 + (1 - 0.60674) * 0.15 = 0.6657 -> ~0.666
       */
      const attempt = makeAttempt({
        conceptId: 'fractions-add',
        correct: true,
        confidence: 'sure',
        hintsUsed: 0,
        timestamp: 1000,
      })
      const result = computeMastery([attempt], 'fractions-add')
      expect(result.score).toBeCloseTo(0.666, 2)
      expect(result.attemptsCount).toBe(1)
      expect(result.confidenceLevel).toBe('low')
    })

    it('hand-calculated single honest gap (maybe + wrong)', () => {
      /**
       * Hand Calculation:
       * L0 = 0.3, S = 0.1, G = 0.25, effectiveLearn = 0.04
       * Numerator = 0.3 * 0.1 = 0.03
       * Denominator = 0.03 + (1 - 0.3) * (1 - 0.25) = 0.03 + 0.525 = 0.555
       * Posterior = 0.03 / 0.555 = 0.05405
       * Raw L1 = 0.05405 + (1 - 0.05405) * 0.04 = 0.0919
       * Honest gap retention floor = 0.30 * 0.65 = 0.1950
       * L1 = max(0.1950, 0.0919) = 0.195
       */
      const attempt = makeAttempt({
        conceptId: 'fractions-add',
        correct: false,
        confidence: 'maybe',
        attemptType: 'honest_gap',
        hintsUsed: 0,
        timestamp: 1000,
      })
      const result = computeMastery([attempt], 'fractions-add')
      expect(result.score).toBeCloseTo(0.195, 2)
      expect(result.score).toBeLessThan(BKT_CONFIG.pInit)
    })

    it('misconception (sure + wrong) drops mastery significantly more than honest_gap', () => {
      /**
       * Hand Calculation:
       * Misconception has S = 0.03, effectiveLearn = 0.02
       * Numerator = 0.3 * 0.03 = 0.009
       * Denominator = 0.009 + 0.7 * 0.75 = 0.534
       * Posterior = 0.009 / 0.534 = 0.01685
       * Raw L1 = 0.01685 + 0.98315 * 0.02 = 0.0365
       * Misconception floor = 0.30 * 0.40 = 0.120 (never drops below ~40% of previous value)
       * L1 = max(0.120, 0.0365) = 0.120
       */
      const misconceptionAttempt = makeAttempt({
        conceptId: 'ratios',
        correct: false,
        confidence: 'sure',
        attemptType: 'misconception',
        timestamp: 1000,
      })
      const honestGapAttempt = makeAttempt({
        conceptId: 'ratios',
        correct: false,
        confidence: 'guess',
        attemptType: 'honest_gap',
        timestamp: 1000,
      })

      const misconceptionResult = computeMastery([misconceptionAttempt], 'ratios')
      const honestGapResult = computeMastery([honestGapAttempt], 'ratios')

      expect(misconceptionResult.score).toBeCloseTo(0.120, 2)
      expect(honestGapResult.score).toBeCloseTo(0.195, 2)
      // Misconception penalty must be substantially larger than honest gap
      expect(misconceptionResult.score).toBeLessThan(honestGapResult.score)
    })

    it('single misconception never reduces mastery below ~40% of previous value and never falls below 0.05', () => {
      // Single misconception from baseline prior 0.30:
      // Expected = 0.30 * 0.40 = 0.120 (>= 0.05)
      const attempt = makeAttempt({
        conceptId: 'ratios',
        correct: false,
        confidence: 'sure',
        attemptType: 'misconception',
        timestamp: 1000,
      })
      const result = computeMastery([attempt], 'ratios')
      expect(result.score).toBeCloseTo(0.120, 2)
      expect(result.score).toBeGreaterThanOrEqual(0.3 * 0.4)
      expect(result.score).toBeGreaterThanOrEqual(0.05)
    })

    it('multiple misconceptions within the same concept continue reducing mastery gradually until the 0.05 floor', () => {
      // Trial 1: 0.30 * 0.40 = 0.120
      // Trial 2: max(0.05, 0.120 * 0.40 = 0.048) = 0.050
      // Trial 3: max(0.05, 0.050 * 0.40 = 0.020) = 0.050 (stays at absolute floor)
      const attempt1 = makeAttempt({ conceptId: 'ratios', correct: false, confidence: 'sure', attemptType: 'misconception', timestamp: 1000 })
      const attempt2 = makeAttempt({ conceptId: 'ratios', correct: false, confidence: 'sure', attemptType: 'misconception', timestamp: 2000 })
      const attempt3 = makeAttempt({ conceptId: 'ratios', correct: false, confidence: 'sure', attemptType: 'misconception', timestamp: 3000 })

      const res1 = computeMastery([attempt1], 'ratios')
      const res2 = computeMastery([attempt1, attempt2], 'ratios')
      const res3 = computeMastery([attempt1, attempt2, attempt3], 'ratios')

      expect(res1.score).toBeCloseTo(0.120, 2)
      expect(res2.score).toBeCloseTo(0.050, 2)
      expect(res3.score).toBe(0.050)
      // Never falls below 0.05
      expect(res3.score).toBeGreaterThanOrEqual(0.05)

      // Test multiple misconceptions from high prior (3 correct answers first)
      const highPriorAttempts: Attempt[] = [
        makeAttempt({ conceptId: 'decimals', correct: true, confidence: 'sure', timestamp: 1000 }),
        makeAttempt({ conceptId: 'decimals', correct: true, confidence: 'sure', timestamp: 2000 }),
        makeAttempt({ conceptId: 'decimals', correct: true, confidence: 'sure', timestamp: 3000 }),
      ]
      const beforeScore = computeMastery(highPriorAttempts, 'decimals').score
      expect(beforeScore).toBeGreaterThan(0.9)

      // Add 4 consecutive misconceptions: mastery steps down gradually
      const misc1 = makeAttempt({ conceptId: 'decimals', correct: false, confidence: 'sure', attemptType: 'misconception', timestamp: 4000 })
      const misc2 = makeAttempt({ conceptId: 'decimals', correct: false, confidence: 'sure', attemptType: 'misconception', timestamp: 5000 })
      const misc3 = makeAttempt({ conceptId: 'decimals', correct: false, confidence: 'sure', attemptType: 'misconception', timestamp: 6000 })
      const misc4 = makeAttempt({ conceptId: 'decimals', correct: false, confidence: 'sure', attemptType: 'misconception', timestamp: 7000 })

      const s1 = computeMastery([...highPriorAttempts, misc1], 'decimals').score
      const s2 = computeMastery([...highPriorAttempts, misc1, misc2], 'decimals').score
      const s3 = computeMastery([...highPriorAttempts, misc1, misc2, misc3], 'decimals').score
      const s4 = computeMastery([...highPriorAttempts, misc1, misc2, misc3, misc4], 'decimals').score

      // Verify gradual monotonic decrease
      expect(s1).toBeLessThan(beforeScore)
      expect(s2).toBeLessThan(s1)
      expect(s3).toBeLessThan(s2)
      expect(s4).toBeLessThanOrEqual(s3)
      // Verify bounded by 0.05
      expect(s4).toBe(0.05)
      expect(s4).toBeGreaterThanOrEqual(0.05)
    })

    it('hints used reduce credit for a correct answer', () => {
      // 0 hints
      const cleanAttempt = makeAttempt({
        conceptId: 'decimals',
        correct: true,
        hintsUsed: 0,
        confidence: 'sure',
        timestamp: 1000,
      })
      // 2 hints
      const hintAttempt = makeAttempt({
        conceptId: 'decimals',
        correct: true,
        hintsUsed: 2,
        confidence: 'sure',
        timestamp: 1000,
      })

      const cleanResult = computeMastery([cleanAttempt], 'decimals')
      const hintResult = computeMastery([hintAttempt], 'decimals')

      // Hinted answer should give less mastery evidence than clean answer
      expect(hintResult.score).toBeLessThan(cleanResult.score)
      expect(cleanResult.score).toBeCloseTo(0.666, 2)
      expect(hintResult.score).toBeCloseTo(0.452, 2)
    })

    it('lucky guess (guess + correct) counts as weak evidence only', () => {
      const luckyAttempt = makeAttempt({
        conceptId: 'basic-equations',
        correct: true,
        confidence: 'guess',
        attemptType: 'lucky_guess',
        hintsUsed: 0,
        timestamp: 1000,
      })
      const confidentAttempt = makeAttempt({
        conceptId: 'basic-equations',
        correct: true,
        confidence: 'sure',
        attemptType: 'confident_correct',
        hintsUsed: 0,
        timestamp: 1000,
      })

      const luckyResult = computeMastery([luckyAttempt], 'basic-equations')
      const confidentResult = computeMastery([confidentAttempt], 'basic-equations')

      expect(luckyResult.score).toBeLessThan(confidentResult.score)
      expect(luckyResult.score).toBeCloseTo(0.427, 2)
    })

    it('all correct sequence monotonically increases mastery to high level', () => {
      const attempts = [1, 2, 3, 4, 5, 6].map((i) =>
        makeAttempt({
          conceptId: 'balancing-equations',
          correct: true,
          confidence: 'sure',
          hintsUsed: 0,
          timestamp: 1000 * i,
        }),
      )

      const result = computeMastery(attempts, 'balancing-equations')
      expect(result.score).toBeGreaterThan(0.95)
      expect(result.confidenceLevel).toBe('high')
      expect(result.attemptsCount).toBe(6)
    })

    it('all wrong sequence monotonically drops mastery to near zero', () => {
      const attempts = [1, 2, 3, 4].map((i) =>
        makeAttempt({
          conceptId: 'fractions-add',
          correct: false,
          confidence: 'maybe',
          timestamp: 1000 * i,
        }),
      )

      const result = computeMastery(attempts, 'fractions-add')
      expect(result.score).toBeLessThan(0.1)
      expect(result.score).toBeGreaterThanOrEqual(0.05)
      expect(result.confidenceLevel).toBe('medium')
    })

    it('mixed attempts reflect realistic ebb and flow of mastery', () => {
      const attempts = [
        makeAttempt({ conceptId: 'ratios', correct: true, timestamp: 1000 }),
        makeAttempt({ conceptId: 'ratios', correct: false, confidence: 'sure', timestamp: 2000 }), // misconception
        makeAttempt({ conceptId: 'ratios', correct: true, timestamp: 3000 }),
      ]

      const result = computeMastery(attempts, 'ratios')
      expect(result.score).toBeGreaterThan(0.2)
      expect(result.score).toBeLessThan(0.8)
      expect(result.confidenceLevel).toBe('medium')
    })
  })

  describe('computeAllMastery()', () => {
    it('computes mastery for all 22 concepts correctly', () => {
      const attempts = [
        makeAttempt({ conceptId: 'fractions-add', correct: true, timestamp: 1000 }),
        makeAttempt({ conceptId: 'fractions-add', correct: true, timestamp: 2000 }),
        makeAttempt({ conceptId: 'fractions-add', correct: true, timestamp: 3000 }),
        makeAttempt({ conceptId: 'decimals', correct: false, timestamp: 1000 }),
      ]

      const map = computeAllMastery(attempts)
      expect(Object.keys(map)).toHaveLength(22)
      expect(map['fractions-add'].score).toBeGreaterThan(0.8)
      expect(map['fractions-add'].confidenceLevel).toBe('medium')
      expect(map['decimals'].score).toBeLessThan(0.3)
      expect(map['ratios'].score).toBe(0.3) // unattempted
      expect(map['ratios'].attemptsCount).toBe(0)
    })
  })
})
