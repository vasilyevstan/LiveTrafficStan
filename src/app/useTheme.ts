import { useCallback, useEffect, useState } from 'react'
import {
  applyDocumentTheme,
  browserThemeStorage,
  readStoredTheme,
  storeTheme,
  type Theme,
} from './theme'

export const useTheme = () => {
  const [theme, setThemeState] = useState<Theme>(() =>
    readStoredTheme(browserThemeStorage()),
  )

  useEffect(() => {
    applyDocumentTheme(theme)
  }, [theme])

  const setTheme = useCallback((nextTheme: Theme) => {
    setThemeState(nextTheme)
    storeTheme(browserThemeStorage(), nextTheme)
  }, [])

  return { theme, setTheme }
}
