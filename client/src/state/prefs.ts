import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface PrefsState {
  theme: 'dark' // Only dark for now
  reducedMotion: boolean
  setReducedMotion: (value: boolean) => void
}

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      reducedMotion: false,
      setReducedMotion: (value) => set({ reducedMotion: value }),
    }),
    { name: 'htbd-prefs' },
  ),
)
