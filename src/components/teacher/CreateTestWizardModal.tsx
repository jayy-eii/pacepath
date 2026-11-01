import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import rawQuestions from '../../data/questions.json'
import rawConcepts from '../../data/concepts.json'
import type { Concept, Question, Language, MistakeTag, CustomQuestion, Assignment } from '../../types'

const allConcepts = rawConcepts as Concept[]
const conceptMap = new Map(allConcepts.map((c) => [c.id, c]))
const allBankQuestions = rawQuestions as unknown as Question[]

interface CreateTestWizardModalProps {
  isOpen: boolean
  onClose: () => void
  lang: Language
  classCode: string
  weakestConcepts?: Array<{ conceptId: string; averageMastery: number }>
  onCreateAssignment: (data: {
    title: string
    description?: string
    questionIds: string[]
    customQuestions: CustomQuestion[]
    timeLimitMinutes?: number | null
    dueDate?: number | null
    showAnswersAfter?: 'submit' | 'due' | 'never'
  }) => Promise<Assignment | null>
}

const MISTAKE_TAG_OPTIONS: Array<{ value: MistakeTag; label: string }> = [
  { value: 'sign_error', label: 'Sign Error (+/- mistake)' },
  { value: 'formula_misuse', label: 'Formula Misuse' },
  { value: 'calculation_slip', label: 'Calculation Slip' },
  { value: 'added_denominators', label: 'Added Denominators Directly' },
  { value: 'concept_gap', label: 'Foundational Concept Gap' },
  { value: 'other', label: 'Other Misconception' },
]

export function CreateTestWizardModal({
  isOpen,
  onClose,
  lang,
  classCode,
  weakestConcepts = [],
  onCreateAssignment,
}: CreateTestWizardModalProps) {
  // Wizard Step: 1 = Details, 2 = Questions, 3 = Review
  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Step 1: Details
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [timeLimit, setTimeLimit] = useState<number | ''>(20)
  const [showAnswersAfter, setShowAnswersAfter] = useState<'submit' | 'due' | 'never'>('submit')
  const [dueDateString, setDueDateString] = useState<string>(() => {
    // Default due tomorrow at 5 PM
    const tomorrow = new Date(Date.now() + 86400000)
    tomorrow.setHours(17, 0, 0, 0)
    return tomorrow.toISOString().slice(0, 16)
  })

  // Step 2: Question Selection
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([])
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[]>([])
  const [activeQuestionTab, setActiveQuestionTab] = useState<'bank' | 'custom'>('bank')
  const [conceptFilter, setConceptFilter] = useState<string>('all')
  const [gradeFilter, setGradeFilter] = useState<number | 'all'>('all')

  // Custom Question Editor State
  const [customTextEn, setCustomTextEn] = useState('')
  const [customTextHi, setCustomTextHi] = useState('')
  const [customConceptId, setCustomConceptId] = useState(allConcepts[0]?.id || 'basic-equations')
  const [customGrade, setCustomGrade] = useState(8)
  const [customOptions, setCustomOptions] = useState<Array<{ en: string; hi: string; mistakeTag: MistakeTag }>>([
    { en: '', hi: '', mistakeTag: 'other' },
    { en: '', hi: '', mistakeTag: 'sign_error' },
    { en: '', hi: '', mistakeTag: 'calculation_slip' },
    { en: '', hi: '', mistakeTag: 'concept_gap' },
  ])
  const [customCorrectIndex, setCustomCorrectIndex] = useState(0)
  const [customExplEn, setCustomExplEn] = useState('')
  const [customExplHi, setCustomExplHi] = useState('')
  const [customEditorError, setCustomEditorError] = useState<string | null>(null)

  // Submission State
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filtered bank questions
  const filteredBankQuestions = useMemo(() => {
    return allBankQuestions.filter((q) => {
      if (conceptFilter !== 'all' && q.conceptId !== conceptFilter) return false
      if (gradeFilter !== 'all' && q.grade !== gradeFilter) return false
      return true
    })
  }, [conceptFilter, gradeFilter])

  // "Suggest from weak concepts" action
  const handleSuggestFromWeakConcepts = () => {
    if (weakestConcepts.length === 0) {
      // Pick 5 balanced questions from first 3 concepts
      const picked = allBankQuestions.slice(0, 5).map((q) => q.id)
      setSelectedQuestionIds(Array.from(new Set([...selectedQuestionIds, ...picked])))
      return
    }

    const weakIds = new Set(weakestConcepts.slice(0, 3).map((w) => w.conceptId))
    const suggested = allBankQuestions.filter((q) => weakIds.has(q.conceptId))

    // Select 2 questions per weak concept
    const newSelected = new Set(selectedQuestionIds)
    weakIds.forEach((cId) => {
      const matching = suggested.filter((q) => q.conceptId === cId)
      matching.slice(0, 2).forEach((q) => newSelected.add(q.id))
    })

    setSelectedQuestionIds(Array.from(newSelected))
  }

  // Toggle bank question
  const toggleBankQuestion = (id: string) => {
    setSelectedQuestionIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    )
  }

  // Add custom question
  const handleAddCustomQuestion = (e: React.FormEvent) => {
    e.preventDefault()
    setCustomEditorError(null)

    if (!customTextEn.trim()) {
      setCustomEditorError('Question text in English is required')
      return
    }

    for (let i = 0; i < 4; i++) {
      if (!customOptions[i].en.trim()) {
        setCustomEditorError(`Option ${i + 1} text is required`)
        return
      }
    }

    const newCQ: CustomQuestion = {
      id: `cq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      conceptId: customConceptId,
      grade: customGrade,
      text: {
        en: customTextEn.trim(),
        hi: customTextHi.trim() || customTextEn.trim(),
      },
      options: customOptions.map((opt) => ({
        en: opt.en.trim(),
        hi: opt.hi.trim() || opt.en.trim(),
        mistakeTag: opt.mistakeTag,
      })),
      correctIndex: customCorrectIndex,
      explanation: customExplEn.trim()
        ? { en: customExplEn.trim(), hi: customExplHi.trim() || customExplEn.trim() }
        : undefined,
    }

    setCustomQuestions((prev) => [...prev, newCQ])

    // Reset form
    setCustomTextEn('')
    setCustomTextHi('')
    setCustomOptions([
      { en: '', hi: '', mistakeTag: 'other' },
      { en: '', hi: '', mistakeTag: 'sign_error' },
      { en: '', hi: '', mistakeTag: 'calculation_slip' },
      { en: '', hi: '', mistakeTag: 'concept_gap' },
    ])
    setCustomCorrectIndex(0)
    setCustomExplEn('')
    setCustomExplHi('')
  }

  const handleRemoveCustomQuestion = (id: string) => {
    setCustomQuestions((prev) => prev.filter((q) => q.id !== id))
  }

  // Final Publish
  const handlePublish = async () => {
    if (!title.trim()) {
      setError('Title is required')
      setStep(1)
      return
    }

    const totalQuestionsCount = selectedQuestionIds.length + customQuestions.length
    if (totalQuestionsCount === 0) {
      setError('Please add at least 1 question to the test')
      setStep(2)
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const parsedDueDate = dueDateString ? new Date(dueDateString).getTime() : null
      await onCreateAssignment({
        title: title.trim(),
        description: description.trim() || undefined,
        questionIds: selectedQuestionIds,
        customQuestions,
        timeLimitMinutes: timeLimit ? Number(timeLimit) : null,
        dueDate: parsedDueDate,
        showAnswersAfter,
      })
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to publish test')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  const totalSelected = selectedQuestionIds.length + customQuestions.length

  return (
    <div className="solve-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <motion.div
        className="solve-modal-container test-wizard-modal"
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="solve-modal-header">
          <div className="solve-modal-title-group">
            <span className="teacher-header-badge">📝 TEST & ASSIGNMENT CREATOR</span>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
              {step === 1 && (lang === 'hi' ? 'चरण 1: टेस्ट विवरण' : 'Step 1: Test Details')}
              {step === 2 && (lang === 'hi' ? 'चरण 2: प्रश्न चुनें' : 'Step 2: Assemble Questions')}
              {step === 3 && (lang === 'hi' ? 'चरण 3: समीक्षा एवं प्रकाशन' : 'Step 3: Review & Publish')}
              <span className="class-code-highlight" style={{ marginLeft: '0.6rem' }}>{classCode}</span>
            </h3>
          </div>
          <button type="button" className="solve-modal-close" onClick={onClose}>
            ✕
          </button>
        </header>

        {/* Wizard Stepper Tabs */}
        <div className="wizard-stepper-bar">
          <button
            type="button"
            className={`wizard-step-btn ${step === 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`}
            onClick={() => setStep(1)}
          >
            1. Details
          </button>
          <button
            type="button"
            className={`wizard-step-btn ${step === 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`}
            onClick={() => {
              if (title.trim()) setStep(2)
            }}
          >
            2. Questions ({totalSelected})
          </button>
          <button
            type="button"
            className={`wizard-step-btn ${step === 3 ? 'active' : ''}`}
            onClick={() => {
              if (title.trim() && totalSelected > 0) setStep(3)
            }}
          >
            3. Review & Assign
          </button>
        </div>

        {error && (
          <div className="teacher-auth-error-banner" style={{ margin: '1rem' }}>
            <span className="error-icon">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <div className="wizard-content-body">
          {/* STEP 1: TEST DETAILS */}
          {step === 1 && (
            <div className="wizard-step-pane">
              <div className="entry-field">
                <label>{lang === 'hi' ? 'टेस्ट का शीर्षक *' : 'Test Title *'}</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Chapter 4 Diagnostic: Linear Equations"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="entry-input"
                />
              </div>

              <div className="entry-field">
                <label>{lang === 'hi' ? 'निर्देश या विवरण' : 'Instructions or Description'}</label>
                <textarea
                  rows={3}
                  placeholder="e.g. Complete before Wednesday class. No calculators allowed."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="entry-input"
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div className="wizard-row-2col">
                <div className="entry-field">
                  <label>{lang === 'hi' ? 'समय सीमा (मिनट)' : 'Time Limit (minutes)'}</label>
                  <input
                    type="number"
                    min={5}
                    max={180}
                    placeholder="Leave empty for untimed"
                    value={timeLimit}
                    onChange={(e) => setTimeLimit(e.target.value ? Number(e.target.value) : '')}
                    className="entry-input"
                  />
                  <span className="entry-hint">
                    {lang === 'hi' ? 'विद्यार्थी को स्क्रीन पर टाइमर दिखेगा।' : 'Timer will count down during test mode.'}
                  </span>
                </div>

                <div className="entry-field">
                  <label>{lang === 'hi' ? 'अंतिम तिथि (Due Date)' : 'Due Date & Time'}</label>
                  <input
                    type="datetime-local"
                    value={dueDateString}
                    onChange={(e) => setDueDateString(e.target.value)}
                    className="entry-input"
                  />
                  <span className="entry-hint">
                    {lang === 'hi' ? 'इसके बाद जमा किए गए टेस्ट पर LATE दर्ज होगा।' : 'Submissions after this time are marked as Late.'}
                  </span>
                </div>
              </div>

              <div className="entry-field">
                <label>{lang === 'hi' ? 'उत्तर एवं विस्तृत समाधान कब दिखाएं' : 'Show Answers & Solutions To Students'}</label>
                <select
                  value={showAnswersAfter}
                  onChange={(e) => setShowAnswersAfter(e.target.value as 'submit' | 'due' | 'never')}
                  className="entry-input"
                >
                  <option value="submit">
                    {lang === 'hi' ? 'जमा करते ही तुरंत दिखाएं (Immediately on submit)' : 'Immediately on submit'}
                  </option>
                  <option value="due">
                    {lang === 'hi' ? 'अंतिम तिथि समाप्त होने के बाद (After due date passes)' : 'After due date passes'}
                  </option>
                  <option value="never">
                    {lang === 'hi' ? 'कभी नहीं - केवल शिक्षक समीक्षा (Never / Teacher review only)' : 'Never / Teacher review only'}
                  </option>
                </select>
                <span className="entry-hint">
                  {lang === 'hi'
                    ? 'नियंत्रित करें कि विद्यार्थी टेस्ट सबमिट करने के बाद सही उत्तर कब देख सकते हैं।'
                    : 'Controls whether solutions unlock immediately, after due date, or stay hidden.'}
                </span>
              </div>

              <div className="wizard-actions-bar">
                <span />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!title.trim()}
                  onClick={() => setStep(2)}
                >
                  Next: Add Questions →
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: QUESTION PICKER & CUSTOM MCQ CREATOR */}
          {step === 2 && (
            <div className="wizard-step-pane">
              <div className="question-source-toggle">
                <button
                  type="button"
                  className={`source-toggle-btn ${activeQuestionTab === 'bank' ? 'active' : ''}`}
                  onClick={() => setActiveQuestionTab('bank')}
                >
                  📚 Standard Bank Questions ({selectedQuestionIds.length} selected)
                </button>
                <button
                  type="button"
                  className={`source-toggle-btn ${activeQuestionTab === 'custom' ? 'active' : ''}`}
                  onClick={() => setActiveQuestionTab('custom')}
                >
                  ✍️ Custom Teacher MCQ Editor ({customQuestions.length} added)
                </button>
              </div>

              {/* TAB A: BANK QUESTIONS */}
              {activeQuestionTab === 'bank' && (
                <div className="bank-picker-container">
                  <div className="bank-filters-bar">
                    <div className="filter-group">
                      <select
                        value={conceptFilter}
                        onChange={(e) => setConceptFilter(e.target.value)}
                        className="picker-select"
                      >
                        <option value="all">All Concepts ({allConcepts.length})</option>
                        {allConcepts.map((c) => (
                          <option key={c.id} value={c.id}>
                            Gr {c.grade}: {c.name.en}
                          </option>
                        ))}
                      </select>

                      <select
                        value={gradeFilter}
                        onChange={(e) =>
                          setGradeFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
                        }
                        className="picker-select"
                      >
                        <option value="all">All Grades</option>
                        {[6, 7, 8, 9, 10].map((g) => (
                          <option key={g} value={g}>Class {g}</option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      className="suggest-weak-btn"
                      onClick={handleSuggestFromWeakConcepts}
                      title="Automatically select high-yield questions for cohort's lowest mastery concepts"
                    >
                      💡 Suggest from Weak Concepts
                    </button>
                  </div>

                  <div className="bank-questions-scroll">
                    {filteredBankQuestions.map((q) => {
                      const isSelected = selectedQuestionIds.includes(q.id)
                      const cName = conceptMap.get(q.conceptId)?.name[lang] || q.conceptId

                      return (
                        <div
                          key={q.id}
                          className={`bank-question-card ${isSelected ? 'selected' : ''}`}
                          onClick={() => toggleBankQuestion(q.id)}
                        >
                          <div className="bank-q-header">
                            <span className="bank-concept-tag">{cName}</span>
                            <span className="bank-diff-tag">Diff {q.difficulty}</span>
                            <span className="bank-select-checkbox">
                              {isSelected ? '✓ Selected' : '+ Select'}
                            </span>
                          </div>
                          <p className="bank-q-text">{q.text[lang] || q.text.en}</p>
                          {q.options && (
                            <div className="bank-q-options">
                              {q.options.map((opt, i) => (
                                <span
                                  key={i}
                                  className={`mini-opt ${i === q.correctIndex ? 'opt-correct' : ''}`}
                                >
                                  {opt[lang] || opt.en}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* TAB B: CUSTOM MCQ EDITOR */}
              {activeQuestionTab === 'custom' && (
                <div className="custom-editor-container">
                  <form onSubmit={handleAddCustomQuestion} className="custom-mcq-form">
                    <h4>✍️ Author a Custom Multiple Choice Question</h4>

                    {customEditorError && (
                      <div className="teacher-auth-error-banner" style={{ margin: '0.5rem 0' }}>
                        <span>⚠️ {customEditorError}</span>
                      </div>
                    )}

                    <div className="wizard-row-2col">
                      <div className="entry-field">
                        <label>Target Concept</label>
                        <select
                          value={customConceptId}
                          onChange={(e) => setCustomConceptId(e.target.value)}
                          className="entry-input"
                        >
                          {allConcepts.map((c) => (
                            <option key={c.id} value={c.id}>
                              Gr {c.grade}: {c.name.en}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="entry-field">
                        <label>Class Grade</label>
                        <select
                          value={customGrade}
                          onChange={(e) => setCustomGrade(Number(e.target.value))}
                          className="entry-input"
                        >
                          {[6, 7, 8, 9, 10].map((g) => (
                            <option key={g} value={g}>Class {g}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="entry-field">
                      <label>Question Text (English) *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Find the value of x: 4x - 7 = 21"
                        value={customTextEn}
                        onChange={(e) => setCustomTextEn(e.target.value)}
                        className="entry-input"
                      />
                    </div>

                    <div className="entry-field">
                      <label>Question Text (Hindi, optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. x का मान ज्ञात करें: 4x - 7 = 21"
                        value={customTextHi}
                        onChange={(e) => setCustomTextHi(e.target.value)}
                        className="entry-input"
                      />
                    </div>

                    <div className="custom-options-group">
                      <label>Answer Options & Suspect Misconception Tags (Choose 1 Correct)</label>
                      {customOptions.map((opt, idx) => (
                        <div key={idx} className="custom-option-row">
                          <label className="opt-radio-label">
                            <input
                              type="radio"
                              name="correctOption"
                              checked={customCorrectIndex === idx}
                              onChange={() => setCustomCorrectIndex(idx)}
                            />
                            <span className="opt-letter">
                              {idx === customCorrectIndex ? '✓ Correct' : `Option ${String.fromCharCode(65 + idx)}`}
                            </span>
                          </label>

                          <input
                            type="text"
                            required
                            placeholder={`Option ${String.fromCharCode(65 + idx)} (e.g. x = 7)`}
                            value={opt.en}
                            onChange={(e) => {
                              const updated = [...customOptions]
                              updated[idx].en = e.target.value
                              setCustomOptions(updated)
                            }}
                            className="entry-input"
                            style={{ flex: 2 }}
                          />

                          {idx !== customCorrectIndex && (
                            <select
                              value={opt.mistakeTag}
                              onChange={(e) => {
                                const updated = [...customOptions]
                                updated[idx].mistakeTag = e.target.value as MistakeTag
                                setCustomOptions(updated)
                              }}
                              className="picker-select opt-mistake-select"
                              title="Tied mistake tag if student picks this distractor"
                            >
                              {MISTAKE_TAG_OPTIONS.map((tag) => (
                                <option key={tag.value} value={tag.value}>
                                  {tag.label}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="entry-field">
                      <label>Solution / Teacher Math Note</label>
                      <input
                        type="text"
                        placeholder="e.g. Add 7 to both sides: 4x = 28, then divide by 4: x = 7"
                        value={customExplEn}
                        onChange={(e) => setCustomExplEn(e.target.value)}
                        className="entry-input"
                      />
                    </div>

                    <button type="submit" className="btn btn-secondary">
                      + Add Custom Question to Test
                    </button>
                  </form>

                  {/* List of already added custom questions */}
                  {customQuestions.length > 0 && (
                    <div className="custom-questions-list">
                      <h5>Added Custom Questions ({customQuestions.length})</h5>
                      {customQuestions.map((cq, idx) => (
                        <div key={cq.id} className="custom-added-card">
                          <div className="cq-header">
                            <span>Q{idx + 1}. {cq.text.en}</span>
                            <button
                              type="button"
                              className="btn-remove-q"
                              onClick={() => handleRemoveCustomQuestion(cq.id)}
                            >
                              Remove
                            </button>
                          </div>
                          <div className="cq-options-preview">
                            {cq.options.map((opt, i) => (
                              <span
                                key={i}
                                className={`cq-opt-chip ${i === cq.correctIndex ? 'correct-chip' : ''}`}
                              >
                                {opt.en} {i === cq.correctIndex && '✓'}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="wizard-actions-bar">
                <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>
                  ← Back to Details
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span className="selected-total-chip">
                    {totalSelected} Question{totalSelected === 1 ? '' : 's'} Selected
                  </span>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={totalSelected === 0}
                    onClick={() => setStep(3)}
                  >
                    Next: Review & Publish →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: REVIEW & PUBLISH */}
          {step === 3 && (
            <div className="wizard-step-pane">
              <div className="wizard-review-card">
                <div className="review-header">
                  <h4>{title}</h4>
                  <span className="review-class-badge">Class {classCode}</span>
                </div>

                {description && <p className="review-desc">{description}</p>}

                <div className="review-meta-grid">
                  <div className="review-meta-item">
                    <span className="meta-label">Total Questions</span>
                    <span className="meta-val">{totalSelected}</span>
                  </div>
                  <div className="review-meta-item">
                    <span className="meta-label">Time Limit</span>
                    <span className="meta-val">{timeLimit ? `${timeLimit} mins` : 'Untimed'}</span>
                  </div>
                  <div className="review-meta-item">
                    <span className="meta-label">Due Date</span>
                    <span className="meta-val">
                      {dueDateString ? new Date(dueDateString).toLocaleString() : 'No Due Date'}
                    </span>
                  </div>
                  <div className="review-meta-item">
                    <span className="meta-label">Breakdown</span>
                    <span className="meta-val">
                      {selectedQuestionIds.length} Bank + {customQuestions.length} Custom
                    </span>
                  </div>
                </div>

                <div className="review-questions-summary">
                  <h5>Questions Included in Test ({totalSelected}):</h5>
                  <ol className="review-q-list">
                    {selectedQuestionIds.map((qid) => {
                      const q = allBankQuestions.find((item) => item.id === qid)
                      const cName = q ? conceptMap.get(q.conceptId)?.name.en : ''
                      return (
                        <li key={qid}>
                          <span className="q-concept-tag">{cName || 'Bank'}</span>{' '}
                          {q?.text.en || qid}
                        </li>
                      )
                    })}
                    {customQuestions.map((cq) => (
                      <li key={cq.id}>
                        <span className="q-custom-tag">Custom Teacher MCQ</span> {cq.text.en}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>

              <div className="wizard-actions-bar">
                <button type="button" className="btn btn-secondary" onClick={() => setStep(2)}>
                  ← Back to Questions
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-publish"
                  disabled={submitting}
                  onClick={handlePublish}
                >
                  {submitting ? 'Publishing Test...' : '🚀 Publish Test to Class'}
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
