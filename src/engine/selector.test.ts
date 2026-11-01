import { describe, it, expect } from 'vitest'
import { selectNextQuestion } from './selector'
import type { Attempt, Question } from '../types'
import rawQuestions from '../data/questions.json'

const questions = rawQuestions as unknown as Question[]

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
    timeTakenMs: 3000,
    confidence: 'sure',
    attemptType: 'confident_correct',
    timestamp: Date.now(),
    ...partial,
  }
}

describe('Adaptive Question Selector', () => {
  it('cold start: serves diagnostic questions when total attempts < 8', () => {
    const result = selectNextQuestion({
      studentGrade: 7,
      allAttempts: [],
      sessionAttemptedQuestionIds: [],
      questionsPool: questions,
      randomFloat: () => 0.5,
    })

    expect(result.selectionStrategy).toBe('diagnostic')
    expect(result.reason.en).toContain('Diagnostic check')
    expect(result.reason.hi).toContain('निदानात्मक प्रश्न')
    expect(result.question).toBeDefined()
  })

  it('lowest mastery strategy (60% weight, roll < 0.6): targets the weakest concept', () => {
    // Generate 8 attempts so cold start is complete
    // Make fractions-add weak (0.10) and decimals strong (0.85)
    const attempts: Attempt[] = [
      // 4 fractions attempts (wrong)
      makeAttempt({ conceptId: 'fractions-add', correct: false, timestamp: 1000 }),
      makeAttempt({ conceptId: 'fractions-add', correct: false, timestamp: 2000 }),
      makeAttempt({ conceptId: 'fractions-add', correct: false, timestamp: 3000 }),
      makeAttempt({ conceptId: 'fractions-add', correct: false, timestamp: 4000 }),
      // 4 decimals attempts (correct)
      makeAttempt({ conceptId: 'decimals', correct: true, timestamp: 5000 }),
      makeAttempt({ conceptId: 'decimals', correct: true, timestamp: 6000 }),
      makeAttempt({ conceptId: 'decimals', correct: true, timestamp: 7000 }),
      makeAttempt({ conceptId: 'decimals', correct: true, timestamp: 8000 }),
    ]

    const result = selectNextQuestion({
      studentGrade: 7,
      allAttempts: attempts,
      sessionAttemptedQuestionIds: [],
      questionsPool: questions,
      randomFloat: () => 0.25, // < 0.60
    })

    expect(result.selectionStrategy).toBe('lowest_mastery')
    expect(result.conceptId).toBe('fractions-add')
    expect(result.targetDifficulty).toBe(1) // low mastery (< 0.4) maps to difficulty 1
    expect(result.reason.en).toContain('lowest mastery topic')
  })

  it('not recent strategy (20% weight, 0.6 <= roll < 0.8): targets spaced repetition', () => {
    // 8 attempts, where fractions-add was practiced 10 days ago (timestamp 100)
    // while all other 7 attempts were recent (timestamp 9000+)
    const attempts: Attempt[] = [
      makeAttempt({ conceptId: 'fractions-add', correct: true, timestamp: 100 }),
      makeAttempt({ conceptId: 'ratios', correct: true, timestamp: 9100 }),
      makeAttempt({ conceptId: 'ratios', correct: true, timestamp: 9200 }),
      makeAttempt({ conceptId: 'decimals', correct: true, timestamp: 9300 }),
      makeAttempt({ conceptId: 'decimals', correct: true, timestamp: 9400 }),
      makeAttempt({ conceptId: 'basic-equations', correct: true, timestamp: 9500 }),
      makeAttempt({ conceptId: 'basic-equations', correct: true, timestamp: 9600 }),
      makeAttempt({ conceptId: 'balancing-equations', correct: true, timestamp: 9700 }),
    ]

    const result = selectNextQuestion({
      studentGrade: 7,
      allAttempts: attempts,
      sessionAttemptedQuestionIds: [],
      questionsPool: questions,
      randomFloat: () => 0.72, // 0.60 to 0.80
    })

    expect(result.selectionStrategy).toBe('not_recent')
    expect(result.conceptId).toBe('fractions-add')
    expect(result.reason.en).toContain("haven't practiced Fractions")
  })

  it('challenge strategy (20% weight, roll >= 0.8): targets high-mastery concept for push', () => {
    // 8 attempts: decimals has 100% mastery, ratios is lower
    const attempts: Attempt[] = [
      makeAttempt({ conceptId: 'decimals', correct: true, hintsUsed: 0, timestamp: 1000 }),
      makeAttempt({ conceptId: 'decimals', correct: true, hintsUsed: 0, timestamp: 2000 }),
      makeAttempt({ conceptId: 'decimals', correct: true, hintsUsed: 0, timestamp: 3000 }),
      makeAttempt({ conceptId: 'decimals', correct: true, hintsUsed: 0, timestamp: 4000 }),
      makeAttempt({ conceptId: 'ratios', correct: false, timestamp: 5000 }),
      makeAttempt({ conceptId: 'ratios', correct: false, timestamp: 6000 }),
      makeAttempt({ conceptId: 'ratios', correct: true, timestamp: 7000 }),
      makeAttempt({ conceptId: 'ratios', correct: false, timestamp: 8000 }),
    ]

    const result = selectNextQuestion({
      studentGrade: 7,
      allAttempts: attempts,
      sessionAttemptedQuestionIds: [],
      questionsPool: questions,
      randomFloat: () => 0.88, // >= 0.80
    })

    expect(result.selectionStrategy).toBe('challenge')
    expect(result.conceptId).toBe('decimals')
    expect(result.targetDifficulty).toBe(3) // High mastery maps to difficulty 3
    expect(result.reason.en).toContain('Challenge')
  })

  it('fast-track up: 3 clean correct answers in a row without hints moves difficulty up', () => {
    // 8 total attempts so past cold start.
    // ratios has 3 clean correct in a row at difficulty 2 base
    const attempts: Attempt[] = [
      makeAttempt({ conceptId: 'decimals', correct: true, timestamp: 1000 }),
      makeAttempt({ conceptId: 'decimals', correct: true, timestamp: 2000 }),
      makeAttempt({ conceptId: 'fractions-add', correct: true, timestamp: 3000 }),
      makeAttempt({ conceptId: 'fractions-add', correct: true, timestamp: 4000 }),
      makeAttempt({ conceptId: 'basic-equations', correct: true, timestamp: 5000 }),
      // 3 clean correct in ratios:
      makeAttempt({ conceptId: 'ratios', correct: true, hintsUsed: 0, timestamp: 6000 }),
      makeAttempt({ conceptId: 'ratios', correct: true, hintsUsed: 0, timestamp: 7000 }),
      makeAttempt({ conceptId: 'ratios', correct: true, hintsUsed: 0, timestamp: 8000 }),
    ]

    const result = selectNextQuestion({
      studentGrade: 7,
      allAttempts: attempts,
      sessionAttemptedQuestionIds: [],
      questionsPool: questions,
      randomFloat: () => 0.95, // Challenge will pick ratios (highest mastery)
    })

    expect(result.conceptId).toBe('ratios')
    expect(result.targetDifficulty).toBe(3) // base 2 or 3 leveled up to 3
    expect(result.reason.en).toContain('Fast-track')
  })

  it('fast-track down: 2 wrong answers in a row moves difficulty down', () => {
    const attempts: Attempt[] = [
      makeAttempt({ conceptId: 'fractions-add', correct: true, timestamp: 1000 }),
      makeAttempt({ conceptId: 'fractions-add', correct: true, timestamp: 2000 }),
      makeAttempt({ conceptId: 'ratios', correct: true, timestamp: 3000 }),
      makeAttempt({ conceptId: 'ratios', correct: true, timestamp: 4000 }),
      makeAttempt({ conceptId: 'basic-equations', correct: true, timestamp: 5000 }),
      makeAttempt({ conceptId: 'balancing-equations', correct: true, timestamp: 6000 }),
      // Last 2 in decimals are wrong
      makeAttempt({ conceptId: 'decimals', correct: false, timestamp: 7000 }),
      makeAttempt({ conceptId: 'decimals', correct: false, timestamp: 8000 }),
    ]

    const result = selectNextQuestion({
      studentGrade: 7,
      allAttempts: attempts,
      sessionAttemptedQuestionIds: [],
      questionsPool: questions,
      randomFloat: () => 0.1, // lowest mastery picks decimals
    })

    expect(result.conceptId).toBe('decimals')
    expect(result.targetDifficulty).toBe(1)
    expect(result.reason.en).toContain('Stepping down')
  })

  it('no repeats within a session: already answered question IDs are excluded', () => {
    const result1 = selectNextQuestion({
      studentGrade: 7,
      allAttempts: [],
      sessionAttemptedQuestionIds: ['q01', 'q02', 'q03'],
      questionsPool: questions,
      randomFloat: () => 0.5,
    })

    expect(['q01', 'q02', 'q03']).not.toContain(result1.question.id)
  })
})
