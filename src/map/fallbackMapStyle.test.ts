import { describe, expect, it } from 'vitest'
import {
  BASEMAP_FALLBACK_MESSAGE,
  fallbackMapStyle,
  fallbackMapStyleKey,
  isFallbackMapStyleKey,
  reconnectedWhileStylePending,
  shouldRetryAfterFallbackLoad,
} from './fallbackMapStyle'

describe('local fallback map style', () => {
  it('contains only a theme-aware local background', () => {
    const light = fallbackMapStyle('light')
    const dark = fallbackMapStyle('dark')

    expect(light.sources).toEqual({})
    expect(light).not.toHaveProperty('sprite')
    expect(light).not.toHaveProperty('glyphs')
    expect(light.layers).toHaveLength(1)
    expect(light.layers[0]).toMatchObject({
      type: 'background',
      paint: { 'background-color': '#dce8ec' },
    })
    expect(dark.layers[0]).toMatchObject({
      paint: { 'background-color': '#071a2b' },
    })
  })

  it('uses explicit keys for fallback lifecycle decisions', () => {
    expect(fallbackMapStyleKey('dark')).toBe(
      'livetrafficstan-fallback:dark',
    )
    expect(
      isFallbackMapStyleKey('livetrafficstan-fallback:light'),
    ).toBe(true)
    expect(isFallbackMapStyleKey('https://example.test/style')).toBe(
      false,
    )
  })

  it('carries a reconnect across a delayed external-style failure', () => {
    const retryPending = reconnectedWhileStylePending(true, false, false)

    expect(retryPending).toBe(true)
    expect(
      shouldRetryAfterFallbackLoad(
        retryPending,
        true,
        BASEMAP_FALLBACK_MESSAGE,
      ),
    ).toBe(true)
    expect(
      shouldRetryAfterFallbackLoad(
        retryPending,
        false,
        BASEMAP_FALLBACK_MESSAGE,
      ),
    ).toBe(false)
    expect(
      shouldRetryAfterFallbackLoad(retryPending, true, undefined),
    ).toBe(false)
  })
})
