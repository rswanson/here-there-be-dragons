import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useSessionStore } from '../state/session'
import { api } from '../api/client'

export function ProtectedRoute() {
  const user = useSessionStore((s) => s.user)
  const setUser = useSessionStore((s) => s.setUser)
  const [loading, setLoading] = useState(!user)

  useEffect(() => {
    if (!user) {
      api.auth.me()
        .then((res) => setUser((res as any).user))
        .catch(() => setUser(null))
        .finally(() => setLoading(false))
    }
  }, [user, setUser])

  if (loading) return <p>Loading...</p>
  if (!user) return <Navigate to="/login" replace />

  return <Outlet />
}
