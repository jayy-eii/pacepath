import { useState, useEffect } from 'react'
import { Mascot } from '../Mascot'
import {
  studentJoin,
  studentLogin,
  getMyHistory,
  getClassInfo,
} from '../../services/supabase'
import {
  setStudentSession,
  checkLoginRateLimit,
  recordFailedLogin,
  resetLoginRateLimit,
} from '../../services/roleSession'
import type { Student, Language } from '../../types'

const AVATARS = ['🦁', '🐯', '🐼', '🦊', '🚀', '⚡', '🦉', '🌟']
const GRADES = [6, 7, 8, 9, 10]

interface StudentAuthModalProps {
  lang: Language
  onAuthenticated: (student: Student) => void
  onSoloPractice: () => void
  onClose?: () => void
}

export function StudentAuthModal({
  lang,
  onAuthenticated,
  onSoloPractice,
  onClose: _onClose,
}: StudentAuthModalProps) {
  const [tab, setTab] = useState<'join' | 'login'>('join')

  // Form State
  const [classCode, setClassCode] = useState('')
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [grade, setGrade] = useState(7)
  const [avatar, setAvatar] = useState(AVATARS[0])

  // Class Lookup Feedback
  const [classMeta, setClassMeta] = useState<{
    code: string
    name: string
    teacherName: string
    grade: number
  } | null>(null)
  const [codeChecking, setCodeChecking] = useState(false)

  // Status & Error
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rateLimitInfo, setRateLimitInfo] = useState<{
    allowed: boolean
    remainingAttempts: number
    retryAfterSeconds?: number
  }>({ allowed: true, remainingAttempts: 10 })

  // Debounced class lookup
  useEffect(() => {
    const clean = classCode.trim().toUpperCase()
    if (!clean) {
      setClassMeta(null)
      setCodeChecking(false)
      return
    }

    setCodeChecking(true)
    const timer = setTimeout(async () => {
      try {
        const info = await getClassInfo(clean)
        setClassMeta(info)
      } catch {
        setClassMeta(null)
      } finally {
        setCodeChecking(false)
      }
    }, 400)

    return () => clearTimeout(timer)
  }, [classCode])

  // Check rate limit when switching or changing fields
  useEffect(() => {
    if (tab === 'login' && classCode.trim() && name.trim()) {
      const rl = checkLoginRateLimit(classCode, name)
      setRateLimitInfo(rl)
    } else {
      setRateLimitInfo({ allowed: true, remainingAttempts: 10 })
    }
  }, [tab, classCode, name])

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!classCode.trim() || !name.trim() || !pin.trim()) return

    if (pin.trim().length < 4) {
      setError(lang === 'hi' ? 'पिन कम से कम 4 अंकों का होना चाहिए' : 'PIN must be at least 4 digits')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const student = await studentJoin({
        classCode: classCode.trim().toUpperCase(),
        name: name.trim(),
        grade,
        avatar,
        pin: pin.trim(),
      })

      setStudentSession({
        studentId: student.id,
        name: student.name,
        classCode: student.classCode,
        grade: student.grade,
        avatar: student.avatar,
        pin: pin.trim(),
        className: classMeta?.name,
        teacherName: classMeta?.teacherName,
        loggedInAt: Date.now(),
      })

      onAuthenticated(student)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to join class'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!classCode.trim() || !name.trim() || !pin.trim()) return

    const rl = checkLoginRateLimit(classCode, name)
    if (!rl.allowed) {
      setError(
        lang === 'hi'
          ? `अधिक गलत प्रयासों के कारण खाता लॉक है। कृपया ${rl.retryAfterSeconds} सेकंड बाद प्रयास करें।`
          : `Too many failed attempts. Please wait ${rl.retryAfterSeconds}s before retrying.`,
      )
      return
    }

    setLoading(true)
    setError(null)

    try {
      const student = await studentLogin(classCode.trim().toUpperCase(), name.trim(), pin.trim())

      resetLoginRateLimit(classCode, name)

      // Fetch history and hydrate local Dexie
      try {
        await getMyHistory(classCode.trim().toUpperCase(), student.id, pin.trim())
      } catch {
        // history fetch non-blocking
      }

      setStudentSession({
        studentId: student.id,
        name: student.name,
        classCode: student.classCode,
        grade: student.grade,
        avatar: student.avatar,
        pin: pin.trim(),
        className: classMeta?.name,
        teacherName: classMeta?.teacherName,
        loggedInAt: Date.now(),
      })

      onAuthenticated(student)
    } catch (err: unknown) {
      recordFailedLogin(classCode, name)
      const updatedRl = checkLoginRateLimit(classCode, name)
      setRateLimitInfo(updatedRl)
      const baseMsg = err instanceof Error ? err.message : 'Invalid credentials'
      setError(`${baseMsg} (${updatedRl.remainingAttempts} attempts remaining)`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="solve-onboarding student-auth-view">
      <div className="solve-onboarding-header">
        <Mascot size={70} mood="wave" />
        <h2>{lang === 'hi' ? 'विद्यार्थी पोर्टल' : 'Student Portal'}</h2>
        <p className="solve-sub">
          {lang === 'hi'
            ? 'अपनी कक्षा से जुड़ें या दूसरे डिवाइस से प्रगति जारी रखें।'
            : 'Join your teacher\'s class or log back in to continue where you left off.'}
        </p>
      </div>

      {/* Tabs */}
      <div className="teacher-entry-toggle" role="tablist">
        <button
          type="button"
          className={`entry-toggle-btn ${tab === 'join' ? 'active' : ''}`}
          onClick={() => {
            setTab('join')
            setError(null)
          }}
          role="tab"
          aria-selected={tab === 'join'}
        >
          ✨ {lang === 'hi' ? 'कक्षा से जुड़ें' : 'Join a Class'}
        </button>
        <button
          type="button"
          className={`entry-toggle-btn ${tab === 'login' ? 'active' : ''}`}
          onClick={() => {
            setTab('login')
            setError(null)
          }}
          role="tab"
          aria-selected={tab === 'login'}
        >
          🔐 {lang === 'hi' ? 'दोबारा लॉग इन करें' : 'Log Back In'}
        </button>
      </div>

      {error && (
        <div className="teacher-auth-error-banner" style={{ margin: '1rem 0' }}>
          <span className="error-icon">❌</span>
          <div>
            <strong>{lang === 'hi' ? 'त्रुटि' : 'Error'}</strong>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Join Form */}
      {tab === 'join' && (
        <form onSubmit={handleJoinSubmit} className="solve-form">
          <div className="entry-field">
            <label>{lang === 'hi' ? 'कक्षा कोड (शिक्षक से प्राप्त)' : 'Class Code (from Teacher)'}</label>
            <input
              type="text"
              required
              placeholder="e.g. MATH-7K2P"
              value={classCode}
              onChange={(e) => setClassCode(e.target.value.toUpperCase())}
              className="entry-input uppercase-input"
            />
            {codeChecking && <span className="entry-hint">🔍 Checking code...</span>}
            {classMeta && (
              <span className="entry-hint" style={{ color: '#34d399', fontWeight: 700 }}>
                ✓ {classMeta.name} • Teacher: {classMeta.teacherName}
              </span>
            )}
          </div>

          <div className="entry-field">
            <label>{lang === 'hi' ? 'आपका नाम' : 'Your Name'}</label>
            <input
              type="text"
              required
              placeholder="e.g. Aarav Sharma"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="entry-input"
            />
          </div>

          <div className="entry-field">
            <label>{lang === 'hi' ? 'कक्षा चुनें' : 'Select Grade'}</label>
            <div className="solve-grades">
              {GRADES.map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`solve-grade-btn ${grade === g ? 'solve-grade-btn--active' : ''}`}
                  onClick={() => setGrade(g)}
                >
                  Class {g}
                </button>
              ))}
            </div>
          </div>

          <div className="entry-field">
            <label>{lang === 'hi' ? 'अवतार चुनें' : 'Choose Your Avatar'}</label>
            <div className="solve-avatars">
              {AVATARS.map((av) => (
                <button
                  key={av}
                  type="button"
                  className={`solve-avatar-btn ${avatar === av ? 'solve-avatar-btn--active' : ''}`}
                  onClick={() => setAvatar(av)}
                >
                  {av}
                </button>
              ))}
            </div>
          </div>

          <div className="entry-field">
            <label>{lang === 'hi' ? '4-अंकीय गुप्त पिन चुनें' : 'Create a 4-Digit PIN'}</label>
            <input
              type="password"
              required
              maxLength={6}
              placeholder="e.g. 1234"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="entry-input"
            />
            <span className="entry-hint">
              {lang === 'hi'
                ? 'इस पिन से आप किसी भी अन्य फोन या ब्राउज़र पर अपनी प्रगति जारी रख सकेंगे।'
                : 'Save this PIN. It allows logging back into your account from other phones or browsers.'}
            </span>
          </div>

          <button
            type="submit"
            className="entry-submit-btn"
            disabled={loading || !classCode.trim() || !name.trim() || !pin.trim()}
          >
            {loading ? (lang === 'hi' ? 'जुड़ रहे हैं...' : 'Joining Class...') : '🚀 Join Class & Start'}
          </button>
        </form>
      )}

      {/* Login Form */}
      {tab === 'login' && (
        <form onSubmit={handleLoginSubmit} className="solve-form">
          <div className="entry-field">
            <label>{lang === 'hi' ? 'कक्षा कोड' : 'Class Code'}</label>
            <input
              type="text"
              required
              placeholder="e.g. MATH-7K2P"
              value={classCode}
              onChange={(e) => setClassCode(e.target.value.toUpperCase())}
              className="entry-input uppercase-input"
            />
          </div>

          <div className="entry-field">
            <label>{lang === 'hi' ? 'आपका पंजीकृत नाम' : 'Your Registered Name'}</label>
            <input
              type="text"
              required
              placeholder="e.g. Aarav Sharma"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="entry-input"
            />
          </div>

          <div className="entry-field">
            <label>{lang === 'hi' ? 'आपका 4-अंकीय पिन' : 'Your 4-Digit PIN'}</label>
            <input
              type="password"
              required
              maxLength={6}
              placeholder="4 digits"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="entry-input"
            />
          </div>

          <button
            type="submit"
            className="entry-submit-btn"
            disabled={loading || !rateLimitInfo.allowed || !classCode.trim() || !name.trim() || !pin.trim()}
          >
            {loading
              ? (lang === 'hi' ? 'सत्यापित कर रहे हैं...' : 'Logging in...')
              : '🔐 Log Back In'}
          </button>
        </form>
      )}

      {/* Solo practice link */}
      <div className="solo-practice-footer">
        <button type="button" className="btn-solo-practice" onClick={onSoloPractice}>
          {lang === 'hi'
            ? 'बिना क्लास कोड के अकेले अभ्यास करना चाहते हैं? यहाँ क्लिक करें →'
            : 'Want to practice solo without a class? Click here →'}
        </button>
      </div>
    </div>
  )
}
