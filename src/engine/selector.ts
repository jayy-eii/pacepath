import type { Question, Attempt, SelectionResult, SelectionStrategy, Intervention } from '../types'
import { computeAllMastery } from './mastery'
import rawQuestions from '../data/questions.json'
import rawConcepts from '../data/concepts.json'

const allQuestions = rawQuestions as unknown as Question[]
const allConcepts = rawConcepts as Array<{ id: string; name: { en: string; hi: string }; grade: number }>
const conceptMap = new Map(allConcepts.map((c) => [c.id, c]))

export interface SelectorOptions {
  studentGrade: number
  allAttempts: Attempt[]
  sessionAttemptedQuestionIds: string[]
  questionsPool?: Question[]
  openInterventions?: Intervention[]
  /** Injectable random generator for deterministic unit testing (0 to 1) */
  randomFloat?: () => number
}

/**
 * Pure function: Selects the next adaptive question and explains the honest reason.
 */
export function selectNextQuestion(options: SelectorOptions): SelectionResult {
  const {
    studentGrade,
    allAttempts,
    sessionAttemptedQuestionIds,
    questionsPool = allQuestions,
    openInterventions = [],
    randomFloat = Math.random,
  } = options

  const sessionExcludedSet = new Set(sessionAttemptedQuestionIds)
  const availableQuestions = questionsPool.filter((q) => !sessionExcludedSet.has(q.id))

  // Edge case: if somehow all questions are exhausted in this session, reset session pool
  const poolToUse = availableQuestions.length > 0 ? availableQuestions : questionsPool

  const totalAttemptsCount = allAttempts.length
  const masteryMap = computeAllMastery(allAttempts)

  let chosenConceptId: string
  let strategy: SelectionStrategy
  let reasonEn = ''
  let reasonHi = ''
  let detailEn = ''
  let detailHi = ''

  // 0. High Priority: If student has open interventions, prioritize targeted intervention questions
  const activeIntervention = openInterventions.find(
    (int) => !int.completedAt && poolToUse.some((q) => q.conceptId === int.conceptId),
  )

  if (activeIntervention && totalAttemptsCount >= 2) {
    strategy = 'lowest_mastery'
    chosenConceptId = activeIntervention.conceptId
    const cName = conceptMap.get(chosenConceptId)?.name || { en: chosenConceptId, hi: chosenConceptId }
    reasonEn = `Targeted intervention: strengthening ${cName.en} to resolve a recurring misconception.`
    reasonHi = `लक्षित अभ्यास: बार-बार दोहराई गई गलती को दूर करने के लिए ${cName.hi} का अभ्यास।`
    detailEn = 'Targeted questions scheduled to reinforce correct procedural reasoning.'
    detailHi = 'सही प्रक्रिया और समझ को मजबूत करने के लिए लक्षित प्रश्न।'
  } else if (totalAttemptsCount < 8) {
    strategy = 'diagnostic'
    // Count attempts per concept in the current session
    const sessionAttemptsByConcept = new Map<string, number>()
    for (const qId of sessionAttemptedQuestionIds) {
      const q = poolToUse.find((item) => item.id === qId)
      if (q) {
        sessionAttemptsByConcept.set(q.conceptId, (sessionAttemptsByConcept.get(q.conceptId) || 0) + 1)
      }
    }

    // Pick an available concept that hasn't been tested yet in this session, or has fewest overall attempts
    const sortedConcepts = [...allConcepts].sort((a, b) => {
      const sessionCountA = sessionAttemptsByConcept.get(a.id) || 0
      const sessionCountB = sessionAttemptsByConcept.get(b.id) || 0
      if (sessionCountA !== sessionCountB) return sessionCountA - sessionCountB
      const totalA = masteryMap[a.id]?.attemptsCount || 0
      const totalB = masteryMap[b.id]?.attemptsCount || 0
      return totalA - totalB
    })

    // Find the first concept that has available questions
    const validConcept = sortedConcepts.find((c) => poolToUse.some((q) => q.conceptId === c.id))
    chosenConceptId = validConcept ? validConcept.id : allConcepts[0].id

    const cName = conceptMap.get(chosenConceptId)?.name || { en: chosenConceptId, hi: chosenConceptId }
    reasonEn = `Diagnostic check: finding your starting point in ${cName.en}.`
    reasonHi = `${cName.hi} में आपकी शुरुआत का स्तर जानने के लिए निदानात्मक प्रश्न।`
    detailEn = 'Early practice serves diagnostic questions across all core concepts to build your baseline map.'
    detailHi = 'शुरुआती अभ्यास आपकी बुनियादी समझ का नक्शा तैयार करने के लिए सभी प्रमुख अवधारणाओं की जाँच करता है।'
  } else {
    // 2. Post-diagnostic adaptive selection (60% lowest mastery, 20% not recent, 20% challenge)
    const roll = randomFloat()

    // Filter concepts that have available questions in pool
    const conceptsWithQuestions = allConcepts.filter((c) =>
      poolToUse.some((q) => q.conceptId === c.id),
    )

    if (roll < 0.6) {
      // 60%: Concept with lowest mastery (with at least 1 attempt)
      strategy = 'lowest_mastery'
      const sortedByMastery = [...conceptsWithQuestions].sort((a, b) => {
        const scoreA = masteryMap[a.id]?.score ?? 0.3
        const scoreB = masteryMap[b.id]?.score ?? 0.3
        return scoreA - scoreB
      })
      chosenConceptId = sortedByMastery[0]?.id || allConcepts[0].id
      const cName = conceptMap.get(chosenConceptId)?.name || { en: chosenConceptId, hi: chosenConceptId }
      reasonEn = `${cName.en} is your lowest mastery topic right now — let's build confidence here.`
      reasonHi = `${cName.hi} में आपकी निपुणता अभी सबसे कम है — आइए इसे मजबूत करें।`
      detailEn = `Your current estimated mastery is ${Math.round((masteryMap[chosenConceptId]?.score || 0.3) * 100)}%. Targeted practice builds fluency fastest.`
      detailHi = `आपकी वर्तमान अनुमानित निपुणता ${Math.round((masteryMap[chosenConceptId]?.score || 0.3) * 100)}% है। लक्षित अभ्यास से सबसे तेज़ी से सुधार होता है।`
    } else if (roll < 0.8) {
      // 20%: Concept not practised recently (spaced repetition for previously practiced concepts)
      strategy = 'not_recent'
      const practicedConcepts = conceptsWithQuestions.filter((c) =>
        allAttempts.some((att) => att.conceptId === c.id),
      )
      const recencyPool = practicedConcepts.length > 0 ? practicedConcepts : conceptsWithQuestions

      const sortedByRecency = [...recencyPool].sort((a, b) => {
        const lastAttemptA = allAttempts
          .filter((att) => att.conceptId === a.id)
          .sort((x, y) => y.timestamp - x.timestamp)[0]?.timestamp || 0
        const lastAttemptB = allAttempts
          .filter((att) => att.conceptId === b.id)
          .sort((x, y) => y.timestamp - x.timestamp)[0]?.timestamp || 0
        return lastAttemptA - lastAttemptB
      })
      chosenConceptId = sortedByRecency[0]?.id || allConcepts[0].id
      const cName = conceptMap.get(chosenConceptId)?.name || { en: chosenConceptId, hi: chosenConceptId }
      reasonEn = `You haven't practiced ${cName.en} recently — let's keep it sharp.`
      reasonHi = `आपने हाल ही में ${cName.hi} का अभ्यास नहीं किया है — आइए इसे ताज़ा रखें।`
      detailEn = 'Spaced repetition helps lock concepts into your long-term memory.'
      detailHi = 'समय-समय पर दोहराव करने से अवधारणाएं आपकी स्थायी स्मृति में पक्की हो जाती हैं।'
    } else {
      // 20%: Challenge question on high-mastery concept
      strategy = 'challenge'
      const sortedByHighest = [...conceptsWithQuestions].sort((a, b) => {
        const scoreA = masteryMap[a.id]?.score ?? 0.3
        const scoreB = masteryMap[b.id]?.score ?? 0.3
        return scoreB - scoreA
      })
      chosenConceptId = sortedByHighest[0]?.id || allConcepts[0].id
      const cName = conceptMap.get(chosenConceptId)?.name || { en: chosenConceptId, hi: chosenConceptId }
      reasonEn = `Challenge: you've mastered ${cName.en}, let's push to the next level!`
      reasonHi = `चुनौती: आपने ${cName.hi} में बहुत अच्छा प्रदर्शन किया है, आइए एक स्तर ऊपर बढ़ें!`
      detailEn = 'Testing yourself on harder problems cements deep mathematical reasoning.'
      detailHi = 'कठिन प्रश्नों पर स्वयं को परखने से गणितीय सोच और गहरी होती है।'
    }
  }

  // 3. Determine target difficulty
  const conceptMastery = masteryMap[chosenConceptId]?.score ?? 0.3
  let baseDifficulty: 1 | 2 | 3
  if (conceptMastery < 0.4) {
    baseDifficulty = 1
  } else if (conceptMastery <= 0.7) {
    baseDifficulty = 2
  } else {
    baseDifficulty = 3
  }

  // Check fast-track adjustment in chosen concept
  const conceptAttempts = allAttempts
    .filter((a) => a.conceptId === chosenConceptId)
    .sort((a, b) => b.timestamp - a.timestamp) // newest first

  let targetDifficulty: 1 | 2 | 3 = baseDifficulty

  if (conceptAttempts.length >= 3) {
    const last3 = conceptAttempts.slice(0, 3)
    const threeCleanCorrect = last3.every((a) => a.correct && (a.hintsUsed || 0) === 0)
    if (threeCleanCorrect) {
      if (baseDifficulty < 3) {
        targetDifficulty = (baseDifficulty + 1) as 1 | 2 | 3
      }
      reasonEn += ' (Fast-track: 3 clean answers in a row!)'
      reasonHi += ' (फास्ट-ट्रैक: लगातार 3 सही उत्तर!)'
    }
  }

  if (conceptAttempts.length >= 2) {
    const last2 = conceptAttempts.slice(0, 2)
    const twoWrong = last2.every((a) => !a.correct)
    if (twoWrong) {
      if (baseDifficulty > 1) {
        targetDifficulty = (baseDifficulty - 1) as 1 | 2 | 3
      }
      reasonEn += ' (Stepping down to reinforce core fundamentals.)'
      reasonHi += ' (बुनियादी सिद्धांतों को पक्का करने के लिए स्तर सुगम किया गया।)'
    }
  }

  // 4. Select the best question in chosen concept matching target difficulty & grade proximity
  const conceptQuestions = poolToUse.filter((q) => q.conceptId === chosenConceptId)

  // Sort by difficulty match, then grade proximity
  const sortedQuestions = [...conceptQuestions].sort((a, b) => {
    const diffMatchA = Math.abs(a.difficulty - targetDifficulty)
    const diffMatchB = Math.abs(b.difficulty - targetDifficulty)
    if (diffMatchA !== diffMatchB) return diffMatchA - diffMatchB

    const gradeMatchA = Math.abs(a.grade - studentGrade)
    const gradeMatchB = Math.abs(b.grade - studentGrade)
    return gradeMatchA - gradeMatchB
  })

  let chosenQuestion = sortedQuestions[0]

  // Fallback if no question in chosen concept
  if (!chosenQuestion) {
    chosenQuestion = poolToUse[0]
    chosenConceptId = chosenQuestion.conceptId
    targetDifficulty = chosenQuestion.difficulty
  }

  return {
    question: chosenQuestion,
    conceptId: chosenConceptId,
    targetDifficulty,
    selectionStrategy: strategy,
    reason: { en: reasonEn, hi: reasonHi },
    detailExplanation: { en: detailEn, hi: detailHi },
  }
}
