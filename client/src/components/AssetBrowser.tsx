import { useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useUiStore } from '../state/ui'
import { useMapStore } from '../state/map'
import { mapsApi } from '../api/maps'
import type { Asset } from '../types/Asset'

export function AssetBrowser({ campaignId, open, onOpenChange }: { campaignId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient()
  const setMapAssetUrl = useUiStore((s) => s.setMapAssetUrl)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [filter, setFilter] = useState<string | undefined>(undefined)
  const [dragOver, setDragOver] = useState(false)

  const { data: assets, isLoading } = useQuery({
    queryKey: ['assets', campaignId, filter],
    queryFn: () => api.assets.list(campaignId, { content_type: filter }),
    enabled: open,
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => api.assets.upload(campaignId, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assets', campaignId] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.assets.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assets', campaignId] }),
  })

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    files.forEach((file) => uploadMutation.mutate(file))
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    files.forEach((file) => uploadMutation.mutate(file))
    e.target.value = ''
  }

  const handleDelete = (asset: Asset) => {
    if (window.confirm(`Delete "${asset.filename}"?`)) {
      deleteMutation.mutate(asset.id)
    }
  }

  const filters = [
    { label: 'All', value: undefined },
    { label: 'Maps', value: 'image/%' },
    { label: 'PDFs', value: 'application/pdf' },
  ]

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.7)',
        }} />
        <Dialog.Content
          aria-describedby={undefined}
          style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'var(--color-bg-elevated)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-lg)',
            width: '80vw', maxWidth: 800, maxHeight: '80vh',
            overflow: 'auto',
          }}
        >
          <Dialog.Title style={{ fontSize: 'var(--font-size-xl)', marginBottom: 'var(--space-md)' }}>
            Asset Library
          </Dialog.Title>

          <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
            {filters.map((f) => (
              <button
                key={f.label}
                onClick={() => setFilter(f.value)}
                style={{
                  padding: 'var(--space-xs) var(--space-sm)',
                  background: filter === f.value ? 'var(--color-interactive)' : 'var(--color-bg-surface)',
                  border: 'none', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-primary)',
                }}
                aria-pressed={filter === f.value}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${dragOver ? 'var(--color-interactive)' : 'var(--color-text-muted)'}`,
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-lg)',
              textAlign: 'center',
              marginBottom: 'var(--space-md)',
              cursor: 'pointer',
            }}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Upload files by clicking or dragging"
            onKeyDown={(e) => { if (e.key === 'Enter') fileInputRef.current?.click() }}
          >
            <p>Drag and drop files here, or click to browse</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,image/svg+xml,application/pdf"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </div>

          {isLoading && <p>Loading assets...</p>}

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: 'var(--space-sm)',
          }}>
            {assets?.map((asset) => (
              <div
                key={asset.id}
                style={{
                  background: 'var(--color-bg-surface)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-sm)',
                  textAlign: 'center',
                }}
              >
                {asset.content_type.startsWith('image/') ? (
                  <img
                    src={api.assets.url(asset.id)}
                    alt={asset.filename}
                    style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 'var(--radius-sm)' }}
                  />
                ) : (
                  <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span>PDF</span>
                  </div>
                )}
                <p style={{ fontSize: 'var(--font-size-sm)', marginTop: 'var(--space-xs)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {asset.filename}
                </p>
                <div style={{ display: 'flex', gap: 'var(--space-xs)', justifyContent: 'center', marginTop: 'var(--space-xs)' }}>
                  {asset.content_type.startsWith('image/') && (
                    <button
                      onClick={async () => {
                        const { currentMap, layers } = useMapStore.getState()
                        const bgLayer = layers.find(l => l.layer_type === 'map_image')
                        if (currentMap && bgLayer) {
                          try {
                            await mapsApi.placeImage(bgLayer.id, {
                              asset_id: asset.id,
                              x: 0,
                              y: 0,
                              width: currentMap.width_squares,
                              height: currentMap.height_squares,
                              rotation: 0,
                              opacity: 1,
                            })
                          } catch (e) {
                            console.error('Failed to place map image:', e)
                          }
                        }
                        // Also set local URL for the CanvasView sprite fallback
                        setMapAssetUrl(api.assets.url(asset.id))
                        onOpenChange(false)
                      }}
                      style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-interactive)', background: 'none', border: 'none' }}
                      aria-label={`Set ${asset.filename} as map`}
                    >
                      Set as Map
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(asset)}
                    style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-error)', background: 'none', border: 'none' }}
                    aria-label={`Delete ${asset.filename}`}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          <Dialog.Close asChild>
            <button
              aria-label="Close"
              style={{ position: 'absolute', top: 'var(--space-sm)', right: 'var(--space-sm)', background: 'none', border: 'none', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-lg)' }}
            >
              ×
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
