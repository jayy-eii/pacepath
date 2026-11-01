/**
 * mathCore.ts
 * Pure, zero-dependency algebra parser, solver, and step validator.
 * Evaluates linear equations, fractions, and arithmetic expressions.
 * Provides strict arithmetic slip simulation (re-running the correct procedure with
 * a single arithmetic error injected at each step).
 */

export interface MathStep {
  stepNumber: number
  expression: string
  explanation: string
}

export interface LinearBracketParams {
  a: number // outer multiplier, e.g. 2 in 2(x + 3) = 14
  b: number // coefficient of x inside bracket, usually 1
  c: number // constant inside bracket, e.g. 3
  d: number // right-hand side constant, e.g. 14
}

export interface LinearStandardParams {
  a: number // coefficient of x, e.g. 2 in 2x + 5 = 17
  b: number // constant, e.g. 5
  c: number // right-hand side, e.g. 17
}

export interface FractionParams {
  n1: number
  d1: number
  n2: number
  d2: number
}

/**
 * Normalizes user numeric answers (handling fractions like "3/4", decimals, and whitespace).
 */
export function parseNumericAnswer(input: number | string): number | null {
  if (typeof input === 'number') {
    return isNaN(input) ? null : input
  }
  const clean = input.trim().replace(/^x\s*=\s*/i, '')
  if (clean.includes('/')) {
    const parts = clean.split('/')
    if (parts.length === 2) {
      const num = parseFloat(parts[0].trim())
      const den = parseFloat(parts[1].trim())
      if (!isNaN(num) && !isNaN(den) && den !== 0) {
        return num / den
      }
    }
  }
  const parsed = parseFloat(clean)
  return isNaN(parsed) ? null : parsed
}

/**
 * Checks if two numbers are approximately equal within tolerance.
 */
export function areNumbersClose(a: number, b: number, tolerance = 0.001): boolean {
  return Math.abs(a - b) <= tolerance
}

/**
 * Solves a linear bracket equation a(bx + c) = d step-by-step.
 * Example: 2(x + 3) = 14
 */
export function solveLinearBracket(params: LinearBracketParams): {
  solution: number
  steps: MathStep[]
} {
  const { a, b, c, d } = params
  const expandedX = a * b
  const expandedConst = a * c
  const transposed = d - expandedConst
  const finalX = transposed / expandedX

  const steps: MathStep[] = [
    {
      stepNumber: 1,
      expression: `${a}(${b === 1 ? '' : b}x ${c >= 0 ? '+ ' + c : '- ' + Math.abs(c)}) = ${d}`,
      explanation: 'Original equation',
    },
    {
      stepNumber: 2,
      expression: `${expandedX === 1 ? '' : expandedX}x ${expandedConst >= 0 ? '+ ' + expandedConst : '- ' + Math.abs(expandedConst)} = ${d}`,
      explanation: `Expand bracket by multiplying both terms by ${a}`,
    },
    {
      stepNumber: 3,
      expression: `${expandedX === 1 ? '' : expandedX}x = ${d} ${expandedConst >= 0 ? '- ' + expandedConst : '+ ' + Math.abs(expandedConst)} = ${transposed}`,
      explanation: `Transpose constant term to the right side with opposite sign`,
    },
    {
      stepNumber: 4,
      expression: `x = ${transposed} / ${expandedX} = ${finalX}`,
      explanation: `Divide both sides by the coefficient ${expandedX}`,
    },
  ]

  return { solution: finalX, steps }
}

/**
 * Solves standard linear equation ax + b = c.
 */
export function solveLinearStandard(params: LinearStandardParams): {
  solution: number
  steps: MathStep[]
} {
  const { a, b, c } = params
  const transposed = c - b
  const finalX = transposed / a

  const steps: MathStep[] = [
    {
      stepNumber: 1,
      expression: `${a === 1 ? '' : a}x ${b >= 0 ? '+ ' + b : '- ' + Math.abs(b)} = ${c}`,
      explanation: 'Original equation',
    },
    {
      stepNumber: 2,
      expression: `${a === 1 ? '' : a}x = ${c} ${b >= 0 ? '- ' + b : '+ ' + Math.abs(b)} = ${transposed}`,
      explanation: 'Transpose constant term to right-hand side',
    },
    {
      stepNumber: 3,
      expression: `x = ${transposed} / ${a} = ${finalX}`,
      explanation: `Divide both sides by ${a}`,
    },
  ]

  return { solution: finalX, steps }
}

/**
 * STRICT CALCULATION SLIP DETECTOR:
 * Re-runs the CORRECT procedure with a single arithmetic counting/calculation
 * error (e.g. ±1, ±2, small arithmetic slip) injected at exactly ONE step.
 * Returns true if the student answer matches one of these perturbed outcomes.
 */
export function detectStrictCalculationSlip(
  procedureType: string,
  variables: Record<string, number | string>,
  studentAnswerNum: number,
): { isSlip: boolean; slipDetails?: { expectedStep: string; actualStep: string; divergenceStep: number } } {
  const SLIP_DELTAS = [-2, -1, 1, 2]

  if (procedureType === 'linear_bracket') {
    const a = Number(variables.a)
    const b = Number(variables.b || 1)
    const c = Number(variables.c)
    const d = Number(variables.d)

    // Normal values:
    const expConst = a * c
    const expX = a * b
    const trans = d - expConst
    const correctAns = trans / expX

    // If answer is already exactly correct, not a slip
    if (areNumbersClose(studentAnswerNum, correctAns)) {
      return { isSlip: false }
    }

    // Injection 1: Arithmetic slip in expansion multiplication: a * c perturbed by delta
    for (const delta of SLIP_DELTAS) {
      const slippedExpConst = expConst + delta
      const slippedTrans = d - slippedExpConst
      const candidateAns = slippedTrans / expX
      if (areNumbersClose(studentAnswerNum, candidateAns)) {
        return {
          isSlip: true,
          slipDetails: {
            divergenceStep: 2,
            expectedStep: `${a} × ${c} = ${expConst}`,
            actualStep: `${a} × ${c} ≈ ${slippedExpConst} (arithmetic slip)`,
          },
        }
      }
    }

    // Injection 2: Arithmetic slip in transposing subtraction: (d - expConst) perturbed by delta
    for (const delta of SLIP_DELTAS) {
      const slippedTrans = trans + delta
      const candidateAns = slippedTrans / expX
      if (areNumbersClose(studentAnswerNum, candidateAns)) {
        return {
          isSlip: true,
          slipDetails: {
            divergenceStep: 3,
            expectedStep: `${d} - ${expConst} = ${trans}`,
            actualStep: `${d} - ${expConst} = ${slippedTrans} (arithmetic slip)`,
          },
        }
      }
    }

    // Injection 3: Arithmetic slip in final division: finalX perturbed by delta
    for (const delta of SLIP_DELTAS) {
      const candidateAns = correctAns + delta
      if (areNumbersClose(studentAnswerNum, candidateAns)) {
        return {
          isSlip: true,
          slipDetails: {
            divergenceStep: 4,
            expectedStep: `${trans} / ${expX} = ${correctAns}`,
            actualStep: `${trans} / ${expX} = ${candidateAns} (arithmetic slip)`,
          },
        }
      }
    }
  }

  if (procedureType === 'linear_standard') {
    const a = Number(variables.a)
    const b = Number(variables.b)
    const c = Number(variables.c)

    const trans = c - b
    const correctAns = trans / a

    if (areNumbersClose(studentAnswerNum, correctAns)) {
      return { isSlip: false }
    }

    // Injection 1: Arithmetic slip in (c - b)
    for (const delta of SLIP_DELTAS) {
      const slippedTrans = trans + delta
      const candidateAns = slippedTrans / a
      if (areNumbersClose(studentAnswerNum, candidateAns)) {
        return {
          isSlip: true,
          slipDetails: {
            divergenceStep: 2,
            expectedStep: `${c} - ${b} = ${trans}`,
            actualStep: `${c} - ${b} = ${slippedTrans} (arithmetic slip)`,
          },
        }
      }
    }

    // Injection 2: Division slip
    for (const delta of SLIP_DELTAS) {
      const candidateAns = correctAns + delta
      if (areNumbersClose(studentAnswerNum, candidateAns)) {
        return {
          isSlip: true,
          slipDetails: {
            divergenceStep: 3,
            expectedStep: `${trans} / ${a} = ${correctAns}`,
            actualStep: `${trans} / ${a} = ${candidateAns} (arithmetic slip)`,
          },
        }
      }
    }
  }

  if (procedureType === 'integer_op') {
    const a = Number(variables.a)
    const b = Number(variables.b)
    const correctAns = a + b

    if (areNumbersClose(studentAnswerNum, correctAns)) {
      return { isSlip: false }
    }

    for (const delta of SLIP_DELTAS) {
      if (areNumbersClose(studentAnswerNum, correctAns + delta)) {
        return {
          isSlip: true,
          slipDetails: {
            divergenceStep: 1,
            expectedStep: `${a} + ${b} = ${correctAns}`,
            actualStep: `${a} + ${b} = ${correctAns + delta} (arithmetic slip)`,
          },
        }
      }
    }
  }

  if (procedureType === 'order_of_operations') {
    const a = Number(variables.a)
    const b = Number(variables.b)
    const c = Number(variables.c)
    const mult = b * c
    const correctAns = a + mult

    // Slip in multiplication
    for (const delta of SLIP_DELTAS) {
      const slippedMult = mult + delta
      if (areNumbersClose(studentAnswerNum, a + slippedMult)) {
        return {
          isSlip: true,
          slipDetails: {
            divergenceStep: 1,
            expectedStep: `${b} × ${c} = ${mult}`,
            actualStep: `${b} × ${c} = ${slippedMult} (arithmetic slip)`,
          },
        }
      }
    }

    // Slip in addition
    for (const delta of SLIP_DELTAS) {
      if (areNumbersClose(studentAnswerNum, correctAns + delta)) {
        return {
          isSlip: true,
          slipDetails: {
            divergenceStep: 2,
            expectedStep: `${a} + ${mult} = ${correctAns}`,
            actualStep: `${a} + ${mult} = ${correctAns + delta} (arithmetic slip)`,
          },
        }
      }
    }
  }

  return { isSlip: false }
}

/**
 * Checks step equivalence across student lines of work for linear equations.
 * Finds the first invalid line and identifies the transformation that failed.
 */
export function checkEquationSteps(
  lines: string[],
  expectedFinalSolution: number,
): {
  valid: boolean
  firstInvalidLineIndex: number | null
  invalidLineText: string | null
  detectedMisconceptionId: string | null
  explanation: string
} {
  if (!lines || lines.length <= 1) {
    return {
      valid: true,
      firstInvalidLineIndex: null,
      invalidLineText: null,
      detectedMisconceptionId: null,
      explanation: 'Not enough steps to analyze.',
    }
  }

  // Parse solution of each linear equation line
  // Supports formats: "2(x+3)=14", "2x+6=14", "2x=8", "x=4", "2x=20", "x=10", etc.
  const solvedValues: (number | null)[] = lines.map((line) => parseEquationSolution(line))

  for (let i = 1; i < solvedValues.length; i++) {
    const prevSol = solvedValues[i - 1]
    const currSol = solvedValues[i]

    if (prevSol !== null && currSol !== null) {
      if (!areNumbersClose(prevSol, currSol, 0.05)) {
        // Line i diverged from line i - 1!
        const lineText = lines[i]
        let miscId: string | null = null
        let explanation = `Step ${i + 1} is not mathematically equivalent to Step ${i}.`

        // Check if line i matches a known misconception divergence
        if (areNumbersClose(currSol, 10) && areNumbersClose(prevSol, 4)) {
          miscId = 'sign_error_transposing'
          explanation = 'Added 6 to the right side instead of subtracting 6.'
        } else if (areNumbersClose(currSol, 9) && areNumbersClose(prevSol, 4)) {
          miscId = 'subtract_coefficient_instead_of_divide'
          explanation = 'Subtracted 2 instead of dividing by 2.'
        } else if (areNumbersClose(currSol, 5.5) && areNumbersClose(prevSol, 4)) {
          miscId = 'distribute_first_term_only'
          explanation = 'Distributed the outside factor to x only.'
        }

        return {
          valid: false,
          firstInvalidLineIndex: i,
          invalidLineText: lineText,
          detectedMisconceptionId: miscId,
          explanation,
        }
      }
    }
  }

  const lastSol = solvedValues[solvedValues.length - 1]
  const matchesFinal = lastSol !== null && areNumbersClose(lastSol, expectedFinalSolution, 0.05)

  return {
    valid: matchesFinal,
    firstInvalidLineIndex: matchesFinal ? null : lines.length - 1,
    invalidLineText: matchesFinal ? null : lines[lines.length - 1],
    detectedMisconceptionId: null,
    explanation: matchesFinal ? 'All steps are mathematically valid!' : 'Final line does not match the solution.',
  }
}

/**
 * Extracts the single variable root of a simple linear equation string.
 */
function parseEquationSolution(eqStr: string): number | null {
  const parts = eqStr.split('=').map((s) => s.trim())
  if (parts.length !== 2) return null

  const lhs = parts[0]
  const rhs = parts[1]

  // If RHS is simple number:
  const rhsNum = parseFloat(rhs)
  if (isNaN(rhsNum)) return null

  // Check: "x = 4" or "x = 10"
  if (/^[a-zA-Z]$/.test(lhs)) {
    return rhsNum
  }

  // Check: "2x = 8" or "2x = 20"
  const axMatch = lhs.match(/^([+-]?\d*)\s*([a-zA-Z])$/)
  if (axMatch) {
    let coef = axMatch[1] === '' || axMatch[1] === '+' ? 1 : axMatch[1] === '-' ? -1 : parseFloat(axMatch[1])
    return rhsNum / coef
  }

  // Check: "2x + 6 = 14" or "2x - 6 = 14"
  const axPlusBMatch = lhs.match(/^([+-]?\d*)\s*([a-zA-Z])\s*([+-])\s*(\d+)$/)
  if (axPlusBMatch) {
    let coef = axPlusBMatch[1] === '' || axPlusBMatch[1] === '+' ? 1 : axPlusBMatch[1] === '-' ? -1 : parseFloat(axPlusBMatch[1])
    const sign = axPlusBMatch[3]
    const constant = parseFloat(axPlusBMatch[4]) * (sign === '-' ? -1 : 1)
    return (rhsNum - constant) / coef
  }

  // Check: "2(x + 3) = 14"
  const bracketMatch = lhs.match(/^([+-]?\d+)\s*\(\s*([a-zA-Z])\s*([+-])\s*(\d+)\s*\)$/)
  if (bracketMatch) {
    const a = parseFloat(bracketMatch[1])
    const sign = bracketMatch[3]
    const c = parseFloat(bracketMatch[4]) * (sign === '-' ? -1 : 1)
    // a(x + c) = rhsNum => x + c = rhsNum / a => x = (rhsNum / a) - c
    return rhsNum / a - c
  }

  return null
}
