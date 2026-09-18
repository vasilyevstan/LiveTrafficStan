export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'livetrafficstan.theme'

interface ThemeStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export const resolveTheme = (value: unknown): Theme =>
  value === 'dark' ? 'dark' : 'light'

export const readStoredTheme = (
  storage: ThemeStorage | undefined,
): Theme => {
  if (!storage) return 'light'
  try {
    return resolveTheme(storage.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'light'
  }
}

export const storeTheme = (
  storage: ThemeStorage | undefined,
  theme: Theme,
) => {
  if (!storage) return
  try {
    storage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    return
  }
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

export const applyDocumentTheme = (theme: Theme) => {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', themeColor(theme))
}
