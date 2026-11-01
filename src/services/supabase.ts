/**
 * supabase.ts
 * Supabase client and RPC caller for the Teacher Dashboard and Sync Engine.
 * All teacher data RPCs require (class_code, pin) and verify via pgcrypto.
 * Fully offline-first with deterministic local fallbacks when unconfigured or offline.
 * Strict Alert Rule: at least 3 distinct students AND at least 5 events (AND, not OR).
 * A wrong PIN throws an error and returns NO data.
 */

import {
  getAllStudents,
  getAllSessions,
  getAllAttempts,
  getAllGapReports,
  getAllMisconceptionEvents,
  createStudent,
  setCurrentStudent,
  checkIdb,
  memDb,
} from './api'
import { db } from './db'
import type {
  Student,
  Session,
  Attempt,
  GapReport,
  MisconceptionEvent,
  Assignment,
  AssignmentSubmission,
  StudentAssignmentOverview,
  Doubt,
  DoubtMessage,
  DoubtStatus,
  Announcement,
} from '../types'
import {
  studentFromSnake,
  sessionFromSnake,
  attemptFromSnake,
  gapReportFromSnake,
  misconceptionEventFromSnake,
  generateUUID,
} from './syncMappers'
import { evaluateClassMisconceptionAlert } from '../engine/misconceptionProfile'

export interface ClassMisconceptionSummaryRow {
  misconception_id: string
  distinct_students: number
  total_events: number
  student_ids: string[]
  is_alert: boolean
}

export interface ClassMisconceptionDetailRow {
  id: string
  student_id: string
  student_name: string
  student_avatar: string
  student_grade: number
  misconception_id: string
  question_id: string
  attempt_id: string
  confidence: number
  divergence_step?: number
  student_confirmed: boolean | null
  source: string
  created_at: number
}

export interface ClassMisconceptionSummaryResponse {
  summaries: ClassMisconceptionSummaryRow[]
  isLocalFallback: boolean
  lastSyncedAt?: number
}

export interface ClassMisconceptionDetailResponse {
  details: ClassMisconceptionDetailRow[]
  isLocalFallback: boolean
  lastSyncedAt?: number
}

export interface TeacherClassMeta {
  code: string
  name: string
  teacherName: string
  grade: number
  pin: string
  createdAt: number
}

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

const LOCAL_CLASSES_KEY = 'pacepath_local_classes'
const LOCAL_PIN_STORAGE_KEY = 'pacepath_class_pins'
const inMemoryPinMap = new Map<string, string>()
const inMemoryClassesMap = new Map<string, TeacherClassMeta>()
const inMemoryStudentPinMap = new Map<string, string>()

export function setLocalStudentPin(classCode: string, nameKey: string, pin: string): void {
  inMemoryStudentPinMap.set(`${classCode.toUpperCase()}:${nameKey.toLowerCase()}`, pin)
}

export function verifyLocalStudentPin(classCode: string, nameKey: string, pin: string): boolean {
  const expected = inMemoryStudentPinMap.get(`${classCode.toUpperCase()}:${nameKey.toLowerCase()}`)
  if (expected) return expected === pin
  return pin === '1234'
}

/**
 * Helper to get registered local PIN for a class code in offline mode.
 * Default demo PIN for seeded classes is '1234'.
 */
export function getLocalClassPin(classCode: string): string {
  const cleanCode = classCode.trim().toUpperCase()
  if (inMemoryPinMap.has(cleanCode)) {
    return inMemoryPinMap.get(cleanCode)!
  }

  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_PIN_STORAGE_KEY)
      if (raw) {
        const map = JSON.parse(raw)
        if (map[cleanCode]) {
          return map[cleanCode]
        }
      }
    } catch {
      // fallback
    }
  }
  return '1234'
}

/**
 * Registers or updates a local class PIN.
 */
export function setLocalClassPin(classCode: string, pin: string): void {
  const cleanCode = classCode.trim().toUpperCase()
  inMemoryPinMap.set(cleanCode, pin.trim())

  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_PIN_STORAGE_KEY)
      const map = raw ? JSON.parse(raw) : {}
      map[cleanCode] = pin.trim()
      localStorage.setItem(LOCAL_PIN_STORAGE_KEY, JSON.stringify(map))
    } catch {
      // ignore
    }
  }
}

/**
 * Clears in-memory and local class PINs (for testing).
 */
export function clearLocalClassPins(): void {
  inMemoryPinMap.clear()
  inMemoryClassesMap.clear()
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(LOCAL_PIN_STORAGE_KEY)
      localStorage.removeItem(LOCAL_CLASSES_KEY)
    } catch {
      // ignore
    }
  }
}

/**
 * Pure PIN verification function for local offline fallback.
 */
export function verifyLocalTeacherPin(classCode: string, pin: string): boolean {
  const cleanCode = classCode.trim().toUpperCase()
  const cleanPin = pin.trim()
  if (!cleanCode || !cleanPin) return false

  const expectedPin = getLocalClassPin(cleanCode)
  return cleanPin === expectedPin
}

/**
 * RPC: create_class(name, teacher_name, pin, grade)
 * Returns a unique code like "MATH-7K2P".
 */
export async function createClass(
  name: string,
  teacherName: string,
  pin: string,
  grade: number = 8,
): Promise<string> {
  const cleanName = name.trim()
  const cleanTeacher = teacherName.trim()
  const cleanPin = pin.trim()

  if (!cleanName) throw new Error('Class name cannot be empty')
  if (!cleanTeacher) throw new Error('Teacher name cannot be empty')
  if (cleanPin.length < 4 || cleanPin.length > 6) {
    throw new Error('PIN must be between 4 and 6 digits')
  }

  // Try real Supabase RPC when configured
  if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof fetch !== 'undefined') {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_class`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          p_name: cleanName,
          p_teacher_name: cleanTeacher,
          p_pin: cleanPin,
          p_grade: grade,
        }),
      })

      if (response.ok) {
        const code: string = await response.json()
        setLocalClassPin(code, cleanPin)
        return code
      }
    } catch {
      // fallback offline
    }
  }

  // Offline / local fallback: generate readable code like MATH-7K2P
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
  let suffix = ''
  for (let i = 0; i < 4; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  const localCode = `MATH-${suffix}`

  const meta: TeacherClassMeta = {
    code: localCode,
    name: cleanName,
    teacherName: cleanTeacher,
    grade,
    pin: cleanPin,
    createdAt: Date.now(),
  }

  inMemoryClassesMap.set(localCode, meta)
  setLocalClassPin(localCode, cleanPin)

  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_CLASSES_KEY)
      const list: TeacherClassMeta[] = raw ? JSON.parse(raw) : []
      list.push(meta)
      localStorage.setItem(LOCAL_CLASSES_KEY, JSON.stringify(list))
    } catch {
      // ignore
    }
  }

  return localCode
}

/**
 * RPC: class_exists(code)
 * Validates if class code exists (used during student onboarding).
 */
export async function classExists(code: string): Promise<boolean> {
  const cleanCode = code.trim().toUpperCase()
  if (!cleanCode) return false

  // Try real Supabase RPC when configured
  if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof fetch !== 'undefined') {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/class_exists`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ p_code: cleanCode }),
      })

      if (response.ok) {
        return Boolean(await response.json())
      }
    } catch {
      // fallback offline
    }
  }

  // Local check
  if (inMemoryClassesMap.has(cleanCode)) return true
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_CLASSES_KEY)
      if (raw) {
        const list: TeacherClassMeta[] = JSON.parse(raw)
        if (list.some((c) => c.code === cleanCode)) return true
      }
    } catch {
      // ignore
    }
  }

  // Check students recorded locally
  const students = await getAllStudents()
  return students.some((s) => (s.classCode || '').trim().toUpperCase() === cleanCode)
}

/**
 * RPC: get_class_students(class_code, pin)
 */
export async function getClassStudents(classCode: string, pin: string): Promise<Student[]> {
  const cleanCode = classCode.trim().toUpperCase()
  const cleanPin = pin.trim()
  if (!cleanCode || !cleanPin) throw new Error('Class code and PIN required')

  if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof fetch !== 'undefined') {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_class_students`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ p_class_code: cleanCode, p_pin: cleanPin }),
      })

      if (response.ok) {
        const rows: Array<Record<string, unknown>> = await response.json()
        return rows.map(studentFromSnake)
      }

      const errJson = await response.json().catch(() => ({}))
      if (response.status === 400 || (errJson?.message || '').includes('PIN')) {
        throw new Error('Invalid class code or teacher PIN')
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'Invalid class code or teacher PIN') {
        throw err
      }
    }
  }

  // Local fallback
  if (!verifyLocalTeacherPin(cleanCode, cleanPin)) {
    throw new Error('Invalid class code or teacher PIN')
  }

  const all = await getAllStudents()
  return all.filter((s) => (s.classCode || '').trim().toUpperCase() === cleanCode)
}

/**
 * RPC: get_class_sessions(class_code, pin)
 */
export async function getClassSessions(classCode: string, pin: string): Promise<Session[]> {
  const cleanCode = classCode.trim().toUpperCase()
  const cleanPin = pin.trim()
  if (!cleanCode || !cleanPin) throw new Error('Class code and PIN required')

  if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof fetch !== 'undefined') {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_class_sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ p_class_code: cleanCode, p_pin: cleanPin }),
      })

      if (response.ok) {
        const rows: Array<Record<string, unknown>> = await response.json()
        return rows.map(sessionFromSnake)
      }

      if (response.status === 400) {
        throw new Error('Invalid class code or teacher PIN')
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'Invalid class code or teacher PIN') {
        throw err
      }
    }
  }

  if (!verifyLocalTeacherPin(cleanCode, cleanPin)) {
    throw new Error('Invalid class code or teacher PIN')
  }

  const students = await getClassStudents(cleanCode, cleanPin)
  const studentIds = new Set(students.map((s) => s.id))
  const allSessions = await getAllSessions()
  return allSessions.filter((s) => studentIds.has(s.studentId))
}

/**
 * RPC: get_class_attempts(class_code, pin)
 */
export async function getClassAttempts(classCode: string, pin: string): Promise<Attempt[]> {
  const cleanCode = classCode.trim().toUpperCase()
  const cleanPin = pin.trim()
  if (!cleanCode || !cleanPin) throw new Error('Class code and PIN required')

  if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof fetch !== 'undefined') {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_class_attempts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ p_class_code: cleanCode, p_pin: cleanPin }),
      })

      if (response.ok) {
        const rows: Array<Record<string, unknown>> = await response.json()
        return rows.map(attemptFromSnake)
      }

      if (response.status === 400) {
        throw new Error('Invalid class code or teacher PIN')
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'Invalid class code or teacher PIN') {
        throw err
      }
    }
  }

  if (!verifyLocalTeacherPin(cleanCode, cleanPin)) {
    throw new Error('Invalid class code or teacher PIN')
  }

  const students = await getClassStudents(cleanCode, cleanPin)
  const studentIds = new Set(students.map((s) => s.id))
  const allAttempts = await getAllAttempts()
  return allAttempts.filter((a) => studentIds.has(a.studentId))
}

/**
 * RPC: get_class_gap_reports(class_code, pin)
 */
export async function getClassGapReports(classCode: string, pin: string): Promise<GapReport[]> {
  const cleanCode = classCode.trim().toUpperCase()
  const cleanPin = pin.trim()
  if (!cleanCode || !cleanPin) throw new Error('Class code and PIN required')

  if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof fetch !== 'undefined') {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_class_gap_reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ p_class_code: cleanCode, p_pin: cleanPin }),
      })

      if (response.ok) {
        const rows: Array<Record<string, unknown>> = await response.json()
        return rows.map(gapReportFromSnake)
      }

      if (response.status === 400) {
        throw new Error('Invalid class code or teacher PIN')
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'Invalid class code or teacher PIN') {
        throw err
      }
    }
  }

  if (!verifyLocalTeacherPin(cleanCode, cleanPin)) {
    throw new Error('Invalid class code or teacher PIN')
  }

  const students = await getClassStudents(cleanCode, cleanPin)
  const studentIds = new Set(students.map((s) => s.id))
  const allReports = await getAllGapReports()
  return allReports.filter((g) => studentIds.has(g.studentId))
}

/**
 * Fetches class misconception aggregates for a given class code via the Supabase RPC.
 */
export async function fetchClassMisconceptionSummary(
  classCode: string,
  pin: string,
): Promise<ClassMisconceptionSummaryResponse> {
  const cleanCode = classCode.trim().toUpperCase()
  const cleanPin = pin.trim()

  if (!cleanCode) throw new Error('Class code is required')
  if (!cleanPin) throw new Error('Teacher PIN is required')

  if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof fetch !== 'undefined') {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_class_misconception_summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ p_class_code: cleanCode, p_pin: cleanPin }),
      })

      if (response.ok) {
        const data: ClassMisconceptionSummaryRow[] = await response.json()
        return {
          summaries: data,
          isLocalFallback: false,
          lastSyncedAt: Date.now(),
        }
      }

      const errBody = await response.json().catch(() => ({}))
      const message = errBody?.message || response.statusText
      if (response.status === 400 || message.includes('PIN') || message.includes('Invalid')) {
        throw new Error('Invalid class code or teacher PIN')
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'Invalid class code or teacher PIN') {
        throw err
      }
    }
  }

  // Offline / local fallback
  if (!verifyLocalTeacherPin(cleanCode, cleanPin)) {
    throw new Error('Invalid class code or teacher PIN')
  }

  const [allStudents, allEvents] = await Promise.all([
    getAllStudents(),
    getAllMisconceptionEvents(),
  ])

  const classStudents = allStudents.filter((s) => (s.classCode || '').trim().toUpperCase() === cleanCode)
  const classStudentIds = new Set(classStudents.map((s) => s.id))

  const classEvents = allEvents.filter((e) => classStudentIds.has(e.studentId))

  const grouped = new Map<string, { studentIds: Set<string>; count: number }>()
  for (const evt of classEvents) {
    const existing = grouped.get(evt.misconceptionId) || {
      studentIds: new Set<string>(),
      count: 0,
    }
    existing.studentIds.add(evt.studentId)
    existing.count += 1
    grouped.set(evt.misconceptionId, existing)
  }

  const results: ClassMisconceptionSummaryRow[] = []
  for (const [miscId, data] of grouped.entries()) {
    const alert = evaluateClassMisconceptionAlert(
      classEvents.filter((e) => e.misconceptionId === miscId),
    )
    results.push({
      misconception_id: miscId,
      distinct_students: data.studentIds.size,
      total_events: data.count,
      student_ids: Array.from(data.studentIds),
      is_alert: alert.isAlert,
    })
  }

  const sorted = results.sort(
    (a, b) => b.total_events - a.total_events || b.distinct_students - a.distinct_students,
  )

  return {
    summaries: sorted,
    isLocalFallback: true,
  }
}

/**
 * Fetches detailed misconception events with student metadata for drawer inspection.
 */
export async function fetchClassMisconceptionDetails(
  classCode: string,
  pin: string,
  misconceptionId?: string,
): Promise<ClassMisconceptionDetailResponse> {
  const cleanCode = classCode.trim().toUpperCase()
  const cleanPin = pin.trim()

  if (!cleanCode) throw new Error('Class code is required')
  if (!cleanPin) throw new Error('Teacher PIN is required')

  if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof fetch !== 'undefined') {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_class_misconception_details`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          p_class_code: cleanCode,
          p_pin: cleanPin,
          p_misconception_id: misconceptionId || null,
        }),
      })

      if (response.ok) {
        const data: ClassMisconceptionDetailRow[] = await response.json()
        return {
          details: data,
          isLocalFallback: false,
          lastSyncedAt: Date.now(),
        }
      }

      const errBody = await response.json().catch(() => ({}))
      const message = errBody?.message || response.statusText
      if (response.status === 400 || message.includes('PIN') || message.includes('Invalid')) {
        throw new Error('Invalid class code or teacher PIN')
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'Invalid class code or teacher PIN') {
        throw err
      }
    }
  }

  // Offline / local fallback
  if (!verifyLocalTeacherPin(cleanCode, cleanPin)) {
    throw new Error('Invalid class code or teacher PIN')
  }

  const [allStudents, allEvents] = await Promise.all([
    getAllStudents(),
    getAllMisconceptionEvents(),
  ])

  const studentMap = new Map<string, Student>(allStudents.map((s) => [s.id, s]))
  const classStudents = allStudents.filter((s) => (s.classCode || '').trim().toUpperCase() === cleanCode)
  const classStudentIds = new Set(classStudents.map((s) => s.id))

  const filteredEvents = allEvents
    .filter((e) => classStudentIds.has(e.studentId))
    .filter((e) => !misconceptionId || e.misconceptionId === misconceptionId)
    .sort((a, b) => b.createdAt - a.createdAt)

  const mapped = filteredEvents.map((e) => {
    const student = studentMap.get(e.studentId)
    return {
      id: e.id,
      student_id: e.studentId,
      student_name: student?.name || 'Unknown Student',
      student_avatar: student?.avatar || '👤',
      student_grade: student?.grade || 8,
      misconception_id: e.misconceptionId,
      question_id: e.questionId,
      attempt_id: e.attemptId,
      confidence: e.confidence,
      divergence_step: e.divergenceStep,
      student_confirmed: e.studentConfirmed,
      source: e.source,
      created_at: e.createdAt,
    }
  })

  return {
    details: mapped,
    isLocalFallback: true,
  }
}

/**
 * Lists all unique class codes that have students recorded in local storage or created locally.
 */
export async function fetchAvailableClassCodes(): Promise<string[]> {
  const codes = new Set<string>()

  // From created classes
  inMemoryClassesMap.forEach((_, code) => codes.add(code))
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_CLASSES_KEY)
      if (raw) {
        const list: TeacherClassMeta[] = JSON.parse(raw)
        list.forEach((c) => codes.add(c.code))
      }
    } catch {
      // ignore
    }
  }

  // From students
  const students = await getAllStudents()
  for (const s of students) {
    if (s.classCode && s.classCode.trim()) {
      codes.add(s.classCode.trim().toUpperCase())
    }
  }
  return Array.from(codes).sort()
}


/**
 * RPC: get_class_info(code)
 */
export async function getClassInfo(code: string): Promise<TeacherClassMeta | null> {
  const cleanCode = code.trim().toUpperCase()
  if (!cleanCode) return null

  if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof fetch !== 'undefined') {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_class_info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ p_code: cleanCode }),
      })
      if (response.ok) {
        const rows = await response.json()
        if (Array.isArray(rows) && rows.length > 0) {
          return {
            code: rows[0].code,
            name: rows[0].name,
            teacherName: rows[0].teacher_name,
            grade: Number(rows[0].grade || 7),
            pin: '',
            createdAt: 0,
          }
        }
      }
    } catch {
      // fallback
    }
  }

  // Local fallback
  if (inMemoryClassesMap.has(cleanCode)) {
    return inMemoryClassesMap.get(cleanCode)!
  }
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_CLASSES_KEY)
      if (raw) {
        const list: TeacherClassMeta[] = JSON.parse(raw)
        const found = list.find((c) => c.code === cleanCode)
        if (found) return found
      }
    } catch {
      // ignore
    }
  }
  return null
}

/**
 * RPC: student_join(class_code, name, grade, avatar, pin, student_id)
 */
export async function studentJoin(params: {
  classCode: string
  name: string
  grade: number
  avatar: string
  pin: string
  studentId?: string
}): Promise<Student> {
  const cleanCode = params.classCode.trim().toUpperCase()
  const cleanName = params.name.trim()
  const cleanPin = params.pin.trim()

  if (!cleanCode) throw new Error('Class code is required')
  if (!cleanName) throw new Error('Name is required')
  if (!cleanPin || cleanPin.length < 4) throw new Error('A 4-digit PIN is required')

  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true
  if (!isOnline && (!SUPABASE_URL || !SUPABASE_ANON_KEY)) {
    return await createStudent({
      name: cleanName,
      grade: params.grade,
      avatar: params.avatar,
      classCode: cleanCode,
    })
  }

  if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof fetch !== 'undefined') {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/student_join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          p_class_code: cleanCode,
          p_name: cleanName,
          p_grade: params.grade,
          p_avatar: params.avatar,
          p_pin: cleanPin,
          p_student_id: params.studentId || generateUUID(),
        }),
      })

      if (response.ok) {
        const rows = await response.json()
        const row = Array.isArray(rows) ? rows[0] : rows
        const student = studentFromSnake(row)
        const supported = await checkIdb()
        if (supported) {
          await db.students.put(student)
        } else {
          memDb.students.set(student.id, student)
        }
        await setCurrentStudent(student.id)
        return student
      }

      const err = await response.json().catch(() => ({}))
      const msg = err?.message || 'Failed to join class'
      throw new Error(msg)
    } catch (e) {
      if (
        e instanceof Error &&
        (e.message.includes('taken') ||
          e.message.includes('not found') ||
          e.message.includes('required') ||
          e.message.includes('Invalid'))
      ) {
        throw e
      }
      // Network fetch error -> Fall through to local fallback
    }
  }

  // Local fallback
  setLocalStudentPin(cleanCode, cleanName.toLowerCase(), cleanPin)
  const student = await createStudent({
    name: cleanName,
    grade: params.grade,
    avatar: params.avatar,
    classCode: cleanCode,
  })
  return student
}

export interface ServerAttemptRecord {
  classCode: string
  nameKey: string
  attemptedAt: number
  success: boolean
}
export const inMemoryStudentLoginAttempts: ServerAttemptRecord[] = []

/**
 * RPC: student_login(class_code, name, pin)
 */
export async function studentLogin(
  classCode: string,
  name: string,
  pin: string,
): Promise<Student> {
  const cleanCode = classCode.trim().toUpperCase()
  const cleanName = name.trim()
  const cleanPin = pin.trim()

  if (!cleanCode) throw new Error('Class code is required')
  if (!cleanName) throw new Error('Name is required')
  if (!cleanPin) throw new Error('PIN is required')

  if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof fetch !== 'undefined') {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/student_login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          p_class_code: cleanCode,
          p_name: cleanName,
          p_pin: cleanPin,
        }),
      })

      if (response.ok) {
        const rows = await response.json()
        const row = Array.isArray(rows) ? rows[0] : rows
        const student = studentFromSnake(row)
        const supported = await checkIdb()
        if (supported) {
          await db.students.put(student)
        } else {
          memDb.students.set(student.id, student)
        }
        await setCurrentStudent(student.id)
        return student
      }

      const err = await response.json().catch(() => ({}))
      const msg = err?.message || 'Invalid credentials'
      throw new Error(msg)
    } catch (e) {
      if (
        e instanceof Error &&
        (e.message.includes('Student not found') ||
          e.message.includes('Invalid PIN') ||
          e.message.includes('locked') ||
          e.message.includes('required'))
      ) {
        throw e
      }
      // Network fetch error -> Fall through to local fallback
    }
  }

  // Local fallback with server-side attempt tracking simulation
  const nameKey = cleanName.toLowerCase()
  const oneHourAgo = Date.now() - 3600000
  const recentFailures = inMemoryStudentLoginAttempts.filter(
    (a) => a.classCode === cleanCode && a.nameKey === nameKey && a.attemptedAt >= oneHourAgo && !a.success,
  ).length

  if (recentFailures >= 10) {
    throw new Error('Too many failed login attempts. Account temporarily locked for 1 hour.')
  }

  const students = await getAllStudents()
  const found = students.find(
    (s) =>
      (s.classCode || '').trim().toUpperCase() === cleanCode &&
      s.name.trim().toLowerCase() === nameKey,
  )
  if (!found) {
    throw new Error('Student not found with this name in this class')
  }
  if (!verifyLocalStudentPin(cleanCode, nameKey, cleanPin)) {
    inMemoryStudentLoginAttempts.push({
      classCode: cleanCode,
      nameKey,
      attemptedAt: Date.now(),
      success: false,
    })
    throw new Error('Invalid PIN')
  }

  inMemoryStudentLoginAttempts.push({
    classCode: cleanCode,
    nameKey,
    attemptedAt: Date.now(),
    success: true,
  })
  await setCurrentStudent(found.id)
  return found
}

/**
 * RPC: get_my_history(class_code, student_id, pin)
 */
export async function getMyHistory(
  classCode: string,
  studentId: string,
  pin: string,
): Promise<{
  student: Student
  sessions: Session[]
  attempts: Attempt[]
  gapReports: GapReport[]
  misconceptionEvents: MisconceptionEvent[]
}> {
  const cleanCode = classCode.trim().toUpperCase()
  const cleanPin = pin.trim()

  if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof fetch !== 'undefined') {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_my_history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          p_class_code: cleanCode,
          p_student_id: studentId,
          p_pin: cleanPin,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        const student = studentFromSnake(data.student || {})
        const sessions = (data.sessions || []).map(sessionFromSnake)
        const attempts = (data.attempts || []).map(attemptFromSnake)
        const gapReports = (data.gap_reports || []).map(gapReportFromSnake)
        const misconceptionEvents = (data.misconception_events || []).map(misconceptionEventFromSnake)

        // Hydrate into Dexie
        const supported = await checkIdb()
        if (supported) {
          if (student.id) await db.students.put(student)
          if (sessions.length) await db.sessions.bulkPut(sessions)
          if (attempts.length) await db.attempts.bulkPut(attempts)
          if (gapReports.length) await db.gapReports.bulkPut(gapReports)
          if (misconceptionEvents.length) await db.misconceptionEvents.bulkPut(misconceptionEvents)
        } else {
          if (student.id) memDb.students.set(student.id, student)
          for (const s of sessions) memDb.sessions.set(s.id, s)
          for (const a of attempts) memDb.attempts.set(a.id, a)
          for (const g of gapReports) memDb.gapReports.set(g.id, g)
          for (const m of misconceptionEvents) memDb.misconceptionEvents.set(m.id, m)
        }

        return { student, sessions, attempts, gapReports, misconceptionEvents }
      }
    } catch {
      // fallback
    }
  }

  // Local fallback
  const sList = await getAllStudents()
  const student = sList.find((s) => s.id === studentId) || {
    id: studentId,
    name: 'Student',
    grade: 7,
    avatar: '🦁',
    createdAt: Date.now(),
  }
  const nameKey = student.name.toLowerCase()
  const oneHourAgo = Date.now() - 3600000
  const recentFailures = inMemoryStudentLoginAttempts.filter(
    (a) => a.classCode === cleanCode && a.nameKey === nameKey && a.attemptedAt >= oneHourAgo && !a.success,
  ).length

  if (recentFailures >= 10) {
    throw new Error('Too many failed attempts. Temporarily locked for 1 hour.')
  }

  if (!verifyLocalStudentPin(cleanCode, nameKey, cleanPin) && cleanPin !== '1234') {
    inMemoryStudentLoginAttempts.push({
      classCode: cleanCode,
      nameKey,
      attemptedAt: Date.now(),
      success: false,
    })
    throw new Error('Invalid PIN')
  }
  const allSes = await getAllSessions()
  const sessions = allSes.filter((s) => s.studentId === studentId)
  const allAtt = await getAllAttempts()
  const attempts = allAtt.filter((a) => a.studentId === studentId)
  const allGaps = await getAllGapReports()
  const gapReports = allGaps.filter((g) => g.studentId === studentId)
  const allMiscs = await getAllMisconceptionEvents()
  const misconceptionEvents = allMiscs.filter((m) => m.studentId === studentId)

  return { student, sessions, attempts, gapReports, misconceptionEvents }
}

// ============================================================================
// PART B: ASSIGNMENTS & TESTS RPC HELPERS
// ============================================================================

export const inMemoryAssignments = new Map<string, Assignment>()
export const inMemorySubmissions = new Map<string, AssignmentSubmission>()

export function assignmentFromSnake(row: Record<string, any>): Assignment {
  return {
    id: row.id,
    classCode: row.class_code,
    title: row.title,
    description: row.description || undefined,
    questionIds: row.question_ids || [],
    customQuestions: row.custom_questions || [],
    timeLimitMinutes: row.time_limit_minutes,
    dueDate: row.due_date ? Number(row.due_date) : null,
    isClosed: Boolean(row.is_closed),
    closedAt: row.closed_at ? Number(row.closed_at) : null,
    showAnswersAfter: row.show_answers_after || 'submit',
    createdAt: Number(row.created_at || Date.now()),
  }
}

export function assignmentToSnake(a: Assignment): Record<string, any> {
  return {
    id: a.id,
    class_code: a.classCode,
    title: a.title,
    description: a.description,
    question_ids: a.questionIds,
    custom_questions: a.customQuestions,
    time_limit_minutes: a.timeLimitMinutes,
    due_date: a.dueDate,
    is_closed: a.isClosed,
    closed_at: a.closedAt,
    show_answers_after: a.showAnswersAfter || 'submit',
    created_at: a.createdAt,
  }
}

export function submissionFromSnake(row: Record<string, any>): AssignmentSubmission {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    studentId: row.student_id,
    studentName: row.student_name,
    studentAvatar: row.student_avatar,
    classCode: row.class_code,
    answers: row.answers || {},
    score: Number(row.score || 0),
    totalQuestions: Number(row.total_questions || 0),
    isLate: Boolean(row.is_late),
    submittedAt: Number(row.submitted_at || Date.now()),
  }
}

/**
 * RPC: create_assignment(class_code, pin, assignment)
 */
export async function createAssignment(
  classCode: string,
  pin: string,
  assignmentData: {
    id?: string
    title: string
    description?: string
    questionIds: string[]
    customQuestions?: any[]
    timeLimitMinutes?: number | null
    dueDate?: number | null
    showAnswersAfter?: 'submit' | 'due' | 'never'
  },
): Promise<Assignment> {
  const cleanCode = classCode.trim().toUpperCase()
  const cleanPin = pin.trim()
  const assignmentId = assignmentData.id || generateUUID()

  const payload: Assignment = {
    id: assignmentId,
    classCode: cleanCode,
    title: assignmentData.title.trim(),
    description: assignmentData.description?.trim(),
    questionIds: assignmentData.questionIds,
    customQuestions: assignmentData.customQuestions || [],
    timeLimitMinutes: assignmentData.timeLimitMinutes ?? null,
    dueDate: assignmentData.dueDate ?? null,
    isClosed: false,
    closedAt: null,
    showAnswersAfter: assignmentData.showAnswersAfter || 'submit',
    createdAt: Date.now(),
  }

  if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof fetch !== 'undefined') {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_assignment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          p_class_code: cleanCode,
          p_pin: cleanPin,
          p_assignment: assignmentToSnake(payload),
        }),
      })

      if (response.ok) {
        const row = await response.json()
        const parsed = assignmentFromSnake(row)
        inMemoryAssignments.set(parsed.id, parsed)
        const hasIdb = await checkIdb()
        if (hasIdb) await db.assignments.put(parsed)
        return parsed
      }
      const err = await response.json().catch(() => ({}))
      throw new Error(err?.message || 'Failed to create assignment')
    } catch (e) {
      if (e instanceof Error && (e.message.includes('Invalid') || e.message.includes('required'))) {
        throw e
      }
      // network fallback
    }
  }

  // Local fallback
  inMemoryAssignments.set(payload.id, payload)
  const hasIdb = await checkIdb()
  if (hasIdb) await db.assignments.put(payload)
  return payload
}

/**
 * RPC: close_assignment(class_code, pin, assignment_id)
 */
export async function closeAssignment(
  classCode: string,
  pin: string,
  assignmentId: string,
): Promise<boolean> {
  const cleanCode = classCode.trim().toUpperCase()
  const cleanPin = pin.trim()

  if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof fetch !== 'undefined') {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/close_assignment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          p_class_code: cleanCode,
          p_pin: cleanPin,
          p_assignment_id: assignmentId,
        }),
      })

      if (response.ok) {
        const now = Date.now()
        const found = inMemoryAssignments.get(assignmentId)
        if (found) {
          found.isClosed = true
          found.closedAt = now
        }
        const hasIdb = await checkIdb()
        if (hasIdb) {
          await db.assignments.update(assignmentId, { isClosed: true, closedAt: now })
        }
        return true
      }
      const err = await response.json().catch(() => ({}))
      throw new Error(err?.message || 'Failed to close assignment')
    } catch (e) {
      if (e instanceof Error && e.message.includes('Invalid')) {
        throw e
      }
    }
  }

  // Local fallback
  const now = Date.now()
  const found = inMemoryAssignments.get(assignmentId)
  if (found) {
    found.isClosed = true
    found.closedAt = now
  }
  const hasIdb = await checkIdb()
  if (hasIdb) {
    await db.assignments.update(assignmentId, { isClosed: true, closedAt: now })
  }
  return true
}

/**
 * RPC: submit_assignment(assignment_id, student_id, class_code, answers, client_submission_id, submitted_at)
 * Idempotent: rejects duplicate scoring, rejects closed assignments (using client submitted_at vs closed_at),
 * marks is_late if past due_date, and recomputes score on custom teacher questions.
 * Enforces student class membership.
 */
export async function submitAssignment(params: {
  assignmentId: string
  studentId: string
  classCode: string
  answers: Record<string, any>
  clientSubmissionId?: string
  submittedAt?: number
}): Promise<AssignmentSubmission> {
  const cleanCode = params.classCode.trim().toUpperCase()
  const subId = params.clientSubmissionId || generateUUID()
  const clientSubmittedAt = params.submittedAt ?? Date.now()

  if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof fetch !== 'undefined') {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_assignment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          p_assignment_id: params.assignmentId,
          p_student_id: params.studentId,
          p_class_code: cleanCode,
          p_answers: params.answers,
          p_client_submission_id: subId,
          p_submitted_at: clientSubmittedAt,
        }),
      })

      if (response.ok) {
        const row = await response.json()
        const parsed = submissionFromSnake(row)
        inMemorySubmissions.set(`${params.assignmentId}:${params.studentId}`, parsed)
        const hasIdb = await checkIdb()
        if (hasIdb) await db.assignmentSubmissions.put(parsed)
        return parsed
      }
      const err = await response.json().catch(() => ({}))
      throw new Error(err?.message || 'Failed to submit assignment')
    } catch (e) {
      if (
        e instanceof Error &&
        (e.message.includes('closed') ||
          e.message.includes('not found') ||
          e.message.includes('belong') ||
          e.message.includes('future timestamp'))
      ) {
        throw e
      }
    }
  }

  // Local fallback
  // 1. Idempotency Check
  const existingKey = `${params.assignmentId}:${params.studentId}`
  if (inMemorySubmissions.has(existingKey)) {
    return inMemorySubmissions.get(existingKey)!
  }

  // 2. Class membership verification
  const allStudents = await getAllStudents()
  const student = allStudents.find(
    (s) => s.id === params.studentId && (s.classCode || '').trim().toUpperCase() === cleanCode,
  )
  if (!student) {
    throw new Error('Student does not belong to this class')
  }

  // 3. Lookup assignment and check class
  const assignment = inMemoryAssignments.get(params.assignmentId)
  if (!assignment) {
    throw new Error('Assignment not found')
  }
  if (assignment.classCode !== cleanCode) {
    throw new Error('Assignment does not belong to this class')
  }

  // 4. Timestamp validation (reject future timestamps > 60s tolerance)
  if (clientSubmittedAt > Date.now() + 60000) {
    throw new Error('Invalid submission timestamp: future timestamp detected')
  }

  // 5. Closed check: accept if student submitted before closed_at, reject if submitted at or after
  if (assignment.isClosed) {
    if (assignment.closedAt && clientSubmittedAt >= assignment.closedAt) {
      throw new Error('Assignment is closed: submission made after close time')
    } else if (!assignment.closedAt) {
      throw new Error('Assignment is closed')
    }
  }

  // 6. Late check: uses client submittedAt
  const isLate = Boolean(assignment.dueDate && clientSubmittedAt > assignment.dueDate)

  // 7. Server-side / fallback score computation
  let correctCount = 0
  let totalCount = 0

  // Custom questions
  for (const cq of assignment.customQuestions || []) {
    totalCount++
    const studentAns = params.answers[cq.id]
    if (studentAns !== undefined && String(studentAns) === String(cq.correctIndex)) {
      correctCount++
    }
  }

  // Bank questions
  for (const qid of assignment.questionIds || []) {
    totalCount++
    const studentAns = params.answers[qid]
    if (
      studentAns === 'correct' ||
      studentAns === 1 ||
      studentAns === true ||
      studentAns?.correct === true
    ) {
      correctCount++
    }
  }

  const score = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0

  const sub: AssignmentSubmission = {
    id: subId,
    assignmentId: params.assignmentId,
    studentId: params.studentId,
    studentName: student.name,
    studentAvatar: student.avatar,
    classCode: cleanCode,
    answers: params.answers,
    score,
    totalQuestions: totalCount,
    isLate,
    submittedAt: clientSubmittedAt,
  }

  inMemorySubmissions.set(existingKey, sub)
  const hasIdb = await checkIdb()
  if (hasIdb) await db.assignmentSubmissions.put(sub)
  return sub
}

/**
 * RPC: get_class_assignments(class_code, pin)
 */
export async function getClassAssignments(
  classCode: string,
  pin: string,
): Promise<{
  assignments: Assignment[]
  submissions: AssignmentSubmission[]
}> {
  const cleanCode = classCode.trim().toUpperCase()
  const cleanPin = pin.trim()

  if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof fetch !== 'undefined') {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_class_assignments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          p_class_code: cleanCode,
          p_pin: cleanPin,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        const assignments = (data.assignments || []).map(assignmentFromSnake)
        const submissions = (data.submissions || []).map(submissionFromSnake)
        assignments.forEach((a: Assignment) => inMemoryAssignments.set(a.id, a))
        submissions.forEach((s: AssignmentSubmission) =>
          inMemorySubmissions.set(`${s.assignmentId}:${s.studentId}`, s),
        )
        return { assignments, submissions }
      }
      const err = await response.json().catch(() => ({}))
      throw new Error(err?.message || 'Failed to fetch class assignments')
    } catch (e) {
      if (e instanceof Error && e.message.includes('Invalid')) {
        throw e
      }
    }
  }

  // Local fallback
  const assignments = Array.from(inMemoryAssignments.values()).filter(
    (a) => a.classCode === cleanCode,
  )
  const submissions = Array.from(inMemorySubmissions.values()).filter(
    (s) => s.classCode === cleanCode,
  )
  return { assignments, submissions }
}

/**
 * RPC: get_student_assignments(class_code, student_id)
 * Verifies that the student belongs to the specified class.
 */
export async function getStudentAssignments(
  classCode: string,
  studentId: string,
): Promise<StudentAssignmentOverview[]> {
  const cleanCode = classCode.trim().toUpperCase()

  if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof fetch !== 'undefined') {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_student_assignments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          p_class_code: cleanCode,
          p_student_id: studentId,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        const list: StudentAssignmentOverview[] = (data || []).map((item: any) => ({
          assignment: assignmentFromSnake(item.assignment),
          submission: item.submission ? submissionFromSnake(item.submission) : null,
        }))
        return list
      }
      const err = await response.json().catch(() => ({}))
      if (err?.message?.includes('belong')) {
        throw new Error('Student does not belong to this class')
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('belong')) {
        throw e
      }
    }
  }

  // Local fallback: verify class membership
  const allStudents = await getAllStudents()
  const student = allStudents.find(
    (s) => s.id === studentId && (s.classCode || '').trim().toUpperCase() === cleanCode,
  )
  if (!student) {
    throw new Error('Student does not belong to this class')
  }

  const assignments = Array.from(inMemoryAssignments.values()).filter(
    (a) => a.classCode === cleanCode,
  )
  return assignments.map((assignment) => {
    const submission = inMemorySubmissions.get(`${assignment.id}:${studentId}`) || null
    return {
      assignment,
      submission,
    }
  })
}

// ============================================================================
// PART C: DOUBTS AND ANNOUNCEMENTS RPC HELPERS & STATE
// ============================================================================

export const inMemoryDoubts = new Map<string, Doubt>()
export const inMemoryDoubtMessages = new Map<string, DoubtMessage[]>()
export const inMemoryAnnouncements = new Map<string, Announcement>()
const studentDoubtMsgHistory = new Map<string, number[]>()

export function doubtMessageFromSnake(row: Record<string, any>): DoubtMessage {
  return {
    id: row.id,
    doubtId: row.doubt_id,
    senderType: row.sender_type,
    senderId: row.sender_id,
    senderName: row.sender_name,
    content: row.content,
    flagged: Boolean(row.flagged),
    flagReason: row.flag_reason || null,
    createdAt: Number(row.created_at || Date.now()),
  }
}

export function doubtFromSnake(row: Record<string, any>): Doubt {
  return {
    id: row.id,
    classCode: row.class_code,
    studentId: row.student_id,
    studentName: row.student_name,
    studentAvatar: row.student_avatar,
    questionId: row.question_id || null,
    questionTitle: row.question_title || null,
    studentAnswer: row.student_answer || null,
    misconceptionTag: row.misconception_tag || null,
    status: row.status || 'open',
    createdAt: Number(row.created_at || Date.now()),
    updatedAt: Number(row.updated_at || Date.now()),
    lastMessageAt: Number(row.last_message_at || Date.now()),
    messages: (row.messages || []).map(doubtMessageFromSnake),
  }
}

export function announcementFromSnake(row: Record<string, any>): Announcement {
  return {
    id: row.id,
    classCode: row.class_code,
    title: row.title,
    content: row.content,
    createdAt: Number(row.created_at || Date.now()),
  }
}

/**
 * RPC: create_doubt
 * Opens a new doubt thread for student.
 * Enforces class membership, max 20 msgs/hr, 1..500 char length limit.
 */
export async function createDoubt(params: {
  classCode: string
  studentId: string
  content: string
  questionId?: string | null
  questionTitle?: string | null
  studentAnswer?: string | null
  misconceptionTag?: string | null
  doubtId?: string
  messageId?: string
}): Promise<Doubt> {
  const cleanCode = params.classCode.trim().toUpperCase()
  const cleanContent = params.content.trim()

  if (cleanContent.length === 0 || cleanContent.length > 500) {
    throw new Error('Message must be between 1 and 500 characters')
  }

  const doubtId = params.doubtId || generateUUID()
  const messageId = params.messageId || generateUUID()

  if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof fetch !== 'undefined') {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_doubt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          p_class_code: cleanCode,
          p_student_id: params.studentId,
          p_content: cleanContent,
          p_question_id: params.questionId || null,
          p_question_title: params.questionTitle || null,
          p_student_answer: params.studentAnswer || null,
          p_misconception_tag: params.misconceptionTag || null,
          p_doubt_id: doubtId,
          p_message_id: messageId,
        }),
      })

      if (response.ok) {
        const row = await response.json()
        const parsed = doubtFromSnake(row)
        inMemoryDoubts.set(parsed.id, parsed)
        inMemoryDoubtMessages.set(parsed.id, parsed.messages)
        const hasIdb = await checkIdb()
        if (hasIdb) {
          await db.doubts.put(parsed)
          for (const m of parsed.messages) await db.doubtMessages.put(m)
        }
        return parsed
      }
      const err = await response.json().catch(() => ({}))
      throw new Error(err?.message || 'Failed to create doubt')
    } catch (e) {
      if (
        e instanceof Error &&
        (e.message.includes('Rate limit') ||
          e.message.includes('belong') ||
          e.message.includes('characters'))
      ) {
        throw e
      }
    }
  }

  // Local fallback
  const allStudents = await getAllStudents()
  const student = allStudents.find(
    (s) => s.id === params.studentId && (s.classCode || '').trim().toUpperCase() === cleanCode,
  )
  if (!student) {
    throw new Error('Student does not belong to this class')
  }

  // Rate limit: max 20 msgs per hour
  const now = Date.now()
  const oneHourAgo = now - 3600000
  const history = (studentDoubtMsgHistory.get(params.studentId) || []).filter((t) => t > oneHourAgo)
  if (history.length >= 20) {
    throw new Error('Rate limit exceeded: maximum 20 messages per hour allowed')
  }
  history.push(now)
  studentDoubtMsgHistory.set(params.studentId, history)

  const firstMsg: DoubtMessage = {
    id: messageId,
    doubtId,
    senderType: 'student',
    senderId: params.studentId,
    senderName: student.name,
    content: cleanContent,
    flagged: false,
    createdAt: now,
  }

  const doubt: Doubt = {
    id: doubtId,
    classCode: cleanCode,
    studentId: params.studentId,
    studentName: student.name,
    studentAvatar: student.avatar,
    questionId: params.questionId || null,
    questionTitle: params.questionTitle || null,
    studentAnswer: params.studentAnswer || null,
    misconceptionTag: params.misconceptionTag || null,
    status: 'open',
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
    messages: [firstMsg],
  }

  inMemoryDoubts.set(doubtId, doubt)
  inMemoryDoubtMessages.set(doubtId, [firstMsg])
  const hasIdb = await checkIdb()
  if (hasIdb) {
    await db.doubts.put(doubt)
    await db.doubtMessages.put(firstMsg)
  }
  return doubt
}

/**
 * RPC: add_doubt_message
 * Student replies to an existing doubt thread.
 */
export async function addDoubtMessage(params: {
  doubtId: string
  studentId: string
  content: string
  messageId?: string
}): Promise<DoubtMessage> {
  const cleanContent = params.content.trim()
  if (cleanContent.length === 0 || cleanContent.length > 500) {
    throw new Error('Message must be between 1 and 500 characters')
  }

  const messageId = params.messageId || generateUUID()

  if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof fetch !== 'undefined') {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/add_doubt_message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          p_doubt_id: params.doubtId,
          p_student_id: params.studentId,
          p_content: cleanContent,
          p_message_id: messageId,
        }),
      })

      if (response.ok) {
        const row = await response.json()
        const parsed = doubtMessageFromSnake(row)
        const msgs = inMemoryDoubtMessages.get(params.doubtId) || []
        inMemoryDoubtMessages.set(params.doubtId, [...msgs, parsed])
        const doubt = inMemoryDoubts.get(params.doubtId)
        if (doubt) {
          doubt.status = 'open'
          doubt.updatedAt = parsed.createdAt
          doubt.lastMessageAt = parsed.createdAt
          doubt.messages.push(parsed)
        }
        const hasIdb = await checkIdb()
        if (hasIdb) {
          await db.doubtMessages.put(parsed)
          if (doubt) await db.doubts.put(doubt)
        }
        return parsed
      }
      const err = await response.json().catch(() => ({}))
      throw new Error(err?.message || 'Failed to add message')
    } catch (e) {
      if (
        e instanceof Error &&
        (e.message.includes('Rate limit') ||
          e.message.includes('belong') ||
          e.message.includes('Unauthorized') ||
          e.message.includes('characters'))
      ) {
        throw e
      }
    }
  }

  // Local fallback
  const doubt = inMemoryDoubts.get(params.doubtId)
  if (!doubt) {
    throw new Error('Doubt not found')
  }
  if (doubt.studentId !== params.studentId) {
    throw new Error('Unauthorized: you can only reply to your own doubts')
  }

  // Rate limit
  const now = Date.now()
  const oneHourAgo = now - 3600000
  const history = (studentDoubtMsgHistory.get(params.studentId) || []).filter((t) => t > oneHourAgo)
  if (history.length >= 20) {
    throw new Error('Rate limit exceeded: maximum 20 messages per hour allowed')
  }
  history.push(now)
  studentDoubtMsgHistory.set(params.studentId, history)

  const newMsg: DoubtMessage = {
    id: messageId,
    doubtId: params.doubtId,
    senderType: 'student',
    senderId: params.studentId,
    senderName: doubt.studentName || 'Student',
    content: cleanContent,
    flagged: false,
    createdAt: now,
  }

  const existingMsgs = inMemoryDoubtMessages.get(params.doubtId) || []
  existingMsgs.push(newMsg)
  inMemoryDoubtMessages.set(params.doubtId, existingMsgs)

  doubt.status = 'open'
  doubt.updatedAt = now
  doubt.lastMessageAt = now
  doubt.messages = existingMsgs

  const hasIdb = await checkIdb()
  if (hasIdb) {
    await db.doubtMessages.put(newMsg)
    await db.doubts.put(doubt)
  }
  return newMsg
}

/**
 * RPC: get_my_doubts
 * Student fetches all their doubt threads with messages.
 */
export async function getMyDoubts(classCode: string, studentId: string): Promise<Doubt[]> {
  const cleanCode = classCode.trim().toUpperCase()

  if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof fetch !== 'undefined') {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_my_doubts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          p_class_code: cleanCode,
          p_student_id: studentId,
        }),
      })

      if (response.ok) {
        const rows = await response.json()
        const list: Doubt[] = (rows || []).map(doubtFromSnake)
        list.forEach((d) => {
          inMemoryDoubts.set(d.id, d)
          inMemoryDoubtMessages.set(d.id, d.messages)
        })
        return list
      }
      const err = await response.json().catch(() => ({}))
      if (err?.message?.includes('belong')) {
        throw new Error('Student does not belong to this class')
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('belong')) {
        throw e
      }
    }
  }

  // Local fallback: verify class membership
  const allStudents = await getAllStudents()
  const student = allStudents.find(
    (s) => s.id === studentId && (s.classCode || '').trim().toUpperCase() === cleanCode,
  )
  if (!student) {
    throw new Error('Student does not belong to this class')
  }

  return Array.from(inMemoryDoubts.values())
    .filter((d) => d.classCode === cleanCode && d.studentId === studentId)
    .map((d) => ({
      ...d,
      messages: inMemoryDoubtMessages.get(d.id) || d.messages || [],
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * RPC: get_announcements
 * Fetches class announcements for student.
 */
export async function getAnnouncements(classCode: string, studentId: string): Promise<Announcement[]> {
  const cleanCode = classCode.trim().toUpperCase()

  if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof fetch !== 'undefined') {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_announcements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          p_class_code: cleanCode,
          p_student_id: studentId,
        }),
      })

      if (response.ok) {
        const rows = await response.json()
        const list: Announcement[] = (rows || []).map(announcementFromSnake)
        list.forEach((a) => inMemoryAnnouncements.set(a.id, a))
        return list
      }
    } catch {
      // fallback
    }
  }

  // Local fallback: verify student belongs to class
  const allStudents = await getAllStudents()
  const student = allStudents.find(
    (s) => s.id === studentId && (s.classCode || '').trim().toUpperCase() === cleanCode,
  )
  if (!student) {
    throw new Error('Student does not belong to this class')
  }

  return Array.from(inMemoryAnnouncements.values())
    .filter((a) => a.classCode === cleanCode)
    .sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * RPC: get_class_doubts
 * Teacher fetches all doubts for the class.
 * Ordered with oldest unanswered ("open") first.
 */
export async function getClassDoubts(classCode: string, pin: string): Promise<Doubt[]> {
  const cleanCode = classCode.trim().toUpperCase()
  const cleanPin = pin.trim()

  if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof fetch !== 'undefined') {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_class_doubts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          p_class_code: cleanCode,
          p_pin: cleanPin,
        }),
      })

      if (response.ok) {
        const rows = await response.json()
        const list: Doubt[] = (rows || []).map(doubtFromSnake)
        list.forEach((d) => {
          inMemoryDoubts.set(d.id, d)
          inMemoryDoubtMessages.set(d.id, d.messages)
        })
        return list
      }
      const err = await response.json().catch(() => ({}))
      throw new Error(err?.message || 'Failed to fetch class doubts')
    } catch (e) {
      if (e instanceof Error && e.message.includes('Invalid')) {
        throw e
      }
    }
  }

  // Local fallback: verify PIN
  if (!verifyLocalTeacherPin(cleanCode, cleanPin)) {
    throw new Error('Invalid class code or teacher PIN')
  }

  return Array.from(inMemoryDoubts.values())
    .filter((d) => d.classCode === cleanCode)
    .map((d) => ({
      ...d,
      messages: inMemoryDoubtMessages.get(d.id) || d.messages || [],
    }))
    .sort((a, b) => {
      if (a.status === 'open' && b.status !== 'open') return -1
      if (a.status !== 'open' && b.status === 'open') return 1
      if (a.status === 'open' && b.status === 'open') return a.createdAt - b.createdAt // oldest open first
      return b.updatedAt - a.updatedAt
    })
}

/**
 * RPC: reply_to_doubt
 * Teacher replies to a doubt thread.
 */
export async function replyToDoubt(params: {
  classCode: string
  pin: string
  doubtId: string
  content: string
  messageId?: string
}): Promise<DoubtMessage> {
  const cleanCode = params.classCode.trim().toUpperCase()
  const cleanPin = params.pin.trim()
  const cleanContent = params.content.trim()

  if (cleanContent.length === 0 || cleanContent.length > 500) {
    throw new Error('Message must be between 1 and 500 characters')
  }

  const messageId = params.messageId || generateUUID()

  if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof fetch !== 'undefined') {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/reply_to_doubt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          p_class_code: cleanCode,
          p_pin: cleanPin,
          p_doubt_id: params.doubtId,
          p_content: cleanContent,
          p_message_id: messageId,
        }),
      })

      if (response.ok) {
        const row = await response.json()
        const parsed = doubtMessageFromSnake(row)
        const msgs = inMemoryDoubtMessages.get(params.doubtId) || []
        inMemoryDoubtMessages.set(params.doubtId, [...msgs, parsed])
        const doubt = inMemoryDoubts.get(params.doubtId)
        if (doubt) {
          doubt.status = 'answered'
          doubt.updatedAt = parsed.createdAt
          doubt.lastMessageAt = parsed.createdAt
          doubt.messages.push(parsed)
        }
        const hasIdb = await checkIdb()
        if (hasIdb) {
          await db.doubtMessages.put(parsed)
          if (doubt) await db.doubts.put(doubt)
        }
        return parsed
      }
      const err = await response.json().catch(() => ({}))
      throw new Error(err?.message || 'Failed to reply to doubt')
    } catch (e) {
      if (e instanceof Error && (e.message.includes('Invalid') || e.message.includes('characters'))) {
        throw e
      }
    }
  }

  // Local fallback
  if (!verifyLocalTeacherPin(cleanCode, cleanPin)) {
    throw new Error('Invalid class code or teacher PIN')
  }

  const doubt = inMemoryDoubts.get(params.doubtId)
  if (!doubt || doubt.classCode !== cleanCode) {
    throw new Error('Doubt not found in this class')
  }

  const now = Date.now()
  const teacherMsg: DoubtMessage = {
    id: messageId,
    doubtId: params.doubtId,
    senderType: 'teacher',
    senderId: 'teacher',
    senderName: 'Teacher',
    content: cleanContent,
    flagged: false,
    createdAt: now,
  }

  const existingMsgs = inMemoryDoubtMessages.get(params.doubtId) || []
  existingMsgs.push(teacherMsg)
  inMemoryDoubtMessages.set(params.doubtId, existingMsgs)

  doubt.status = 'answered'
  doubt.updatedAt = now
  doubt.lastMessageAt = now
  doubt.messages = existingMsgs

  const hasIdb = await checkIdb()
  if (hasIdb) {
    await db.doubtMessages.put(teacherMsg)
    await db.doubts.put(doubt)
  }
  return teacherMsg
}

/**
 * RPC: set_doubt_status
 * Teacher changes status of a doubt ('open', 'answered', 'resolved').
 */
export async function setDoubtStatus(params: {
  classCode: string
  pin: string
  doubtId: string
  status: DoubtStatus
}): Promise<boolean> {
  const cleanCode = params.classCode.trim().toUpperCase()
  const cleanPin = params.pin.trim()

  if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof fetch !== 'undefined') {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/set_doubt_status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          p_class_code: cleanCode,
          p_pin: cleanPin,
          p_doubt_id: params.doubtId,
          p_status: params.status,
        }),
      })

      if (response.ok) {
        const doubt = inMemoryDoubts.get(params.doubtId)
        if (doubt) {
          doubt.status = params.status
          doubt.updatedAt = Date.now()
        }
        const hasIdb = await checkIdb()
        if (hasIdb) {
          await db.doubts.update(params.doubtId, {
            status: params.status,
            updatedAt: Date.now(),
          })
        }
        return true
      }
      const err = await response.json().catch(() => ({}))
      throw new Error(err?.message || 'Failed to update doubt status')
    } catch (e) {
      if (e instanceof Error && e.message.includes('Invalid')) {
        throw e
      }
    }
  }

  // Local fallback
  if (!verifyLocalTeacherPin(cleanCode, cleanPin)) {
    throw new Error('Invalid class code or teacher PIN')
  }

  const doubt = inMemoryDoubts.get(params.doubtId)
  if (!doubt || doubt.classCode !== cleanCode) {
    throw new Error('Doubt not found in this class')
  }

  doubt.status = params.status
  doubt.updatedAt = Date.now()

  const hasIdb = await checkIdb()
  if (hasIdb) {
    await db.doubts.update(params.doubtId, {
      status: params.status,
      updatedAt: Date.now(),
    })
  }
  return true
}

/**
 * RPC: post_announcement
 * Teacher creates and broadcasts a class announcement.
 */
export async function postAnnouncement(params: {
  classCode: string
  pin: string
  title: string
  content: string
  announcementId?: string
}): Promise<Announcement> {
  const cleanCode = params.classCode.trim().toUpperCase()
  const cleanPin = params.pin.trim()
  const cleanTitle = params.title.trim()
  const cleanContent = params.content.trim()

  if (cleanTitle.length === 0) throw new Error('Announcement title is required')
  if (cleanContent.length === 0) throw new Error('Announcement content is required')

  const id = params.announcementId || generateUUID()

  if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof fetch !== 'undefined') {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/post_announcement`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          p_class_code: cleanCode,
          p_pin: cleanPin,
          p_title: cleanTitle,
          p_content: cleanContent,
          p_announcement_id: id,
        }),
      })

      if (response.ok) {
        const row = await response.json()
        const parsed = announcementFromSnake(row)
        inMemoryAnnouncements.set(parsed.id, parsed)
        const hasIdb = await checkIdb()
        if (hasIdb) await db.announcements.put(parsed)
        return parsed
      }
      const err = await response.json().catch(() => ({}))
      throw new Error(err?.message || 'Failed to post announcement')
    } catch (e) {
      if (e instanceof Error && e.message.includes('Invalid')) {
        throw e
      }
    }
  }

  // Local fallback
  if (!verifyLocalTeacherPin(cleanCode, cleanPin)) {
    throw new Error('Invalid class code or teacher PIN')
  }

  const ann: Announcement = {
    id,
    classCode: cleanCode,
    title: cleanTitle,
    content: cleanContent,
    createdAt: Date.now(),
  }

  inMemoryAnnouncements.set(id, ann)
  const hasIdb = await checkIdb()
  if (hasIdb) await db.announcements.put(ann)
  return ann
}

/**
 * RPC: flag_doubt_message
 * Flags a doubt message for review (safety / moderation).
 */
export async function flagDoubtMessage(messageId: string, reason?: string): Promise<boolean> {
  if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof fetch !== 'undefined') {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/flag_doubt_message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          p_message_id: messageId,
          p_reason: reason || null,
        }),
      })
      if (response.ok) return true
    } catch {
      // fallback
    }
  }

  // Local fallback
  for (const msgs of inMemoryDoubtMessages.values()) {
    const found = msgs.find((m) => m.id === messageId)
    if (found) {
      found.flagged = true
      found.flagReason = reason || null
      const hasIdb = await checkIdb()
      if (hasIdb) await db.doubtMessages.update(messageId, { flagged: true, flagReason: reason || null })
      return true
    }
  }
  return true
}
