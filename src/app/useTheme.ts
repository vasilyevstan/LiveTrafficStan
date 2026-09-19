import { useEffect, useState } from 'react'
import {
  applyDocumentTheme,
  browserThemeMatchMedia,
  resolveEffectiveTheme,
  watchSystemTheme,
  type Theme,
  type ThemePreference,
} from './theme'

export const useTheme = (preference: ThemePreference) => {
  const [theme, setTheme] = useState<Theme>(() =>
    resolveEffectiveTheme(preference, browserThemeMatchMedia()),
  )

  useEffect(() => {
    setTheme(resolveEffectiveTheme(preference, browserThemeMatchMedia()))
  }, [preference])

  useEffect(() => {
    applyDocumentTheme(theme)
  }, [theme])

  useEffect(() => {
    if (preference !== 'auto') return
    return watchSystemTheme(browserThemeMatchMedia(), setTheme)
  }, [preference])

  return theme
}
