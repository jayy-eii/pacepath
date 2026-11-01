import { describe, it, expect, beforeEach } from 'vitest'
import {
  sendAiTutorMessage,
  addLocalChatMessage,
  getLocalChatHistory,
  clearLocalChatHistory,
} from './aiTutorService'

describe('aiTutorService', () => {
  beforeEach(() => {
    clearLocalChatHistory()
  })

  it('immediately flags self-harm content with safe supportive response', async () => {
    const res = await sendAiTutorMessage({
      classCode: 'TEST01',
      studentId: 'stud-1',
      message: 'I want to hurt myself',
    })

    expect(res.flagged).toBe(true)
    expect(res.reply).toContain('safety and well-being')
    expect(res.reply).toContain('teacher, parents')
  })

  it('immediately flags personal info (phone number, password)', async () => {
    const res = await sendAiTutorMessage({
      classCode: 'TEST01',
      studentId: 'stud-1',
      message: 'My password is secret123 and phone is 9876543210',
    })

    expect(res.flagged).toBe(true)
    expect(res.reply).toContain('privacy and safety')
  })

  it('returns offline notice when device is offline', async () => {
    const originalOnline = navigator.onLine
    try {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
      const res = await sendAiTutorMessage({
        classCode: 'TEST01',
        studentId: 'stud-1',
        message: 'How do I solve 2x + 4 = 10?',
      })
      expect(res.error).toBe('offline')
      expect(res.reply).toContain('requires an active internet connection')
    } finally {
      Object.defineProperty(navigator, 'onLine', { value: originalOnline, configurable: true })
    }
  })

  it('manages local chat history in memory', () => {
    expect(getLocalChatHistory('stud-1')).toHaveLength(0)

    addLocalChatMessage({
      id: 'm1',
      classCode: 'TEST01',
      studentId: 'stud-1',
      senderRole: 'student',
      content: 'Can you give me a hint?',
      hasImage: false,
      flagged: false,
      createdAt: Date.now(),
    })

    addLocalChatMessage({
      id: 'm2',
      classCode: 'TEST01',
      studentId: 'stud-2',
      senderRole: 'student',
      content: 'Hello',
      hasImage: false,
      flagged: false,
      createdAt: Date.now(),
    })

    expect(getLocalChatHistory('stud-1')).toHaveLength(1)
    expect(getLocalChatHistory('stud-2')).toHaveLength(1)

    clearLocalChatHistory('stud-1')
    expect(getLocalChatHistory('stud-1')).toHaveLength(0)
    expect(getLocalChatHistory('stud-2')).toHaveLength(1)
  })

  it('provides safe simulated tutor response in unconfigured / test environment without network calls', async () => {
    const res = await sendAiTutorMessage({
      classCode: 'DEMO6',
      studentId: 'stud-1',
      message: 'How do I solve brackets in linear equations?',
      context: {
        question_text: 'Solve 2(x + 3) = 14',
      },
    })

    expect(res.flagged).toBe(false)
    expect(res.reply).toContain('Solve 2(x + 3) = 14')
    expect(res.reply).toContain('EQUATION:')
  })
})
