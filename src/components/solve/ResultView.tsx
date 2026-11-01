import { motion } from 'framer-motion'
import type { SessionSummary, Student, Language } from '../../types'
import { Mascot } from '../Mascot'
import { Confetti } from '../Confetti'
import { fadeUp } from '../../motion/presets'

interface ResultViewProps {
  summary: SessionSummary
  student: Student | null
  lang: Language
  onRestart: () => void
  onClose: () => void
  onAskTeacher?: (context: {
    questionId?: string
    questionTitle: string
    studentAnswer?: string
    misconceptionTag?: string
  }) => void
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const remSecs = seconds % 60
  return `${mins}m ${remSecs}s`
}

export function ResultView({ summary, student, lang, onRestart, onClose, onAskTeacher }: ResultViewProps) {
  const isCelebration = summary.accuracyPct >= 70 && summary.totalQuestions > 0
  const misconceptionsCount = summary.misconceptionsCount || 0

  return (
    <motion.div
      className="solve-result-container"
      variants={fadeUp}
      initial="hidden"
      animate="show"
    >
      {isCelebration && <Confetti bursts={2} />}

      {/* Header */}
      <div className="solve-result-hero">
        <Mascot size={110} mood={isCelebration ? 'cheer' : 'idle'} />
        <h2 className="solve-result-title">
          {summary.totalQuestions === 0
            ? lang === 'hi' ? 'सत्र समाप्त हुआ' : 'Session Ended'
            : isCelebration
              ? lang === 'hi'
                ? `शानदार काम, ${student?.name || 'दोस्त'}! 🌟`
                : `Awesome work, ${student?.name || 'champ'}! 🌟`
              : lang === 'hi'
                ? `अच्छा प्रयास, ${student?.name || 'दोस्त'}! 🌱`
                : `Great effort, ${student?.name || 'champ'}! 🌱`}
        </h2>
        <p className="solve-result-sub">
          {summary.totalQuestions === 0
            ? lang === 'hi'
              ? 'इस सत्र में कोई प्रश्न हल नहीं किया गया था।'
              : 'No questions were answered in this practice session.'
            : lang === 'hi'
              ? 'यहाँ आपके वास्तविक हल किए गए प्रश्नों और BKT निपुणता का पूरा विवरण है:'
              : 'Here is your real performance & Bayesian Knowledge Tracing mastery summary:'}
        </p>
      </div>

      {/* Honest Empty State if 0 questions answered */}
      {summary.totalQuestions === 0 ? (
        <div className="solve-empty-state">
          <p className="empty-msg">
            {lang === 'hi'
              ? 'कोई डेटा उपलब्ध नहीं है क्योंकि आपने कोई सवाल सबमिट नहीं किया। नया अभ्यास शुरू करें और अपनी प्रगति देखें!'
              : 'No attempts were recorded. Start a practice round whenever you are ready to see your concept breakdown!'}
          </p>
          <div className="solve-result-actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={onRestart}>
              {lang === 'hi' ? 'नया अभ्यास शुरू करें 🚀' : 'Start Practice 🚀'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {lang === 'hi' ? 'होम पर वापस जाएं' : 'Back to Home'}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Key Metric Stats Cards */}
          <div className="solve-metrics-row">
            <div className="solve-metric-card">
              <span className="metric-label">{lang === 'hi' ? 'स्कोर' : 'Score'}</span>
              <strong className="metric-value">
                {summary.correctCount} / {summary.totalQuestions}
              </strong>
              <span className="metric-sub">{summary.accuracyPct}% accuracy</span>
            </div>

            <div className="solve-metric-card">
              <span className="metric-label">{lang === 'hi' ? 'सक्रिय समय' : 'Active Time'}</span>
              <strong className="metric-value">{formatTime(summary.totalActiveSeconds)}</strong>
              <span className="metric-sub">
                {lang === 'hi' ? 'वास्तविक अध्ययन समय' : 'real focused time'}
              </span>
            </div>

            <div className="solve-metric-card">
              <span className="metric-label">{lang === 'hi' ? 'भ्रांतियां (Misconceptions)' : 'Misconceptions'}</span>
              <strong className="metric-value" style={{ color: misconceptionsCount > 0 ? 'var(--c4)' : 'var(--accent-2)' }}>
                {misconceptionsCount}
              </strong>
              <span className="metric-sub">
                {misconceptionsCount > 0
                  ? lang === 'hi' ? 'समीक्षा की गई' : 'reviewed & flagged'
                  : lang === 'hi' ? 'कोई भ्रांति नहीं' : 'none detected'}
              </span>
            </div>
          </div>

          {/* Misconceptions Notice Banner */}
          {misconceptionsCount > 0 ? (
            <div className="misconception-summary-banner">
              <span className="banner-icon">💡</span>
              <p>
                {lang === 'hi'
                  ? `इस राउंड में ${misconceptionsCount} भ्रांति(यां) पहचानी गईं। पूरे विश्वास के बावजूद गलत होना सामान्य है — समाधान देखने से ये नियम हमेशा के लिए याद हो जाते हैं!`
                  : `${misconceptionsCount} misconception(s) identified in this round. Being confident on a tricky question is very common — reviewing the worked solution helps turn these into long-term strengths!`}
              </p>
            </div>
          ) : (
            <div className="misconception-clean-banner">
              <span className="banner-icon">✨</span>
              <p>
                {lang === 'hi'
                  ? 'उत्कृष्ट सटीकता! इस राउंड में कोई बड़ी भ्रांति नहीं मिली। आपका वैचारिक आधार बहुत मजबूत है।'
                  : 'Zero misconceptions! You maintained solid conceptual accuracy and avoided common pitfalls.'}
              </p>
            </div>
          )}

          {/* Dynamic Real Insights */}
          <div className="solve-insights-card">
            {summary.strongestConcept && (
              <div className="insight-item insight-strongest">
                <span className="insight-icon" aria-hidden="true">⭐</span>
                <div>
                  <strong>{lang === 'hi' ? 'सबसे मजबूत अवधारणा:' : 'Strongest Concept:'}</strong>{' '}
                  <span>
                    {summary.strongestConcept.conceptName[lang]} ({summary.strongestConcept.accuracyPct}%)
                  </span>
                </div>
              </div>
            )}

            {summary.needsPracticeConcept ? (
              <div className="insight-item insight-practice">
                <span className="insight-icon" aria-hidden="true">🎯</span>
                <div>
                  <strong>{lang === 'hi' ? 'अभ्यास की आवश्यकता:' : 'Needs Practice:'}</strong>{' '}
                  <span>
                    {summary.needsPracticeConcept.conceptName[lang]} ({summary.needsPracticeConcept.accuracyPct}%)
                  </span>
                </div>
              </div>
            ) : (
              <div className="insight-item insight-perfect">
                <span className="insight-icon" aria-hidden="true">✨</span>
                <div>
                  <strong>{lang === 'hi' ? 'उत्कृष्ट समझ:' : 'All Concepts Strong:'}</strong>{' '}
                  <span>
                    {lang === 'hi'
                      ? 'आपने सभी अवधारणाओं में बहुत अच्छा प्रदर्शन किया!'
                      : 'You scored 100% across all attempted concepts!'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Real BKT Mastery Growth (Before vs After this session) */}
          {summary.masteryBefore && summary.masteryAfter && (
            <div className="solve-mastery-growth-card">
              <h4 className="breakdown-title">
                {lang === 'hi'
                  ? 'BKT निपुणता प्रगति (इस सत्र से पहले vs बाद)'
                  : 'Mastery Progression (Before vs After Session)'}
              </h4>
              <p className="mastery-growth-sub">
                {lang === 'hi'
                  ? 'बेयेसियन नॉलेज ट्रेसिंग (BKT) द्वारा वास्तविक संकेतों (संकेत, आत्मविश्वास और परिणाम) से आकलित।'
                  : 'Computed via Bayesian Knowledge Tracing using real confidence, hints, and accuracy.'}
              </p>

              <div className="mastery-growth-list">
                {summary.perConcept.map((item) => {
                  const beforeScore = summary.masteryBefore?.[item.conceptId] ?? 0.3
                  const afterScore = summary.masteryAfter?.[item.conceptId] ?? 0.3
                  const beforePct = Math.round(beforeScore * 100)
                  const afterPct = Math.round(afterScore * 100)
                  const delta = afterPct - beforePct

                  return (
                    <div key={item.conceptId} className="mastery-growth-row">
                      <div className="growth-row-top">
                        <span className="growth-concept-name">{item.conceptName[lang]}</span>
                        <div className="growth-score-delta">
                          <span className="score-before">{beforePct}%</span>
                          <span className="score-arrow">→</span>
                          <span className="score-after"><strong>{afterPct}%</strong></span>
                          <span className={`score-delta ${delta >= 0 ? 'delta-pos' : 'delta-neg'}`}>
                            {delta >= 0 ? `+${delta}%` : `${delta}%`}
                          </span>
                        </div>
                      </div>
                      <div className="growth-bar-track">
                        <motion.div
                          className="growth-bar-fill"
                          initial={{ width: `${beforePct}%` }}
                          animate={{ width: `${afterPct}%` }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                          style={{
                            background:
                              afterPct >= 70
                                ? 'linear-gradient(90deg, #4cc9b0, #6ee7ff)'
                                : afterPct >= 40
                                  ? 'linear-gradient(90deg, #ffc862, #4cc9b0)'
                                  : 'linear-gradient(90deg, #ff5470, #ffc862)',
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Bottom Actions */}
          <div className="solve-result-actions" style={{ display: 'flex', gap: '0.8rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <motion.button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={onRestart}
              whileTap={{ scale: 0.95 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            >
              {lang === 'hi' ? 'अगला अभ्यास शुरू करें 🚀' : 'Practice Again 🚀'}
            </motion.button>
            {onAskTeacher && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                onClick={() => {
                  const topConcept = summary.perConcept[0]
                  onAskTeacher({
                    questionTitle: topConcept
                      ? `Practice Session Query (${topConcept.conceptName[lang]})`
                      : 'Practice Session Doubt',
                  })
                }}
              >
                💬 {lang === 'hi' ? 'शिक्षक से सवाल पूछें' : 'Ask Teacher'}
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {lang === 'hi' ? 'समाप्त करें व वापस जाएं' : 'Done & Close'}
            </button>
          </div>
        </>
      )}
    </motion.div>
  )
}
