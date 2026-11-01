import { useState } from 'react'
import { motion } from 'framer-motion'
import { createDoubt } from '../../services/supabase'
import type { Language, Doubt } from '../../types'

interface AskTeacherModalProps {
  isOpen: boolean
  onClose: () => void
  lang: Language
  classCode: string
  studentId: string
  studentName?: string
  context?: {
    questionId?: string | null
    questionTitle?: string | null
    studentAnswer?: string | null
    misconceptionTag?: string | null
  } | null
  onSuccess?: (doubt: Doubt) => void
}

export function AskTeacherModal({
  isOpen,
  onClose,
  lang,
  classCode,
  studentId,
  context,
  onSuccess,
}: AskTeacherModalProps) {
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  if (!isOpen) return null

  const charCount = content.trim().length
  const maxChars = 500
  const isOverLimit = charCount > maxChars
  const isValid = charCount > 0 && !isOverLimit

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || submitting) return

    setSubmitting(true)
    setError(null)
    setSuccessMsg(null)

    try {
      const doubt = await createDoubt({
        classCode,
        studentId,
        content: content.trim(),
        questionId: context?.questionId || null,
        questionTitle: context?.questionTitle || null,
        studentAnswer: context?.studentAnswer || null,
        misconceptionTag: context?.misconceptionTag || null,
      })

      setSuccessMsg(
        lang === 'hi'
          ? 'आपका संदेश शिक्षक को भेज दिया गया है! शिक्षक के उत्तर का नोटिफिकेशन आपको मिलेगा।'
          : 'Your doubt has been sent to your teacher! You will receive an alert once they reply.',
      )
      setContent('')
      if (onSuccess) onSuccess(doubt)

      setTimeout(() => {
        setSuccessMsg(null)
        onClose()
      }, 1500)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send doubt to teacher')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="solve-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <motion.div
        className="solve-modal-container ask-teacher-modal"
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '560px' }}
      >
        <header className="solve-modal-header">
          <div className="solve-modal-title-group">
            <span className="teacher-header-badge">💬 {lang === 'hi' ? 'संदेह समाधान' : 'ASK TEACHER'}</span>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
              {lang === 'hi' ? 'शिक्षक से सवाल पूछें' : 'Ask Your Teacher'}
              <span className="class-code-highlight" style={{ marginLeft: '0.6rem' }}>{classCode}</span>
            </h3>
          </div>
          <button type="button" className="solve-modal-close" onClick={onClose}>
            ✕
          </button>
        </header>

        <form onSubmit={handleSubmit} className="ask-teacher-form" style={{ padding: '1.5rem' }}>
          {/* Question snapshot preview if attached */}
          {context?.questionTitle && (
            <div className="doubt-context-card" style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '8px',
              padding: '0.8rem 1rem',
              marginBottom: '1rem',
              fontSize: '0.9rem'
            }}>
              <div style={{ color: 'var(--c2, #ffc862)', fontWeight: 700, marginBottom: '0.3rem', fontSize: '0.8rem' }}>
                📎 {lang === 'hi' ? 'संलग्न प्रश्न संदर्भ:' : 'Attached Question Context:'}
              </div>
              <div style={{ fontWeight: 600, color: 'var(--text-1)' }}>{context.questionTitle}</div>
              {context.studentAnswer && (
                <div style={{ marginTop: '0.3rem', fontSize: '0.85rem', color: 'var(--text-2)' }}>
                  <span>{lang === 'hi' ? 'आपका उत्तर: ' : 'Your answer: '}</span>
                  <strong style={{ color: 'var(--text-1)' }}>{context.studentAnswer}</strong>
                </div>
              )}
              {context.misconceptionTag && (
                <div style={{ marginTop: '0.3rem' }}>
                  <span className="tag-misconception" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}>
                    💡 {context.misconceptionTag}
                  </span>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="teacher-login-error" style={{ marginBottom: '1rem' }}>
              ⚠️ {error}
            </div>
          )}

          {successMsg && (
            <div className="teacher-login-success" style={{
              marginBottom: '1rem',
              background: 'rgba(76, 201, 176, 0.15)',
              border: '1px solid #4cc9b0',
              color: '#4cc9b0',
              padding: '0.75rem',
              borderRadius: '6px'
            }}>
              ✓ {successMsg}
            </div>
          )}

          <div className="entry-field">
            <label htmlFor="doubt-textarea" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{lang === 'hi' ? 'आपका प्रश्न या शंका' : 'Explain what you are stuck on'}</span>
              <span style={{ fontSize: '0.8rem', color: isOverLimit ? 'var(--c4, #ff5470)' : 'var(--text-muted)' }}>
                {charCount} / {maxChars}
              </span>
            </label>
            <textarea
              id="doubt-textarea"
              rows={4}
              maxLength={maxChars + 20}
              placeholder={lang === 'hi' ? 'मुझे यह समझ नहीं आया कि दूसरे स्टेप में चिन्ह क्यों बदला...' : 'e.g. I got confused on why the sign flipped in step 2...'}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="entry-input"
              style={{ resize: 'vertical' }}
              disabled={submitting}
              autoFocus
            />
            <span className="entry-hint">
              {lang === 'hi'
                ? 'अधिकतम 500 अक्षर। आपका संदेश सीधे आपके शिक्षक के बोर्ड पर दिखेगा।'
                : 'Up to 500 characters. Your teacher can read and reply to this in their class dashboard.'}
            </span>
          </div>

          <div className="wizard-actions-bar" style={{ marginTop: '1.2rem', display: 'flex', justifyContent: 'flex-end', gap: '0.8rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              {lang === 'hi' ? 'रद्द करें' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!isValid || submitting}
            >
              {submitting
                ? lang === 'hi' ? 'भेजा जा रहा है...' : 'Sending...'
                : lang === 'hi' ? 'शिक्षक को भेजें 🚀' : 'Send Doubt 🚀'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}
