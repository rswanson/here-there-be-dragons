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
import { WallToolbar } from '../components/WallToolbar'
import { TokenVisionEditor } from '../components/TokenVisionEditor'
import { VisionPanel } from '../components/VisionPanel'
import { FogTool } from '../components/FogTool'
import { MapSettings } from '../components/MapSettings'
import { TokenContextMenu } from '../components/TokenContextMenu'
import { SidebarTabs } from '../components/SidebarTabs'
import { InitiativePanel } from '../components/InitiativePanel'
import { useMapStore } from '../state/map'
import { useTokenStore } from '../state/tokens'
import { useDrawingStore } from '../state/drawings'
import { useCharacterStore } from '../state/characters'
import { useInitiativeStore } from '../state/initiative'
import { useSessionStore } from '../state/session'
import { usePresenceStore } from '../state/presence'
import type { Token } from '../types/Token'
import type { NewCombatant } from '../types/NewCombatant'

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
  const [showStartCombat, setShowStartCombat] = useState(false)
  const [startCombatName, setStartCombatName] = useState('')
  const [startCombatValue, setStartCombatValue] = useState('')
  const [startCombatExtras, setStartCombatExtras] = useState<NewCombatant[]>([])

  const encounter = useInitiativeStore((s) => s.encounter)
  const user = useSessionStore((s) => s.user)
  const connectedUsers = usePresenceStore((s) => s.connectedUsers)
  const isDm = user
    ? connectedUsers.find((u) => u.user_id === user.id)?.role === 'dm'
    : false

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

  const characters = useCharacterStore((s) => s.characters)

  const handleAddStartEntry = () => {
    const name = startCombatName.trim()
    const value = parseInt(startCombatValue, 10)
    if (!name || isNaN(value)) return
    setStartCombatExtras((prev) => [
      ...prev,
      { character_id: null, name, initiative_value: value },
    ])
    setStartCombatName('')
    setStartCombatValue('')
  }

  const handleStartEncounter = () => {
    wsClient.send({
      type: 'StartEncounter',
      payload: { combatants: startCombatExtras },
    })
    setShowStartCombat(false)
    setStartCombatExtras([])
    setStartCombatName('')
    setStartCombatValue('')
  }

  if (isLoading) return <p style={{ padding: 'var(--space-lg)' }}>Loading...</p>
  if (!campaign)
    return <p style={{ padding: 'var(--space-lg)' }}>Campaign not found.</p>

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 50px)', overflow: 'hidden' }}>
      {/* Canvas area with overlaid panels */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <CanvasView />
        <Toolbar />
        <LayerPanel />
        <TokenInspector />
        {isDm && <TokenVisionEditor />}
        {isDm && <WallToolbar />}
        {isDm && (
          <div style={{
            position: 'absolute', left: 8, bottom: 8,
            background: 'var(--color-surface, #2a2a3e)', borderRadius: 8,
            padding: 6, zIndex: 10,
          }}>
            <FogTool />
          </div>
        )}
        {isDm && <VisionPanel />}
        <InitiativePanel />

        {/* Start Combat button / form — DM only, shown when no active encounter */}
        {isDm && !encounter && (
          <div
            style={{
              position: 'absolute',
              bottom: 12,
              left: 12,
              zIndex: 10,
              background: 'var(--color-surface, #2a2a3e)',
              borderRadius: 8,
              padding: showStartCombat ? 8 : 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {showStartCombat ? (
              <>
                <h4
                  style={{
                    margin: '0 0 4px',
                    fontSize: 12,
                    color: 'var(--color-text, #e0e0e0)',
                    borderBottom: '1px solid var(--color-border, #444)',
                    paddingBottom: 4,
                  }}
                >
                  Start Combat
                </h4>

                {/* Character checkboxes */}
                {characters.length > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                      maxHeight: 120,
                      overflowY: 'auto',
                    }}
                  >
                    {characters.map((c) => {
                      const already = startCombatExtras.some(
                        (e) => e.character_id === c.id,
                      )
                      return (
                        <label
                          key={c.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 11,
                            color: 'var(--color-text, #e0e0e0)',
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={already}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setStartCombatExtras((prev) => [
                                  ...prev,
                                  {
                                    character_id: c.id,
                                    name: c.name,
                                    initiative_value: 0,
                                  },
                                ])
                              } else {
                                setStartCombatExtras((prev) =>
                                  prev.filter((x) => x.character_id !== c.id),
                                )
                              }
                            }}
                          />
                          {c.name}
                        </label>
                      )
                    })}
                  </div>
                )}

                {/* Manual entry row */}
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    type="text"
                    placeholder="Name"
                    value={startCombatName}
                    onChange={(e) => setStartCombatName(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '3px 5px',
                      borderRadius: 4,
                      border: '1px solid var(--color-border, #444)',
                      background: 'var(--color-bg, #1a1a2e)',
                      color: 'var(--color-text, #e0e0e0)',
                      fontSize: 11,
                    }}
                  />
                  <input
                    type="number"
                    placeholder="Init"
                    value={startCombatValue}
                    onChange={(e) => setStartCombatValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddStartEntry()
                    }}
                    style={{
                      width: 44,
                      padding: '3px 5px',
                      borderRadius: 4,
                      border: '1px solid var(--color-border, #444)',
                      background: 'var(--color-bg, #1a1a2e)',
                      color: 'var(--color-text, #e0e0e0)',
                      fontSize: 11,
                    }}
                  />
                  <button
                    onClick={handleAddStartEntry}
                    style={{
                      padding: '3px 7px',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 11,
                      background: 'var(--color-primary, #6366f1)',
                      color: '#fff',
                    }}
                  >
                    +
                  </button>
                </div>

                {/* Preview of combatants to add */}
                {startCombatExtras.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {startCombatExtras.map((entry, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 11,
                          color: 'var(--color-text-secondary, #888)',
                        }}
                      >
                        <span style={{ flex: 1 }}>{entry.name}</span>
                        <span>{entry.initiative_value}</span>
                        <button
                          onClick={() =>
                            setStartCombatExtras((prev) =>
                              prev.filter((_, j) => j !== i),
                            )
                          }
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#f87171',
                            cursor: 'pointer',
                            fontSize: 11,
                            padding: '0 2px',
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={handleStartEncounter}
                    style={{
                      flex: 1,
                      padding: '4px 8px',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 12,
                      background: 'var(--color-primary, #6366f1)',
                      color: '#fff',
                    }}
                  >
                    Start
                  </button>
                  <button
                    onClick={() => {
                      setShowStartCombat(false)
                      setStartCombatExtras([])
                      setStartCombatName('')
                      setStartCombatValue('')
                    }}
                    style={{
                      padding: '4px 8px',
                      border: '1px solid var(--color-border, #444)',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 12,
                      background: 'transparent',
                      color: 'var(--color-text-secondary, #888)',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={() => setShowStartCombat(true)}
                style={{
                  padding: '6px 12px',
                  border: '1px solid var(--color-border, #444)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 12,
                  background: 'var(--color-surface, #2a2a3e)',
                  color: 'var(--color-text, #e0e0e0)',
                }}
              >
                Start Combat
              </button>
            )}
          </div>
        )}
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
            <div
              style={{
                padding: 'var(--space-md)',
                borderBottom: '1px solid var(--color-border, #333)',
              }}
            >
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
