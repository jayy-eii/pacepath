/**
 * misconceptionDetect.ts
 * Pure, rule-based detection engine for mathematical misconceptions.
 * Executes buggy procedures to simulate erroneous student reasoning,
 * discriminates strict arithmetic calculation slips, and ranks candidates.
 * Works 100% OFFLINE without any LLM dependency.
 */

import type {
  Question,
  DetectionResult,
  CandidateMisconception,
  ConfidenceRating,
  MisconceptionEvent,
} from '../types'
import {
  parseNumericAnswer,
  areNumbersClose,
  detectStrictCalculationSlip,
  checkEquationSteps,
} from './mathCore'

export interface BuggyProcedureResult {
  predictedAnswer: number | string
  divergenceStep: number
  steps: string[]
}

export type BuggyProcedureFn = (
  variables: Record<string, number | string>,
) => BuggyProcedureResult | null

/**
 * Registry of executable buggy procedures for each known school misconception.
 */
export const BUGGY_PROCEDURES: Record<string, BuggyProcedureFn> = {
  // 1. Sign error transposing: adding instead of subtracting when moving term
  sign_error_transposing: (vars) => {
    if (vars.a !== undefined && vars.c !== undefined && vars.d !== undefined) {
      const a = Number(vars.a)
      const b = Number(vars.b || 1)
      const c = Number(vars.c)
      const d = Number(vars.d)
      const expConst = a * c
      // Mistake: d + expConst instead of d - expConst
      const buggyTrans = d + expConst
      const buggyAns = buggyTrans / (a * b)
      return {
        predictedAnswer: buggyAns,
        divergenceStep: 3,
        steps: [
          `${a}(${b === 1 ? '' : b}x ${c >= 0 ? '+ ' + c : '- ' + Math.abs(c)}) = ${d}`,
          `${a * b}x ${expConst >= 0 ? '+ ' + expConst : '- ' + Math.abs(expConst)} = ${d}`,
          `${a * b}x = ${d} + ${expConst} = ${buggyTrans}  ← [Sign error: added instead of subtracted]`,
          `x = ${buggyTrans} / ${a * b} = ${buggyAns}`,
        ],
      }
    }
    if (vars.a !== undefined && vars.b !== undefined && vars.c !== undefined) {
      const a = Number(vars.a)
      const b = Number(vars.b)
      const c = Number(vars.c)
      // Standard: ax + b = c => ax = c + b instead of c - b
      const buggyTrans = c + b
      const buggyAns = buggyTrans / a
      return {
        predictedAnswer: buggyAns,
        divergenceStep: 2,
        steps: [
          `${a === 1 ? '' : a}x ${b >= 0 ? '+ ' + b : '- ' + Math.abs(b)} = ${c}`,
          `${a === 1 ? '' : a}x = ${c} + ${Math.abs(b)} = ${buggyTrans}  ← [Sign error: added instead of subtracted]`,
          `x = ${buggyTrans} / ${a} = ${buggyAns}`,
        ],
      }
    }
    return null
  },

  // 2. Distribute first term only: a(bx + c) => abx + c = d
  distribute_first_term_only: (vars) => {
    if (vars.a !== undefined && vars.c !== undefined && vars.d !== undefined) {
      const a = Number(vars.a)
      const b = Number(vars.b || 1)
      const c = Number(vars.c)
      const d = Number(vars.d)
      // Mistake: 2(x+3) => 2x + 3 instead of 2x + 6
      const buggyTrans = d - c
      const buggyAns = buggyTrans / (a * b)
      return {
        predictedAnswer: buggyAns,
        divergenceStep: 2,
        steps: [
          `${a}(${b === 1 ? '' : b}x ${c >= 0 ? '+ ' + c : '- ' + Math.abs(c)}) = ${d}`,
          `${a * b}x + ${c} = ${d}  ← [Only multiplied x by ${a}, forgot to multiply ${c}]`,
          `${a * b}x = ${d} - ${c} = ${buggyTrans}`,
          `x = ${buggyTrans} / ${a * b} = ${buggyAns}`,
        ],
      }
    }
    return null
  },

  // 3. Subtract coefficient instead of divide: a(x+c) = d => x+c = d - a
  subtract_coefficient_instead_of_divide: (vars) => {
    if (vars.a !== undefined && vars.c !== undefined && vars.d !== undefined) {
      const a = Number(vars.a)
      const b = Number(vars.b || 1)
      const c = Number(vars.c)
      const d = Number(vars.d)
      // Mistake: subtracted a from d instead of dividing
      const buggyRhs = d - a
      const buggyAns = (buggyRhs - c) / b
      return {
        predictedAnswer: buggyAns,
        divergenceStep: 2,
        steps: [
          `${a}(${b === 1 ? '' : b}x ${c >= 0 ? '+ ' + c : '- ' + Math.abs(c)}) = ${d}`,
          `${b === 1 ? '' : b}x + ${c} = ${d} - ${a} = ${buggyRhs}  ← [Subtracted ${a} instead of dividing by ${a}]`,
          `x = ${buggyRhs} - ${c} = ${buggyAns}`,
        ],
      }
    }
    if (vars.a !== undefined && vars.b !== undefined && vars.c !== undefined) {
      const a = Number(vars.a)
      const b = Number(vars.b)
      const c = Number(vars.c)
      // ax + b = c => x + b = c - a => x = c - a - b
      const buggyAns = c - a - b
      return {
        predictedAnswer: buggyAns,
        divergenceStep: 2,
        steps: [
          `${a}x + ${b} = ${c}`,
          `x + ${b} = ${c} - ${a} = ${c - a}  ← [Subtracted coefficient ${a} instead of dividing]`,
          `x = ${c - a} - ${b} = ${buggyAns}`,
        ],
      }
    }
    return null
  },

  // 4. Combine unlike terms: 2x + 5 = 17 => 7x = 17
  combine_unlike_terms: (vars) => {
    if (vars.a !== undefined && vars.b !== undefined && vars.c !== undefined) {
      const a = Number(vars.a)
      const b = Number(vars.b)
      const c = Number(vars.c)
      const combined = a + b
      if (combined === 0) return null
      const buggyAns = parseFloat((c / combined).toFixed(2))
      return {
        predictedAnswer: buggyAns,
        divergenceStep: 2,
        steps: [
          `${a}x + ${b} = ${c}`,
          `${combined}x = ${c}  ← [Added variable coefficient ${a} and constant ${b} together]`,
          `x = ${c} / ${combined} ≈ ${buggyAns}`,
        ],
      }
    }
    return null
  },

  // 5. Operate on one side only: forgetting right side
  operate_on_one_side_only: (vars) => {
    if (vars.a !== undefined && vars.b !== undefined && vars.c !== undefined) {
      const a = Number(vars.a)
      const c = Number(vars.c)
      const buggyAns = c / a
      return {
        predictedAnswer: buggyAns,
        divergenceStep: 2,
        steps: [
          `${a}x + ${vars.b} = ${c}`,
          `${a}x = ${c}  ← [Eliminated ${vars.b} on left, but forgot to subtract from right side]`,
          `x = ${c} / ${a} = ${buggyAns}`,
        ],
      }
    }
    if (vars.a !== undefined && vars.c !== undefined && vars.d !== undefined) {
      const a = Number(vars.a)
      const b = Number(vars.b || 1)
      const d = Number(vars.d)
      const buggyAns = d / (a * b)
      return {
        predictedAnswer: buggyAns,
        divergenceStep: 3,
        steps: [
          `${a}(${b === 1 ? '' : b}x + ${vars.c}) = ${d}`,
          `${a * b}x = ${d}  ← [Eliminated constant term on left, forgot to subtract from right]`,
          `x = ${d} / ${a * b} = ${buggyAns}`,
        ],
      }
    }
    return null
  },

  // 6. Fractions: add denominators straight across (1/4 + 2/4 = 3/8 = 0.375)
  fraction_add_denominators: (vars) => {
    if (vars.n1 !== undefined && vars.d1 !== undefined && vars.n2 !== undefined && vars.d2 !== undefined) {
      const n1 = Number(vars.n1)
      const d1 = Number(vars.d1)
      const n2 = Number(vars.n2)
      const d2 = Number(vars.d2)
      const buggyNum = n1 + n2
      const buggyDen = d1 + d2
      const buggyAns = buggyNum / buggyDen
      return {
        predictedAnswer: buggyAns,
        divergenceStep: 1,
        steps: [
          `${n1}/${d1} + ${n2}/${d2}`,
          `(${n1} + ${n2}) / (${d1} + ${d2}) = ${buggyNum}/${buggyDen}  ← [Added both denominators together]`,
          `= ${buggyAns}`,
        ],
      }
    }
    return null
  },

  // 7. Fractions: cross multiply during multiplication
  fraction_multiply_cross_confusion: (vars) => {
    if (vars.n1 !== undefined && vars.d1 !== undefined && vars.n2 !== undefined && vars.d2 !== undefined) {
      const n1 = Number(vars.n1)
      const d1 = Number(vars.d1)
      const n2 = Number(vars.n2)
      const d2 = Number(vars.d2)
      const buggyNum = n1 * d2
      const buggyDen = d1 * n2
      const buggyAns = parseFloat((buggyNum / buggyDen).toFixed(3))
      return {
        predictedAnswer: buggyAns,
        divergenceStep: 1,
        steps: [
          `(${n1}/${d1}) × (${n2}/${d2})`,
          `(${n1} × ${d2}) / (${d1} × ${n2}) = ${buggyNum}/${buggyDen}  ← [Cross-multiplied instead of straight across]`,
          `≈ ${buggyAns}`,
        ],
      }
    }
    return null
  },

  // 8. Integer sign rule error: -6 - 4 => +10 (confusing with -6 * -4)
  integer_sign_rule_error: (vars) => {
    if (vars.a !== undefined && vars.b !== undefined) {
      const a = Number(vars.a)
      const b = Number(vars.b)
      if (a < 0 && b < 0) {
        // -6 - 4 treated as +10
        const buggyAns = Math.abs(a) + Math.abs(b)
        return {
          predictedAnswer: buggyAns,
          divergenceStep: 1,
          steps: [
            `${a} ${b >= 0 ? '+ ' + b : '- ' + Math.abs(b)}`,
            `+${Math.abs(a) + Math.abs(b)}  ← [Treated two negatives as making positive: "minus-minus plus"]`,
          ],
        }
      }
      if (a < 0 && b > 0) {
        // -8 + 3 treated as -11
        const buggyAns = a - b
        return {
          predictedAnswer: buggyAns,
          divergenceStep: 1,
          steps: [
            `${a} + ${b}`,
            `${buggyAns}  ← [Added absolute values without offsetting opposite signs]`,
          ],
        }
      }
    }
    return null
  },

  // 9. Ratio additive thinking: adding difference instead of multiplying
  ratio_additive_thinking: (vars) => {
    if (vars.a !== undefined && vars.b !== undefined && vars.newA !== undefined) {
      const a = Number(vars.a)
      const b = Number(vars.b)
      const newA = Number(vars.newA)
      const diff = newA - a
      const buggyAns = b + diff
      return {
        predictedAnswer: buggyAns,
        divergenceStep: 1,
        steps: [
          `Ratio ${a} : ${b}`,
          `First term increased from ${a} to ${newA} (+${diff})`,
          `Second term: ${b} + ${diff} = ${buggyAns}  ← [Added ${diff} instead of multiplying by scale factor]`,
        ],
      }
    }
    return null
  },

  // 10. Order of operations error: doing addition before multiplication (5 + 3 * 4 = 32)
  order_of_operations_error: (vars) => {
    if (vars.a !== undefined && vars.b !== undefined && vars.c !== undefined) {
      const a = Number(vars.a)
      const b = Number(vars.b)
      const c = Number(vars.c)
      const buggyAns = (a + b) * c
      return {
        predictedAnswer: buggyAns,
        divergenceStep: 1,
        steps: [
          `${a} + ${b} × ${c}`,
          `(${a} + ${b}) × ${c} = ${a + b} × ${c}  ← [Added left-to-right before multiplying]`,
          `= ${buggyAns}`,
        ],
      }
    }
    return null
  },

  // 11. Exponent multiply base: 2^4 = 2 * 4 = 8
  exponent_multiply_base: (vars) => {
    if (vars.base !== undefined && vars.exp !== undefined) {
      const base = Number(vars.base)
      const exp = Number(vars.exp)
      const buggyAns = base * exp
      return {
        predictedAnswer: buggyAns,
        divergenceStep: 1,
        steps: [
          `${base}^${exp}`,
          `${base} × ${exp} = ${buggyAns}  ← [Multiplied base by power instead of repeated multiplication]`,
        ],
      }
    }
    return null
  },

  // 12. Negative power sign error: 2^-3 = -8 or -6
  negative_power_or_squared_sign_error: (vars) => {
    if (vars.base !== undefined && vars.exp !== undefined) {
      const base = Number(vars.base)
      const exp = Number(vars.exp)
      const buggyAns = -(Math.pow(base, Math.abs(exp)))
      return {
        predictedAnswer: buggyAns,
        divergenceStep: 1,
        steps: [
          `${base}^(${exp})`,
          `-${Math.pow(base, Math.abs(exp))}  ← [Assumed negative exponent produces a negative number]`,
        ],
      }
    }
    return null
  },
}

export const MISCONCEPTION_PROCEDURE_TYPES: Record<string, string[]> = {
  sign_error_transposing: ['linear_bracket', 'linear_standard'],
  distribute_first_term_only: ['linear_bracket'],
  subtract_coefficient_instead_of_divide: ['linear_bracket', 'linear_standard'],
  combine_unlike_terms: ['linear_standard'],
  operate_on_one_side_only: ['linear_bracket', 'linear_standard'],
  fraction_add_denominators: ['fraction_add'],
  fraction_multiply_cross_confusion: ['fraction_multiply'],
  integer_sign_rule_error: ['integer_op'],
  decimal_place_value_error: ['decimal_compare'],
  ratio_additive_thinking: ['ratio_scale'],
  percent_base_confusion: ['percent_eval'],
  order_of_operations_error: ['order_of_operations'],
  exponent_multiply_base: ['exponent_eval'],
  negative_power_or_squared_sign_error: ['exponent_eval', 'negative_power'],
}

/**
 * Pure function: Detects whether a student answer matches a known misconception,
 * a strict calculation slip, an exact correct answer, or is unmatched/ambiguous.
 */
export function detectMisconception(
  question: Question,
  studentAnswer: number | string,
  history?: MisconceptionEvent[],
  confidence?: ConfidenceRating,
): DetectionResult {
  const parsedStudent = parseNumericAnswer(studentAnswer)
  if (parsedStudent === null) {
    return { status: 'unmatched', candidates: [] }
  }

  // 1. Check if student answer is mathematically correct
  const correctNum = question.correctAnswer !== undefined ? parseNumericAnswer(question.correctAnswer) : null
  if (correctNum !== null && areNumbersClose(parsedStudent, correctNum, question.tolerance || 0.001)) {
    return { status: 'correct', candidates: [] }
  }

  // 2. Check for strict arithmetic slip (re-running correct procedure with single arithmetic perturbation)
  if (question.procedure) {
    const slipCheck = detectStrictCalculationSlip(
      question.procedure.type,
      question.procedure.variables,
      parsedStudent,
    )
    if (slipCheck.isSlip) {
      return {
        status: 'calculation_slip',
        candidates: [],
        slipDetails: slipCheck.slipDetails,
      }
    }
  }

  // 3. Procedural Buggy Simulations across applicable misconceptions
  const matchedCandidates: CandidateMisconception[] = []

  if (question.procedure) {
    const procType = question.procedure.type
    for (const [miscId, procedureFn] of Object.entries(BUGGY_PROCEDURES)) {
      const allowedTypes = MISCONCEPTION_PROCEDURE_TYPES[miscId]
      if (allowedTypes && !allowedTypes.includes(procType)) {
        continue // Skip procedure not relevant to this question format
      }

      const result = procedureFn(question.procedure.variables)
      if (result) {
        const predictedNum = parseNumericAnswer(result.predictedAnswer)
        if (predictedNum !== null && areNumbersClose(parsedStudent, predictedNum, question.tolerance || 0.05)) {
          // Check prior frequency in student history
          const priorCount = history ? history.filter((h) => h.misconceptionId === miscId).length : 0
          // Confidence boost if student was 'sure'
          const confScore = confidence === 'sure' ? 0.95 : confidence === 'maybe' ? 0.8 : 0.65
          const weightedConfidence = Math.min(0.99, confScore + priorCount * 0.02)

          matchedCandidates.push({
            misconceptionId: miscId,
            confidence: weightedConfidence,
            evidence: result.steps,
            matchesAnswer: true,
            predictedAnswer: result.predictedAnswer,
            divergenceStep: result.divergenceStep,
          })
        }
      }
    }
  }

  // 4. MCQ wrongTags mapping if student answered an option
  if (question.options && typeof studentAnswer === 'number' && question.wrongTags) {
    const tag = question.wrongTags[String(studentAnswer)]
    if (tag) {
      const tagToMiscMap: Record<string, string> = {
        sign_error: 'sign_error_transposing',
        added_denominators: 'fraction_add_denominators',
        formula_misuse: 'distribute_first_term_only',
      }
      const mappedId = tagToMiscMap[tag]
      if (mappedId && !matchedCandidates.some((c) => c.misconceptionId === mappedId)) {
        matchedCandidates.push({
          misconceptionId: mappedId,
          confidence: 0.75,
          evidence: [`Option selected with tag: ${tag}`],
          matchesAnswer: true,
        })
      }
    }
  }

  // 5. Rank and return status
  if (matchedCandidates.length === 1) {
    return {
      status: 'matched',
      candidates: matchedCandidates,
    }
  }

  if (matchedCandidates.length > 1) {
    // Sort by confidence descending
    matchedCandidates.sort((a, b) => b.confidence - a.confidence)
    return {
      status: 'ambiguous',
      candidates: matchedCandidates,
    }
  }

  return {
    status: 'unmatched',
    candidates: [],
  }
}

/**
 * Show-Your-Work step-checking mode.
 * Evaluates multi-line student submissions to find where the work diverged.
 */
export function checkSteps(
  lines: string[],
  question: Question,
): {
  valid: boolean
  firstInvalidLineIndex: number | null
  invalidLineText: string | null
  detectedMisconceptionId: string | null
  explanation: string
} {
  const correctNum = question.correctAnswer !== undefined ? parseNumericAnswer(question.correctAnswer) || 0 : 0
  return checkEquationSteps(lines, correctNum)
}
