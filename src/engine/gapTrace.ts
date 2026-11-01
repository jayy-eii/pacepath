import type {
  Attempt,
  Question,
  Concept,
  TraceResult,
  TracePathNode,
  LocalizedText,
} from '../types'
import { computeMastery } from './mastery'
import rawConcepts from '../data/concepts.json'
import rawQuestions from '../data/questions.json'

const defaultConcepts = rawConcepts as unknown as Concept[]
const defaultQuestions = rawQuestions as unknown as Question[]

export interface TriggerCheckInput {
  attempt: Attempt
  question: Question
  sessionAttempts: Attempt[]
  allStudentAttempts: Attempt[]
  triggeredConceptsThisSession: Set<string>
}

/**
 * Checks if Gap Detective should be triggered for this attempt:
 * (a) Misconception attempt (sure + wrong)
 * (b) 2 wrong answers in a row in the same concept in current session
 * (c) Concept mastery falls below 0.35 after at least 3 attempts
 * Guard: Max once per concept per session.
 */
export function isGapTraceTriggered(input: TriggerCheckInput): {
  triggered: boolean
  reason: 'misconception' | 'consecutive_wrong' | 'low_mastery' | null
} {
  const { attempt, question, sessionAttempts, allStudentAttempts, triggeredConceptsThisSession } = input

  // If question was correct, do not trigger
  if (attempt.correct) {
    return { triggered: false, reason: null }
  }

  const conceptId = question.conceptId

  // Guard: Do not trigger more than once per concept per session
  if (triggeredConceptsThisSession.has(conceptId)) {
    return { triggered: false, reason: null }
  }

  // (a) Misconception (sure + wrong)
  if (attempt.attemptType === 'misconception') {
    return { triggered: true, reason: 'misconception' }
  }

  // (b) 2 wrong answers in a row in the same concept in this session
  const conceptSessionAttempts = sessionAttempts.filter((a) => a.conceptId === conceptId)
  if (conceptSessionAttempts.length >= 2) {
    const lastTwo = conceptSessionAttempts.slice(-2)
    if (lastTwo.every((a) => !a.correct)) {
      return { triggered: true, reason: 'consecutive_wrong' }
    }
  }

  // (c) Mastery below 0.35 after at least 3 attempts
  const allConceptAttempts = allStudentAttempts.filter((a) => a.conceptId === conceptId)
  if (allConceptAttempts.length >= 3) {
    const mastery = computeMastery(allConceptAttempts, conceptId)
    if (mastery.score < 0.35) {
      return { triggered: true, reason: 'low_mastery' }
    }
  }

  return { triggered: false, reason: null }
}

/**
 * Traces backwards through the prerequisite graph to identify the genuine root cause.
 * Pure function: NO FAKE DATA.
 *
 * Traversal logic:
 * - If chosen wrong option has suspectConceptId, check it first.
 * - For each prerequisite:
 *    - attempts >= 2:
 *        - mastery >= 0.70 -> 'solid' (stop branch traversal)
 *        - mastery < 0.40  -> 'weak'  (traverse backwards into its prerequisites)
 *        - 0.40 to 0.69    -> 'weak' if no deeper weakness, borderline
 *    - attempts < 2:
 *        - 'unknown' -> requests PROBE questions to verify instead of guessing.
 */
export function traceGap(
  studentAttempts: Attempt[],
  wrongQuestion: Question,
  chosenOptionIndex?: number,
  customGraph?: Concept[],
  triggerReason: 'misconception' | 'consecutive_wrong' | 'low_mastery' = 'misconception',
  suspectMisconceptionPrereqId?: string,
): TraceResult {
  const graph = customGraph || defaultConcepts
  const graphMap = new Map<string, Concept>(graph.map((c) => [c.id, c]))

  const startConceptId = wrongQuestion.conceptId
  const startConcept = graphMap.get(startConceptId)

  const path: TracePathNode[] = []
  const probesNeeded: string[] = []
  const visited = new Set<string>()

  // Check if chosen option or identified misconception points to a suspect prerequisite concept
  let suspectConceptId: string | undefined = suspectMisconceptionPrereqId
  if (
    !suspectConceptId &&
    chosenOptionIndex !== undefined &&
    wrongQuestion.options &&
    wrongQuestion.options[chosenOptionIndex]?.suspectConceptId
  ) {
    suspectConceptId = wrongQuestion.options[chosenOptionIndex].suspectConceptId
  }

  // Include starting concept in path trace
  const startMastery = computeMastery(studentAttempts, startConceptId)
  path.push({
    conceptId: startConceptId,
    status: 'weak',
    mastery: startMastery.attemptsCount > 0 ? startMastery.score : null,
    attemptsCount: startMastery.attemptsCount,
  })
  visited.add(startConceptId)

  // Candidate root cause tracking: deepest weak concept whose own prerequisites are solid
  let candidateRootCauseId: string | null = null

  // Queue of concepts to evaluate backwards
  // If suspectConceptId exists and is valid, focus on the suspect branch first
  const queue: string[] = []
  const remainingPrereqs: string[] = []

  if (startConcept) {
    for (const prereqId of startConcept.prerequisites) {
      if (prereqId === suspectConceptId) continue
      remainingPrereqs.push(prereqId)
    }
  }

  if (suspectConceptId && graphMap.has(suspectConceptId)) {
    queue.push(suspectConceptId)
  } else {
    queue.push(...remainingPrereqs)
  }

  while (queue.length > 0) {
    const currentId = queue.shift()!
    if (visited.has(currentId)) continue
    visited.add(currentId)

    const concept = graphMap.get(currentId)
    if (!concept) continue

    const mastery = computeMastery(studentAttempts, currentId)
    const count = mastery.attemptsCount

    if (count < 2) {
      // Not enough data -> UNKNOWN. Must request probe questions
      path.push({
        conceptId: currentId,
        status: 'unknown',
        mastery: count > 0 ? mastery.score : null,
        attemptsCount: count,
      })
      if (!probesNeeded.includes(currentId)) {
        probesNeeded.push(currentId)
      }
      // Stop traversing deeper along an unverified branch until probe results arrive
      continue
    }

    if (mastery.score >= 0.7) {
      // SOLID prerequisite -> stop going deeper on this branch
      path.push({
        conceptId: currentId,
        status: 'solid',
        mastery: mastery.score,
        attemptsCount: count,
      })

      // If the suspect was innocent (solid) and queue is empty, fall back to check remaining prerequisites
      if (queue.length === 0 && candidateRootCauseId === null && remainingPrereqs.length > 0) {
        for (const rem of remainingPrereqs) {
          if (!visited.has(rem)) {
            queue.push(rem)
          }
        }
        remainingPrereqs.length = 0
      }
    } else {
      // WEAK prerequisite (< 0.70) -> candidate for root cause
      path.push({
        conceptId: currentId,
        status: 'weak',
        mastery: mastery.score,
        attemptsCount: count,
      })

      // If this concept is weak, it is our new deepest candidate root cause
      candidateRootCauseId = currentId

      // Walk backwards into ITS prerequisites
      for (const p of concept.prerequisites) {
        if (!visited.has(p) && !queue.includes(p)) {
          queue.push(p)
        }
      }
    }
  }

  // Determine root cause and confidence
  let confidence: 'low' | 'medium' | 'high' = 'high'
  if (probesNeeded.length > 0) {
    confidence = 'low'
  } else if (path.some((node) => node.attemptsCount < 3)) {
    confidence = 'medium'
  }

  // If probes are needed, we do not yet commit to a final root cause until probes finish
  const rootCauseId = probesNeeded.length > 0 ? null : candidateRootCauseId

  // Generate clear, honest explanation
  let explanation: LocalizedText
  if (rootCauseId) {
    const rootConcept = graphMap.get(rootCauseId)
    const startName = startConcept?.name.en || startConceptId
    const rootName = rootConcept?.name.en || rootCauseId
    const startNameHi = startConcept?.name.hi || startConceptId
    const rootNameHi = rootConcept?.name.hi || rootCauseId

    explanation = {
      en: `Struggle in "${startName}" traces back to foundational gaps in "${rootName}". Strengthening this prerequisite will unlock the concept!`,
      hi: `"${startNameHi}" में कठिनाई की जड़ "${rootNameHi}" के बुनियादी संप्रत्यय में है। इसे मजबूत करने से यह पाठ पूरी तरह समझ आएगा!`,
    }
  } else if (probesNeeded.length > 0) {
    explanation = {
      en: `Checking foundational prerequisites. Quick diagnostic check needed to pinpoint the exact gap.`,
      hi: `बुनियादी पूर्व-अपेक्षित संप्रत्ययों की जांच की जा रही है। वास्तविक कारण जानने के लिए त्वरित जांच आवश्यक है।`,
    }
  } else {
    // All prerequisites solid -> struggle is with current concept itself
    const startName = startConcept?.name.en || startConceptId
    const startNameHi = startConcept?.name.hi || startConceptId
    explanation = {
      en: `Good news! Your prerequisites for "${startName}" are solid. This concept just needs more practice.`,
      hi: `अच्छी खबर! "${startNameHi}" के लिए आपकी बुनियादी समझ मजबूत है। इस विषय में केवल थोड़े और अभ्यास की आवश्यकता है।`,
    }
  }

  return {
    startConceptId,
    path,
    rootCauseId,
    probesNeeded,
    confidence,
    triggerReason,
    explanation,
  }
}

/**
 * Retrieves probe questions (1 to 2 questions) for an unknown prerequisite concept,
 * avoiding questions already answered in the session.
 */
export function getProbeQuestions(
  conceptId: string,
  sessionAttemptedIds: string[] = [],
  pool?: Question[],
  limit = 2,
): Question[] {
  const all = pool || defaultQuestions
  const attemptedSet = new Set(sessionAttemptedIds)

  const conceptPool = all.filter((q) => q.conceptId === conceptId && !attemptedSet.has(q.id))
  // Sort by difficulty ascending (start with difficulty 1 or 2)
  conceptPool.sort((a, b) => a.difficulty - b.difficulty)

  if (conceptPool.length > 0) {
    return conceptPool.slice(0, limit)
  }

  // Fallback: if all were attempted, reuse easiest
  const fallbackPool = all.filter((q) => q.conceptId === conceptId)
  fallbackPool.sort((a, b) => a.difficulty - b.difficulty)
  return fallbackPool.slice(0, limit)
}

/**
 * Retrieves fix-round questions (3 to 5 questions) for the root cause concept,
 * starting with difficulty 1 first.
 */
export function getFixQuestions(
  rootCauseConceptId: string,
  sessionAttemptedIds: string[] = [],
  pool?: Question[],
  limit = 3,
): Question[] {
  const all = pool || defaultQuestions
  const attemptedSet = new Set(sessionAttemptedIds)

  const unattempted = all.filter((q) => q.conceptId === rootCauseConceptId && !attemptedSet.has(q.id))
  unattempted.sort((a, b) => a.difficulty - b.difficulty)

  if (unattempted.length >= limit) {
    return unattempted.slice(0, limit)
  }

  // If not enough unattempted questions, take whatever is available from the concept
  const fullConceptPool = all.filter((q) => q.conceptId === rootCauseConceptId)
  fullConceptPool.sort((a, b) => a.difficulty - b.difficulty)
  return fullConceptPool.slice(0, limit)
}
