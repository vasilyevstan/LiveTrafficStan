import { describe, expect, it } from 'vitest'
import { defaultAppPreferences } from '../domain/preferences'
import { resolvePrePaintTheme } from './prePaintTheme'

describe('pre-paint theme resolution', () => {
  it('matches fragment, unified storage, legacy, and default precedence', () => {
    expect(
      resolvePrePaintTheme({
        fragment: '#v=1&theme=dark',
        storedPreferences: JSON.stringify({
          ...defaultAppPreferences(),
          theme: 'light',
        }),
        legacyTheme: 'light',
        systemDark: false,
      }),
    ).toBe('dark')
    expect(
      resolvePrePaintTheme({
        fragment: '',
        storedPreferences: JSON.stringify({
          ...defaultAppPreferences(),
          theme: 'auto',
        }),
        legacyTheme: 'light',
        systemDark: true,
      }),
    ).toBe('dark')
    expect(
      resolvePrePaintTheme({
        fragment: '',
        storedPreferences: null,
        legacyTheme: 'dark',
        systemDark: false,
      }),
    ).toBe('dark')
  })

  it('rejects the complete malformed fragment and does not import legacy over present invalid unified storage', () => {
    expect(
      resolvePrePaintTheme({
        fragment: '#v=1&theme=dark&radius=50',
        storedPreferences: JSON.stringify(defaultAppPreferences()),
        legacyTheme: 'dark',
        systemDark: false,
      }),
    ).toBe('light')
    expect(
      resolvePrePaintTheme({
        fragment: '',
        storedPreferences: '{bad',
        legacyTheme: 'dark',
        systemDark: false,
      }),
    ).toBe('light')
  })
})
