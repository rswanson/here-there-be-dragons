import { create } from 'zustand'
import type { User } from '../types/User'

interface SessionState {
  user: User | null
  setUser: (user: User | null) => void
}

export const useSessionStore = create<SessionState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}))
