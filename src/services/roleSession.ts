import { forceSyncNow } from './syncEngine'

export type AppRole = 'student' | 'teacher'

export interface StudentSession {
  studentId: string
  name: string
  classCode?: string
  grade: number
  avatar: string
  pin?: string
  className?: string
  teacherName?: string
  loggedInAt: number
}

export interface TeacherSession {
  classCode: string
  teacherName: string
  pin: string
}

const ACTIVE_ROLE_KEY = 'pacepath_active_role'
const STUDENT_SESSION_KEY = 'pacepath_student_session'
const TEACHER_SESSION_KEY = 'pacepath_teacher_session'
const LOGIN_ATTEMPTS_KEY = 'pacepath_student_login_attempts'

const inMemoryStore = new Map<string, string>()

function safeGetItem(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      const v = localStorage.getItem(key)
      if (v !== null && v !== undefined) return v
    }
  } catch {
    // Node 22 / private browsing fallback
  }
  return inMemoryStore.get(key) ?? null
}

function safeSetItem(key: string, val: string): void {
  inMemoryStore.set(key, val)
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, val)
    }
  } catch {
    // Node 22 / private browsing fallback
  }
}

function safeRemoveItem(key: string): void {
  inMemoryStore.delete(key)
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key)
    }
  } catch {
    // Node 22 / private browsing fallback
  }
}

export function clearRoleSessionStore(): void {
  inMemoryStore.clear()
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(ACTIVE_ROLE_KEY)
      localStorage.removeItem(STUDENT_SESSION_KEY)
      localStorage.removeItem(TEACHER_SESSION_KEY)
      localStorage.removeItem(LOGIN_ATTEMPTS_KEY)
    }
  } catch {
    // ignore
  }
}

type RoleChangeCallback = (role: AppRole | null) => void
const roleListeners = new Set<RoleChangeCallback>()

/**
 * Normalizes a name key for case-insensitive class roster matching.
 * e.g. "  Aarav   Sharma  " -> "aarav sharma"
 */
export function normalizeNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Gets the current active role from storage.
 */
export function getActiveRole(): AppRole | null {
  const role = safeGetItem(ACTIVE_ROLE_KEY)
  if (role === 'student' || role === 'teacher') return role
  return null
}

/**
 * Sets the active role and notifies subscribers.
 */
export function setActiveRole(role: AppRole | null): void {
  if (role) {
    safeSetItem(ACTIVE_ROLE_KEY, role)
  } else {
    safeRemoveItem(ACTIVE_ROLE_KEY)
  }
  roleListeners.forEach((cb) => cb(role))
}

/**
 * Subscribes to role changes.
 */
export function subscribeActiveRole(callback: RoleChangeCallback): () => void {
  roleListeners.add(callback)
  return () => roleListeners.delete(callback)
}

/**
 * Gets the stored student session, if any.
 */
export function getStudentSession(): StudentSession | null {
  try {
    const raw = safeGetItem(STUDENT_SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/**
 * Sets the student session and sets active role to 'student'.
 * Clears any active teacher session so both cannot be active simultaneously.
 */
export function setStudentSession(session: StudentSession): void {
  safeRemoveItem(TEACHER_SESSION_KEY)
  safeSetItem(STUDENT_SESSION_KEY, JSON.stringify(session))
  safeSetItem('pacepath_current_student', session.studentId)
  setActiveRole('student')
}

/**
 * Clears student session.
 */
export function clearStudentSession(): void {
  safeRemoveItem(STUDENT_SESSION_KEY)
  safeRemoveItem('pacepath_current_student')
}

/**
 * Gets the stored teacher session, if any.
 */
export function getTeacherSession(): TeacherSession | null {
  try {
    const raw = safeGetItem(TEACHER_SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/**
 * Sets the teacher session and sets active role to 'teacher'.
 * Clears any active student session so both cannot be active simultaneously.
 */
export function setTeacherSession(session: TeacherSession): void {
  safeRemoveItem(STUDENT_SESSION_KEY)
  safeRemoveItem('pacepath_current_student')
  safeSetItem(TEACHER_SESSION_KEY, JSON.stringify(session))
  setActiveRole('teacher')
}

/**
 * Clears teacher session.
 */
export function clearTeacherSession(): void {
  safeRemoveItem(TEACHER_SESSION_KEY)
}

/**
 * Switches role or logs out completely, returning to the Role Gate.
 * Flushes unsynced outbox items if online, but NEVER deletes outbox items.
 * Unsynced items remain in Dexie/memory to sync after the next login.
 */
export async function switchRoleOrLogout(): Promise<void> {
  // If online, flush pending outbox first
  try {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true
    if (isOnline) {
      await forceSyncNow()
    }
  } catch {
    // Non-blocking: outbox items stay safely in Dexie
  }

  safeRemoveItem(STUDENT_SESSION_KEY)
  safeRemoveItem(TEACHER_SESSION_KEY)
  safeRemoveItem('pacepath_current_student')
  setActiveRole(null)
}

/**
 * Client-side rate limiting for student logins:
 * Maximum 10 failed attempts per hour per (classCode + name).
 */
interface FailedAttemptRecord {
  attempts: number
  firstAttemptAt: number
  lockedUntil?: number
}

function getLoginAttemptsStore(): Record<string, FailedAttemptRecord> {
  try {
    const raw = safeGetItem(LOGIN_ATTEMPTS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveLoginAttemptsStore(store: Record<string, FailedAttemptRecord>): void {
  safeSetItem(LOGIN_ATTEMPTS_KEY, JSON.stringify(store))
}

export function checkLoginRateLimit(
  classCode: string,
  name: string,
  maxAttempts: number = 10,
  windowMs: number = 3600000,
): { allowed: boolean; remainingAttempts: number; retryAfterSeconds?: number } {
  const key = `${classCode.trim().toUpperCase()}:${normalizeNameKey(name)}`
  const store = getLoginAttemptsStore()
  const record = store[key]

  if (!record) {
    return { allowed: true, remainingAttempts: maxAttempts }
  }

  const now = Date.now()

  // If locked
  if (record.lockedUntil && now < record.lockedUntil) {
    const retryAfter = Math.ceil((record.lockedUntil - now) / 1000)
    return { allowed: false, remainingAttempts: 0, retryAfterSeconds: retryAfter }
  }

  // If window expired, reset
  if (now - record.firstAttemptAt > windowMs) {
    delete store[key]
    saveLoginAttemptsStore(store)
    return { allowed: true, remainingAttempts: maxAttempts }
  }

  const remaining = Math.max(0, maxAttempts - record.attempts)
  if (remaining === 0) {
    record.lockedUntil = record.firstAttemptAt + windowMs
    saveLoginAttemptsStore(store)
    const retryAfter = Math.ceil((record.lockedUntil - now) / 1000)
    return { allowed: false, remainingAttempts: 0, retryAfterSeconds: retryAfter }
  }

  return { allowed: true, remainingAttempts: remaining }
}

export function recordFailedLogin(
  classCode: string,
  name: string,
  maxAttempts: number = 10,
  windowMs: number = 3600000,
): void {
  const key = `${classCode.trim().toUpperCase()}:${normalizeNameKey(name)}`
  const store = getLoginAttemptsStore()
  const now = Date.now()
  const record = store[key] || { attempts: 0, firstAttemptAt: now }

  if (now - record.firstAttemptAt > windowMs) {
    record.attempts = 1
    record.firstAttemptAt = now
    delete record.lockedUntil
  } else {
    record.attempts += 1
  }

  if (record.attempts >= maxAttempts) {
    record.lockedUntil = record.firstAttemptAt + windowMs
  }

  store[key] = record
  saveLoginAttemptsStore(store)
}

export function resetLoginRateLimit(classCode: string, name: string): void {
  const key = `${classCode.trim().toUpperCase()}:${normalizeNameKey(name)}`
  const store = getLoginAttemptsStore()
  if (store[key]) {
    delete store[key]
    saveLoginAttemptsStore(store)
  }
}
