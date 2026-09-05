import type { ThemePreference } from './themeStore'

const systemThemeQuery = '(prefers-color-scheme: dark)'

export function initializeTheme() {
  let preference: ThemePreference = 'system'
  try {
    const stored = window.localStorage.getItem('agent-piano-theme-v1')
    const parsed = stored ? JSON.parse(stored) as { state?: { preference?: ThemePreference } } : null
    if (parsed?.state?.preference) preference = parsed.state.preference
  } catch {
    // Invalid persisted preferences fall back to the system theme.
  }
  applyTheme(preference, window.matchMedia(systemThemeQuery).matches)
}

export function applyTheme(preference: ThemePreference, systemIsDark: boolean) {
  const resolvedTheme = preference === 'system'
    ? systemIsDark ? 'dark' : 'light'
    : preference
  const root = document.documentElement
  root.classList.toggle('dark', resolvedTheme === 'dark')
  root.dataset.theme = resolvedTheme
  root.style.colorScheme = resolvedTheme
}

export { systemThemeQuery }
