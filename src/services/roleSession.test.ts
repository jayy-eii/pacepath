import { describe, it, expect, beforeEach } from 'vitest'
import {
  normalizeNameKey,
  getActiveRole,
  setActiveRole,
  switchRoleOrLogout,
  getStudentSession,
  setStudentSession,
  clearStudentSession,
  getTeacherSession,
  setTeacherSession,
  clearTeacherSession,
  checkLoginRateLimit,
  recordFailedLogin,
  resetLoginRateLimit,
  clearRoleSessionStore,
} from './roleSession'

describe('Role & Session Management', () => {
  beforeEach(() => {
    clearRoleSessionStore()
  })

  describe('normalizeNameKey', () => {
    it('trims leading/trailing whitespace, converts to lowercase, and collapses multiple spaces', () => {
      expect(normalizeNameKey('  Aarav   Sharma  ')).toBe('aarav sharma')
      expect(normalizeNameKey('DIYA')).toBe('diya')
      expect(normalizeNameKey('  Kabir   singh   VERMA ')).toBe('kabir singh verma')
    })
  })

  describe('Role Switch and Isolation', () => {
    it('defaults to null active role', () => {
      expect(getActiveRole()).toBeNull()
    })

    it('sets and updates active role', async () => {
      setActiveRole('student')
      expect(getActiveRole()).toBe('student')

      setActiveRole('teacher')
      expect(getActiveRole()).toBe('teacher')

      await switchRoleOrLogout()
      expect(getActiveRole()).toBeNull()
    })

    it('persists student session and automatically activates student role', () => {
      setStudentSession({
        studentId: 'st-123',
        name: 'Aarav',
        classCode: 'MATH-7K2P',
        grade: 8,
        avatar: '🦁',
        loggedInAt: Date.now(),
      })

      expect(getActiveRole()).toBe('student')
      const sess = getStudentSession()
      expect(sess?.studentId).toBe('st-123')
      expect(sess?.name).toBe('Aarav')

      clearStudentSession()
      expect(getStudentSession()).toBeNull()
    })

    it('persists teacher session and automatically activates teacher role', () => {
      setTeacherSession({
        classCode: 'MATH-7K2P',
        teacherName: 'Mrs. Sharma',
        pin: '1234',
      })

      expect(getActiveRole()).toBe('teacher')
      const sess = getTeacherSession()
      expect(sess?.classCode).toBe('MATH-7K2P')
      expect(sess?.teacherName).toBe('Mrs. Sharma')

      clearTeacherSession()
      expect(getTeacherSession()).toBeNull()
    })
    it('enforces mutual exclusivity between student and teacher sessions', () => {
      // 1. Log in as student
      setStudentSession({
        studentId: 'st-exclusive-1',
        name: 'Aarav',
        classCode: 'MATH-EXCL',
        grade: 8,
        avatar: '🦁',
        loggedInAt: Date.now(),
      })
      expect(getActiveRole()).toBe('student')
      expect(getStudentSession()).not.toBeNull()
      expect(getTeacherSession()).toBeNull()

      // 2. Switching to teacher clears student session
      setTeacherSession({
        classCode: 'MATH-EXCL',
        teacherName: 'Mrs. Sharma',
        pin: '1234',
      })
      expect(getActiveRole()).toBe('teacher')
      expect(getTeacherSession()).not.toBeNull()
      expect(getStudentSession()).toBeNull()

      // 3. Switching back to student clears teacher session
      setStudentSession({
        studentId: 'st-exclusive-2',
        name: 'Diya',
        classCode: 'MATH-EXCL',
        grade: 7,
        avatar: '🦊',
        loggedInAt: Date.now(),
      })
      expect(getActiveRole()).toBe('student')
      expect(getStudentSession()?.name).toBe('Diya')
      expect(getTeacherSession()).toBeNull()
    })

    it('NEVER deletes unsynced outbox items on switchRoleOrLogout', async () => {
      const { enqueueSync, getPendingOutboxCount } = await import('./syncEngine')

      // Enqueue an attempt into the outbox
      await enqueueSync('attempts', {
        id: 'att-preserve-1',
        studentId: 'st-1',
        questionId: 'q-1',
        correct: true,
      })

      const countBefore = await getPendingOutboxCount()
      expect(countBefore).toBeGreaterThan(0)

      // Logout / switch role
      await switchRoleOrLogout()

      // The role session is cleared
      expect(getActiveRole()).toBeNull()
      expect(getStudentSession()).toBeNull()
      expect(getTeacherSession()).toBeNull()

      // CRITICAL: Unsynced outbox items remain 100% intact!
      const countAfter = await getPendingOutboxCount()
      expect(countAfter).toBe(countBefore)
    })
  })

  describe('Login Rate Limiting', () => {
    it('allows attempts initially and decrements count', () => {
      const code = 'MATH-TEST'
      const name = 'Aarav'

      const initial = checkLoginRateLimit(code, name, 5)
      expect(initial.allowed).toBe(true)
      expect(initial.remainingAttempts).toBe(5)

      recordFailedLogin(code, name, 5)
      recordFailedLogin(code, name, 5)

      const afterTwo = checkLoginRateLimit(code, name, 5)
      expect(afterTwo.allowed).toBe(true)
      expect(afterTwo.remainingAttempts).toBe(3)
    })

    it('locks out when reaching max attempts and resets on success', () => {
      const code = 'MATH-TEST'
      const name = 'Diya'

      for (let i = 0; i < 5; i++) {
        recordFailedLogin(code, name, 5)
      }

      const locked = checkLoginRateLimit(code, name, 5)
      expect(locked.allowed).toBe(false)
      expect(locked.remainingAttempts).toBe(0)
      expect(locked.retryAfterSeconds).toBeGreaterThan(0)

      // Reset
      resetLoginRateLimit(code, name)
      const afterReset = checkLoginRateLimit(code, name, 5)
      expect(afterReset.allowed).toBe(true)
      expect(afterReset.remainingAttempts).toBe(5)
    })
  })
})
