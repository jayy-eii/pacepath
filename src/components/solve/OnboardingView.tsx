import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Mascot } from '../Mascot'
import { createStudent } from '../../services/api'
import { classExists } from '../../services/supabase'
import type { Student, Language } from '../../types'
import { fadeUp, spring } from '../../motion/presets'

const AVATARS = ['🦁', '🐯', '🐼', '🦊', '🚀', '⚡', '🦉', '🌟']
const GRADES = [6, 7, 8, 9, 10]

interface OnboardingViewProps {
  lang: Language
  onStudentCreated: (student: Student) => void
  onClose: () => void
}

export function OnboardingView({ lang, onStudentCreated, onClose }: OnboardingViewProps) {
  const [name, setName] = useState('')
  const [grade, setGrade] = useState(7)
  const [avatar, setAvatar] = useState(AVATARS[0])
  const [classCode, setClassCode] = useState('')
  const [codeStatus, setCodeStatus] = useState<'idle' | 'checking' | 'verified' | 'offline_accepted' | 'not_found'>('idle')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Debounced class code validation via class_exists
  useEffect(() => {
    const clean = classCode.trim().toUpperCase()
    if (!clean) {
      setCodeStatus('idle')
      return
    }

    setCodeStatus('checking')
    const timer = setTimeout(async () => {
      try {
        const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true
        if (!isOnline) {
          setCodeStatus('offline_accepted')
          return
        }

        const exists = await classExists(clean)
        if (exists) {
          setCodeStatus('verified')
        } else {
          setCodeStatus('not_found')
        }
      } catch {
        setCodeStatus('offline_accepted')
      }
    }, 400)

    return () => clearTimeout(timer)
  }, [classCode])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError(lang === 'hi' ? 'कृपया अपना नाम दर्ज करें' : 'Please enter your name')
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)
      const student = await createStudent({
        name: name.trim(),
        grade,
        avatar,
        classCode: classCode.trim() || undefined,
      })
      onStudentCreated(student)
    } catch (err) {
      console.error('Error creating student:', err)
      setError(lang === 'hi' ? 'प्रोफ़ाइल बनाने में समस्या आई' : 'Could not save profile. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <motion.div
      className="solve-onboarding"
      variants={fadeUp}
      initial="hidden"
      animate="show"
      exit={{ opacity: 0, scale: 0.95 }}
    >
      <div className="solve-onboarding-header">
        <Mascot size={90} mood="wave" />
        <h2>{lang === 'hi' ? 'पेसपाथ में आपका स्वागत है!' : 'Welcome to PacePath!'}</h2>
        <p className="solve-sub">
          {lang === 'hi'
            ? 'अपनी प्रोफ़ाइल बनाएं और अपनी गति से गणित सीखना शुरू करें।'
            : 'Set up your student profile to start practicing at your own pace.'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="solve-form">
        <div className="solve-form-group">
          <label htmlFor="student-name">
            {lang === 'hi' ? 'आपका नाम क्या है?' : 'What is your name?'}
          </label>
          <input
            id="student-name"
            type="text"
            className="solve-input"
            placeholder={lang === 'hi' ? 'उदा. आरव या अनया' : 'e.g. Aarav or Ananya'}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (error) setError(null)
            }}
            maxLength={32}
            autoFocus
          />
        </div>

        <div className="solve-form-group">
          <label>{lang === 'hi' ? 'अपनी कक्षा चुनें:' : 'Select your Class / Grade:'}</label>
          <div className="solve-grade-pills" role="radiogroup" aria-label="Select Grade">
            {GRADES.map((g) => (
              <button
                key={g}
                type="button"
                className={`solve-grade-pill ${grade === g ? 'active' : ''}`}
                onClick={() => setGrade(g)}
                aria-pressed={grade === g}
              >
                {lang === 'hi' ? `कक्षा ${g}` : `Class ${g}`}
              </button>
            ))}
          </div>
        </div>

        <div className="solve-form-group">
          <label>{lang === 'hi' ? 'अपना अवतार चुनें:' : 'Choose your avatar:'}</label>
          <div className="solve-avatar-grid" role="radiogroup" aria-label="Select Avatar">
            {AVATARS.map((av) => (
              <button
                key={av}
                type="button"
                className={`solve-avatar-btn ${avatar === av ? 'active' : ''}`}
                onClick={() => setAvatar(av)}
                aria-pressed={avatar === av}
              >
                <span>{av}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="solve-form-group">
          <label htmlFor="class-code">
            {lang === 'hi' ? 'कक्षा कोड (वैकल्पिक):' : 'Class code (optional):'}
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="class-code"
              type="text"
              className="solve-input solve-input-sm"
              placeholder={lang === 'hi' ? 'उदा. MATH-7K2P' : 'e.g. MATH-7K2P'}
              value={classCode}
              onChange={(e) => setClassCode(e.target.value.toUpperCase())}
              maxLength={16}
            />
            {codeStatus === 'checking' && (
              <span style={{ fontSize: '0.75rem', color: '#38bdf8', marginTop: '0.25rem', display: 'block' }}>
                🔍 {lang === 'hi' ? 'जाँच हो रही है...' : 'Verifying code...'}
              </span>
            )}
            {codeStatus === 'verified' && (
              <span style={{ fontSize: '0.75rem', color: '#34d399', marginTop: '0.25rem', display: 'block' }}>
                ✓ {lang === 'hi' ? 'कक्षा कोड मान्य है!' : 'Class code verified!'}
              </span>
            )}
            {codeStatus === 'offline_accepted' && (
              <span style={{ fontSize: '0.75rem', color: '#fbbf24', marginTop: '0.25rem', display: 'block' }}>
                ℹ️ {lang === 'hi' ? 'ऑफ़लाइन: कोड सहेज लिया गया है, ऑनलाइन आने पर सिंक होगा।' : 'Offline: Code accepted locally, will link on sync.'}
              </span>
            )}
            {codeStatus === 'not_found' && (
              <span style={{ fontSize: '0.75rem', color: '#f87171', marginTop: '0.25rem', display: 'block' }}>
                ⚠️ {lang === 'hi' ? 'कोड अभी नहीं मिला, लेकिन आप जारी रख सकते हैं।' : 'Code not found on server yet, but you can continue.'}
              </span>
            )}
          </div>
        </div>

        {error && <div className="solve-error-banner">{error}</div>}

        <div className="solve-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
          >
            {lang === 'hi' ? 'रद्द करें' : 'Cancel'}
          </button>
          <motion.button
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={isSubmitting}
            whileTap={{ scale: 0.95 }}
            transition={spring.pop}
          >
            {isSubmitting
              ? lang === 'hi'
                ? 'तैयार हो रहा है...'
                : 'Setting up...'
              : lang === 'hi'
                ? 'अभ्यास शुरू करें 🚀'
                : 'Start Practice 🚀'}
          </motion.button>
        </div>
      </form>
    </motion.div>
  )
}
