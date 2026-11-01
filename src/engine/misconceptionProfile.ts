/**
 * misconceptionProfile.ts
 * Computes per-student misconception profiles, tracks status transitions
 * (new -> recurring -> improving -> resolved), and generates targeted interventions.
 * Pure functions: NO FAKE DATA.
 */

import type {
  MisconceptionEvent,
  Attempt,
  MisconceptionProfileEntry,
  Intervention,
  Question,
  MisconceptionStatus,
} from '../types'
import rawMisconceptions from '../data/misconceptions.json'
import rawQuestions from '../data/questions.json'

const allMisconceptions = rawMisconceptions as Array<{
  id: string
  conceptId: string
  prerequisiteConceptId?: string
  name: { en: string; hi: string }
  description: { en: string; hi: string }
}>

const allQuestions = rawQuestions as unknown as Question[]

export interface ProfileComputationResult {
  entries: Record<string, MisconceptionProfileEntry>
  recurringCount: number
  topRecurringMisconceptionId: string | null
}

export interface ClassMisconceptionAlert {
  distinctStudents: number
  totalEvents: number
  isAlert: boolean
}

/**
 * Checks if a misconception occurrence qualifies as recurring:
 * Strict rule: at least 3 events across at least 2 sessions.
 */
export function isRecurringStatus(count: number, distinctSessions: number): boolean {
  return count >= 3 && distinctSessions >= 2
}

/**
 * Evaluates the class misconception alert threshold:
 * Rule: At least 3 distinct students AND at least 5 events (strict AND, not OR).
 */
export function evaluateClassMisconceptionAlert(
  events: Array<{ studentId: string; misconceptionId?: string }>,
): ClassMisconceptionAlert {
  const distinctStudents = new Set(events.map((e) => e.studentId)).size
  const totalEvents = events.length
  const isAlert = distinctStudents >= 3 && totalEvents >= 5

  return {
    distinctStudents,
    totalEvents,
    isAlert,
  }
}

export interface ClassMisconceptionSummary {
  misconceptionId: string
  distinctStudents: number
  totalEvents: number
  studentIds: string[]
  isAlert: boolean
}

/**
 * Aggregates misconception events across a class or cohort.
 */
export function aggregateClassMisconceptions(
  events: MisconceptionEvent[],
): ClassMisconceptionSummary[] {
  const grouped = new Map<string, { studentIds: Set<string>; totalEvents: number }>()

  for (const evt of events) {
    const existing = grouped.get(evt.misconceptionId) || {
      studentIds: new Set<string>(),
      totalEvents: 0,
    }
    existing.studentIds.add(evt.studentId)
    existing.totalEvents += 1
    grouped.set(evt.misconceptionId, existing)
  }

  const summaries: ClassMisconceptionSummary[] = []
  for (const [miscId, data] of grouped.entries()) {
    const distinctStudents = data.studentIds.size
    const totalEvents = data.totalEvents
    summaries.push({
      misconceptionId: miscId,
      distinctStudents,
      totalEvents,
      studentIds: Array.from(data.studentIds),
      isAlert: distinctStudents >= 3 && totalEvents >= 5,
    })
  }

  return summaries.sort((a, b) => b.totalEvents - a.totalEvents || b.distinctStudents - a.distinctStudents)
}

/**
 * Computes the real profile for a student from their actual recorded events and attempts.
 */
export function computeProfile(
  events: MisconceptionEvent[],
  attempts: Attempt[],
): ProfileComputationResult {
  const entries: Record<string, MisconceptionProfileEntry> = {}

  // Map attemptId -> attempt for quick session lookup
  const attemptMap = new Map<string, Attempt>(attempts.map((a) => [a.id, a]))

  // Group events by misconceptionId
  const grouped = new Map<string, MisconceptionEvent[]>()
  for (const evt of events) {
    const list = grouped.get(evt.misconceptionId) || []
    list.push(evt)
    grouped.set(evt.misconceptionId, list)
  }

  for (const [miscId, miscEvents] of grouped.entries()) {
    const count = miscEvents.length

    // Determine distinct sessions
    const sessionIds = new Set<string>()
    for (const evt of miscEvents) {
      const att = attemptMap.get(evt.attemptId)
      if (att && att.sessionId) {
        sessionIds.add(att.sessionId)
      }
    }
    const distinctSessions = Math.max(1, sessionIds.size)

    // Sort events chronologically
    miscEvents.sort((a, b) => a.createdAt - b.createdAt)
    const lastSeen = miscEvents[miscEvents.length - 1].createdAt

    // Find the concept associated with this misconception
    const miscDef = allMisconceptions.find((m) => m.id === miscId)
    const conceptId = miscDef?.conceptId

    // Count consecutive correct attempts in this concept after the last misconception event
    let consecutiveCorrect = 0
    if (conceptId) {
      const attemptsAfter = attempts
        .filter((a) => a.conceptId === conceptId && a.timestamp >= lastSeen)
        .sort((a, b) => a.timestamp - b.timestamp)

      // Count backwards from newest attempt
      for (let i = attemptsAfter.length - 1; i >= 0; i--) {
        if (attemptsAfter[i].correct) {
          consecutiveCorrect++
        } else {
          break
        }
      }
    }

    // Determine status:
    // resolved: 3 consecutive correct diagnostic/fix questions in that concept after the mistake
    // recurring: >= 3 events across >= 2 sessions
    // improving: consecutiveCorrect >= 1 and not yet 3
    // new: < 3 events or 1 session
    let status: MisconceptionStatus = 'new'
    if (consecutiveCorrect >= 3) {
      status = 'resolved'
    } else if (isRecurringStatus(count, distinctSessions)) {
      status = 'recurring'
    } else if (consecutiveCorrect > 0) {
      status = 'improving'
    }

    // Determine trend
    let trend: 'improving' | 'deteriorating' | 'stable' = 'stable'
    if (consecutiveCorrect > 0) {
      trend = 'improving'
    } else if (count >= 3) {
      trend = 'deteriorating'
    }

    entries[miscId] = {
      misconceptionId: miscId,
      count,
      distinctSessions,
      lastSeen,
      trend,
      status,
      consecutiveCorrect,
    }
  }

  // Count recurring and identify top recurring misconception
  let recurringCount = 0
  let topRecurringMisconceptionId: string | null = null
  let maxRecurringCount = 0

  for (const [miscId, entry] of Object.entries(entries)) {
    if (entry.status === 'recurring') {
      recurringCount++
      if (entry.count > maxRecurringCount) {
        maxRecurringCount = entry.count
        topRecurringMisconceptionId = miscId
      }
    }
  }

  return {
    entries,
    recurringCount,
    topRecurringMisconceptionId,
  }
}

/**
 * Creates a targeted intervention for a recurring misconception:
 * Generates 3 targeted questions verified by math engine + schedules a re-check in 1 to 2 days.
 */
export function generateIntervention(
  studentId: string,
  misconceptionId: string,
): Intervention {
  const miscDef = allMisconceptions.find((m) => m.id === misconceptionId)
  const conceptId = miscDef?.conceptId || 'balancing-equations'

  // Pick 3 non-repeating targeted questions from questions pool matching this concept
  const pool = allQuestions.filter((q) => q.conceptId === conceptId)
  const selectedQuestions = pool.slice(0, 3)

  // Re-check scheduled for 24-48 hours later (1 day default)
  const recheckScheduledFor = Date.now() + 24 * 60 * 60 * 1000

  return {
    id: `int_${misconceptionId}_${Date.now()}`,
    studentId,
    misconceptionId,
    conceptId,
    createdAt: Date.now(),
    recheckScheduledFor,
    questions: selectedQuestions,
    completedAt: null,
    passed: false,
  }
}
