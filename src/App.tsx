import { lazy, Suspense, useEffect, useState } from 'react'
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from 'react-router-dom'
import { useMotionSettings, useReducedMotionPref } from './motion/reducedMotion'
import { initDevConsole } from './services/devConsole'
import { initSyncEngine } from './services/syncEngine'
import {
  getActiveRole,
  setActiveRole,
  switchRoleOrLogout,
  subscribeActiveRole,
  type AppRole,
} from './services/roleSession'
import { RoleGuard } from './components/RoleGuard'
import type { Language } from './types'

// Route-level code splitting with React.lazy
const LandingPage = lazy(() => import('./pages/LandingPage'))
const StudentWorkspacePage = lazy(() => import('./pages/StudentWorkspacePage'))
const TeacherWorkspacePage = lazy(() => import('./pages/TeacherWorkspacePage'))

/** Skeleton shimmer fallback — never flashes a blank screen while a chunk loads */
function RouteLoadingFallback() {
  return (
    <div className="scene-skeleton" aria-hidden="true" style={{ minHeight: '100vh', padding: '3rem' }}>
      <div className="shimmer shimmer-line" style={{ width: '60%', height: '24px', margin: '0 auto 1.5rem' }} />
      <div className="shimmer shimmer-block" style={{ width: '85%', height: '360px', margin: '0 auto' }} />
    </div>
  )
}

type Theme = 'dark' | 'light'

function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme')
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  })
  useEffect(() => {
    document.documentElement.classList.toggle('theme-light', theme === 'light')
    localStorage.setItem('theme', theme)
  }, [theme])
  return { theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) }
}

function AppRoutes() {
  const navigate = useNavigate()
  const { theme, toggle: toggleTheme } = useTheme()
  const { pref, setPref } = useMotionSettings()
  const reduced = useReducedMotionPref()

  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem('pacepath_lang')
    return saved === 'hi' ? 'hi' : 'en'
  })

  const toggleLang = () => {
    setLang((prev) => {
      const next = prev === 'en' ? 'hi' : 'en'
      localStorage.setItem('pacepath_lang', next)
      return next
    })
  }

  const [isDevOpen, setIsDevOpen] = useState(false)
  const [activeRole, setActiveRoleState] = useState<AppRole | null>(() => getActiveRole())
  const [isRoleGateOpen, setIsRoleGateOpen] = useState(false)

  useEffect(() => {
    return subscribeActiveRole((role) => {
      setActiveRoleState(role)
    })
  }, [])

  const handleSelectRole = (role: AppRole) => {
    setActiveRole(role)
    setIsRoleGateOpen(false)
    if (role === 'student') {
      navigate('/student')
    } else if (role === 'teacher') {
      navigate('/teacher/overview')
    }
  }

  const handleSwitchRole = () => {
    switchRoleOrLogout()
    navigate('/')
    setIsRoleGateOpen(true)
  }

  const openStudentPractice = () => {
    if (activeRole !== 'student') {
      setActiveRole('student')
    }
    navigate('/student/practice')
  }

  const openTeacherDashboard = () => {
    if (activeRole !== 'teacher') {
      setActiveRole('teacher')
    }
    navigate('/teacher/overview')
  }

  const toggleMotionPref = () => setPref(pref === 'auto' ? 'off' : 'auto')

  // Glass blur + shrink on topnav once scrolled
  useEffect(() => {
    const onScroll = () => {
      document.querySelector('.topnav')?.classList.toggle('scrolled', window.scrollY > 24)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Mirror effective reduced-motion preference onto <html>
  useEffect(() => {
    document.documentElement.classList.toggle('theme-reduce', reduced)
  }, [reduced])

  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        {/* Landing Page */}
        <Route
          path="/"
          element={
            <LandingPage
              lang={lang}
              onToggleLang={toggleLang}
              theme={theme}
              toggleTheme={toggleTheme}
              pref={pref}
              toggleMotionPref={toggleMotionPref}
              reduced={reduced}
              activeRole={activeRole}
              onStartPractice={openStudentPractice}
              onOpenTeacherDashboard={openTeacherDashboard}
              handleSwitchRole={handleSwitchRole}
              isRoleGateOpen={isRoleGateOpen}
              setIsRoleGateOpen={setIsRoleGateOpen}
              handleSelectRole={handleSelectRole}
              isDevOpen={isDevOpen}
              setIsDevOpen={setIsDevOpen}
            />
          }
        />

        {/* Student Workspace Routes with Role Guard */}
        <Route
          path="/student"
          element={
            <RoleGuard requiredRole="student">
              <StudentWorkspacePage
                lang={lang}
                onToggleLang={toggleLang}
                theme={theme}
                toggleTheme={toggleTheme}
              />
            </RoleGuard>
          }
        />
        <Route
          path="/student/:subpage"
          element={
            <RoleGuard requiredRole="student">
              <StudentWorkspacePage
                lang={lang}
                onToggleLang={toggleLang}
                theme={theme}
                toggleTheme={toggleTheme}
              />
            </RoleGuard>
          }
        />

        {/* Teacher Workspace Routes with Role Guard */}
        <Route
          path="/teacher"
          element={<Navigate to="/teacher/overview" replace />}
        />
        <Route
          path="/teacher/:tab"
          element={
            <RoleGuard requiredRole="teacher">
              <TeacherWorkspacePage
                lang={lang}
                onToggleLang={toggleLang}
              />
            </RoleGuard>
          }
        />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  // Initialize dev console and sync engine once
  useEffect(() => {
    initDevConsole()
    const cleanupSync = initSyncEngine()
    return () => cleanupSync()
  }, [])

  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
