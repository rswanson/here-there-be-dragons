import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { mapsApi } from '../api/maps'
import { charactersApi } from '../api/characters'
import { wsClient } from '../api/ws'
import { createMessageDispatcher } from '../api/dispatcher'
import { CanvasView } from '../canvas/CanvasView'
import { Toolbar } from '../components/Toolbar'
import { LayerPanel } from '../components/LayerPanel'
import { TokenInspector } from '../components/TokenInspector'
import { MapSettings } from '../components/MapSettings'
import { TokenContextMenu } from '../components/TokenContextMenu'
import { SidebarTabs } from '../components/SidebarTabs'
import { useMapStore } from '../state/map'
import { useTokenStore } from '../state/tokens'
import { useDrawingStore } from '../state/drawings'
import { useCharacterStore } from '../state/characters'
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

  // Load characters for this campaign
  useEffect(() => {
    if (!id) return
    let cancelled = false
    charactersApi.list(id).then((characters) => {
      if (!cancelled) useCharacterStore.getState().loadCharacters(characters)
    })
    return () => {
      cancelled = true
    }
  }, [id])

  // Keep a ref to selectedMapId for the reconnect callback
  const selectedMapIdRef = useRef(selectedMapId)
  useEffect(() => {
    selectedMapIdRef.current = selectedMapId
  }, [selectedMapId])

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

  // WebSocket connection lifecycle
  useEffect(() => {
    if (!id) return

    const dispatch = createMessageDispatcher()
    const unsub = wsClient.subscribe(dispatch)

    wsClient.connect(id, () => {
      // Reconnect handler: reload current map state
      const mapId = selectedMapIdRef.current
      if (mapId) {
        mapsApi.getState(mapId).then((data) => {
          loadMap(data.map, data.layers)
          loadTokens(data.tokens)
          loadDrawings(data.drawings)
        })
      }
    })

    return () => {
      unsub()
      wsClient.disconnect()
    }
  }, [id, loadMap, loadTokens, loadDrawings])

  // When map is selected, load full state via composite endpoint
  useEffect(() => {
    if (!selectedMapId) return
    let cancelled = false
    mapsApi.getState(selectedMapId).then((data) => {
      if (cancelled) return
      loadMap(data.map, data.layers)
      loadTokens(data.tokens)
      loadDrawings(data.drawings)
    })
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
          overflow: 'hidden',
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
                &larr; Back
              </button>
            </div>
            <MapSettings />
          </>
        ) : (
          <>
            {/* Campaign header — always visible above tabs */}
            <div
              style={{
                padding: 'var(--space-md)',
                borderBottom: '1px solid var(--color-border, #333)',
                flexShrink: 0,
              }}
            >
              <h2 style={{ margin: '0 0 4px' }}>{campaign.name}</h2>
              <p
                style={{
                  color: 'var(--color-text-secondary)',
                  fontSize: 'var(--font-size-sm)',
                  margin: 0,
                }}
              >
                Invite code: {campaign.invite_code}
              </p>
            </div>

            <SidebarTabs
              campaignId={id!}
              maps={maps}
              selectedMapId={selectedMapId}
              onMapSelect={setSelectedMapId}
              onCreateMap={() => createMapMutation.mutate()}
              isCreatingMap={createMapMutation.isPending}
              onShowMapSettings={() => setShowMapSettings(true)}
              assetBrowserOpen={assetBrowserOpen}
              onAssetBrowserOpenChange={setAssetBrowserOpen}
            />
          </>
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
