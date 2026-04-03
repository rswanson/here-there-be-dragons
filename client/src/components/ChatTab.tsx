import { useEffect, useRef, useCallback } from 'react'
import { useChatStore } from '../state/chat'
import { chatApi } from '../api/chat'
import { ChatMessageItem } from './ChatMessage'
import { ChatInput } from './ChatInput'

interface ChatTabProps {
  campaignId: string
}

const LIMIT = 50

export function ChatTab({ campaignId }: ChatTabProps) {
  const messages = useChatStore((s) => s.messages)
  const hasMore = useChatStore((s) => s.hasMore)
  const scrollRef = useRef<HTMLDivElement>(null)
  const isLoadingMore = useRef(false)

  // Load recent messages on mount
  useEffect(() => {
    chatApi.getRecent(campaignId, LIMIT).then((msgs) => {
      const reversed = [...msgs].reverse()
      useChatStore.getState().setMessages(reversed)
      useChatStore.getState().setHasMore(msgs.length >= LIMIT)
    }).catch((err) => {
      console.error('Failed to load chat messages:', err)
    })
  }, [campaignId])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages.length])

  // Scroll-up pagination
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || !hasMore || isLoadingMore.current) return

    if (el.scrollTop <= 40 && messages.length > 0) {
      isLoadingMore.current = true
      const firstId = messages[0].id
      const prevScrollHeight = el.scrollHeight

      chatApi.getBefore(campaignId, firstId, LIMIT).then((older) => {
        const reversed = [...older].reverse()
        useChatStore.getState().prependMessages(reversed)
        if (older.length < LIMIT) {
          useChatStore.getState().setHasMore(false)
        }
        // Restore scroll position after prepend
        requestAnimationFrame(() => {
          if (el) {
            el.scrollTop = el.scrollHeight - prevScrollHeight
          }
        })
      }).catch((err) => {
        console.error('Failed to load older messages:', err)
      }).finally(() => {
        isLoadingMore.current = false
      })
    }
  }, [campaignId, hasMore, messages])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        height: '100%',
      }}
    >
      {/* Scrollable message list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        {hasMore && (
          <div
            style={{
              textAlign: 'center',
              padding: '8px',
              fontSize: 11,
              color: 'var(--color-text-secondary)',
            }}
          >
            Scroll up to load more…
          </div>
        )}
        {messages.length === 0 ? (
          <div
            style={{
              padding: 16,
              textAlign: 'center',
              fontSize: 12,
              color: 'var(--color-text-secondary)',
            }}
          >
            No messages yet. Say something!
          </div>
        ) : (
          messages.map((msg) => <ChatMessageItem key={msg.id} message={msg} />)
        )}
      </div>

      {/* Input bar */}
      <ChatInput campaignId={campaignId} />
    </div>
  )
}
