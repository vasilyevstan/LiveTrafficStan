import {
  isThemePreference,
  resolveEffectiveTheme,
  type Theme,
  type ThemePreference,
} from './theme'
import { resolveAppPreferences } from '../domain/preferences'
import { parseShareFragment } from '../domain/shareState'

export interface PrePaintThemeInput {
  fragment: string
  storedPreferences: string | null
  legacyTheme: string | null
  systemDark: boolean
}

export const resolvePrePaintThemePreference = ({
  fragment,
  storedPreferences,
  legacyTheme,
}: Omit<PrePaintThemeInput, 'systemDark'>): ThemePreference => {
  const sharedTheme = parseShareFragment(fragment)?.preferences?.theme
  if (sharedTheme) return sharedTheme

  if (storedPreferences !== null) {
    try {
      return resolveAppPreferences(JSON.parse(storedPreferences)).theme
    } catch {
      return 'light'
    }
  }

  return isThemePreference(legacyTheme) ? legacyTheme : 'light'
}

export const resolvePrePaintTheme = (
  input: PrePaintThemeInput,
): Theme =>
  resolveEffectiveTheme(
    resolvePrePaintThemePreference(input),
    () => ({ matches: input.systemDark }),
  )
