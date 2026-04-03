import { AssetBrowser } from './AssetBrowser'
import { PlayersOnline } from './PlayersOnline'

interface MapSummary {
  id: string
  name: string
}

interface CampaignTabProps {
  campaignId: string
  maps: MapSummary[] | undefined
  selectedMapId: string | null
  onMapSelect: (mapId: string | null) => void
  onCreateMap: () => void
  isCreatingMap: boolean
  onShowMapSettings: () => void
  assetBrowserOpen: boolean
  onAssetBrowserOpenChange: (open: boolean) => void
}

export function CampaignTab({
  campaignId,
  maps,
  selectedMapId,
  onMapSelect,
  onCreateMap,
  isCreatingMap,
  onShowMapSettings,
  assetBrowserOpen,
  onAssetBrowserOpenChange,
}: CampaignTabProps) {
  return (
    <div style={{ padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
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
            onClick={onCreateMap}
            disabled={isCreatingMap}
            style={{
              background: 'transparent',
              border: '1px solid var(--color-border, #444)',
              borderRadius: 4,
              color: 'var(--color-text)',
              cursor: isCreatingMap ? 'not-allowed' : 'pointer',
              fontSize: 11,
              padding: '2px 8px',
            }}
          >
            {isCreatingMap ? 'Creating\u2026' : '+ New Map'}
          </button>
        </div>
        <select
          id="map-selector"
          value={selectedMapId ?? ''}
          onChange={(e) => onMapSelect(e.target.value || null)}
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
          <option value="">&mdash; Select a map &mdash;</option>
          {maps?.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {/* Map Settings button */}
      {selectedMapId && (
        <button
          onClick={onShowMapSettings}
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
          Map Settings
        </button>
      )}

      {/* Asset Library */}
      <button
        onClick={() => onAssetBrowserOpenChange(true)}
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
      <AssetBrowser campaignId={campaignId} open={assetBrowserOpen} onOpenChange={onAssetBrowserOpenChange} />

      {/* Players Online */}
      <PlayersOnline />
    </div>
  )
}
