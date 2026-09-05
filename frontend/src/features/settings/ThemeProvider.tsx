import { useEffect, type ReactNode } from 'react'
import { applyTheme, systemThemeQuery } from './initializeTheme'
import { useThemeStore } from './themeStore'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useThemeStore((state) => state.preference)

  useEffect(() => {
    const media = window.matchMedia(systemThemeQuery)
    const apply = () => applyTheme(preference, media.matches)
    apply()
    if (preference !== 'system') return
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [preference])

  return children
}
