import { Hero } from '../components/Hero'
import { MisconceptionShowcase } from '../components/MisconceptionShowcase'
import { ProblemSection } from '../components/ProblemSection'
import { HowItWorksSection } from '../components/HowItWorksSection'
import { FeaturesGrid } from '../components/FeaturesGrid'
import { PillarsShowcase } from '../components/PillarsShowcase'
import { BuiltForIndiaSection } from '../components/BuiltForIndiaSection'
import { FinalCTA } from '../components/FinalCTA'
import { Footer } from '../components/Footer'
import { SectionDots } from '../components/SectionDots'
import { ProgressBar } from '../components/ProgressBar'
import { Mascot } from '../components/Mascot'
import { SyncStatusChip } from '../components/SyncStatusChip'
import { RoleGateModal } from '../components/RoleGateModal'
import { DevInspectorModal } from '../components/solve/DevInspectorModal'
import type { Language } from '../types'
import type { AppRole } from '../services/roleSession'

interface LandingPageProps {
  lang: Language
  onToggleLang: () => void
  theme: 'dark' | 'light'
  toggleTheme: () => void
  pref: string
  toggleMotionPref: () => void
  reduced: boolean
  activeRole: AppRole | null
  onStartPractice: () => void
  onOpenTeacherDashboard: () => void
  handleSwitchRole: () => void
  isRoleGateOpen: boolean
  setIsRoleGateOpen: (open: boolean) => void
  handleSelectRole: (role: AppRole) => void
  isDevOpen: boolean
  setIsDevOpen: (open: boolean) => void
}

export function LandingPage({
  lang,
  onToggleLang,
  theme,
  toggleTheme,
  pref,
  toggleMotionPref,
  reduced,
  activeRole,
  onStartPractice,
  onOpenTeacherDashboard,
  handleSwitchRole,
  isRoleGateOpen,
  setIsRoleGateOpen,
  handleSelectRole,
  isDevOpen,
  setIsDevOpen,
}: LandingPageProps) {
  return (
    <>
      <ProgressBar />
      <SectionDots />

      <header className="topnav">
        <div className="topnav-left">
          <a href="#hero" className="logo" aria-label="PacePath - Back to top">
            <Mascot size={32} mood="idle" />
            <div className="logo-brand-col">
              <span className="logo-title">PacePath</span>
              <span className="logo-badge">Class 6–10</span>
            </div>
          </a>
        </div>

        <nav className="topnav-center" aria-label="Section links">
          <div className="topnav-center-links">
            <button
              type="button"
              className="chip chip--compact topnav-link"
              onClick={() => {/* scroll to features section */}}
            >Features</button>
            <button
              type="button"
              className="chip chip--compact topnav-link"
              onClick={() => {/* scroll to how-it-works section */}}
            >How it works</button>
            <button
              type="button"
              className="chip chip--compact topnav-link"
              onClick={() => {/* scroll to try-it section */}}
            >Try it</button>
            <button
              type="button"
              className="chip chip--compact topnav-link"
              onClick={() => {/* scroll to teachers section */}}
            >For teachers</button>
          </div>
        </nav>

        <div className="topnav-right">
          {/* Role CTA / Role Pill */}
          {activeRole === 'student' ? (
            <div className="role-chip-indicator role-chip--student" style={{ whiteSpace: 'nowrap', alignItems: 'center', gap: '0.5rem' }}>
              <span className="role-indicator-icon">🎓</span>
              <span className="role-indicator-text">{lang === 'hi' ? 'विद्यार्थी' : 'Student'}</span>
              <button
                type="button"
                className="role-switch-btn"
                onClick={handleSwitchRole}
                title={lang === 'hi' ? 'भूमिका बदलें' : 'Switch role'}
                style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }}
              >
                {lang === 'hi' ? 'बदलें' : 'Switch'}
              </button>
            </div>
          ) : activeRole === 'teacher' ? (
            <div className="role-chip-indicator role-chip--teacher" style={{ whiteSpace: 'nowrap', alignItems: 'center', gap: '0.5rem' }}>
              <span className="role-indicator-icon">🏫</span>
              <span className="role-indicator-text">{lang === 'hi' ? 'शिक्षक' : 'Teacher'}</span>
              <button
                type="button"
                className="role-switch-btn"
                onClick={handleSwitchRole}
                title={lang === 'hi' ? 'भूमिका बदलें' : 'Switch role'}
                style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }}
              >
                {lang === 'hi' ? 'बदलें' : 'Switch'}
              </button>
              <span className="pill-dot" style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--accent)', boxShadow: '0 0 8px var(--glow)', marginLeft: '0.4rem' }}></span>
            </div>
          ) : (
            <button
              type="button"
              className="role-chip-indicator role-chip--guest"
              onClick={() => setIsRoleGateOpen(true)}
              style={{ whiteSpace: 'nowrap', alignItems: 'center', gap: '0.5rem' }}
            >
              <span>👤</span>
              <span>{lang === 'hi' ? 'भूमिका चुनें' : 'Choose Role'}</span>
            </button>
          )}

          {/* Settings Menu (compact, far right) */}
          <div style={{ whiteSpace: 'nowrap', alignItems: 'center', gap: '0.3rem', display: 'flex' }} role="menu" aria-label="Settings">
            <button
              type="button"
              className="chip chip--compact"
              onClick={onToggleLang}
              aria-label={lang === 'en' ? 'Switch to Hindi' : 'Switch to English'}
              title={lang === 'en' ? 'हिंदी में बदलें' : 'Switch to English'}
            >
              <span aria-hidden="true" style={{ fontWeight: 800 }}>{lang === 'en' ? 'हि' : 'EN'}</span>
            </button>

            <button
              type="button"
              className={`chip chip--compact ${pref === 'off' && !reduced ? 'chip--on' : ''}`}
              onClick={toggleMotionPref}
              aria-label={
                pref === 'auto'
                  ? reduced
                    ? 'Reduced animations active. Click for full.'
                    : 'Full animations active. Click to reduce.'
                  : 'Full animations active. Click to reduce.'
              }
              title={
                pref === 'auto'
                  ? reduced
                    ? 'Animations reduced (system setting)'
                    : 'Click to reduce animations'
                  : 'Full animations enabled'
              }
            >
              <span aria-hidden="true">{pref === 'off' && !reduced ? '✨' : '🐢'}</span>
            </button>

            <button
              type="button"
              className="chip chip--compact"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <span aria-hidden="true">{theme === 'dark' ? '🌙' : '☀️'}</span>
            </button>

            {/* Sync Status Dot (compact) */}
            <SyncStatusChip />

            {/* Dev DB Inspector (Shown ONLY when import.meta.env.DEV is true) */}
            {import.meta.env.DEV && (
              <button
                type="button"
                className="chip chip--compact chip--dev"
                onClick={() => setIsDevOpen(true)}
                title="Inspect IndexedDB raw records (Dev only)"
              >
                <span aria-hidden="true">🛠️</span>
                <span className="chip-text">DB</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* 1. Hero Section */}
        <Hero
          onStartPractice={onStartPractice}
          onOpenTeacherDashboard={onOpenTeacherDashboard}
          lang={lang}
        />

        {/* 2. Try-it Misconception Widget (Real Engine) */}
        <MisconceptionShowcase
          lang={lang}
          onStartPractice={onStartPractice}
        />

        {/* 3. The Problem (3 Compact Cards) */}
        <ProblemSection lang={lang} />

        {/* 4. How it Works (Learn, Solve, Test) */}
        <HowItWorksSection
          lang={lang}
          onStartPractice={onStartPractice}
        />

        {/* 5. Features Grid (For Students & For Teachers) */}
        <FeaturesGrid lang={lang} />

        {/* 6. The 3 Pillars (Student Trajectories, DAG, Teacher Cohort) */}
        <PillarsShowcase lang={lang} />

        {/* 7. Built for India (Bilingual, Offline, Shared Phone, Low Data) */}
        <BuiltForIndiaSection lang={lang} />

        {/* 8. Role-based Final CTA */}
        <FinalCTA
          onStartPractice={onStartPractice}
          onOpenTeacherDashboard={onOpenTeacherDashboard}
          lang={lang}
        />
      </main>

      {/* 9. Site Footer */}
      <Footer lang={lang} onOpenDev={() => setIsDevOpen(true)} />

      {/* Role Gate Modal */}
      <RoleGateModal
        isOpen={isRoleGateOpen}
        onClose={() => setIsRoleGateOpen(false)}
        lang={lang}
        onSelectRole={handleSelectRole}
      />

      {/* Dev Inspector Modal */}
      <DevInspectorModal
        isOpen={isDevOpen}
        onClose={() => setIsDevOpen(false)}
      />
    </>
  )
}

export default LandingPage
