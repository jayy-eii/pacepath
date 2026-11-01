import {
  getAllStudents,
  getAllSessions,
  getAllAttempts,
  clearAllData,
  getCurrentStudent,
} from './api'
import { computeAllMastery } from '../engine/mastery'
import { getLastSelectorDecision } from './selectorState'

declare global {
  interface Window {
    __pacepath?: {
      dumpDatabase: () => Promise<void>
      getAttempts: () => Promise<unknown>
      getSessions: () => Promise<unknown>
      getStudents: () => Promise<unknown>
      getCurrentStudent: () => Promise<unknown>
      getMastery: () => Promise<unknown>
      getLastDecision: () => unknown
      clearDatabase: () => Promise<void>
      help: () => void
    }
  }
}

export function initDevConsole() {
  if (typeof window === 'undefined') return

  window.__pacepath = {
    async dumpDatabase() {
      const [students, sessions, attempts] = await Promise.all([
        getAllStudents(),
        getAllSessions(),
        getAllAttempts(),
      ])

      console.group('📊 PacePath IndexedDB Raw Tables')
      console.log('--- Students ---')
      console.table(students)
      console.log('--- Sessions ---')
      console.table(sessions)
      console.log('--- Attempts (with Confidence & Classification) ---')
      console.table(
        attempts.map((a) => ({
          id: a.id,
          questionId: a.questionId,
          conceptId: a.conceptId,
          confidence: a.confidence || '—',
          attemptType: a.attemptType || (a.correct ? 'correct' : 'wrong'),
          correct: a.correct,
          mistakeTag: a.mistakeTag || '—',
          hintsUsed: a.hintsUsed,
          timeTakenMs: `${a.timeTakenMs}ms`,
          timestamp: new Date(a.timestamp).toLocaleTimeString(),
        })),
      )
      console.groupEnd()
    },

    async getAttempts() {
      const attempts = await getAllAttempts()
      console.log('Attempts:', attempts)
      return attempts
    },

    async getSessions() {
      const sessions = await getAllSessions()
      console.log('Sessions:', sessions)
      return sessions
    },

    async getStudents() {
      const students = await getAllStudents()
      console.log('Students:', students)
      return students
    },

    async getCurrentStudent() {
      const student = await getCurrentStudent()
      console.log('Current Student:', student)
      return student
    },

    async getMastery() {
      const [current, attempts] = await Promise.all([
        getCurrentStudent(),
        getAllAttempts(),
      ])
      const studentAtts = current ? attempts.filter((a) => a.studentId === current.id) : attempts
      const mastery = computeAllMastery(studentAtts)
      console.group('🧠 Bayesian Knowledge Tracing Mastery Map')
      console.table(
        Object.entries(mastery).map(([conceptId, res]) => ({
          concept: conceptId,
          masteryScore: res.score,
          masteryPct: `${Math.round(res.score * 100)}%`,
          attempts: res.attemptsCount,
          confidenceLevel: res.confidenceLevel,
        })),
      )
      console.groupEnd()
      return mastery
    },

    getLastDecision() {
      const decision = getLastSelectorDecision()
      console.log('🎯 Last Adaptive Selector Decision:', decision)
      return decision
    },

    async clearDatabase() {
      await clearAllData()
      console.log('✅ PacePath DB and local storage cleared!')
      window.location.reload()
    },

    help() {
      console.log(`
🛠️ PacePath Dev Console Helper:
  - window.__pacepath.dumpDatabase()    -> Prints all tables (Students, Sessions, Attempts)
  - window.__pacepath.getMastery()      -> Prints real BKT mastery table per concept
  - window.__pacepath.getLastDecision() -> Prints last selector decision & reason
  - window.__pacepath.getAttempts()     -> Returns all raw attempts
  - window.__pacepath.getSessions()     -> Returns all sessions
  - window.__pacepath.getStudents()     -> Returns all students
  - window.__pacepath.clearDatabase()   -> Deletes all data and reloads
      `)
    },
  }

  // Print friendly hint in browser console
  console.info(
    '%c💡 PacePath Adaptive Engine Active: type window.__pacepath.help() to inspect real BKT mastery and selector state.',
    'color: #7c6cff; font-weight: bold;',
  )


}
