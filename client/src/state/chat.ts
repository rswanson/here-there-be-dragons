import { create } from 'zustand';
import type { ChatMessage } from '../types/ChatMessage';

interface ChatState {
  messages: ChatMessage[];
  hasMore: boolean;

  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  prependMessages: (messages: ChatMessage[]) => void;
  setHasMore: (hasMore: boolean) => void;
  handleIncomingMessage: (message: ChatMessage) => void;
}

const initialState = {
  messages: [] as ChatMessage[],
  hasMore: false,
};

export const useChatStore = create<ChatState>()((set) => ({
  ...initialState,

  setMessages: (messages) => set({ messages }),

  addMessage: (message) =>
    set((s) => ({
      messages: s.messages.some((m) => m.id === message.id)
        ? s.messages
        : [...s.messages, message],
    })),

  prependMessages: (messages) =>
    set((s) => {
      const existingIds = new Set(s.messages.map((m) => m.id));
      const newMessages = messages.filter((m) => !existingIds.has(m.id));
      return { messages: [...newMessages, ...s.messages] };
    }),

  setHasMore: (hasMore) => set({ hasMore }),

  handleIncomingMessage: (message) =>
    set((s) => ({
      messages: s.messages.some((m) => m.id === message.id)
        ? s.messages
        : [...s.messages, message],
    })),
}));
