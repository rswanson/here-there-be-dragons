import { useState } from 'react'
import type { Handout } from '../types/Handout'
import type { UpdateHandoutRequest } from '../types/UpdateHandoutRequest'
import type { HandoutVisibility } from '../types/HandoutVisibility'

interface HandoutEditorProps {
  handout: Handout
  onSave: (updates: UpdateHandoutRequest) => void
  onBack: () => void
}

function renderMarkdown(md: string): string {
  // Split into blocks on double newline for paragraph handling
  const blocks = md.split(/\n\n+/)
  const renderedBlocks = blocks.map((block) => {
    const lines = block.split('\n')

    // Heading detection — check first line
    const headingMatch = lines[0].match(/^(#{1,6})\s+(.*)/)
    if (headingMatch && lines.length === 1) {
      const level = headingMatch[1].length
      return `<h${level}>${inlineMarkdown(headingMatch[2])}</h${level}>`
    }

    // Unordered list — all lines starting with "- "
    if (lines.every((l) => l.match(/^-\s/))) {
      const items = lines.map((l) => `<li>${inlineMarkdown(l.replace(/^-\s/, ''))}</li>`).join('')
      return `<ul>${items}</ul>`
    }

    // Mixed block: some lines are list items, some are headings, fall through to paragraph
    // Check if the whole block is a single heading
    const fullHeadingMatch = block.match(/^(#{1,6})\s+(.+)$/)
    if (fullHeadingMatch) {
      const level = fullHeadingMatch[1].length
      return `<h${level}>${inlineMarkdown(fullHeadingMatch[2])}</h${level}>`
    }

    // Default: paragraph
    const joined = lines.map((l) => inlineMarkdown(l)).join('<br />')
    return `<p>${joined}</p>`
  })

  return renderedBlocks.join('\n')
}

function inlineMarkdown(text: string): string {
  return text
    // Images with asset: protocol — must come before links
    .replace(/!\[([^\]]*)\]\(asset:([^)]+)\)/g, '<img src="/api/assets/$2" alt="$1" style="max-width:100%" />')
    // Regular images
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%" />')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
}

const visibilityLabels: Record<HandoutVisibility, string> = {
  everyone: 'Everyone',
  dm_only: 'DM Only',
  specific_players: 'Specific Players',
}

export function HandoutEditor({ handout, onSave, onBack }: HandoutEditorProps) {
  const [title, setTitle] = useState(handout.title)
  const [content, setContent] = useState(handout.content)
  const [visibility, setVisibility] = useState<HandoutVisibility>(handout.visibility)

  const handleSave = () => {
    onSave({
      title,
      content,
      visibility,
      player_ids: handout.player_ids,
    })
  }

  const previewHtml = renderMarkdown(content)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        gap: 8,
        padding: 12,
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button
          onClick={onBack}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            fontSize: 'var(--font-size-sm)',
            padding: 0,
            whiteSpace: 'nowrap',
          }}
        >
          &larr; Back
        </button>
        <button
          onClick={handleSave}
          style={{
            marginLeft: 'auto',
            background: 'var(--color-primary, #6366f1)',
            border: 'none',
            borderRadius: 4,
            color: '#fff',
            cursor: 'pointer',
            fontSize: 11,
            padding: '4px 12px',
          }}
        >
          Save
        </button>
      </div>

      {/* Title input */}
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Handout title"
        style={{
          width: '100%',
          background: 'var(--color-bg-surface, #1e1e1e)',
          border: '1px solid var(--color-border, #444)',
          borderRadius: 4,
          color: 'var(--color-text)',
          fontSize: 14,
          fontWeight: 600,
          padding: '6px 8px',
          boxSizing: 'border-box',
        }}
      />

      {/* Visibility controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Visibility:</span>
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as HandoutVisibility)}
          style={{
            background: 'var(--color-bg-surface, #1e1e1e)',
            border: '1px solid var(--color-border, #444)',
            borderRadius: 4,
            color: 'var(--color-text)',
            fontSize: 11,
            padding: '3px 6px',
            cursor: 'pointer',
          }}
        >
          {(Object.keys(visibilityLabels) as HandoutVisibility[]).map((v) => (
            <option key={v} value={v}>
              {visibilityLabels[v]}
            </option>
          ))}
        </select>
      </div>

      {/* Split pane */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* Markdown editor */}
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write markdown here..."
          style={{
            flex: 1,
            resize: 'none',
            background: 'var(--color-bg-surface, #1e1e1e)',
            border: '1px solid var(--color-border, #444)',
            borderRadius: 4,
            color: 'var(--color-text)',
            fontFamily: 'monospace',
            fontSize: 12,
            lineHeight: 1.5,
            padding: 8,
            minHeight: 0,
          }}
        />

        {/* Rendered preview */}
        <div
          style={{
            flex: 1,
            background: 'var(--color-bg-surface, #1e1e1e)',
            border: '1px solid var(--color-border, #444)',
            borderRadius: 4,
            color: 'var(--color-text)',
            fontSize: 12,
            lineHeight: 1.6,
            overflowY: 'auto',
            padding: 8,
            minHeight: 0,
          }}
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      </div>
    </div>
  )
}
