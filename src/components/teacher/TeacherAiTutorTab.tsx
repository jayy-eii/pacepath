import { useState, useEffect } from 'react'
import type { Language } from '../../types'
import {
  getClassAiActivity,
  getFlaggedAiConversations,
  type ClassAiActivityRow,
  type FlaggedAiConversationRow,
} from '../../services/supabase'
import rawConcepts from '../../data/concepts.json'

interface TeacherAiTutorTabProps {
  classCode: string
  pin: string
  lang: Language
}

const allConcepts = rawConcepts as Array<{
  id: string
  name: { en: string; hi: string }
  grade: number
}>
const conceptMap = new Map(allConcepts.map((c) => [c.id, c]))

export function TeacherAiTutorTab({ classCode, pin, lang }: TeacherAiTutorTabProps) {
  const [activityList, setActivityList] = useState<ClassAiActivityRow[]>([])
  const [flaggedList, setFlaggedList] = useState<FlaggedAiConversationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedStudentForDrawer, setSelectedStudentForDrawer] = useState<{
    id: string
    name: string
  } | null>(null)
  const [filterText, setFilterText] = useState('')

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      const [activity, flagged] = await Promise.all([
        getClassAiActivity(classCode, pin),
        getFlaggedAiConversations(classCode, pin),
      ])
      setActivityList(activity)
      setFlaggedList(flagged)
    } catch (err: any) {
      setError(err?.message || 'Failed to load AI Tutor activity.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [classCode, pin])

  // Aggregate stats
  const totalMessages = activityList.reduce((acc, row) => acc + (row.total_messages || 0), 0)
  const totalPhotos = activityList.reduce((acc, row) => acc + (row.photo_count || 0), 0)
  const totalFlagged = activityList.reduce((acc, row) => acc + (row.flagged_count || 0), 0)

  // Concept demand calculation: group distinct students per concept_id
  const conceptStudentCountMap = new Map<string, Set<string>>()
  activityList.forEach((row) => {
    if (row.concept_id) {
      if (!conceptStudentCountMap.has(row.concept_id)) {
        conceptStudentCountMap.set(row.concept_id, new Set())
      }
      conceptStudentCountMap.get(row.concept_id)!.add(row.student_id)
    }
  })

  // Concepts with >= 3 distinct students
  const highDemandConcepts: Array<{ id: string; count: number; name: string }> = []
  conceptStudentCountMap.forEach((studentSet, cId) => {
    if (studentSet.size >= 3) {
      const cMeta = conceptMap.get(cId)
      highDemandConcepts.push({
        id: cId,
        count: studentSet.size,
        name: cMeta ? cMeta.name[lang] : cId,
      })
    }
  })

  // Filtered student list
  const filteredStudents = activityList.filter((s) =>
    s.student_name.toLowerCase().includes(filterText.toLowerCase().trim()),
  )

  // Transcript drawer messages
  const drawerMessages = selectedStudentForDrawer
    ? flaggedList.filter((m) => m.student_id === selectedStudentForDrawer.id)
    : []

  if (loading) {
    return (
      <div className="teacher-tab-loading">
        <div className="spinner-sm" />
        <p>{lang === 'hi' ? 'एआई ट्यूटर गतिविधि लोड हो रही है...' : 'Loading AI Tutor analytics...'}</p>
      </div>
    )
  }

  return (
    <div className="teacher-ai-tutor-view">
      {/* Tab Header */}
      <div className="section-title-row">
        <div>
          <h2>{lang === 'hi' ? 'एआई ट्यूटर गतिविधि एवं सुरक्षा' : 'AI Tutor Activity & Safety'}</h2>
          <p className="tab-subtitle">
            {lang === 'hi'
              ? 'छात्रों के अध्ययन प्रश्न, फोटो विश्लेषण और सुरक्षा मॉनिटरिंग'
              : 'Student queries, photo help, concept demand, and safety flags'}
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={loadData}>
          🔄 {lang === 'hi' ? 'ताज़ा करें' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      {/* Aggregate KPI Stat Cards */}
      <div className="teacher-stats-grid">
        <div className="stat-card">
          <span className="stat-label">{lang === 'hi' ? 'कुल प्रश्न' : 'Total Queries'}</span>
          <span className="stat-value">{totalMessages}</span>
          <span className="stat-sub">{lang === 'hi' ? 'छात्रों द्वारा पूछे गए' : 'from all students'}</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">{lang === 'hi' ? 'फोटो प्रश्न' : 'Photo Inquiries'}</span>
          <span className="stat-value">📷 {totalPhotos}</span>
          <span className="stat-sub">{lang === 'hi' ? 'किताब/नोटबुक चित्र' : 'notebook / book snaps'}</span>
        </div>

        <div className={`stat-card ${totalFlagged > 0 ? 'stat-alert' : ''}`}>
          <span className="stat-label">{lang === 'hi' ? 'फ्लैग की गई बातचीत' : 'Flagged Inquiries'}</span>
          <span className="stat-value">🛡️ {totalFlagged}</span>
          <span className="stat-sub">
            {totalFlagged === 0
              ? lang === 'hi' ? 'सभी बातचीत सुरक्षित' : 'Zero safety violations'
              : lang === 'hi' ? 'समीक्षा आवश्यक' : 'Safety review required'}
          </span>
        </div>
      </div>

      {/* High Concept Demand Insight (Threshold: >= 3 students) */}
      <div className="tutor-demand-section">
        {highDemandConcepts.length > 0 ? (
          <div className="concept-demand-alert">
            <div className="alert-icon">💡</div>
            <div className="alert-body">
              <h4>
                {lang === 'hi'
                  ? 'सामूहिक कक्षा आवश्यकता पहचानी गई (≥3 छात्र)'
                  : 'High Class Concept Demand (≥3 students)'}
              </h4>
              <p>
                {lang === 'hi'
                  ? `निम्नलिखित अवधारणाओं पर 3 या अधिक छात्रों ने एआई ट्यूटर से सहायता मांगी है। इन विषयों पर कक्षा में संक्षिप्त पुनरावृत्ति सत्र (Mini-Lesson) उपयोगी रहेगा:`
                  : `Multiple students are seeking AI tutor hints on these specific concepts. Consider a 10-minute whole-class review:`}
              </p>
              <div className="demand-tags-row">
                {highDemandConcepts.map((item) => (
                  <span key={item.id} className="demand-tag">
                    <strong>{item.name}</strong> ({item.count} {lang === 'hi' ? 'छात्र' : 'students'})
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="concept-demand-normal">
            <span>ℹ️ {lang === 'hi'
              ? 'वर्तमान में छात्रों के प्रश्न व्यक्तिगत अभ्यास विषयों में वितरित हैं (कोई साझा कठिनाई ≥3 छात्र नहीं)।'
              : 'Concept inquiries are currently distributed across individual practice topics (no cluster ≥ 3 students).'}</span>
          </div>
        )}
      </div>

      {/* Flagged Inquiries Quick List (if any) */}
      {flaggedList.length > 0 && (
        <div className="flagged-section">
          <div className="flagged-header">
            <h3>🛡️ {lang === 'hi' ? 'सुरक्षा समीक्षा हेतु फ्लैग किए गए संदेश' : 'Flagged for Safety Review'}</h3>
            <span className="badge-warning">{flaggedList.length} items</span>
          </div>
          <div className="flagged-cards-grid">
            {flaggedList.map((item) => (
              <div key={item.id} className="flagged-card">
                <div className="flagged-card-top">
                  <span className="flagged-student-name">
                    {item.student_avatar} {item.student_name}
                  </span>
                  <span className="flagged-time">
                    {new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="flagged-content">
                  <em>"{item.content}"</em>
                </div>
                <div className="flagged-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() =>
                      setSelectedStudentForDrawer({
                        id: item.student_id,
                        name: item.student_name,
                      })
                    }
                  >
                    {lang === 'hi' ? 'पूर्ण संवाद देखें' : 'View Full Transcript'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Student Activity Roster */}
      <div className="tutor-roster-section">
        <div className="roster-header-row">
          <h3>{lang === 'hi' ? 'छात्रवार ट्यूटर उपयोग' : 'Student Activity Roster'}</h3>
          <input
            type="text"
            className="search-input"
            placeholder={lang === 'hi' ? 'छात्र खोजें...' : 'Search student...'}
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
        </div>

        {activityList.length === 0 ? (
          <div className="empty-state-card">
            <h4>{lang === 'hi' ? 'कोई ट्यूटर गतिविधि नहीं' : 'No AI Tutor activity yet'}</h4>
            <p>
              {lang === 'hi'
                ? `कक्षा ${classCode} के छात्रों ने अभी तक एआई ट्यूटर से प्रश्न नहीं पूछे हैं। जब वे अभ्यास में प्रश्न पूछेंगे या फोटो भेजेंगे, उनका विवरण यहाँ दिखाई देगा।`
                : `Students in Class ${classCode} have not queried the AI Study Tutor yet. Once they ask questions or attach photos, their usage analytics will appear here.`}
            </p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="tutor-roster-table">
              <thead>
                <tr>
                  <th>{lang === 'hi' ? 'छात्र' : 'Student'}</th>
                  <th>{lang === 'hi' ? 'कुल प्रश्न' : 'Total Queries'}</th>
                  <th>{lang === 'hi' ? 'फोटो प्रश्न' : 'Photos'}</th>
                  <th>{lang === 'hi' ? 'फ्लैग स्थिति' : 'Flagged'}</th>
                  <th>{lang === 'hi' ? 'अंतिम सक्रिय' : 'Last Active'}</th>
                  <th>{lang === 'hi' ? 'कार्रवाई' : 'Action'}</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((row) => (
                  <tr key={row.student_id}>
                    <td>
                      <span className="student-cell">
                        <span className="student-avatar">{row.student_avatar || '👤'}</span>
                        <span className="student-name">{row.student_name}</span>
                      </span>
                    </td>
                    <td><strong>{row.total_messages}</strong></td>
                    <td>{row.photo_count > 0 ? `📷 ${row.photo_count}` : '0'}</td>
                    <td>
                      {row.flagged_count > 0 ? (
                        <span className="badge-flagged">⚠️ {row.flagged_count}</span>
                      ) : (
                        <span className="badge-clean">✓ Safe</span>
                      )}
                    </td>
                    <td>
                      {row.last_active
                        ? new Date(row.last_active).toLocaleDateString([], { month: 'short', day: 'numeric' })
                        : '—'}
                    </td>
                    <td>
                      {row.flagged_count > 0 ? (
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs"
                          onClick={() =>
                            setSelectedStudentForDrawer({
                              id: row.student_id,
                              name: row.student_name,
                            })
                          }
                        >
                          {lang === 'hi' ? 'समीक्षा' : 'Review'}
                        </button>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Flagged Conversation Drawer */}
      {selectedStudentForDrawer && (
        <div className="transcript-drawer-backdrop" onClick={() => setSelectedStudentForDrawer(null)}>
          <div className="transcript-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="drawer-title-group">
                <h3>🛡️ {selectedStudentForDrawer.name} — {lang === 'hi' ? 'सुरक्षा ट्रांसक्रिप्ट' : 'Safety Transcript'}</h3>
                <span className="drawer-sub">Class {classCode}</span>
              </div>
              <button
                type="button"
                className="btn btn-ghost drawer-close-btn"
                onClick={() => setSelectedStudentForDrawer(null)}
              >
                ✕
              </button>
            </div>

            <div className="drawer-body">
              {drawerMessages.length === 0 ? (
                <p className="drawer-empty">No flagged messages recorded for this student.</p>
              ) : (
                <div className="drawer-messages-list">
                  {drawerMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`drawer-msg-item ${
                        msg.sender_role === 'student' ? 'drawer-msg-student' : 'drawer-msg-assistant'
                      }`}
                    >
                      <div className="drawer-msg-header">
                        <strong>{msg.sender_role === 'student' ? selectedStudentForDrawer.name : '🤖 AI Tutor'}</strong>
                        <span className="drawer-msg-time">
                          {new Date(msg.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="drawer-msg-content">{msg.content}</div>
                      {msg.has_image && (
                        <span className="drawer-image-tag">📷 Photo was attached</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="drawer-footer">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setSelectedStudentForDrawer(null)}
              >
                {lang === 'hi' ? 'समीक्षा संपन्न' : 'Close Review'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
