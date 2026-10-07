import { useEffect, useLayoutEffect, useState } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'
const storageKey = 'wadahdb:theme'

export function readThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(storageKey)
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
  } catch { /* Use the default when storage is unavailable. */ }
  return 'light'
}

function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  return preference === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : preference
}

export function applyTheme(preference: ThemePreference) {
  const resolved = resolveTheme(preference)
  document.documentElement.dataset.theme = resolved
  return resolved
}

export function useTheme() {
  const [preference, setPreference] = useState(readThemePreference)
  const [resolved, setResolved] = useState(() => resolveTheme(preference))

  useLayoutEffect(() => {
    setResolved(applyTheme(preference))
    try { localStorage.setItem(storageKey, preference) } catch { /* Keep the in-session preference. */ }
  }, [preference])

  useEffect(() => {
    if (preference !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setResolved(applyTheme('system'))
    media.addEventListener('change', update)
    update()
    return () => media.removeEventListener('change', update)
  }, [preference])

  return { preference, setPreference, resolved }
}
