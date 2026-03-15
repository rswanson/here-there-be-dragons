import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'

export function Campaigns() {
  const queryClient = useQueryClient()
  const [newName, setNewName] = useState('')
  const [joinCode, setJoinCode] = useState('')

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.campaigns.list(),
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => api.campaigns.create({ name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      setNewName('')
    },
  })

  const joinMutation = useMutation({
    mutationFn: (code: string) => api.campaigns.join(code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      setJoinCode('')
    },
  })

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (newName.trim()) createMutation.mutate(newName.trim())
  }

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault()
    if (joinCode.trim()) joinMutation.mutate(joinCode.trim())
  }

  if (isLoading) return <p style={{ padding: 'var(--space-lg)' }}>Loading...</p>

  return (
    <div style={{ padding: 'var(--space-lg)', maxWidth: 800, margin: '0 auto' }}>
      <h1>Campaigns</h1>

      <section style={{ marginTop: 'var(--space-lg)' }}>
        <h2>Create Campaign</h2>
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Campaign name"
            required
            style={{ flex: 1, padding: 'var(--space-sm)' }}
          />
          <button type="submit">Create</button>
        </form>
      </section>

      <section style={{ marginTop: 'var(--space-lg)' }}>
        <h2>Join Campaign</h2>
        <form onSubmit={handleJoin} style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Invite code"
            required
            style={{ flex: 1, padding: 'var(--space-sm)' }}
          />
          <button type="submit">Join</button>
        </form>
      </section>

      <section style={{ marginTop: 'var(--space-lg)' }}>
        <h2>Your Campaigns</h2>
        {(campaigns as any)?.length === 0 && <p>No campaigns yet.</p>}
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          {(campaigns as any)?.map((c: any) => (
            <li key={c.id}>
              <Link
                to={`/campaigns/${c.id}`}
                style={{
                  display: 'block',
                  padding: 'var(--space-md)',
                  background: 'var(--color-bg-surface)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
