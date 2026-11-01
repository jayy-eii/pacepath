import type {
  Attempt,
  ConfidenceRating,
  AttemptType,
  MasteryResult,
  ConceptMasteryMap,
  ConfidenceLevel,
} from '../types'
import rawConcepts from '../data/concepts.json'

/**
 * Standard Bayesian Knowledge Tracing (BKT) Parameters:
 * - pInit (L0) = 0.30 : Prior probability that a student knows the skill initially.
 * - pLearn (T) = 0.15 : Probability of transitioning from unlearned to learned after an opportunity.
 * - pSlip (S)  = 0.10 : Probability of making a mistake despite knowing the skill.
 * - pGuess (G) = 0.25 : Probability of guessing correctly without knowing the skill (4 options).
 *
 * Standard BKT Updating Formula:
 * 1. Observation Update (Bayes' Rule):
 *    P(L_t | correct) = [P(L_t) * (1 - S)] / [P(L_t) * (1 - S) + (1 - P(L_t)) * G]
 *    P(L_t | wrong)   = [P(L_t) * S]       / [P(L_t) * S       + (1 - P(L_t)) * (1 - G)]
 *
 * 2. Learning Transition Update:
 *    P(L_{t+1}) = P(L_t | obs) + (1 - P(L_t | obs)) * T
 *
 * Real-Signal Adjustments:
 * 1. Hints on correct answer:
 *    Scaffolding increases effective guessing/assistance G:
 *    0 hints: G = 0.25; 1 hint: G = 0.50; 2 hints: G = 0.70; 3 hints: G = 0.85.
 *    This reduces the knowledge credit gained for assisted answers.
 *
 * 2. Misconception (sure + wrong):
 *    Indicates an ingrained erroneous belief. Slip S is reduced to 0.03.
 *    This lowers mastery significantly more than an honest gap.
 *    To ensure balanced and encouraging pedagogy, a single misconception never reduces mastery
 *    below ~40% of its previous value, and mastery never falls below an absolute floor of 0.05.
 *    Multiple misconceptions within the same concept continue reducing mastery gradually until 0.05.
 *
 * 3. Lucky guess (guess + correct):
 *    Student admitted guessing. G increases to 0.80, so knowledge gain is minimal.
 *
 * 4. Honest gap (guess/maybe + wrong):
 *    Expected knowledge gap. Standard S = 0.10, G = 0.25 apply.
 *
 * 5. Recency weighting:
 *    Learning transitions slightly scale by (0.85 + 0.30 * (index + 1) / totalAttempts).
 */
export const BKT_CONFIG = {
  pInit: 0.3,
  pLearn: 0.15,
  pSlip: 0.1,
  pGuess: 0.25,
}

/**
 * Classifies an attempt into an attemptType based on confidence rating and correctness.
 * - sure + correct   -> confident_correct
 * - maybe + correct  -> maybe_correct
 * - guess + correct  -> lucky_guess
 * - sure + wrong     -> misconception (most critical for gap finding)
 * - guess/maybe + wrong -> honest_gap
 */
export function classifyAttempt(confidence: ConfidenceRating, correct: boolean): AttemptType {
  if (correct) {
    if (confidence === 'sure') return 'confident_correct'
    if (confidence === 'guess') return 'lucky_guess'
    return 'maybe_correct'
  }
  // Wrong
  if (confidence === 'sure') {
    return 'misconception'
  }
  return 'honest_gap'
}

/**
 * Returns effective BKT parameters adjusted by student signals (hints, confidence, misconception).
 */
function getAdjustedParameters(
  attempt: Attempt,
  attemptIndex: number,
  totalAttempts: number,
) {
  let pSlip = BKT_CONFIG.pSlip
  let pGuess = BKT_CONFIG.pGuess
  let pLearn = BKT_CONFIG.pLearn

  const attemptType = attempt.attemptType || (
    attempt.confidence
      ? classifyAttempt(attempt.confidence, attempt.correct)
      : attempt.correct
        ? 'confident_correct'
        : 'honest_gap'
  )

  if (attempt.correct) {
    if (attemptType === 'lucky_guess') {
      // Lucky guess provides weak evidence of true knowledge
      pGuess = 0.8
    } else {
      // Scaffolding hints reduce credit
      const hints = attempt.hintsUsed || 0
      if (hints === 1) pGuess = 0.5
      else if (hints === 2) pGuess = 0.7
      else if (hints >= 3) pGuess = 0.85
    }
  } else {
    // Wrong answer
    if (attemptType === 'misconception') {
      // High confidence mistake represents a real misconception, not just a slip
      pSlip = 0.03
      pLearn = 0.05
    }
  }

  // Slight recency weighting on learning transition: older attempts scale ~0.85, newest ~1.15
  if (totalAttempts > 1) {
    const recencyMultiplier = 0.85 + 0.3 * ((attemptIndex + 1) / totalAttempts)
    pLearn = Math.min(0.4, pLearn * recencyMultiplier)
  }

  return { pSlip, pGuess, pLearn, attemptType }
}

/**
 * Computes the BKT mastery score for a specific concept from a chronological list of attempts.
 * Returns score (0 to 1), attempt count, and confidence level.
 */
export function computeMastery(attempts: Attempt[], conceptId: string): MasteryResult {
  const conceptAttempts = attempts
    .filter((a) => a.conceptId === conceptId)
    .sort((a, b) => a.timestamp - b.timestamp)

  const count = conceptAttempts.length

  if (count === 0) {
    return {
      score: BKT_CONFIG.pInit,
      attemptsCount: 0,
      confidenceLevel: 'low',
    }
  }

  let pKnown = BKT_CONFIG.pInit

  for (let i = 0; i < count; i++) {
    const attempt = conceptAttempts[i]
    const { pSlip, pGuess, pLearn, attemptType } = getAdjustedParameters(attempt, i, count)
    const pPrevious = pKnown

    // Observation update
    let pPosterior: number
    if (attempt.correct) {
      const num = pKnown * (1 - pSlip)
      const den = num + (1 - pKnown) * pGuess
      pPosterior = den > 0 ? num / den : pKnown
    } else {
      const num = pKnown * pSlip
      const den = num + (1 - pKnown) * (1 - pGuess)
      pPosterior = den > 0 ? num / den : pKnown
    }

    // Knowledge transition update:
    // On incorrect attempts, passive transition probability is significantly lower (0.04)
    // compared to successful practice (0.15)
    const effectiveLearn = attempt.correct ? pLearn : (attemptType === 'misconception' ? 0.02 : 0.04)
    pKnown = pPosterior + (1 - pPosterior) * effectiveLearn

    // Misconception penalty floor: a single misconception never reduces mastery below ~40% of its previous value
    if (attemptType === 'misconception') {
      const misconceptionFloor = pPrevious * 0.4
      pKnown = Math.max(misconceptionFloor, pKnown)
    } else if (!attempt.correct) {
      // Honest gap mistake retains ~65% of previous mastery (less severe than misconception)
      const honestGapFloor = pPrevious * 0.65
      pKnown = Math.max(honestGapFloor, pKnown)
    }

    // Absolute bounds: mastery never falls below 0.05
    pKnown = Math.max(0.05, Math.min(0.99, pKnown))
  }

  // Confidence level based on number of evidence opportunities
  let confidenceLevel: ConfidenceLevel = 'low'
  if (count >= 6) {
    confidenceLevel = 'high'
  } else if (count >= 3) {
    confidenceLevel = 'medium'
  }

  return {
    score: Math.round(pKnown * 1000) / 1000,
    attemptsCount: count,
    confidenceLevel,
  }
}

/**
 * Computes mastery scores across all known concepts.
 */
export function computeAllMastery(attempts: Attempt[]): ConceptMasteryMap {
  const allConceptIds = (rawConcepts as Array<{ id: string }>).map((c) => c.id)
  const map: ConceptMasteryMap = {}

  for (const cid of allConceptIds) {
    map[cid] = computeMastery(attempts, cid)
  }

  return map
}
