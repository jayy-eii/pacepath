import { useParams, useNavigate } from 'react-router-dom'
import { TeacherDashboardModal } from '../components/TeacherDashboardModal'
import type { Language } from '../types'

interface TeacherWorkspacePageProps {
  lang: Language
  onToggleLang?: () => void
}

export function TeacherWorkspacePage({ lang }: TeacherWorkspacePageProps) {
  const navigate = useNavigate()
  const { tab } = useParams<{ tab?: string }>()

  const handleClose = () => {
    navigate('/')
  }

  const handleTabChange = (newTab: string) => {
    navigate(`/teacher/${newTab}`)
  }

  return (
    <div className="teacher-workspace-page-wrapper">
      <TeacherDashboardModal
        isOpen={true}
        onClose={handleClose}
        lang={lang}
        initialTab={tab}
        isFullPage={true}
        onTabChange={handleTabChange}
      />
    </div>
  )
}

export default TeacherWorkspacePage
