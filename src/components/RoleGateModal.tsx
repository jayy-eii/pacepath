import { motion } from 'framer-motion'
import { Mascot } from './Mascot'
import type { Language } from '../types'
import type { AppRole } from '../services/roleSession'

interface RoleGateModalProps {
  isOpen: boolean
  onClose?: () => void
  lang: Language
  onSelectRole: (role: AppRole) => void
}

export function RoleGateModal({ isOpen, onClose, lang, onSelectRole }: RoleGateModalProps) {
  if (!isOpen) return null

  return (
    <div className="solve-modal-backdrop role-gate-backdrop" role="dialog" aria-modal="true">
      <motion.div
        className="role-gate-container"
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 20 }}
      >
        <div className="role-gate-header">
          <Mascot size={72} mood="wave" />
          <h2>
            {lang === 'hi' ? 'पेसपाथ में आपका स्वागत है!' : 'Welcome to PacePath!'}
          </h2>
          <p className="role-gate-sub">
            {lang === 'hi'
              ? 'कृपया अपनी भूमिका चुनें:'
              : 'Choose your role to get started:'}
          </p>
        </div>

        <div className="role-cards-grid">
          {/* Student Card */}
          <motion.div
            className="role-card role-card-student"
            whileHover={{ y: -4, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelectRole('student')}
          >
            <div className="role-card-badge">FOR LEARNERS</div>
            <span className="role-card-icon">🎓</span>
            <h3>{lang === 'hi' ? 'मैं विद्यार्थी हूँ' : "I'm a Student"}</h3>
            <p className="role-card-desc">
              {lang === 'hi'
                ? 'गणित का अभ्यास करें, अपनी गलतियों के पीछे का कारण समझें और शिक्षक की कक्षा से जुड़ें।'
                : 'Practice adaptive maths, uncover why you made a mistake, take assigned tests, and level up.'}
            </p>
            <div className="role-feature-tags">
              <span>⚡ Adaptive Practice</span>
              <span>🔍 Gap Detective</span>
              <span>📱 Works Offline</span>
            </div>
            <button type="button" className="role-select-btn student-btn">
              {lang === 'hi' ? 'विद्यार्थी पोर्टल →' : 'Enter as Student →'}
            </button>
          </motion.div>

          {/* Teacher Card */}
          <motion.div
            className="role-card role-card-teacher"
            whileHover={{ y: -4, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelectRole('teacher')}
          >
            <div className="role-card-badge badge-teacher">FOR EDUCATORS</div>
            <span className="role-card-icon">🏫</span>
            <h3>{lang === 'hi' ? 'मैं शिक्षक हूँ' : "I'm a Teacher"}</h3>
            <p className="role-card-desc">
              {lang === 'hi'
                ? 'कक्षाएं बनाएं, विद्यार्थियों का वास्तविक हीटमैप देखें, टेस्ट असाइन करें और भ्रांतियां दूर करें।'
                : 'Create classes, monitor live cohort heatmaps, group students for 10-min actions, and track procedural misconceptions.'}
            </p>
            <div className="role-feature-tags">
              <span>🗺️ Class Heatmap</span>
              <span>🎯 Remedial Groups</span>
              <span>💡 10-Min Actions</span>
            </div>
            <button type="button" className="role-select-btn teacher-btn">
              {lang === 'hi' ? 'शिक्षक पोर्टल →' : 'Enter as Teacher →'}
            </button>
          </motion.div>
        </div>

        {onClose && (
          <div className="role-gate-footer">
            <button type="button" className="role-gate-browse-link" onClick={onClose}>
              {lang === 'hi' ? 'वेबसाइट देखें (बिना लॉगिन)' : 'Browse landing page without signing in'}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  )
}
