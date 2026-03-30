import * as Tabs from '@radix-ui/react-tabs'
import { CampaignTab } from './CampaignTab'
import { CharacterList } from './CharacterList'
import { CharacterCreateDialog } from './CharacterCreateDialog'
import { CharacterSheet } from './CharacterSheet'
import { ChatTab } from './ChatTab'
import { DocsTab } from './DocsTab'
import { useCharacterStore } from '../state/characters'
import { useState } from 'react'

interface MapSummary {
  id: string
  name: string
}

interface SidebarTabsProps {
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

const triggerStyle: React.CSSProperties = {
  flex: 1,
  textAlign: 'center',
  padding: '8px 0',
  fontSize: 11,
  cursor: 'pointer',
  background: 'transparent',
  border: 'none',
  borderBottom: '2px solid transparent',
  color: 'var(--color-text-secondary)',
  fontFamily: 'inherit',
}

const triggerActiveStyle: React.CSSProperties = {
  color: 'var(--color-text)',
  borderBottomColor: 'var(--color-primary, #6366f1)',
}

const contentStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  minHeight: 0,
}

export function SidebarTabs({
  campaignId,
  maps,
  selectedMapId,
  onMapSelect,
  onCreateMap,
  isCreatingMap,
  onShowMapSettings,
  assetBrowserOpen,
  onAssetBrowserOpenChange,
}: SidebarTabsProps) {
  const activeCharacterId = useCharacterStore((s) => s.activeCharacterId)
  const setActiveCharacter = useCharacterStore((s) => s.setActiveCharacter)
  const [createCharOpen, setCreateCharOpen] = useState(false)

  return (
    <Tabs.Root
      defaultValue="campaign"
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
    >
      <Tabs.List
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--color-border, #333)',
          flexShrink: 0,
        }}
      >
        {(['campaign', 'chat', 'chars', 'docs'] as const).map((tab) => (
          <Tabs.Trigger
            key={tab}
            value={tab}
            style={triggerStyle}
            onFocus={(e) => {
              // Apply active styles via data attribute (handled by Radix)
              // We use inline styles as a fallback
              const el = e.currentTarget
              if (el.dataset.state === 'active') {
                Object.assign(el.style, triggerActiveStyle)
              }
            }}
            ref={(el) => {
              if (!el) return
              // Use MutationObserver-free approach: check on render
              const update = () => {
                if (el.dataset.state === 'active') {
                  el.style.color = 'var(--color-text)'
                  el.style.borderBottomColor = 'var(--color-primary, #6366f1)'
                } else {
                  el.style.color = 'var(--color-text-secondary)'
                  el.style.borderBottomColor = 'transparent'
                }
              }
              update()
              // Observe data-state changes
              const observer = new MutationObserver(update)
              observer.observe(el, { attributes: true, attributeFilter: ['data-state'] })
            }}
          >
            {tab === 'campaign' ? 'Campaign' : tab === 'chat' ? 'Chat' : tab === 'chars' ? 'Chars' : 'Docs'}
          </Tabs.Trigger>
        ))}
      </Tabs.List>

      <Tabs.Content value="campaign" style={contentStyle}>
        <CampaignTab
          campaignId={campaignId}
          maps={maps}
          selectedMapId={selectedMapId}
          onMapSelect={onMapSelect}
          onCreateMap={onCreateMap}
          isCreatingMap={isCreatingMap}
          onShowMapSettings={onShowMapSettings}
          assetBrowserOpen={assetBrowserOpen}
          onAssetBrowserOpenChange={onAssetBrowserOpenChange}
        />
      </Tabs.Content>

      <Tabs.Content value="chat" style={{ ...contentStyle, display: 'flex', flexDirection: 'column' }}>
        <ChatTab campaignId={campaignId} />
      </Tabs.Content>

      <Tabs.Content value="chars" style={contentStyle}>
        <div style={{ padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          {activeCharacterId ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => setActiveCharacter(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  fontSize: 'var(--font-size-sm)',
                  padding: 0,
                  textAlign: 'left',
                }}
              >
                &larr; Back to list
              </button>
              <CharacterSheet />
            </div>
          ) : (
            <>
              <CharacterList campaignId={campaignId} onCreateClick={() => setCreateCharOpen(true)} />
              <CharacterCreateDialog
                campaignId={campaignId}
                open={createCharOpen}
                onOpenChange={setCreateCharOpen}
              />
            </>
          )}
        </div>
      </Tabs.Content>

      <Tabs.Content value="docs" style={contentStyle}>
        <div style={{ padding: 12, color: 'var(--color-text-secondary)', fontSize: 12 }}>
          Docs (coming soon)
        </div>
      </Tabs.Content>
    </Tabs.Root>
  )
}
