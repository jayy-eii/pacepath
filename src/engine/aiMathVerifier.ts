import {
  solveLinearBracket,
  solveLinearStandard,
  parseNumericAnswer,
  areNumbersClose,
} from './mathCore'

export interface VerificationResult {
  hasEquation: boolean
  rawEquation?: string
  status: 'verified' | 'divergent' | 'unverified' | 'none'
  engineSolution?: number
  replyAnswer?: number
  cleanText: string
  message?: string
}

/**
 * Parses an AI reply for EQUATION: <eq>, solves it using mathCore,
 * and validates the AI's stated answer against the ground truth.
 */
export function verifyAiResponse(text: string): VerificationResult {
  if (!text) {
    return { hasEquation: false, status: 'none', cleanText: '' }
  }

  // Look for EQUATION: ... (case-insensitive, can be on its own line or anywhere)
  const equationMatch = text.match(/EQUATION:\s*([^\n\r]+)/i)
  if (!equationMatch) {
    return { hasEquation: false, status: 'none', cleanText: text }
  }

  const rawEquation = equationMatch[1].trim()
  // Clean the text by removing the EQUATION: line for user display
  const cleanText = text.replace(/EQUATION:\s*[^\n\r]+/i, '').trim()

  // Parse equation: normalize variable to 'x' and strip internal whitespace
  const normalized = rawEquation.replace(/[a-wy-z]/gi, 'x').replace(/\s+/g, '')

  let engineSolution: number | undefined = undefined

  // 1. Linear Bracket pattern: a(bx + c) = d
  // e.g. 2(x+3)=14, 2(2x-4)=16, -3(x+1)=9
  const bracketRegex = /^([+-]?\d+)\(([+-]?\d*)x([+-]\d+)\)=([+-]?\d+)$/
  const bracketMatch = normalized.match(bracketRegex)

  if (bracketMatch) {
    const a = parseInt(bracketMatch[1], 10)
    const bStr = bracketMatch[2]
    const b = bStr === '' || bStr === '+' ? 1 : bStr === '-' ? -1 : parseInt(bStr, 10)
    const c = parseInt(bracketMatch[3], 10)
    const d = parseInt(bracketMatch[4], 10)

    try {
      const res = solveLinearBracket({ a, b, c, d })
      engineSolution = res.solution
    } catch {
      // Ignore parser failure
    }
  }

  // 2. Linear Standard pattern: ax + b = c or ax = c
  // e.g. 2x+5=17, 2x=10, x-4=10, -3x+6=12
  if (engineSolution === undefined) {
    const stdRegex = /^([+-]?\d*)x(?:([+-]\d+))?=([+-]?\d+)$/
    const stdMatch = normalized.match(stdRegex)
    if (stdMatch) {
      const aStr = stdMatch[1]
      const a = aStr === '' || aStr === '+' ? 1 : aStr === '-' ? -1 : parseInt(aStr, 10)
      const b = stdMatch[2] ? parseInt(stdMatch[2], 10) : 0
      const c = parseInt(stdMatch[3], 10)

      if (a !== 0) {
        try {
          const res = solveLinearStandard({ a, b, c })
          engineSolution = res.solution
        } catch {
          // Ignore parser failure
        }
      }
    }
  }

  if (engineSolution === undefined) {
    return {
      hasEquation: true,
      rawEquation,
      status: 'unverified',
      cleanText,
      message: 'Equation detected but format is beyond offline linear solver',
    }
  }

  // Extract candidate answer from AI's text
  // Must avoid matching intermediate steps like "2x = 8" where '2' precedes 'x'
  let replyAnswer: number | undefined = undefined

  const answerRegex = /(?:(?<![a-zA-Z0-9])x\s*=\s*|answer\s*(?:is|:|=)\s*|solution\s*(?:is|:|=)\s*)([+-]?\d+(?:\.\d+)?|[+-]?\d+\/\d+)/gi
  const matches = Array.from(cleanText.matchAll(answerRegex))
  if (matches.length > 0) {
    // Take the final occurrence as the tutor's concluding answer
    const lastMatch = matches[matches.length - 1]
    const parsed = parseNumericAnswer(lastMatch[1])
    if (parsed !== null) {
      replyAnswer = parsed
    }
  }

  if (replyAnswer === undefined) {
    // Equation was verified by math engine, but reply was a hint without final x = ...
    return {
      hasEquation: true,
      rawEquation,
      status: 'verified',
      engineSolution,
      cleanText,
      message: `✓ Verified by PacePath maths engine (Expected: x = ${engineSolution})`,
    }
  }

  const isMatch = areNumbersClose(replyAnswer, engineSolution)

  return {
    hasEquation: true,
    rawEquation,
    status: isMatch ? 'verified' : 'divergent',
    engineSolution,
    replyAnswer,
    cleanText,
    message: isMatch
      ? '✓ Verified by PacePath maths engine'
      : `Divergence note: Maths engine calculated x = ${engineSolution}, but AI stated x = ${replyAnswer}`,
  }
}
