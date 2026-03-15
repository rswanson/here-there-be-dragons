import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useSessionStore } from '../state/session'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const setUser = useSessionStore((s) => s.setUser)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      const res = await api.auth.login({ email, password })
      setUser((res as any).user)
      navigate('/campaigns')
    } catch (err) {
      setError((err as any).message || 'Login failed')
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: '4rem auto', padding: 'var(--space-lg)' }}>
      <h1>Login</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        <label>
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            style={{ width: '100%', padding: 'var(--space-sm)', marginTop: 'var(--space-xs)' }}
          />
        </label>
        <label>
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={{ width: '100%', padding: 'var(--space-sm)', marginTop: 'var(--space-xs)' }}
          />
        </label>
        {error && <p role="alert" style={{ color: 'var(--color-error)' }}>{error}</p>}
        <button type="submit">Login</button>
      </form>
      <p style={{ marginTop: 'var(--space-md)' }}>
        No account? <Link to="/register">Register</Link>
      </p>
    </div>
  )
}
