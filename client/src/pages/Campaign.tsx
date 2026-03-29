import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { mapsApi } from '../api/maps'
import { CanvasView } from '../canvas/CanvasView'
import { AssetBrowser } from '../components/AssetBrowser'
import { Toolbar } from '../components/Toolbar'
import { LayerPanel } from '../components/LayerPanel'
import { TokenInspector } from '../components/TokenInspector'
import { MapSettings } from '../components/MapSettings'
import { TokenContextMenu } from '../components/TokenContextMenu'
import { useMapStore } from '../state/map'
import { useTokenStore } from '../state/tokens'
import { useDrawingStore } from '../state/drawings'
import type { Token } from '../types/Token'

interface ContextMenuState {
  token: Token
  x: number
  y: number
}

export function Campaign() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [assetBrowserOpen, setAssetBrowserOpen] = useState(false)
  const [showMapSettings, setShowMapSettings] = useState(false)
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  const loadMap = useMapStore((s) => s.loadMap)
  const loadTokens = useTokenStore((s) => s.loadTokens)
  const loadDrawings = useDrawingStore((s) => s.loadDrawings)

  const { data: campaign, isLoading } = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => api.campaigns.get(id!),
    enabled: !!id,
  })

  const { data: maps } = useQuery({
    queryKey: ['maps', id],
    queryFn: () => mapsApi.list(id!),
    enabled: !!id,
  })

  const createMapMutation = useMutation({
    mutationFn: () =>
      mapsApi.create(id!, {
        name: 'New Map',
        grid_enabled: true,
        grid_size_px: 64,
        grid_scale: 5,
        width_squares: 30,
        height_squares: 20,
      }),
    onSuccess: (newMap) => {
      void queryClient.invalidateQueries({ queryKey: ['maps', id] })
      setSelectedMapId(newMap.id)
    },
  })

  // When map is selected, load it into stores
  useEffect(() => {
    if (!selectedMapId) return
    let cancelled = false
    const load = async () => {
      const mapData = await mapsApi.get(selectedMapId)
      if (cancelled) return
      const { layers, ...mapFields } = mapData
      loadMap(mapFields, layers)
      // Tokens and drawings APIs don't have list endpoints yet — start empty
      loadTokens([])
      loadDrawings([])
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [selectedMapId, loadMap, loadTokens, loadDrawings])

  if (isLoading) return <p style={{ padding: 'var(--space-lg)' }}>Loading...</p>
  if (!campaign) return <p style={{ padding: 'var(--space-lg)' }}>Campaign not found.</p>

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 50px)', overflow: 'hidden' }}>
      {/* Canvas area with overlaid Toolbar */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <CanvasView />
        <Toolbar />
        <LayerPanel />
        <TokenInspector />
      </div>

      {/* Sidebar */}
      <aside
        role="complementary"
        aria-label="Campaign sidebar"
        style={{
          width: 280,
          background: 'var(--color-bg-secondary)',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          borderLeft: '1px solid var(--color-border, #333)',
        }}
      >
        {showMapSettings ? (
          <>
            <div style={{ padding: 'var(--space-md)', borderBottom: '1px solid var(--color-border, #333)' }}>
              <button
                onClick={() => setShowMapSettings(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  fontSize: 'var(--font-size-sm)',
                  padding: 0,
                }}
              >
                ← Back
              </button>
            </div>
            <MapSettings />
          </>
        ) : (
          <div style={{ padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {/* Campaign info */}
            <div>
              <h2 style={{ margin: '0 0 4px' }}>{campaign.name}</h2>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', margin: 0 }}>
                Invite code: {campaign.invite_code}
              </p>
            </div>

            {/* Map selector */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label
                  htmlFor="map-selector"
                  style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', fontWeight: 600 }}
                >
                  Map
                </label>
                <button
                  onClick={() => createMapMutation.mutate()}
                  disabled={createMapMutation.isPending}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--color-border, #444)',
                    borderRadius: 4,
                    color: 'var(--color-text)',
                    cursor: createMapMutation.isPending ? 'not-allowed' : 'pointer',
                    fontSize: 11,
                    padding: '2px 8px',
                  }}
                >
                  {createMapMutation.isPending ? 'Creating…' : '+ New Map'}
                </button>
              </div>
              <select
                id="map-selector"
                value={selectedMapId ?? ''}
                onChange={(e) => setSelectedMapId(e.target.value || null)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  background: 'var(--color-bg, #1a1a2e)',
                  border: '1px solid var(--color-border, #444)',
                  borderRadius: 4,
                  color: 'var(--color-text)',
                  fontSize: 'var(--font-size-sm)',
                }}
              >
                <option value="">— Select a map —</option>
                {maps?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Map Settings button (DM only — always show for now) */}
            {selectedMapId && (
              <button
                onClick={() => setShowMapSettings(true)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--color-border, #444)',
                  borderRadius: 4,
                  color: 'var(--color-text)',
                  cursor: 'pointer',
                  fontSize: 'var(--font-size-sm)',
                  padding: '6px 12px',
                  textAlign: 'left',
                }}
              >
                ⚙ Map Settings
              </button>
            )}

            {/* Asset Library */}
            <button
              onClick={() => setAssetBrowserOpen(true)}
              style={{
                background: 'transparent',
                border: '1px solid var(--color-border, #444)',
                borderRadius: 4,
                color: 'var(--color-text)',
                cursor: 'pointer',
                fontSize: 'var(--font-size-sm)',
                padding: '6px 12px',
                textAlign: 'left',
              }}
            >
              Asset Library
            </button>
            <AssetBrowser campaignId={id!} open={assetBrowserOpen} onOpenChange={setAssetBrowserOpen} />
          </div>
        )}
      </aside>

      {/* Token context menu */}
      {contextMenu && (
        <TokenContextMenu
          token={contextMenu.token}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
