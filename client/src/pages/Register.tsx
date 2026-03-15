import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useSessionStore } from '../state/session'

export function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const setUser = useSessionStore((s) => s.setUser)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      const res = await api.auth.register({ email, password, display_name: displayName })
      setUser((res as any).user)
      navigate('/campaigns')
    } catch (err) {
      setError((err as any).message || 'Registration failed')
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: '4rem auto', padding: 'var(--space-lg)' }}>
      <h1>Register</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        <label>
          <span>Display Name</span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            autoComplete="name"
            style={{ width: '100%', padding: 'var(--space-sm)', marginTop: 'var(--space-xs)' }}
          />
        </label>
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
            minLength={8}
            autoComplete="new-password"
            style={{ width: '100%', padding: 'var(--space-sm)', marginTop: 'var(--space-xs)' }}
          />
        </label>
        {error && <p role="alert" style={{ color: 'var(--color-error)' }}>{error}</p>}
        <button type="submit">Register</button>
      </form>
      <p style={{ marginTop: 'var(--space-md)' }}>
        Already have an account? <Link to="/login">Login</Link>
      </p>
    </div>
  )
}
