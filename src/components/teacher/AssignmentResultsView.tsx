import { useMemo } from 'react'
import rawQuestions from '../../data/questions.json'
import rawConcepts from '../../data/concepts.json'
import type { Assignment, AssignmentSubmission, Language, Question, Concept } from '../../types'

const allConcepts = rawConcepts as Concept[]
const conceptMap = new Map(allConcepts.map((c) => [c.id, c]))
const allBankQuestions = rawQuestions as unknown as Question[]
const bankMap = new Map(allBankQuestions.map((q) => [q.id, q]))

export interface DistractorAnalytics {
  count: number
  optionText: string
  mistakeTag?: string
}

export interface QuestionAnalyticItem {
  id: string
  text: string
  conceptName: string
  isCustom: boolean
  correctAnswerLabel: string
  options: Array<{ text: string; mistakeTag?: string }>
  correctIndex: number
  correctAttempts: number
  totalResponses: number
  accuracyPct: number
  topWrongOption: DistractorAnalytics | null
}

interface AssignmentResultsViewProps {
  assignment: Assignment
  submissions: AssignmentSubmission[]
  totalEnrolled: number
  lang: Language
  onCloseAssignment: (assignmentId: string) => Promise<void>
  onBack: () => void
}

export function AssignmentResultsView({
  assignment,
  submissions,
  totalEnrolled,
  lang,
  onCloseAssignment,
  onBack,
}: AssignmentResultsViewProps) {
  // Aggregate Metrics
  const submittedCount = submissions.length
  const pendingCount = Math.max(0, totalEnrolled - submittedCount)
  const averageScore =
    submittedCount > 0
      ? Math.round(submissions.reduce((acc, s) => acc + s.score, 0) / submittedCount)
      : 0
  const lateCount = submissions.filter((s) => s.isLate).length

  // Score Distribution: High (>=80), Mid (50-79), Low (<50)
  const highTier = submissions.filter((s) => s.score >= 80).length
  const midTier = submissions.filter((s) => s.score >= 50 && s.score < 80).length
  const lowTier = submissions.filter((s) => s.score < 50).length

  // Compile all questions in this test (bank + custom)
  const questionsList = useMemo(() => {
    const list: Array<{
      id: string
      text: string
      conceptName: string
      isCustom: boolean
      correctAnswerLabel: string
      options: Array<{ text: string; mistakeTag?: string }>
      correctIndex: number
    }> = []

    // 1. Bank questions
    for (const qid of assignment.questionIds) {
      const q = bankMap.get(qid)
      if (q) {
        const cName = conceptMap.get(q.conceptId)?.name[lang] || q.conceptId
        const correctOpt = q.options && q.correctIndex !== undefined ? q.options[q.correctIndex] : null
        list.push({
          id: q.id,
          text: q.text[lang] || q.text.en,
          conceptName: cName,
          isCustom: false,
          correctAnswerLabel: correctOpt ? correctOpt[lang] || correctOpt.en : String(q.correctAnswer || ''),
          options: (q.options || []).map((o) => ({
            text: o[lang] || o.en,
            mistakeTag: undefined,
          })),
          correctIndex: q.correctIndex ?? 0,
        })
      }
    }

    // 2. Custom teacher questions
    for (const cq of assignment.customQuestions || []) {
      const cName = conceptMap.get(cq.conceptId)?.name[lang] || cq.conceptId
      const correctOpt = cq.options[cq.correctIndex]
      list.push({
        id: cq.id,
        text: cq.text[lang] || cq.text.en,
        conceptName: cName,
        isCustom: true,
        correctAnswerLabel: correctOpt ? correctOpt[lang] || correctOpt.en : '',
        options: cq.options.map((o) => ({
          text: o[lang] || o.en,
          mistakeTag: o.mistakeTag,
        })),
        correctIndex: cq.correctIndex,
      })
    }

    return list
  }, [assignment, lang])

  // Question-by-Question Analysis
  const questionAnalytics: QuestionAnalyticItem[] = useMemo(() => {
    return questionsList.map((q) => {
      let correctAttempts = 0
      const wrongAnswerTally: Record<string, { count: number; optionText: string; mistakeTag?: string }> = {}

      submissions.forEach((sub) => {
        const studentAns = sub.answers[q.id]
        if (studentAns === undefined) return

        let isCorrect = false
        let chosenIdx: number | null = null

        if (q.isCustom) {
          if (String(studentAns) === String(q.correctIndex)) {
            isCorrect = true
          } else {
            chosenIdx = Number(studentAns)
          }
        } else {
          if (
            studentAns === 'correct' ||
            studentAns === 1 ||
            studentAns === true ||
            studentAns?.correct === true
          ) {
            isCorrect = true
          } else if (typeof studentAns === 'number') {
            chosenIdx = studentAns
            isCorrect = chosenIdx === q.correctIndex
          }
        }

        if (isCorrect) {
          correctAttempts++
        } else if (chosenIdx !== null && q.options[chosenIdx]) {
          const opt = q.options[chosenIdx]
          const optKey = `opt_${chosenIdx}`
          if (!wrongAnswerTally[optKey]) {
            wrongAnswerTally[optKey] = {
              count: 0,
              optionText: opt.text,
              mistakeTag: opt.mistakeTag,
            }
          }
          wrongAnswerTally[optKey].count++
        }
      })

      const totalResponses = submittedCount
      const accuracyPct = totalResponses > 0 ? Math.round((correctAttempts / totalResponses) * 100) : 0

      // Most common wrong option
      let topWrongOption: DistractorAnalytics | null = null
      Object.values(wrongAnswerTally).forEach((w) => {
        if (!topWrongOption || w.count > topWrongOption.count) {
          topWrongOption = w
        }
      })

      return {
        ...q,
        correctAttempts,
        totalResponses,
        accuracyPct,
        topWrongOption,
      }
    })
  }, [questionsList, submissions, submittedCount])

  return (
    <div className="assignment-results-view">
      <div className="results-top-nav">
        <button type="button" className="btn-back-link" onClick={onBack}>
          ← {lang === 'hi' ? 'सभी टेस्ट की सूची' : 'Back to Assignments'}
        </button>
        {!assignment.isClosed ? (
          <button
            type="button"
            className="btn-close-test"
            onClick={() => onCloseAssignment(assignment.id)}
            title="Lock test so no further submissions are accepted"
          >
            🔒 {lang === 'hi' ? 'टेस्ट बंद करें (Lock Test)' : 'Close Test Early'}
          </button>
        ) : (
          <span className="badge-test-closed">🔒 Closed</span>
        )}
      </div>

      <div className="results-header-card">
        <div className="results-title-row">
          <div>
            <h3>{assignment.title}</h3>
            {assignment.description && <p className="results-desc">{assignment.description}</p>}
          </div>
          <div className="results-badges-group">
            <span className="badge-class-code">{assignment.classCode}</span>
            <span className={`status-pill ${assignment.isClosed ? 'pill-closed' : 'pill-active'}`}>
              {assignment.isClosed ? 'Closed' : 'Active'}
            </span>
          </div>
        </div>

        <div className="results-meta-chips">
          <span>📝 {questionsList.length} Questions</span>
          <span>⏱️ {assignment.timeLimitMinutes ? `${assignment.timeLimitMinutes} mins` : 'Untimed'}</span>
          <span>
            📅 {assignment.dueDate ? `Due: ${new Date(assignment.dueDate).toLocaleDateString()}` : 'No Due Date'}
          </span>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="teacher-overview-grid results-stats-grid">
        <div className="teacher-stat-card">
          <span className="stat-label">Submissions</span>
          <span className="stat-value text-accent-cyan">
            {submittedCount} / {totalEnrolled}
          </span>
          <span className="stat-foot">{pendingCount} students pending</span>
        </div>

        <div className="teacher-stat-card">
          <span className="stat-label">Class Average</span>
          <span className="stat-value text-accent-green">{averageScore}%</span>
          <span className="stat-foot">Based on real score recomputation</span>
        </div>

        <div className="teacher-stat-card">
          <span className="stat-label">Late Submissions</span>
          <span className="stat-value text-accent-amber">{lateCount}</span>
          <span className="stat-foot">{submittedCount > 0 ? `${Math.round((lateCount / submittedCount) * 100)}% of submitted` : '0%'}</span>
        </div>
      </div>

      {/* Score Distribution Breakdown */}
      {submittedCount > 0 && (
        <div className="score-distribution-card">
          <h4>📊 Score Distribution</h4>
          <div className="distribution-bars-row">
            <div className="dist-tier tier-high">
              <span className="tier-label">High (≥80%)</span>
              <span className="tier-count">{highTier}</span>
              <span className="tier-pct">{Math.round((highTier / submittedCount) * 100)}%</span>
            </div>
            <div className="dist-tier tier-mid">
              <span className="tier-label">Mid (50-79%)</span>
              <span className="tier-count">{midTier}</span>
              <span className="tier-pct">{Math.round((midTier / submittedCount) * 100)}%</span>
            </div>
            <div className="dist-tier tier-low">
              <span className="tier-label">Needs Help (&lt;50%)</span>
              <span className="tier-count">{lowTier}</span>
              <span className="tier-pct">{Math.round((lowTier / submittedCount) * 100)}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Question Accuracy & Misconception Breakdown */}
      <div className="question-analytics-card">
        <h4>🎯 Question Accuracy & Distractor Misconception Insights</h4>
        <p className="section-subtext">
          Tied to procedural mistake tags to see why students chose specific wrong options:
        </p>

        <div className="question-analytics-list">
          {questionAnalytics.map((q, idx) => (
            <div key={q.id} className="analytics-question-item">
              <div className="q-item-top">
                <span className="q-item-number">Q{idx + 1}</span>
                <span className="q-item-concept">{q.conceptName}</span>
                {q.isCustom && <span className="q-custom-badge">Custom</span>}
                <span className={`q-acc-badge ${q.accuracyPct >= 70 ? 'acc-high' : q.accuracyPct >= 40 ? 'acc-mid' : 'acc-low'}`}>
                  {q.accuracyPct}% Accuracy ({q.correctAttempts}/{q.totalResponses})
                </span>
              </div>

              <p className="q-item-text">{q.text}</p>
              <div className="q-item-correct-ans">
                <strong>Correct:</strong> {q.correctAnswerLabel}
              </div>

              {q.topWrongOption && (
                <div className="top-wrong-alert">
                  <span className="distractor-icon">⚠️</span>
                  <div>
                    <span className="distractor-headline">
                      Most Common Distractor: <strong>&quot;{q.topWrongOption.optionText}&quot;</strong> ({q.topWrongOption.count} students)
                    </span>
                    {q.topWrongOption.mistakeTag && (
                      <span className="distractor-tag-chip">
                        Tag: {q.topWrongOption.mistakeTag}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Submissions Table */}
      <div className="submissions-table-card">
        <h4>👥 Student Submissions ({submissions.length})</h4>
        {submissions.length === 0 ? (
          <div className="teacher-empty-state">
            <span className="empty-symbol">⏳</span>
            <h5>No submissions yet</h5>
            <p>Students can see this test under &quot;From My Teacher&quot; on their home screen.</p>
          </div>
        ) : (
          <div className="teacher-table-wrapper">
            <table className="teacher-students-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Score</th>
                  <th>Accuracy</th>
                  <th>Status</th>
                  <th>Submitted At</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((sub) => (
                  <tr key={sub.id}>
                    <td>
                      <div className="student-name-cell">
                        <span className="student-avatar-bubble">{sub.studentAvatar || '🎓'}</span>
                        <span className="student-name-text">{sub.studentName || 'Student'}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`acc-pill ${sub.score >= 80 ? 'acc-high' : sub.score >= 50 ? 'acc-mid' : 'acc-low'}`}>
                        {sub.score}%
                      </span>
                    </td>
                    <td>
                      {Math.round((sub.score / 100) * sub.totalQuestions)} / {sub.totalQuestions}
                    </td>
                    <td>
                      {sub.isLate ? (
                        <span className="badge-late-submission">⚠️ LATE</span>
                      ) : (
                        <span className="badge-ontime-submission">✓ On Time</span>
                      )}
                    </td>
                    <td>{new Date(sub.submittedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
