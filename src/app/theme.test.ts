import { describe, expect, it, vi } from 'vitest'
import {
  THEME_STORAGE_KEY,
  readStoredTheme,
  resolveTheme,
  storeTheme,
  themeColor,
} from './theme'

describe('theme preference', () => {
  it('uses only explicit light and dark values', () => {
    expect(resolveTheme('dark')).toBe('dark')
    expect(resolveTheme('light')).toBe('light')
    expect(resolveTheme('system')).toBe('light')
    expect(resolveTheme(undefined)).toBe('light')
  })

  it('reads and writes the repository storage key', () => {
    const storage = {
      getItem: vi.fn().mockReturnValue('dark'),
      setItem: vi.fn(),
    }

    expect(readStoredTheme(storage)).toBe('dark')
    storeTheme(storage, 'light')
    expect(storage.getItem).toHaveBeenCalledWith(THEME_STORAGE_KEY)
    expect(storage.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'light')
  })

  it('falls back safely when storage is unavailable or throws', () => {
    expect(readStoredTheme(undefined)).toBe('light')
    expect(
      readStoredTheme({
        getItem: () => {
          throw new Error('blocked')
        },
        setItem: vi.fn(),
      }),
    ).toBe('light')
    expect(() =>
      storeTheme(
        {
          getItem: vi.fn(),
          setItem: () => {
            throw new Error('blocked')
          },
        },
        'dark',
      ),
    ).not.toThrow()
  })

  it('provides matching browser chrome colors', () => {
    expect(themeColor('light')).toBe('#dce8ec')
    expect(themeColor('dark')).toBe('#07131d')
  })
})
