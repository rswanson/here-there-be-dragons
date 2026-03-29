import { Outlet, Link } from 'react-router-dom'
import { useSessionStore } from '../state/session'
import { api } from '../api/client'
import { ConnectionStatus } from './ConnectionStatus'

export function Layout() {
  const user = useSessionStore((s) => s.user)
  const setUser = useSessionStore((s) => s.setUser)

  const handleLogout = async () => {
    await api.auth.logout()
    setUser(null)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        role="banner"
        style={{
          padding: 'var(--space-sm) var(--space-md)',
          background: 'var(--color-bg-secondary)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Link to="/campaigns" style={{ fontWeight: 'bold', fontSize: 'var(--font-size-lg)' }}>
          Here There Be Dragons
        </Link>
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
            <ConnectionStatus />
            <span>{user.display_name}</span>
            <button onClick={handleLogout}>Logout</button>
          </div>
        )}
      </header>
      <main id="main-content" role="main" style={{ flex: 1 }}>
        <Outlet />
      </main>
    </div>
  )
}
