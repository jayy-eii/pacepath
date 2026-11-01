import type { Student, Session, Attempt } from '../types'
import { computeMastery } from './mastery'

export type StudentActivityStatus = 'active_today' | 'active_yesterday' | 'inactive_3plus_days' | 'never_started'

export interface StudentConceptMastery {
  studentId: string
  conceptId: string
  status: 'evaluated' | 'no_data'
  score: number | null
  attemptsCount: number
}

export type ClassMasteryGrid = Record<string, Record<string, StudentConceptMastery>>

export interface ConceptStudentGroups {
  conceptId: string
  remedial: Student[]
  on_track: Student[]
  advanced: Student[]
  not_enough_data: Student[]
}

export interface WeakConceptInsight {
  conceptId: string
  averageMastery: number
  studentsWithData: number
  totalAttempts: number
}

export interface ReadyToMoveOnInsight {
  conceptId: string
  averageMastery: number
  masteredPercentage: number
  studentsWithData: number
}

export interface CommonMistakeInsight {
  mistakeTag: string
  distinctStudents: number
  totalOccurrences: number
}

export interface StudentAttentionInsight {
  studentId: string
  studentName: string
  accuracyPct: number
  totalAttempts: number
  reason: 'low_accuracy' | 'active_gaps' | 'both'
  activeGapsCount: number
}

export interface OverconfidenceInsight {
  overconfidentAttempts: number
  totalSureAttempts: number
  overconfidenceRate: number // 0 to 1
  affectedStudentsCount: number
}

export interface ClassInsightsResult {
  hasSufficientData: boolean
  totalStudents: number
  evaluatedConceptsCount: number
  weakestConcepts: WeakConceptInsight[]
  readyToMoveOn: ReadyToMoveOnInsight[]
  commonMistakes: CommonMistakeInsight[]
  studentsNeedingAttention: StudentAttentionInsight[]
  overconfidence: OverconfidenceInsight | null
}

/**
 * Computes mastery status per student per concept.
 * Rule: Fewer than 2 attempts for that student on that concept = 'no_data' (score is null).
 */
export function computeStudentConceptMastery(
  studentAttempts: Attempt[],
  conceptId: string,
  studentId: string,
): StudentConceptMastery {
  const filtered = studentAttempts.filter((a) => a.studentId === studentId && a.conceptId === conceptId)
  if (filtered.length < 2) {
    return {
      studentId,
      conceptId,
      status: 'no_data',
      score: null,
      attemptsCount: filtered.length,
    }
  }

  const result = computeMastery(filtered, conceptId)
  return {
    studentId,
    conceptId,
    status: 'evaluated',
    score: result.score,
    attemptsCount: result.attemptsCount,
  }
}

/**
 * Builds the full grid of [studentId][conceptId] mastery across the class.
 */
export function computeClassMasteryGrid(
  students: Student[],
  conceptIds: string[],
  attempts: Attempt[],
): ClassMasteryGrid {
  const attemptsByStudent = new Map<string, Attempt[]>()
  for (const att of attempts) {
    const list = attemptsByStudent.get(att.studentId) || []
    list.push(att)
    attemptsByStudent.set(att.studentId, list)
  }

  const grid: ClassMasteryGrid = {}
  for (const student of students) {
    grid[student.id] = {}
    const sAttempts = attemptsByStudent.get(student.id) || []
    for (const cId of conceptIds) {
      grid[student.id][cId] = computeStudentConceptMastery(sAttempts, cId, student.id)
    }
  }
  return grid
}

/**
 * Determines a student's activity status based on real session and attempt timestamps.
 * - 'active_today': activity on the current calendar day (from midnight)
 * - 'active_yesterday': activity on the previous calendar day
 * - 'inactive_3plus_days': activity older than yesterday
 * - 'never_started': 0 sessions and 0 attempts
 */
export function getStudentActivityStatus(
  studentId: string,
  sessions: Session[],
  attempts: Attempt[],
  referenceTime: number = Date.now(),
): StudentActivityStatus {
  const sSessions = sessions.filter((s) => s.studentId === studentId)
  const sAttempts = attempts.filter((a) => a.studentId === studentId)

  let latestTime = 0
  for (const s of sSessions) {
    const t = s.endTime || s.startTime || 0
    if (t > latestTime) latestTime = t
  }
  for (const a of sAttempts) {
    const t = a.timestamp || 0
    if (t > latestTime) latestTime = t
  }

  if (latestTime === 0) return 'never_started'

  const refDate = new Date(referenceTime)
  const startOfToday = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate()).getTime()
  const startOfYesterday = startOfToday - 86400000

  if (latestTime >= startOfToday) {
    return 'active_today'
  }
  if (latestTime >= startOfYesterday) {
    return 'active_yesterday'
  }
  return 'inactive_3plus_days'
}

/**
 * Groups students into Remedial (<0.40), On-Track (0.40-0.70), Advanced (>0.70),
 * and Not Enough Data (< 2 attempts) for a specific concept.
 */
export function groupStudents(
  conceptId: string,
  students: Student[],
  attempts: Attempt[],
): ConceptStudentGroups {
  const attemptsByStudent = new Map<string, Attempt[]>()
  for (const att of attempts) {
    if (att.conceptId === conceptId) {
      const list = attemptsByStudent.get(att.studentId) || []
      list.push(att)
      attemptsByStudent.set(att.studentId, list)
    }
  }

  const groups: ConceptStudentGroups = {
    conceptId,
    remedial: [],
    on_track: [],
    advanced: [],
    not_enough_data: [],
  }

  for (const student of students) {
    const sAttempts = attemptsByStudent.get(student.id) || []
    if (sAttempts.length < 2) {
      groups.not_enough_data.push(student)
      continue
    }

    const mastery = computeMastery(sAttempts, conceptId)
    if (mastery.score < 0.4) {
      groups.remedial.push(student)
    } else if (mastery.score <= 0.7) {
      groups.on_track.push(student)
    } else {
      groups.advanced.push(student)
    }
  }

  return groups
}

/**
 * Derives statistical class insights adhering strictly to significance thresholds:
 * Concept insights require at least 3 students with evaluated data AND at least 5 total attempts.
 */
export function deriveClassInsights(
  students: Student[],
  conceptIds: string[],
  attempts: Attempt[],
  activeGapsByStudent: Record<string, number> = {},
): ClassInsightsResult {
  const weakestConcepts: WeakConceptInsight[] = []
  const readyToMoveOn: ReadyToMoveOnInsight[] = []
  let totalEvaluatedConcepts = 0

  const attemptsByConcept = new Map<string, Attempt[]>()
  for (const att of attempts) {
    const list = attemptsByConcept.get(att.conceptId) || []
    list.push(att)
    attemptsByConcept.set(att.conceptId, list)
  }

  for (const cId of conceptIds) {
    const cAttempts = attemptsByConcept.get(cId) || []
    if (cAttempts.length < 5) continue

    // Group attempts by student
    const studentAttemptsMap = new Map<string, Attempt[]>()
    for (const a of cAttempts) {
      const list = studentAttemptsMap.get(a.studentId) || []
      list.push(a)
      studentAttemptsMap.set(a.studentId, list)
    }

    const evaluatedStudentsScores: number[] = []
    for (const [, sAtts] of studentAttemptsMap.entries()) {
      if (sAtts.length >= 2) {
        const m = computeMastery(sAtts, cId)
        evaluatedStudentsScores.push(m.score)
      }
    }

    // Must meet threshold: >= 3 students with data AND >= 5 attempts
    if (evaluatedStudentsScores.length >= 3) {
      totalEvaluatedConcepts++
      const avgMastery =
        evaluatedStudentsScores.reduce((acc, score) => acc + score, 0) / evaluatedStudentsScores.length

      if (avgMastery < 0.5) {
        weakestConcepts.push({
          conceptId: cId,
          averageMastery: Math.round(avgMastery * 100) / 100,
          studentsWithData: evaluatedStudentsScores.length,
          totalAttempts: cAttempts.length,
        })
      }

      const masteredCount = evaluatedStudentsScores.filter((s) => s >= 0.7).length
      const masteredPct = Math.round((masteredCount / evaluatedStudentsScores.length) * 100)
      if (masteredPct >= 70 || avgMastery >= 0.75) {
        readyToMoveOn.push({
          conceptId: cId,
          averageMastery: Math.round(avgMastery * 100) / 100,
          masteredPercentage: masteredPct,
          studentsWithData: evaluatedStudentsScores.length,
        })
      }
    }
  }

  weakestConcepts.sort((a, b) => a.averageMastery - b.averageMastery)
  readyToMoveOn.sort((a, b) => b.averageMastery - a.averageMastery)

  // Common Mistake Types: >= 3 distinct students AND >= 5 total occurrences
  const mistakeCounts = new Map<string, { students: Set<string>; total: number }>()
  for (const att of attempts) {
    if (!att.correct && att.mistakeTag) {
      const tag = att.mistakeTag
      const existing = mistakeCounts.get(tag) || { students: new Set(), total: 0 }
      existing.students.add(att.studentId)
      existing.total++
      mistakeCounts.set(tag, existing)
    }
  }

  const commonMistakes: CommonMistakeInsight[] = []
  for (const [tag, data] of mistakeCounts.entries()) {
    if (data.students.size >= 3 && data.total >= 5) {
      commonMistakes.push({
        mistakeTag: tag,
        distinctStudents: data.students.size,
        totalOccurrences: data.total,
      })
    }
  }
  commonMistakes.sort((a, b) => b.totalOccurrences - a.totalOccurrences)

  // Students Needing Attention: >= 5 attempts, accuracy < 40% OR >= 2 active gaps
  const studentAttemptsMap = new Map<string, Attempt[]>()
  for (const att of attempts) {
    const list = studentAttemptsMap.get(att.studentId) || []
    list.push(att)
    studentAttemptsMap.set(att.studentId, list)
  }

  const studentsNeedingAttention: StudentAttentionInsight[] = []
  for (const student of students) {
    const sAtts = studentAttemptsMap.get(student.id) || []
    const gapsCount = activeGapsByStudent[student.id] || 0
    if (sAtts.length >= 5) {
      const correct = sAtts.filter((a) => a.correct).length
      const accuracyPct = Math.round((correct / sAtts.length) * 100)
      const lowAcc = accuracyPct < 40
      const manyGaps = gapsCount >= 2

      if (lowAcc || manyGaps) {
        studentsNeedingAttention.push({
          studentId: student.id,
          studentName: student.name,
          accuracyPct,
          totalAttempts: sAtts.length,
          reason: lowAcc && manyGaps ? 'both' : lowAcc ? 'low_accuracy' : 'active_gaps',
          activeGapsCount: gapsCount,
        })
      }
    }
  }
  studentsNeedingAttention.sort((a, b) => a.accuracyPct - b.accuracyPct)

  // Overconfidence Index: sure + incorrect >= 25% across at least 10 sure attempts
  const sureAttempts = attempts.filter((a) => a.confidence === 'sure')
  let overconfidence: OverconfidenceInsight | null = null
  if (sureAttempts.length >= 10) {
    const wrongSure = sureAttempts.filter((a) => !a.correct)
    const rate = wrongSure.length / sureAttempts.length
    if (rate >= 0.25) {
      const affectedStudents = new Set(wrongSure.map((a) => a.studentId))
      overconfidence = {
        overconfidentAttempts: wrongSure.length,
        totalSureAttempts: sureAttempts.length,
        overconfidenceRate: Math.round(rate * 100) / 100,
        affectedStudentsCount: affectedStudents.size,
      }
    }
  }

  const hasSufficientData =
    totalEvaluatedConcepts > 0 || commonMistakes.length > 0 || studentsNeedingAttention.length > 0

  return {
    hasSufficientData,
    totalStudents: students.length,
    evaluatedConceptsCount: totalEvaluatedConcepts,
    weakestConcepts,
    readyToMoveOn,
    commonMistakes,
    studentsNeedingAttention,
    overconfidence,
  }
}
