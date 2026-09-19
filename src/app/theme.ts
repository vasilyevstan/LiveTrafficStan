export type Theme = 'light' | 'dark'
export type ThemePreference = Theme | 'auto'

export const THEME_STORAGE_KEY = 'livetrafficstan.theme'
export const THEME_MEDIA_QUERY = '(prefers-color-scheme: dark)'

interface ThemeStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

interface ThemeMediaQueryList {
  matches: boolean
  addEventListener?: (
    type: 'change',
    listener: (event: { matches: boolean }) => void,
  ) => void
  removeEventListener?: (
    type: 'change',
    listener: (event: { matches: boolean }) => void,
  ) => void
  addListener?: (listener: (event: { matches: boolean }) => void) => void
  removeListener?: (listener: (event: { matches: boolean }) => void) => void
}

export type ThemeMatchMedia = (
  query: string,
) => ThemeMediaQueryList

export const isThemePreference = (
  value: unknown,
): value is ThemePreference =>
  value === 'auto' || value === 'light' || value === 'dark'

export const resolveThemePreference = (
  value: unknown,
): ThemePreference =>
  isThemePreference(value) ? value : 'light'

export const readStoredThemePreference = (
  storage: ThemeStorage | undefined,
): ThemePreference => {
  if (!storage) return 'light'
  try {
    return resolveThemePreference(storage.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'light'
  }
}

export const storeThemePreference = (
  storage: ThemeStorage | undefined,
  preference: ThemePreference,
) => {
  if (!storage) return
  try {
    storage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    return
  }
}

export const resolveEffectiveTheme = (
  preference: ThemePreference,
  matchMedia: ThemeMatchMedia | undefined,
): Theme => {
  if (preference !== 'auto' || !matchMedia) return preference === 'dark'
    ? 'dark'
    : 'light'

  try {
    return matchMedia(THEME_MEDIA_QUERY).matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export const watchSystemTheme = (
  matchMedia: ThemeMatchMedia | undefined,
  onTheme: (theme: Theme) => void,
) => {
  if (!matchMedia) {
    onTheme('light')
    return () => undefined
  }

  let media: ThemeMediaQueryList
  try {
    media = matchMedia(THEME_MEDIA_QUERY)
  } catch {
    onTheme('light')
    return () => undefined
  }

  const handleChange = (event: { matches: boolean }) => {
    onTheme(event.matches ? 'dark' : 'light')
  }
  onTheme(media.matches ? 'dark' : 'light')

  if (media.addEventListener && media.removeEventListener) {
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener?.('change', handleChange)
  }
  if (media.addListener && media.removeListener) {
    media.addListener(handleChange)
    return () => media.removeListener?.(handleChange)
  }
  return () => undefined
}

export const themeColor = (theme: Theme) =>
  theme === 'dark' ? '#07131d' : '#dce8ec'

export const browserThemeStorage = () => {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

export const browserThemeMatchMedia = (): ThemeMatchMedia | undefined =>
  typeof window.matchMedia === 'function'
    ? window.matchMedia.bind(window)
    : undefined

export const applyDocumentTheme = (theme: Theme) => {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', themeColor(theme))
}
