import { Navigate, useLocation } from 'react-router-dom'
import { getActiveRole, type AppRole } from '../services/roleSession'
import type { ReactNode } from 'react'

interface RoleGuardProps {
  requiredRole: AppRole
  children: ReactNode
}

/**
 * Route guard that enforces role isolation:
 * - Students cannot access teacher routes (redirects to /student).
 * - Teachers cannot access student routes (redirects to /teacher/overview).
 * - If no role is active yet, automatically aligns the role to the accessed section.
 */
export function RoleGuard({ requiredRole, children }: RoleGuardProps) {
  const activeRole = getActiveRole()
  const location = useLocation()

  // Strict role mismatch: student cannot open teacher routes, teacher cannot open student routes
  if (activeRole === 'student' && requiredRole === 'teacher') {
    return <Navigate to="/student" replace state={{ from: location }} />
  }

  if (activeRole === 'teacher' && requiredRole === 'student') {
    return <Navigate to="/teacher/overview" replace state={{ from: location }} />
  }

  return <>{children}</>
}
