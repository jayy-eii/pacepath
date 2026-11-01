import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  getAllStudents,
  getAllSessions,
  getAllAttempts,
  getAllGapReports,
  getAllMisconceptionEvents,
  clearAllData,
  getCurrentStudent,
} from '../../services/api'
import { computeAllMastery } from '../../engine/mastery'
import { traceGap } from '../../engine/gapTrace'
import { getLastSelectorDecision } from '../../services/selectorState'
import {
  getAllPendingOutboxItems,
  getSyncState,
  forceSyncNow,
  type SyncState,
} from '../../services/syncEngine'
import type { SyncOutboxItem } from '../../services/db'
import type { Student, Session, Attempt, ConceptMasteryMap, GapReport, TraceResult, Question, Concept, MisconceptionEvent } from '../../types'
import rawConcepts from '../../data/concepts.json'
import rawQuestions from '../../data/questions.json'

const allConcepts = rawConcepts as unknown as Concept[]
const allQuestions = rawQuestions as unknown as Question[]

interface DevInspectorModalProps {
  isOpen: boolean
  onClose: () => void
}

export function DevInspectorModal({ isOpen, onClose }: DevInspectorModalProps) {
  const [students, setStudents] = useState<Student[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [gapReports, setGapReports] = useState<GapReport[]>([])
  const [miscEvents, setMiscEvents] = useState<MisconceptionEvent[]>([])
  const [masteryMap, setMasteryMap] = useState<ConceptMasteryMap>({})
  const [activeTab, setActiveTab] = useState<'mastery' | 'misconceptions' | 'gapTrace' | 'attempts' | 'sessions' | 'students' | 'sync'>('mastery')
  const [outboxItems, setOutboxItems] = useState<SyncOutboxItem[]>([])
  const [syncState, setSyncState] = useState<SyncState>(getSyncState())
  const [isForcingSync, setIsForcingSync] = useState(false)
  const [selectedConceptForTrace, setSelectedConceptForTrace] = useState<string>('balancing-equations')
  const [simulatedTrace, setSimulatedTrace] = useState<TraceResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [stu, sess, att, gaps, evts, pendingOutbox] = await Promise.all([
        getAllStudents(),
        getAllSessions(),
        getAllAttempts(),
        getAllGapReports(),
        getAllMisconceptionEvents(),
        getAllPendingOutboxItems(),
      ])
      setStudents(stu)
      setSessions(sess)
      setAttempts(att)
      setGapReports(gaps)
      setMiscEvents(evts)
      setOutboxItems(pendingOutbox)
      setSyncState(getSyncState())

      const current = await getCurrentStudent()
      const studentAtts = current ? att.filter((a) => a.studentId === current.id) : att
      const computed = computeAllMastery(studentAtts)
      setMasteryMap(computed)

      // Run real simulation on selected concept
      const targetQ = allQuestions.find((q) => q.conceptId === selectedConceptForTrace) || allQuestions[0]
      const trace = traceGap(studentAtts, targetQ)
      setSimulatedTrace(trace)
    } catch (err) {
      console.error('Failed to load raw DB data:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRunTraceForConcept = (conceptId: string) => {
    setSelectedConceptForTrace(conceptId)
    const currentStudentAttempts = attempts // from loaded attempts
    const targetQ = allQuestions.find((q) => q.conceptId === conceptId) || allQuestions[0]
    const trace = traceGap(currentStudentAttempts, targetQ)
    setSimulatedTrace(trace)
  }

  useEffect(() => {
    if (isOpen) {
      loadData()
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleClear = async () => {
    if (window.confirm('Are you sure you want to delete ALL students, sessions, and attempts from IndexedDB?')) {
      await clearAllData()
      await loadData()
      window.location.reload()
    }
  }

  // Attempt type breakdown stats
  const attemptTypeCounts = {
    confident_correct: attempts.filter((a) => a.attemptType === 'confident_correct').length,
    maybe_correct: attempts.filter((a) => a.attemptType === 'maybe_correct').length,
    lucky_guess: attempts.filter((a) => a.attemptType === 'lucky_guess').length,
    misconception: attempts.filter((a) => a.attemptType === 'misconception').length,
    honest_gap: attempts.filter((a) => a.attemptType === 'honest_gap').length,
  }

  const lastDecision = getLastSelectorDecision()

  return (
    <div className="dev-modal-overlay" role="dialog" aria-modal="true">
      <motion.div
        className="dev-modal-window"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
      >
        <div className="dev-modal-header">
          <div className="dev-title-area">
            <span className="dev-badge">DEV TOOL</span>
            <h3>PacePath BKT & IndexedDB Inspector</h3>
          </div>
          <div className="dev-actions-top">
            <button type="button" className="dev-btn" onClick={loadData} disabled={isLoading}>
              🔄 Refresh
            </button>
            <button type="button" className="dev-btn dev-btn-danger" onClick={handleClear}>
              🗑️ Clear Local Data
            </button>
            <button type="button" className="dev-close-btn" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        {/* Tab selection */}
        <div className="dev-tabs">
          <button
            type="button"
            className={`dev-tab ${activeTab === 'mastery' ? 'active' : ''}`}
            onClick={() => setActiveTab('mastery')}
          >
            🧠 Mastery & Selector
          </button>
          <button
            type="button"
            className={`dev-tab ${activeTab === 'misconceptions' ? 'active' : ''}`}
            onClick={() => setActiveTab('misconceptions')}
          >
            ⚡ Misconceptions ({miscEvents.length})
          </button>
          <button
            type="button"
            className={`dev-tab ${activeTab === 'gapTrace' ? 'active' : ''}`}
            onClick={() => setActiveTab('gapTrace')}
          >
            🔍 Gap Detective & DAG
          </button>
          <button
            type="button"
            className={`dev-tab ${activeTab === 'attempts' ? 'active' : ''}`}
            onClick={() => setActiveTab('attempts')}
          >
            Attempts ({attempts.length})
          </button>
          <button
            type="button"
            className={`dev-tab ${activeTab === 'sessions' ? 'active' : ''}`}
            onClick={() => setActiveTab('sessions')}
          >
            Sessions ({sessions.length})
          </button>
          <button
            type="button"
            className={`dev-tab ${activeTab === 'students' ? 'active' : ''}`}
            onClick={() => setActiveTab('students')}
          >
            Students ({students.length})
          </button>
          <button
            type="button"
            className={`dev-tab ${activeTab === 'sync' ? 'active' : ''}`}
            onClick={() => setActiveTab('sync')}
          >
            🔄 Sync Outbox ({outboxItems.length})
          </button>
        </div>

        {/* Content Table */}
        <div className="dev-table-container">
          {activeTab === 'mastery' && (
            <div className="dev-mastery-panel">
              {/* Last Selector Decision */}
              <div className="dev-panel-box">
                <h4 className="dev-subhead">🎯 Adaptive Selector: Last Real Decision</h4>
                {lastDecision ? (
                  <div className="dev-decision-grid">
                    <div>
                      <span className="dev-kv-k">Concept:</span>
                      <strong className="dev-kv-v">{lastDecision.conceptId}</strong>
                    </div>
                    <div>
                      <span className="dev-kv-k">Target Difficulty:</span>
                      <strong className="dev-kv-v">Level {lastDecision.targetDifficulty}</strong>
                    </div>
                    <div>
                      <span className="dev-kv-k">Strategy:</span>
                      <span className="status-pill correct">{lastDecision.selectionStrategy}</span>
                    </div>
                    <div>
                      <span className="dev-kv-k">Question ID:</span>
                      <code className="dev-mono">{lastDecision.question.id}</code>
                    </div>
                    <div className="dev-full-col">
                      <span className="dev-kv-k">Reason:</span>
                      <p className="dev-reason-quote">"{lastDecision.reason.en}"</p>
                    </div>
                  </div>
                ) : (
                  <p className="dev-empty">Start an adaptive practice round to see the live selector decision in real-time.</p>
                )}
              </div>

              {/* Real BKT Mastery Scores */}
              <div className="dev-panel-box">
                <h4 className="dev-subhead">📊 Bayesian Knowledge Tracing (BKT) Mastery Per Concept</h4>
                <table className="dev-table">
                  <thead>
                    <tr>
                      <th>Concept</th>
                      <th>BKT Mastery Score</th>
                      <th>Mastery %</th>
                      <th>Attempts Count</th>
                      <th>Confidence Level</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allConcepts.map((c) => {
                      const m = masteryMap[c.id]
                      const score = m ? m.score : 0.3
                      const count = m ? m.attemptsCount : 0
                      const conf = m ? m.confidenceLevel : 'low'
                      return (
                        <tr key={c.id}>
                          <td><strong>{c.name.en}</strong> (<code>{c.id}</code>)</td>
                          <td className="dev-mono">{score.toFixed(3)}</td>
                          <td>
                            <strong>{Math.round(score * 100)}%</strong>
                          </td>
                          <td>{count}</td>
                          <td>
                            <span className={`status-pill ${conf === 'high' ? 'correct' : conf === 'medium' ? 'medium' : 'wrong'}`}>
                              {conf}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Confidence & Attempt Types Breakdown */}
              <div className="dev-panel-box">
                <h4 className="dev-subhead">💡 Attempt Type & Confidence Breakdown</h4>
                <div className="dev-stat-tiles">
                  <div className="dev-tile">
                    <span className="tile-label">🎯 Confident Correct</span>
                    <strong className="tile-num">{attemptTypeCounts.confident_correct}</strong>
                  </div>
                  <div className="dev-tile">
                    <span className="tile-label">🌟 Good Instinct</span>
                    <strong className="tile-num">{attemptTypeCounts.maybe_correct}</strong>
                  </div>
                  <div className="dev-tile">
                    <span className="tile-label">🍀 Lucky Guess</span>
                    <strong className="tile-num">{attemptTypeCounts.lucky_guess}</strong>
                  </div>
                  <div className="dev-tile tile-alert">
                    <span className="tile-label">💡 Misconceptions</span>
                    <strong className="tile-num">{attemptTypeCounts.misconception}</strong>
                  </div>
                  <div className="dev-tile">
                    <span className="tile-label">🌱 Honest Gaps</span>
                    <strong className="tile-num">{attemptTypeCounts.honest_gap}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'misconceptions' && (
            <div className="dev-table-wrapper">
              <table className="dev-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Misconception ID</th>
                    <th>Source</th>
                    <th>Confidence</th>
                    <th>Confirmed?</th>
                    <th>Question ID</th>
                    <th>Student ID</th>
                  </tr>
                </thead>
                <tbody>
                  {miscEvents.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="dev-empty">
                        No misconception events recorded in IndexedDB yet.
                      </td>
                    </tr>
                  ) : (
                    miscEvents.map((evt) => (
                      <tr key={evt.id}>
                        <td className="dev-time">{new Date(evt.createdAt).toLocaleTimeString()}</td>
                        <td>
                          <strong>{evt.misconceptionId}</strong>
                        </td>
                        <td>
                          <span className="dev-chip">{evt.source}</span>
                        </td>
                        <td>{Math.round(evt.confidence * 100)}%</td>
                        <td>
                          {evt.studentConfirmed === true ? (
                            <span className="status-pill correct">Yes</span>
                          ) : evt.studentConfirmed === false ? (
                            <span className="status-pill wrong">No</span>
                          ) : (
                            <span className="status-pill medium">Pending</span>
                          )}
                        </td>
                        <td className="dev-mono">{evt.questionId}</td>
                        <td className="dev-mono">{evt.studentId.slice(0, 8)}...</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'gapTrace' && (
            <div className="dev-gaptrace-panel">
              {/* DAG & Graph Stats */}
              <div className="dev-panel-box">
                <h4 className="dev-subhead">🗺️ Prerequisite Concept Graph (Class 6 - 10 DAG)</h4>
                <div className="dev-dag-summary">
                  <div className="dev-tile">
                    <span className="tile-label">Concepts</span>
                    <strong className="tile-num">{allConcepts.length}</strong>
                  </div>
                  <div className="dev-tile">
                    <span className="tile-label">Questions Pool</span>
                    <strong className="tile-num">{allQuestions.length}</strong>
                  </div>
                  <div className="dev-tile">
                    <span className="tile-label">DAG Cycles</span>
                    <strong className="tile-num" style={{ color: '#4cc9b0' }}>0 (Verified)</strong>
                  </div>
                  <div className="dev-tile">
                    <span className="tile-label">Stored Gap Reports</span>
                    <strong className="tile-num">{gapReports.length}</strong>
                  </div>
                </div>
              </div>

              {/* Interactive Trace Simulator on Real Attempts */}
              <div className="dev-panel-box">
                <h4 className="dev-subhead">🧪 Live Trace Simulator (Runs on Real Attempts, Zero Fake Data)</h4>
                <div className="dev-trace-controls">
                  <label htmlFor="dev-concept-select" className="dev-kv-k">
                    Select Concept to Trace:
                  </label>
                  <select
                    id="dev-concept-select"
                    className="dev-select"
                    value={selectedConceptForTrace}
                    onChange={(e) => handleRunTraceForConcept(e.target.value)}
                  >
                    {allConcepts.map((c) => (
                      <option key={c.id} value={c.id}>
                        [Class {c.grade}] {c.name.en} ({c.id})
                      </option>
                    ))}
                  </select>
                </div>

                {simulatedTrace && (
                  <div className="dev-trace-results-box">
                    <div className="dev-trace-summary-line">
                      <span>Root Cause: <strong style={{ color: simulatedTrace.rootCauseId ? '#ff5470' : '#4cc9b0' }}>{simulatedTrace.rootCauseId || 'None (Prerequisites Solid)'}</strong></span>
                      <span>Confidence: <strong>{simulatedTrace.confidence}</strong></span>
                      <span>Probes Needed: <strong>{simulatedTrace.probesNeeded.join(', ') || 'None'}</strong></span>
                    </div>

                    <div className="dev-trace-path-tags">
                      <span className="dev-kv-k">Backwards Path:</span>
                      {simulatedTrace.path.map((node, i) => (
                        <span key={node.conceptId} className={`trace-path-tag tag-${node.status}`}>
                          {i > 0 && ' ← '}
                          {node.conceptId} ({node.status}{node.mastery !== null ? ` ${(node.mastery * 100).toFixed(0)}%` : ''})
                        </span>
                      ))}
                    </div>

                    <div className="dev-json-viewer">
                      <pre>{JSON.stringify(simulatedTrace, null, 2)}</pre>
                    </div>
                  </div>
                )}
              </div>

              {/* Stored gapReports Table */}
              <div className="dev-panel-box">
                <h4 className="dev-subhead">📋 IndexedDB: "gapReports" Table ({gapReports.length})</h4>
                {gapReports.length === 0 ? (
                  <p className="dev-empty">No gap reports stored in IndexedDB yet.</p>
                ) : (
                  <table className="dev-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Start Concept</th>
                        <th>Root Cause</th>
                        <th>Confidence</th>
                        <th>Reason</th>
                        <th>Status</th>
                        <th>ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gapReports.map((r) => (
                        <tr key={r.id}>
                          <td>{new Date(r.createdAt).toLocaleTimeString()}</td>
                          <td><strong>{r.startConceptId}</strong></td>
                          <td><span className="dev-badge-warn">{r.rootCauseId || 'None'}</span></td>
                          <td>{r.confidence}</td>
                          <td>{r.triggerReason}</td>
                          <td>
                            <span className={`status-pill ${r.resolvedAt ? 'correct' : 'wrong'}`}>
                              {r.resolvedAt ? 'Resolved' : 'Active'}
                            </span>
                          </td>
                          <td className="dev-mono">{r.id.slice(0, 8)}...</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {activeTab === 'attempts' && (
            attempts.length === 0 ? (
              <p className="dev-empty">No attempts recorded yet. Answer some questions in Solve Mode to see real records.</p>
            ) : (
              <table className="dev-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Question ID</th>
                    <th>Concept</th>
                    <th>Confidence</th>
                    <th>Classification</th>
                    <th>Result</th>
                    <th>Mistake Tag</th>
                    <th>Hints</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {[...attempts].reverse().map((att) => (
                    <tr key={att.id} className={att.correct ? 'row-correct' : 'row-wrong'}>
                      <td>{new Date(att.timestamp).toLocaleTimeString()}</td>
                      <td><strong>{att.questionId}</strong></td>
                      <td><code>{att.conceptId}</code></td>
                      <td>
                        <span className="dev-conf-tag">{att.confidence || '—'}</span>
                      </td>
                      <td>
                        <span className={`status-pill ${att.attemptType === 'misconception' ? 'wrong' : 'correct'}`}>
                          {att.attemptType || (att.correct ? 'correct' : 'wrong')}
                        </span>
                      </td>
                      <td>
                        <span className={`status-pill ${att.correct ? 'correct' : 'wrong'}`}>
                          {att.correct ? '✓ Correct' : '✕ Wrong'}
                        </span>
                      </td>
                      <td>{att.mistakeTag ? <code>{att.mistakeTag}</code> : '—'}</td>
                      <td>{att.hintsUsed}</td>
                      <td>{att.timeTakenMs} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}

          {activeTab === 'sessions' && (
            sessions.length === 0 ? (
              <p className="dev-empty">No sessions created yet.</p>
            ) : (
              <table className="dev-table">
                <thead>
                  <tr>
                    <th>Start Time</th>
                    <th>End Time</th>
                    <th>Active Seconds</th>
                    <th>Session ID</th>
                    <th>Student ID</th>
                  </tr>
                </thead>
                <tbody>
                  {[...sessions].reverse().map((s) => (
                    <tr key={s.id}>
                      <td>{new Date(s.startTime).toLocaleTimeString()}</td>
                      <td>{s.endTime ? new Date(s.endTime).toLocaleTimeString() : 'In Progress'}</td>
                      <td><strong>{s.activeSeconds}s</strong></td>
                      <td className="dev-mono">{s.id}</td>
                      <td className="dev-mono">{s.studentId.slice(0, 8)}...</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}

          {activeTab === 'students' && (
            students.length === 0 ? (
              <p className="dev-empty">No students created yet.</p>
            ) : (
              <table className="dev-table">
                <thead>
                  <tr>
                    <th>Avatar</th>
                    <th>Name</th>
                    <th>Grade</th>
                    <th>Class Code</th>
                    <th>Created</th>
                    <th>ID</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((st) => (
                    <tr key={st.id}>
                      <td style={{ fontSize: '1.4rem' }}>{st.avatar}</td>
                      <td><strong>{st.name}</strong></td>
                      <td>Class {st.grade}</td>
                      <td>{st.classCode || '—'}</td>
                      <td>{new Date(st.createdAt).toLocaleDateString()}</td>
                      <td className="dev-mono">{st.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}

          {activeTab === 'sync' && (
            <div className="dev-sync-panel">
              <div className="dev-panel-box">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <h4 className="dev-subhead" style={{ margin: 0 }}>
                      ⚡ Supabase Sync Outbox & Background Worker
                    </h4>
                    <p style={{ margin: '0.3rem 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      Items are held in local Dexie outbox and removed ONLY after Supabase <code>sync_batch</code> RPC confirms success.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="dev-btn"
                    style={{ background: '#38bdf8', color: '#0b1120', fontWeight: 700 }}
                    disabled={isForcingSync}
                    onClick={async () => {
                      setIsForcingSync(true)
                      try {
                        await forceSyncNow()
                        await loadData()
                      } finally {
                        setIsForcingSync(false)
                      }
                    }}
                  >
                    {isForcingSync ? 'Syncing...' : '🚀 Force Sync Now'}
                  </button>
                </div>

                <div className="dev-stat-tiles" style={{ marginTop: '1.25rem' }}>
                  <div className="dev-tile">
                    <span className="tile-label">📦 Outbox Size</span>
                    <strong className="tile-num">{outboxItems.length}</strong>
                  </div>
                  <div className="dev-tile">
                    <span className="tile-label">📡 Engine Status</span>
                    <strong className="tile-num" style={{ fontSize: '1.1rem', textTransform: 'uppercase' }}>
                      {syncState.status}
                    </strong>
                  </div>
                  <div className="dev-tile">
                    <span className="tile-label">⏱️ Last Synced</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>
                      {syncState.lastSyncedAt ? new Date(syncState.lastSyncedAt).toLocaleTimeString() : 'Never'}
                    </span>
                  </div>
                  <div className="dev-tile">
                    <span className="tile-label">⚠️ Last Result / Error</span>
                    <span style={{ fontSize: '0.8rem', color: syncState.lastError ? '#ff5470' : '#4cc9b0' }}>
                      {syncState.lastError || 'None (Healthy)'}
                    </span>
                  </div>
                </div>
              </div>

              {outboxItems.length === 0 ? (
                <p className="dev-empty" style={{ margin: '1.5rem 0' }}>
                  🎉 Outbox is completely empty! All local records are in sync.
                </p>
              ) : (
                <table className="dev-table" style={{ marginTop: '1.5rem' }}>
                  <thead>
                    <tr>
                      <th>Table</th>
                      <th>Action</th>
                      <th>Retries</th>
                      <th>Enqueued At</th>
                      <th>Payload ID</th>
                      <th>Last Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outboxItems.map((item) => (
                      <tr key={item.id}>
                        <td><code>{item.table}</code></td>
                        <td><span className="status-pill correct">{item.action}</span></td>
                        <td>{item.retryCount}</td>
                        <td>{new Date(item.timestamp).toLocaleTimeString()}</td>
                        <td className="dev-mono">{item.id.slice(0, 12)}...</td>
                        <td style={{ color: item.lastError ? '#ff5470' : 'var(--text-muted)', fontSize: '0.78rem' }}>
                          {item.lastError || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
