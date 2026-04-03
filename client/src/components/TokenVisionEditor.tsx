import { useState } from 'react'
import { useTokenStore } from '../state/tokens'
import { wsClient } from '../api/ws'
import type { Token } from '../types/Token'

const inputStyle = {
  background: 'var(--color-bg, #1a1a2e)',
  border: '1px solid var(--color-border, #444)',
  borderRadius: 4,
  color: 'var(--color-text, #e0e0e0)',
  padding: '4px 6px',
  fontSize: 12,
  width: '100%',
} as const

interface TokenVisionEditorFormProps {
  token: Token
}

function TokenVisionEditorForm({ token }: TokenVisionEditorFormProps) {
  const [hasVision, setHasVision] = useState(token.has_vision)
  const [visionRange, setVisionRange] = useState(String(token.vision_range))
  const [darkvisionRange, setDarkvisionRange] = useState(String(token.darkvision_range))
  const [lightBright, setLightBright] = useState(String(token.light_bright))
  const [lightDim, setLightDim] = useState(String(token.light_dim))

  const sendUpdate = (patch: Record<string, unknown>) => {
    wsClient.send({
      type: 'UpdateToken',
      payload: {
        token_id: token.id,
        patch: {
          name: null,
          asset_id: null,
          owner_id: null,
          x: null,
          y: null,
          size: null,
          rotation: null,
          bars: null,
          status_markers: null,
          has_vision: null,
          vision_range: null,
          darkvision_range: null,
          light_bright: null,
          light_dim: null,
          ...patch,
        },
      },
    })
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      borderTop: '1px solid var(--color-border, #444)',
      paddingTop: 8, marginTop: 4,
    }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
        Vision & Light
      </span>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
        <input
          type="checkbox"
          checked={hasVision}
          onChange={(e) => {
            setHasVision(e.target.checked)
            sendUpdate({ has_vision: e.target.checked })
          }}
        />
        Has Vision
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>Vision Range (cells)</span>
        <input
          type="number" min={0} step={1}
          value={visionRange}
          onChange={(e) => setVisionRange(e.target.value)}
          onBlur={() => sendUpdate({ vision_range: Number(visionRange) || 0 })}
          style={inputStyle}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>Darkvision Range (cells)</span>
        <input
          type="number" min={0} step={1}
          value={darkvisionRange}
          onChange={(e) => setDarkvisionRange(e.target.value)}
          onBlur={() => sendUpdate({ darkvision_range: Number(darkvisionRange) || 0 })}
          style={inputStyle}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>Bright Light (cells)</span>
        <input
          type="number" min={0} step={1}
          value={lightBright}
          onChange={(e) => setLightBright(e.target.value)}
          onBlur={() => sendUpdate({ light_bright: Number(lightBright) || 0 })}
          style={inputStyle}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>Dim Light (cells)</span>
        <input
          type="number" min={0} step={1}
          value={lightDim}
          onChange={(e) => setLightDim(e.target.value)}
          onBlur={() => sendUpdate({ light_dim: Number(lightDim) || 0 })}
          style={inputStyle}
        />
      </label>
    </div>
  )
}

export function TokenVisionEditor() {
  const tokens = useTokenStore((s) => s.tokens)
  const selectedIds = useTokenStore((s) => s.selectedIds)

  const selectedToken: Token | null =
    selectedIds.length === 1 ? (tokens.find((t) => t.id === selectedIds[0]) ?? null) : null

  if (!selectedToken) return null

  return <TokenVisionEditorForm key={selectedToken.id} token={selectedToken} />
}
