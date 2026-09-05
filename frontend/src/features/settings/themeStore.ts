import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemePreference = 'system' | 'light' | 'dark'

type ThemeState = {
  preference: ThemePreference
  setPreference: (preference: ThemePreference) => void
}

export const useThemeStore = create<ThemeState>()(persist((set) => ({
  preference: 'system',
  setPreference: (preference) => set({ preference }),
}), {
  name: 'agent-piano-theme-v1',
  partialize: (state) => ({ preference: state.preference }),
}))
