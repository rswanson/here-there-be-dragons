import { describe, it, expect, beforeEach } from 'vitest'
import { useChatStore } from '../chat'
import type { ChatMessage } from '../../types/ChatMessage'

const makeMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'msg-1',
  campaign_id: 'campaign-1',
  sender_user_id: 'user-1',
  sender_display_name: 'Alice',
  character_id: null,
  character_name: null,
  message_type: 'ooc',
  content: 'Hello!',
  whisper_target_ids: [],
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

describe('useChatStore', () => {
  beforeEach(() => {
    useChatStore.setState(useChatStore.getInitialState())
  })

  it('starts empty', () => {
    const state = useChatStore.getState()
    expect(state.messages).toEqual([])
    expect(state.hasMore).toBe(false)
  })

  it('setMessages replaces the message list', () => {
    const msgs = [makeMessage(), makeMessage({ id: 'msg-2', content: 'World' })]
    useChatStore.getState().setMessages(msgs)
    expect(useChatStore.getState().messages).toHaveLength(2)
  })

  it('addMessage appends without duplicates', () => {
    const msg = makeMessage()
    useChatStore.getState().addMessage(msg)
    useChatStore.getState().addMessage(msg)
    expect(useChatStore.getState().messages).toHaveLength(1)
  })

  it('addMessage appends distinct messages', () => {
    useChatStore.getState().addMessage(makeMessage({ id: 'msg-1' }))
    useChatStore.getState().addMessage(makeMessage({ id: 'msg-2' }))
    expect(useChatStore.getState().messages).toHaveLength(2)
    expect(useChatStore.getState().messages[1].id).toBe('msg-2')
  })

  it('prependMessages adds messages to the front', () => {
    useChatStore.getState().setMessages([makeMessage({ id: 'msg-3' })])
    useChatStore
      .getState()
      .prependMessages([
        makeMessage({ id: 'msg-1' }),
        makeMessage({ id: 'msg-2' }),
      ])
    const ids = useChatStore.getState().messages.map((m) => m.id)
    expect(ids).toEqual(['msg-1', 'msg-2', 'msg-3'])
  })

  it('prependMessages deduplicates', () => {
    useChatStore.getState().setMessages([makeMessage({ id: 'msg-1' })])
    useChatStore
      .getState()
      .prependMessages([makeMessage({ id: 'msg-1' }), makeMessage({ id: 'msg-0' })])
    expect(useChatStore.getState().messages).toHaveLength(2)
  })

  it('setHasMore updates the flag', () => {
    useChatStore.getState().setHasMore(true)
    expect(useChatStore.getState().hasMore).toBe(true)
    useChatStore.getState().setHasMore(false)
    expect(useChatStore.getState().hasMore).toBe(false)
  })

  it('handleIncomingMessage appends without duplicates', () => {
    const msg = makeMessage()
    useChatStore.getState().handleIncomingMessage(msg)
    useChatStore.getState().handleIncomingMessage(msg)
    expect(useChatStore.getState().messages).toHaveLength(1)
  })

  it('handleIncomingMessage appends new messages', () => {
    useChatStore.getState().handleIncomingMessage(makeMessage({ id: 'msg-1' }))
    useChatStore.getState().handleIncomingMessage(makeMessage({ id: 'msg-2' }))
    expect(useChatStore.getState().messages).toHaveLength(2)
  })
})
