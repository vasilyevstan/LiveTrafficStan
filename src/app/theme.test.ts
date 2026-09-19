import { describe, expect, it, vi } from 'vitest'
import {
  THEME_MEDIA_QUERY,
  THEME_STORAGE_KEY,
  readStoredThemePreference,
  resolveEffectiveTheme,
  resolveThemePreference,
  storeThemePreference,
  themeColor,
  watchSystemTheme,
} from './theme'

describe('theme preference', () => {
  it('accepts Auto, Light, and Dark while preserving the Light fallback', () => {
    expect(resolveThemePreference('auto')).toBe('auto')
    expect(resolveThemePreference('dark')).toBe('dark')
    expect(resolveThemePreference('light')).toBe('light')
    expect(resolveThemePreference('system')).toBe('light')
    expect(resolveThemePreference(undefined)).toBe('light')
  })

  it('reads and writes the repository storage key', () => {
    const storage = {
      getItem: vi.fn().mockReturnValue('dark'),
      setItem: vi.fn(),
    }

    expect(readStoredThemePreference(storage)).toBe('dark')
    storeThemePreference(storage, 'auto')
    expect(storage.getItem).toHaveBeenCalledWith(THEME_STORAGE_KEY)
    expect(storage.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'auto')
  })

  it('falls back safely when storage is unavailable or throws', () => {
    expect(readStoredThemePreference(undefined)).toBe('light')
    expect(
      readStoredThemePreference({
        getItem: () => {
          throw new Error('blocked')
        },
        setItem: vi.fn(),
      }),
    ).toBe('light')
    expect(() =>
      storeThemePreference(
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

  it('resolves Auto from the system with a deterministic Light fallback', () => {
    expect(
      resolveEffectiveTheme('auto', (query) => {
        expect(query).toBe(THEME_MEDIA_QUERY)
        return { matches: true }
      }),
    ).toBe('dark')
    expect(
      resolveEffectiveTheme('auto', () => ({ matches: false })),
    ).toBe('light')
    expect(resolveEffectiveTheme('auto', undefined)).toBe('light')
    expect(
      resolveEffectiveTheme('auto', () => {
        throw new Error('unsupported')
      }),
    ).toBe('light')
    expect(
      resolveEffectiveTheme('dark', () => ({ matches: false })),
    ).toBe('dark')
  })

  it('subscribes to system changes and removes the matching listener', () => {
    let listener: ((event: { matches: boolean }) => void) | undefined
    const removeEventListener = vi.fn()
    const onTheme = vi.fn()
    const stop = watchSystemTheme(
      (query) => {
        expect(query).toBe(THEME_MEDIA_QUERY)
        return {
          matches: false,
          addEventListener: (_type, nextListener) => {
            listener = nextListener
          },
          removeEventListener,
        }
      },
      onTheme,
    )

    expect(onTheme).toHaveBeenLastCalledWith('light')
    listener?.({ matches: true })
    expect(onTheme).toHaveBeenLastCalledWith('dark')
    stop()
    expect(removeEventListener).toHaveBeenCalledWith('change', listener)
  })

  it('supports legacy media-query listeners and missing matchMedia', () => {
    let listener: ((event: { matches: boolean }) => void) | undefined
    const removeListener = vi.fn()
    const onTheme = vi.fn()
    const stop = watchSystemTheme(
      () => ({
        matches: true,
        addListener: (nextListener) => {
          listener = nextListener
        },
        removeListener,
      }),
      onTheme,
    )
    expect(onTheme).toHaveBeenLastCalledWith('dark')
    listener?.({ matches: false })
    expect(onTheme).toHaveBeenLastCalledWith('light')
    stop()
    expect(removeListener).toHaveBeenCalledWith(listener)

    const fallback = vi.fn()
    expect(() => watchSystemTheme(undefined, fallback)()).not.toThrow()
    expect(fallback).toHaveBeenCalledWith('light')
  })

  it('provides matching browser chrome colors', () => {
    expect(themeColor('light')).toBe('#dce8ec')
    expect(themeColor('dark')).toBe('#07131d')
  })
})
