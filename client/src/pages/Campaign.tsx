import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { CanvasView } from '../canvas/CanvasView'
import { AssetBrowser } from '../components/AssetBrowser'

export function Campaign() {
  const { id } = useParams<{ id: string }>()
  const [assetBrowserOpen, setAssetBrowserOpen] = useState(false)

  const { data: campaign, isLoading } = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => api.campaigns.get(id!),
    enabled: !!id,
  })

  if (isLoading) return <p style={{ padding: 'var(--space-lg)' }}>Loading...</p>
  if (!campaign) return <p style={{ padding: 'var(--space-lg)' }}>Campaign not found.</p>

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 50px)' }}>
      <div style={{ flex: 1, position: 'relative' }}>
        <CanvasView />
      </div>
      <aside
        role="complementary"
        aria-label="Campaign sidebar"
        style={{
          width: 300,
          background: 'var(--color-bg-secondary)',
          padding: 'var(--space-md)',
          overflowY: 'auto',
        }}
      >
        <h2>{campaign.name}</h2>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          Invite code: {campaign.invite_code}
        </p>
        <button onClick={() => setAssetBrowserOpen(true)}>Asset Library</button>
        <AssetBrowser campaignId={id!} open={assetBrowserOpen} onOpenChange={setAssetBrowserOpen} />
      </aside>
    </div>
  )
}
