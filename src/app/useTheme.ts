import { useCallback, useEffect, useState } from 'react'
import {
  applyDocumentTheme,
  browserThemeMatchMedia,
  browserThemeStorage,
  readStoredThemePreference,
  resolveEffectiveTheme,
  storeThemePreference,
  watchSystemTheme,
  type Theme,
  type ThemePreference,
} from './theme'

export const useTheme = () => {
  const [state, setState] = useState<{
    preference: ThemePreference
    theme: Theme
  }>(() => {
    const preference = readStoredThemePreference(browserThemeStorage())
    return {
      preference,
      theme: resolveEffectiveTheme(
        preference,
        browserThemeMatchMedia(),
      ),
    }
  })

  useEffect(() => {
    applyDocumentTheme(state.theme)
  }, [state.theme])

  useEffect(() => {
    if (state.preference !== 'auto') return
    return watchSystemTheme(browserThemeMatchMedia(), (theme) => {
      setState((current) =>
        current.preference === 'auto' && current.theme !== theme
          ? { ...current, theme }
          : current,
      )
    })
  }, [state.preference])

  const setThemePreference = useCallback((preference: ThemePreference) => {
    storeThemePreference(browserThemeStorage(), preference)
    setState({
      preference,
      theme: resolveEffectiveTheme(
        preference,
        browserThemeMatchMedia(),
      ),
    })
  }, [])

  return {
    theme: state.theme,
    themePreference: state.preference,
    setThemePreference,
  }
}
