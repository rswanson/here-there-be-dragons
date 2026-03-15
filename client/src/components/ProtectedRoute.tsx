import { useEffect, useRef, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useSessionStore } from '../state/session'
import { api } from '../api/client'

export function ProtectedRoute() {
  const user = useSessionStore((s) => s.user)
  const setUser = useSessionStore((s) => s.setUser)
  const [checked, setChecked] = useState(false)
  const checking = useRef(false)

  useEffect(() => {
    if (!user && !checking.current) {
      checking.current = true
      api.auth.me()
        .then((res) => setUser(res.user))
        .catch(() => setUser(null))
        .finally(() => {
          checking.current = false
          setChecked(true)
        })
    }
  }, [user, setUser])

  if (user) return <Outlet />
  if (!checked) return <p>Loading...</p>

  return <Navigate to="/login" replace />
}
