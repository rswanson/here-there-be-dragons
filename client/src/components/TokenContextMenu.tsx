import { useEffect, useRef, useState } from 'react'
import { useTokenStore } from '../state/tokens'
import { useMapStore } from '../state/map'
import { tokensApi } from '../api/tokens'
import type { Token } from '../types/Token'

interface TokenContextMenuProps {
  token: Token
  x: number
  y: number
  onClose: () => void
}

const menuItemStyle: React.CSSProperties = {
  padding: '6px 12px',
  cursor: 'pointer',
  borderRadius: 4,
  fontSize: 13,
  color: 'var(--color-text, #e0e0e0)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  userSelect: 'none',
}

const SIZES = [1, 2, 3, 4] as const

export function TokenContextMenu({ token, x, y, onClose }: TokenContextMenuProps) {
  const removeToken = useTokenStore((s) => s.removeToken)
  const addToken = useTokenStore((s) => s.addToken)
  const updateToken = useTokenStore((s) => s.updateToken)
  const selectToken = useTokenStore((s) => s.selectToken)
  const layers = useMapStore((s) => s.layers)
  const ref = useRef<HTMLDivElement>(null)
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [activeSubmenu, setActiveSubmenu] = useState<'layer' | 'size' | null>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const handleEdit = () => {
    selectToken(token.id)
    onClose()
  }

  const handleDuplicate = async () => {
    try {
      const resp = await tokensApi.create(token.layer_id, {
        name: `${token.name} (copy)`,
        x: token.x + 1,
        y: token.y + 1,
        size: token.size,
        rotation: token.rotation,
        asset_id: token.asset_id,
        owner_id: token.owner_id,
        bars: token.bars,
        status_markers: token.status_markers,
        has_vision: false,
        vision_range: 0,
        darkvision_range: 0,
        light_bright: 0,
        light_dim: 0,
      })
      addToken(resp)
    } catch {
      /* ignore */
    }
    onClose()
  }

  const handleDelete = async () => {
    try {
      await tokensApi.delete(token.id)
      removeToken(token.id)
    } catch {
      /* ignore */
    }
    onClose()
  }

  const handleMoveToLayer = async (layerId: string) => {
    try {
      // layer_id is a valid PATCH field on the server; cast needed because ts-rs
      // generated UpdateTokenRequest does not include it yet.
      const updated = await tokensApi.update(
        token.id,
        // layer_id is a valid PATCH field on the server; ts-rs generated
        // UpdateTokenRequest does not include it yet, so cast through unknown.
        { layer_id: layerId } as unknown as Parameters<typeof tokensApi.update>[1],
      )
      updateToken(token.id, { ...updated, layer_id: layerId })
    } catch {
      /* ignore */
    }
    onClose()
  }

  const handleSetSize = async (size: number) => {
    try {
      const updated = await tokensApi.update(token.id, {
        size,
        name: null,
        asset_id: null,
        owner_id: null,
        x: null,
        y: null,
        rotation: null,
        bars: null,
        status_markers: null,
        has_vision: null,
        vision_range: null,
        darkvision_range: null,
        light_bright: null,
        light_dim: null,
      })
      updateToken(token.id, updated)
    } catch {
      /* ignore */
    }
    onClose()
  }

  const getItemStyle = (id: string): React.CSSProperties => ({
    ...menuItemStyle,
    background: hoveredItem === id ? 'var(--color-primary, #6366f1)' : 'transparent',
    color: hoveredItem === id ? '#fff' : 'var(--color-text, #e0e0e0)',
  })

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: x,
        top: y,
        background: 'var(--color-surface, #2a2a3e)',
        borderRadius: 6,
        padding: 4,
        zIndex: 100,
        minWidth: 160,
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        border: '1px solid var(--color-border, #444)',
      }}
    >
      {/* Edit */}
      <div
        style={getItemStyle('edit')}
        onMouseEnter={() => { setHoveredItem('edit'); setActiveSubmenu(null) }}
        onMouseLeave={() => setHoveredItem(null)}
        onClick={handleEdit}
      >
        Edit
      </div>

      {/* Duplicate */}
      <div
        style={getItemStyle('duplicate')}
        onMouseEnter={() => { setHoveredItem('duplicate'); setActiveSubmenu(null) }}
        onMouseLeave={() => setHoveredItem(null)}
        onClick={handleDuplicate}
      >
        Duplicate
      </div>

      <div style={{ height: 1, background: 'var(--color-border, #444)', margin: '4px 0' }} />

      {/* Move to Layer */}
      <div
        style={{ position: 'relative' }}
        onMouseEnter={() => { setHoveredItem('layer'); setActiveSubmenu('layer') }}
        onMouseLeave={() => { setHoveredItem(null); setActiveSubmenu(null) }}
      >
        <div style={getItemStyle('layer')}>
          Move to Layer
          <span style={{ fontSize: 10, opacity: 0.7 }}>▶</span>
        </div>
        {activeSubmenu === 'layer' && (
          <div
            style={{
              position: 'absolute',
              left: '100%',
              top: 0,
              background: 'var(--color-surface, #2a2a3e)',
              borderRadius: 6,
              padding: 4,
              zIndex: 101,
              minWidth: 140,
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              border: '1px solid var(--color-border, #444)',
            }}
          >
            {layers.length === 0 ? (
              <div style={{ ...menuItemStyle, opacity: 0.5, cursor: 'default' }}>No layers</div>
            ) : (
              layers.map((layer) => {
                const subId = `layer-${layer.id}`
                return (
                  <div
                    key={layer.id}
                    style={{
                      ...menuItemStyle,
                      background: hoveredItem === subId ? 'var(--color-primary, #6366f1)' : 'transparent',
                      color: layer.id === token.layer_id
                        ? 'var(--color-text-secondary, #aaa)'
                        : hoveredItem === subId
                        ? '#fff'
                        : 'var(--color-text, #e0e0e0)',
                      cursor: layer.id === token.layer_id ? 'default' : 'pointer',
                    }}
                    onMouseEnter={() => setHoveredItem(subId)}
                    onMouseLeave={() => setHoveredItem(null)}
                    onClick={() => {
                      if (layer.id !== token.layer_id) void handleMoveToLayer(layer.id)
                    }}
                  >
                    {layer.name}
                    {layer.id === token.layer_id && (
                      <span style={{ fontSize: 10, opacity: 0.6 }}>✓</span>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* Set Size */}
      <div
        style={{ position: 'relative' }}
        onMouseEnter={() => { setHoveredItem('size'); setActiveSubmenu('size') }}
        onMouseLeave={() => { setHoveredItem(null); setActiveSubmenu(null) }}
      >
        <div style={getItemStyle('size')}>
          Set Size
          <span style={{ fontSize: 10, opacity: 0.7 }}>▶</span>
        </div>
        {activeSubmenu === 'size' && (
          <div
            style={{
              position: 'absolute',
              left: '100%',
              top: 0,
              background: 'var(--color-surface, #2a2a3e)',
              borderRadius: 6,
              padding: 4,
              zIndex: 101,
              minWidth: 100,
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              border: '1px solid var(--color-border, #444)',
            }}
          >
            {SIZES.map((size) => {
              const subId = `size-${size}`
              return (
                <div
                  key={size}
                  style={{
                    ...menuItemStyle,
                    background: hoveredItem === subId ? 'var(--color-primary, #6366f1)' : 'transparent',
                    color: token.size === size
                      ? 'var(--color-text-secondary, #aaa)'
                      : hoveredItem === subId
                      ? '#fff'
                      : 'var(--color-text, #e0e0e0)',
                    cursor: token.size === size ? 'default' : 'pointer',
                  }}
                  onMouseEnter={() => setHoveredItem(subId)}
                  onMouseLeave={() => setHoveredItem(null)}
                  onClick={() => {
                    if (token.size !== size) void handleSetSize(size)
                  }}
                >
                  {size}×{size}
                  {token.size === size && (
                    <span style={{ fontSize: 10, opacity: 0.6 }}>✓</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ height: 1, background: 'var(--color-border, #444)', margin: '4px 0' }} />

      {/* Delete */}
      <div
        style={{
          ...getItemStyle('delete'),
          color: hoveredItem === 'delete' ? '#fff' : 'var(--color-danger, #ef4444)',
        }}
        onMouseEnter={() => { setHoveredItem('delete'); setActiveSubmenu(null) }}
        onMouseLeave={() => setHoveredItem(null)}
        onClick={handleDelete}
      >
        Delete
      </div>
    </div>
  )
}
