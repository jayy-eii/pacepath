import { describe, it, expect } from 'vitest'
import { verifyAiResponse } from './aiMathVerifier'

describe('aiMathVerifier', () => {
  it('returns none when text has no EQUATION marker', () => {
    const res = verifyAiResponse('Remember that when adding negative numbers, keep the sign.')
    expect(res.hasEquation).toBe(false)
    expect(res.status).toBe('none')
    expect(res.cleanText).toBe('Remember that when adding negative numbers, keep the sign.')
  })

  it('correctly verifies a matching bracket linear equation', () => {
    const text = `Let's solve step by step:
2(x + 3) = 14
2x + 6 = 14
2x = 8
So the solution gives x = 4
EQUATION: 2(x+3)=14`

    const res = verifyAiResponse(text)
    expect(res.hasEquation).toBe(true)
    expect(res.status).toBe('verified')
    expect(res.engineSolution).toBe(4)
    expect(res.replyAnswer).toBe(4)
    expect(res.message).toBe('✓ Verified by PacePath maths engine')
    expect(res.cleanText).not.toContain('EQUATION:')
  })

  it('correctly verifies a matching standard linear equation', () => {
    const text = `Subtract 5 from both sides:
2x = 12
Therefore x = 6
EQUATION: 2x + 5 = 17`

    const res = verifyAiResponse(text)
    expect(res.hasEquation).toBe(true)
    expect(res.status).toBe('verified')
    expect(res.engineSolution).toBe(6)
    expect(res.replyAnswer).toBe(6)
    expect(res.message).toBe('✓ Verified by PacePath maths engine')
  })

  it('detects divergence when AI provides an incorrect answer', () => {
    const text = `If you expand 2(x+3)=14, you get 2x + 6 = 14, which means x = 5
EQUATION: 2(x+3)=14`

    const res = verifyAiResponse(text)
    expect(res.hasEquation).toBe(true)
    expect(res.status).toBe('divergent')
    expect(res.engineSolution).toBe(4)
    expect(res.replyAnswer).toBe(5)
    expect(res.message).toContain('Divergence note: Maths engine calculated x = 4, but AI stated x = 5')
  })

  it('handles hints where no final answer is stated yet', () => {
    const text = `First expand the brackets on the left side! What is 2 multiplied by 3?
EQUATION: 2(x+3)=14`

    const res = verifyAiResponse(text)
    expect(res.hasEquation).toBe(true)
    expect(res.status).toBe('verified')
    expect(res.engineSolution).toBe(4)
    expect(res.replyAnswer).toBeUndefined()
    expect(res.message).toContain('✓ Verified by PacePath maths engine (Expected: x = 4)')
  })

  it('handles equations with variable y or alternative symbols', () => {
    const text = `Subtract 4 from both sides: 3y = 9, so x = 3
EQUATION: 3y + 4 = 13`

    const res = verifyAiResponse(text)
    expect(res.hasEquation).toBe(true)
    expect(res.status).toBe('verified')
    expect(res.engineSolution).toBe(3)
  })

  it('flags unverified for higher-order or unsupported formats gracefully', () => {
    const text = `This is a quadratic equation:
x^2 - 4x + 4 = 0
EQUATION: x^2 - 4x + 4 = 0`

    const res = verifyAiResponse(text)
    expect(res.hasEquation).toBe(true)
    expect(res.status).toBe('unverified')
    expect(res.message).toContain('beyond offline linear solver')
  })
})
