import { describe, it, expect, beforeEach } from 'vitest'
import {
  fetchClassMisconceptionSummary,
  fetchClassMisconceptionDetails,
  verifyLocalTeacherPin,
  setLocalClassPin,
  clearLocalClassPins,
  studentJoin,
  studentLogin,
  getMyHistory,
  getClassInfo,
  createClass,
  createAssignment,
  closeAssignment,
  submitAssignment,
  getClassAssignments,
  getStudentAssignments,
  createDoubt,
  addDoubtMessage,
  getMyDoubts,
  getClassDoubts,
  replyToDoubt,
  setDoubtStatus,
  postAnnouncement,
  getAnnouncements,
  flagDoubtMessage,
} from './supabase'

describe('Supabase Teacher RPC & PIN Verification', () => {
  beforeEach(() => {
    clearLocalClassPins()
  })

  it('validates default local demo PIN 1234', () => {
    expect(verifyLocalTeacherPin('GRADE8A', '1234')).toBe(true)
    expect(verifyLocalTeacherPin('GRADE8A', '9999')).toBe(false)
    expect(verifyLocalTeacherPin('GRADE8A', '')).toBe(false)
  })

  it('strictly blocks all network calls and fails loudly if any test attempts a real fetch', async () => {
    await expect(async () => {
      await fetch('https://nacibpxjujvuiemgzwlz.supabase.co/rest/v1/rpc/create_class')
    }).rejects.toThrow(/NETWORK CALL BLOCKED/)
  })

  it('allows registering a custom class PIN', () => {
    setLocalClassPin('CLASS_10B', '5678')
    expect(verifyLocalTeacherPin('CLASS_10B', '5678')).toBe(true)
    expect(verifyLocalTeacherPin('CLASS_10B', '1234')).toBe(false)
  })

  it('throws an error and returns NO data on wrong PIN in fetchClassMisconceptionSummary', async () => {
    await expect(
      fetchClassMisconceptionSummary('GRADE8A', 'wrong_pin'),
    ).rejects.toThrow('Invalid class code or teacher PIN')
  })

  it('throws an error and returns NO data on wrong PIN in fetchClassMisconceptionDetails', async () => {
    await expect(
      fetchClassMisconceptionDetails('GRADE8A', 'wrong_pin'),
    ).rejects.toThrow('Invalid class code or teacher PIN')
  })

  it('returns valid response with isLocalFallback flag when correct PIN is provided', async () => {
    const res = await fetchClassMisconceptionSummary('GRADE8A', '1234')
    expect(res).toBeDefined()
    expect(res.isLocalFallback).toBe(true)
    expect(Array.isArray(res.summaries)).toBe(true)
  })

  it('allows student to join a class, log back in with PIN, and fetch history', async () => {
    const classCode = await createClass('Class 8-C', 'Mr. Patel', '4321', 8)
    const classInfo = await getClassInfo(classCode)
    expect(classInfo?.name).toBe('Class 8-C')
    expect(classInfo?.teacherName).toBe('Mr. Patel')

    const student = await studentJoin({
      classCode,
      name: 'Rohan Sharma',
      grade: 8,
      avatar: '🐯',
      pin: '1234',
    })

    expect(student.id).toBeDefined()
    expect(student.name).toBe('Rohan Sharma')
    expect(student.classCode).toBe(classCode)

    // Log back in with correct PIN
    const loggedIn = await studentLogin(classCode, 'rohan sharma', '1234')
    expect(loggedIn.id).toBe(student.id)

    // Wrong PIN should fail
    await expect(
      studentLogin(classCode, 'rohan sharma', '9999'),
    ).rejects.toThrow('Invalid PIN')

    // Fetch history
    const history = await getMyHistory(classCode, student.id, '1234')
    expect(history.student.id).toBe(student.id)
    expect(Array.isArray(history.attempts)).toBe(true)
  })

  it('enforces server-side rate-limiting and locks out after 10 failed login attempts', async () => {
    const classCode = await createClass('Class 8-RL', 'Mr. Verma', '9999', 8)
    const student = await studentJoin({
      classCode,
      name: 'Priya Mehta',
      grade: 8,
      avatar: '🌟',
      pin: '2222',
    })
    expect(student.id).toBeDefined()

    // 10 failed login attempts
    for (let i = 0; i < 10; i++) {
      await expect(
        studentLogin(classCode, 'priya mehta', '0000'),
      ).rejects.toThrow('Invalid PIN')
    }

    // 11th attempt must be rejected with the rate limit lockout error, even with the correct PIN
    await expect(
      studentLogin(classCode, 'priya mehta', '2222'),
    ).rejects.toThrow(/locked for 1 hour/i)
  })

  describe('Part B: Assignments and Tests', () => {
    it('creates an assignment, submits with server-side score calculation, and enforces idempotence', async () => {
      const classCode = await createClass('Class 9-A', 'Mrs. Gupta', '1111', 9)
      const student = await studentJoin({
        classCode,
        name: 'Kabir Verma',
        grade: 9,
        avatar: '🦁',
        pin: '3333',
      })

      // 1. Teacher creates assignment with 1 standard question and 1 custom question
      const assignment = await createAssignment(classCode, '1111', {
        title: 'Linear Equations Diagnostic Test',
        description: 'Test on brackets and two-step solving',
        questionIds: ['q-std-1'],
        customQuestions: [
          {
            id: 'cq-1',
            conceptId: 'balancing-equations',
            grade: 9,
            text: { en: 'Solve 3(x - 2) = 15', hi: 'हल करें: 3(x - 2) = 15' },
            options: [
              { en: 'x = 7', hi: 'x = 7' }, // correct index 0
              { en: 'x = 3', hi: 'x = 3' },
              { en: 'x = 5', hi: 'x = 5' },
              { en: 'x = 9', hi: 'x = 9' },
            ],
            correctIndex: 0,
          },
        ],
        timeLimitMinutes: 20,
        dueDate: Date.now() + 86400000, // Due in 24h
      })

      expect(assignment.id).toBeDefined()
      expect(assignment.isClosed).toBe(false)

      // 2. Student views assignments
      const studentList = await getStudentAssignments(classCode, student.id)
      expect(studentList.length).toBe(1)
      expect(studentList[0].assignment.title).toBe('Linear Equations Diagnostic Test')
      expect(studentList[0].submission).toBeNull()

      // 3. Student submits test: custom question answered correctly (0), standard answered correctly
      const submission = await submitAssignment({
        assignmentId: assignment.id,
        studentId: student.id,
        classCode,
        answers: {
          'cq-1': '0',
          'q-std-1': 'correct',
        },
      })

      expect(submission.score).toBe(100)
      expect(submission.totalQuestions).toBe(2)
      expect(submission.isLate).toBe(false)

      // 4. Idempotence: Duplicate submit retry must return existing submission without altering score
      const duplicateSub = await submitAssignment({
        assignmentId: assignment.id,
        studentId: student.id,
        classCode,
        answers: {
          'cq-1': '1', // different wrong answer on retry
          'q-std-1': 'wrong',
        },
      })
      expect(duplicateSub.id).toBe(submission.id)
      expect(duplicateSub.score).toBe(100) // Score preserved!

      // 5. Teacher views class assignments and submissions
      const classData = await getClassAssignments(classCode, '1111')
      expect(classData.assignments.length).toBe(1)
      expect(classData.submissions.length).toBe(1)
      expect(classData.submissions[0].score).toBe(100)
    })

    it('rejects submissions for closed assignments and flags late submissions', async () => {
      const classCode = await createClass('Class 8-Closed', 'Mr. Roy', '5555', 8)
      const student = await studentJoin({
        classCode,
        name: 'Ananya Sen',
        grade: 8,
        avatar: '🦊',
        pin: '4444',
      })

      // Assignment created with past due date (1 hour ago)
      const assignment = await createAssignment(classCode, '5555', {
        title: 'Past Due Homework',
        questionIds: ['q-1'],
        dueDate: Date.now() - 3600000, // 1 hour in the past
      })

      // Late submission should be accepted but flagged as isLate = true
      const lateSub = await submitAssignment({
        assignmentId: assignment.id,
        studentId: student.id,
        classCode,
        answers: { 'q-1': 'correct' },
      })
      expect(lateSub.isLate).toBe(true)

      // Teacher closes the assignment
      await closeAssignment(classCode, '5555', assignment.id)

      // Second student tries to submit to closed assignment -> must be rejected
      const student2 = await studentJoin({
        classCode,
        name: 'Dev Sharma',
        grade: 8,
        avatar: '🚀',
        pin: '5555',
      })

      await expect(
        submitAssignment({
          assignmentId: assignment.id,
          studentId: student2.id,
          classCode,
          answers: { 'q-1': 'correct' },
        }),
      ).rejects.toThrow('Assignment is closed')
    })

    it('handles client submitted_at timestamp: accepts on-time submission synced late, rejects after close, flags late', async () => {
      const classCode = await createClass('Class 8-Timing', 'Mrs. Gupta', '7777', 8)
      const student = await studentJoin({
        classCode,
        name: 'Kabir Verma',
        grade: 8,
        avatar: '🦁',
        pin: '1111',
      })

      // Base time 1 hour in the past
      const baseTime = Date.now() - 3600000
      // Assignment was due 40 minutes ago
      const assignment = await createAssignment(classCode, '7777', {
        title: 'Timing Test',
        questionIds: ['q-1'],
        dueDate: baseTime + 1200000, // 40 mins ago
      })

      // Teacher closed assignment 20 minutes ago
      await closeAssignment(classCode, '7777', assignment.id)
      assignment.closedAt = baseTime + 2400000

      // Student pressed submit on-time 50 minutes ago (before due date and before closed_at)
      const onTimeClientTimestamp = baseTime + 600000
      const sub = await submitAssignment({
        assignmentId: assignment.id,
        studentId: student.id,
        classCode,
        answers: { 'q-1': 'correct' },
        submittedAt: onTimeClientTimestamp,
      })
      expect(sub.isLate).toBe(false)
      expect(sub.submittedAt).toBe(onTimeClientTimestamp)

      // Another student pressed submit 10 minutes ago (AFTER closed_at) -> rejected
      const studentLate = await studentJoin({
        classCode,
        name: 'Rohan Mehra',
        grade: 8,
        avatar: '🐯',
        pin: '2222',
      })

      await expect(
        submitAssignment({
          assignmentId: assignment.id,
          studentId: studentLate.id,
          classCode,
          answers: { 'q-1': 'correct' },
          submittedAt: baseTime + 3000000, // after close
        }),
      ).rejects.toThrow('Assignment is closed')

      // Reject future timestamp skew (> 60s into future)
      const studentFuture = await studentJoin({
        classCode,
        name: 'Future Student',
        grade: 8,
        avatar: '🚀',
        pin: '3333',
      })
      const openAssignment = await createAssignment(classCode, '7777', {
        title: 'Open Assignment',
        questionIds: ['q-1'],
      })
      await expect(
        submitAssignment({
          assignmentId: openAssignment.id,
          studentId: studentFuture.id,
          classCode,
          answers: { 'q-1': 'correct' },
          submittedAt: Date.now() + 120000, // 2 minutes in future
        }),
      ).rejects.toThrow('future timestamp detected')
    })

    it('verifies student class membership in submit_assignment and get_student_assignments', async () => {
      const classA = await createClass('Class A', 'Teacher A', '1234', 8)
      const classB = await createClass('Class B', 'Teacher B', '5678', 8)

      const studentA = await studentJoin({
        classCode: classA,
        name: 'Student A',
        grade: 8,
        avatar: '🦊',
        pin: '1111',
      })

      const assignmentB = await createAssignment(classB, '5678', {
        title: 'Class B Assignment',
        questionIds: ['q-1'],
      })

      // Student A tries to submit to Class B -> rejected
      await expect(
        submitAssignment({
          assignmentId: assignmentB.id,
          studentId: studentA.id,
          classCode: classB,
          answers: { 'q-1': 'correct' },
        }),
      ).rejects.toThrow('Student does not belong to this class')

      // Student A tries to get assignments of Class B -> rejected
      await expect(getStudentAssignments(classB, studentA.id)).rejects.toThrow(
        'Student does not belong to this class',
      )

      // Student A gets assignments of their own Class A -> succeeds
      const myAssignments = await getStudentAssignments(classA, studentA.id)
      expect(Array.isArray(myAssignments)).toBe(true)
    })
  })

  // ============================================================================
  // PART C: DOUBTS AND ANNOUNCEMENTS TESTS
  // ============================================================================
  describe('Part C: Doubts and Announcements', () => {
    it('allows student to create a doubt with attached question context and teacher to reply', async () => {
      const classCode = await createClass('Class 8-Doubts', 'Mr. Verma', '8888', 8)
      const student = await studentJoin({
        classCode,
        name: 'Isha Patel',
        grade: 8,
        avatar: '🌸',
        pin: '1234',
      })

      // 1. Student creates doubt
      const doubt = await createDoubt({
        classCode,
        studentId: student.id,
        content: 'Why did the sign change in step 2 of this linear equation?',
        questionId: 'q-basic-eq-1',
        questionTitle: 'Solve for x: 3x - 7 = 14',
        studentAnswer: 'x = 2.33',
        misconceptionTag: 'sign_error',
      })

      expect(doubt.id).toBeDefined()
      expect(doubt.status).toBe('open')
      expect(doubt.messages.length).toBe(1)
      expect(doubt.messages[0].senderType).toBe('student')
      expect(doubt.messages[0].content).toContain('Why did the sign change')

      // 2. Student views their doubts
      const myDoubts = await getMyDoubts(classCode, student.id)
      expect(myDoubts.length).toBe(1)
      expect(myDoubts[0].id).toBe(doubt.id)

      // 3. Teacher views class doubts (requires valid PIN)
      await expect(getClassDoubts(classCode, 'wrong-pin')).rejects.toThrow(
        'Invalid class code or teacher PIN',
      )

      const classDoubts = await getClassDoubts(classCode, '8888')
      expect(classDoubts.length).toBe(1)
      expect(classDoubts[0].status).toBe('open')
      expect(classDoubts[0].studentName).toBe('Isha Patel')

      // 4. Teacher replies to doubt
      const reply = await replyToDoubt({
        classCode,
        pin: '8888',
        doubtId: doubt.id,
        content: 'When adding 7 to both sides, -7 + 7 becomes 0, so 3x = 21.',
      })
      expect(reply.senderType).toBe('teacher')

      // 5. Verify doubt status transitioned to 'answered'
      const updatedDoubts = await getClassDoubts(classCode, '8888')
      expect(updatedDoubts[0].status).toBe('answered')
      expect(updatedDoubts[0].messages.length).toBe(2)

      // 6. Teacher marks resolved
      await setDoubtStatus({
        classCode,
        pin: '8888',
        doubtId: doubt.id,
        status: 'resolved',
      })
      const resolvedDoubts = await getClassDoubts(classCode, '8888')
      expect(resolvedDoubts[0].status).toBe('resolved')

      // 7. Student sends follow-up message -> thread reopens to 'open'
      await addDoubtMessage({
        doubtId: doubt.id,
        studentId: student.id,
        content: 'Oh got it! Thank you sir!',
      })
      const reopenedDoubts = await getClassDoubts(classCode, '8888')
      expect(reopenedDoubts[0].status).toBe('open')
      expect(reopenedDoubts[0].messages.length).toBe(3)
    })

    it('enforces 20 messages per hour rate limit and 500-character message length', async () => {
      const classCode = await createClass('Class 8-Limits', 'Mrs. Rao', '9999', 8)
      const student = await studentJoin({
        classCode,
        name: 'Arjun Kapoor',
        grade: 8,
        avatar: '⚡',
        pin: '2222',
      })

      // Message length validation: empty or > 500 chars rejected
      await expect(
        createDoubt({
          classCode,
          studentId: student.id,
          content: '',
        }),
      ).rejects.toThrow('Message must be between 1 and 500 characters')

      await expect(
        createDoubt({
          classCode,
          studentId: student.id,
          content: 'A'.repeat(501),
        }),
      ).rejects.toThrow('Message must be between 1 and 500 characters')

      // First doubt creates message 1
      const doubt = await createDoubt({
        classCode,
        studentId: student.id,
        content: 'Initial query',
      })

      // Send 19 more messages (total = 20 messages within the hour)
      for (let i = 2; i <= 20; i++) {
        await addDoubtMessage({
          doubtId: doubt.id,
          studentId: student.id,
          content: `Follow-up message ${i}`,
        })
      }

      // 21st message must exceed rate limit and throw error
      await expect(
        addDoubtMessage({
          doubtId: doubt.id,
          studentId: student.id,
          content: 'Exceeding message 21',
        }),
      ).rejects.toThrow('Rate limit exceeded: maximum 20 messages per hour allowed')
    })

    it('supports broadcast announcements and message flagging', async () => {
      const classCode = await createClass('Class 8-Announce', 'Mr. Das', '3333', 8)
      const student = await studentJoin({
        classCode,
        name: 'Tara Sharma',
        grade: 8,
        avatar: '⭐',
        pin: '4444',
      })

      // 1. Teacher posts announcement
      const announcement = await postAnnouncement({
        classCode,
        pin: '3333',
        title: 'Weekly Math Olympiad',
        content: 'Please review the Fractions and Equations concepts before Friday.',
      })
      expect(announcement.title).toBe('Weekly Math Olympiad')

      // 2. Student fetches announcements
      const list = await getAnnouncements(classCode, student.id)
      expect(list.length).toBe(1)
      expect(list[0].title).toBe('Weekly Math Olympiad')

      // 3. Message flagging
      const doubt = await createDoubt({
        classCode,
        studentId: student.id,
        content: 'Can you help review this?',
      })
      const msgId = doubt.messages[0].id

      await flagDoubtMessage(msgId, 'Inappropriate language')
      const refreshedDoubts = await getMyDoubts(classCode, student.id)
      expect(refreshedDoubts[0].messages[0].flagged).toBe(true)
    })
  })
})
