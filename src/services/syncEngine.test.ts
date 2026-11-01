import { describe, it, expect, beforeEach } from 'vitest'
import {
  calculateBackoffMs,
  enqueueSync,
  getPendingOutboxCount,
  processSyncQueue,
  memSyncOutbox,
} from './syncEngine'
import { generateUUID } from './syncMappers'

describe('Sync Engine (Outbox Queue & Retry/Backoff)', () => {
  beforeEach(() => {
    memSyncOutbox.clear()
  })

  describe('calculateBackoffMs', () => {
    it('returns 0ms on initial attempt (retryCount 0)', () => {
      expect(calculateBackoffMs(0)).toBe(0)
    })

    it('returns 1000ms on first retry (retryCount 1)', () => {
      expect(calculateBackoffMs(1)).toBe(1000)
    })

    it('returns 2000ms on second retry (retryCount 2)', () => {
      expect(calculateBackoffMs(2)).toBe(2000)
    })

    it('returns 4000ms on third retry (retryCount 3)', () => {
      expect(calculateBackoffMs(3)).toBe(4000)
    })

    it('returns 8000ms on fourth retry (retryCount 4)', () => {
      expect(calculateBackoffMs(4)).toBe(8000)
    })

    it('returns 16000ms on fifth retry (retryCount 5)', () => {
      expect(calculateBackoffMs(5)).toBe(16000)
    })

    it('caps backoff at 30000ms (30s maximum ceiling)', () => {
      expect(calculateBackoffMs(6)).toBe(30000)
      expect(calculateBackoffMs(7)).toBe(30000)
      expect(calculateBackoffMs(15)).toBe(30000)
    })
  })

  describe('Outbox Queue Management', () => {
    it('successfully enqueues items into outbox and updates pending count', async () => {
      const studentId = generateUUID()
      await enqueueSync('students', {
        id: studentId,
        name: 'Dev Student',
        grade: 8,
        avatar: '🦁',
        class_code: 'MATH-7K2P',
        created_at: Date.now(),
      })

      const count = await getPendingOutboxCount()
      expect(count).toBeGreaterThanOrEqual(1)
    })

    it('retains queued items safely when offline or Supabase unconfigured', async () => {
      const attemptId = generateUUID()
      await enqueueSync('attempts', {
        id: attemptId,
        student_id: generateUUID(),
        session_id: generateUUID(),
        question_id: 'q1',
        concept_id: 'fractions-add',
        correct: true,
        timestamp: Date.now(),
      })

      // Run sync in unconfigured test environment
      const res = await processSyncQueue()
      expect(res.success).toBe(false)

      // Queue items are NOT deleted on failure/offline
      const count = await getPendingOutboxCount()
      expect(count).toBeGreaterThanOrEqual(1)
    })
  })
})
