import { describe, expect, it } from 'vitest'
import {
  isMapCameraState,
  isNorthResetUseful,
  normalizeMapBearing,
  roundMapCameraState,
} from './mapCamera'

describe('map camera state', () => {
  it.each([undefined, Number.NaN, Infinity, -Infinity, 0, -0, 1, -1, 360, 359, -359])(
    'hides reset north for unavailable or north-aligned bearing %s',
    (bearing) => {
      expect(isNorthResetUseful(bearing, 1)).toBe(false)
    },
  )

  it.each([1.01, -1.01, 30, -30, 180, -180, 359 - 0.01, -359 + 0.01, 390])(
    'shows reset north for useful wrapped bearing %s',
    (bearing) => {
      expect(isNorthResetUseful(bearing, 1)).toBe(true)
    },
  )

  it('normalizes the compass needle without modifying camera state', () => {
    expect(normalizeMapBearing(390)).toBe(30)
    expect(normalizeMapBearing(-390)).toBe(-30)
    expect(normalizeMapBearing(360)).toBe(0)
  })

  it('validates MapLibre camera bounds', () => {
    expect(
      isMapCameraState({
        latitude: 59.437,
        longitude: 24.754,
        zoom: 8.25,
        bearing: -30,
        pitch: 45,
      }),
    ).toBe(true)
    expect(
      isMapCameraState({
        latitude: 59.437,
        longitude: 24.754,
        zoom: 23,
        bearing: 0,
        pitch: 0,
      }),
    ).toBe(false)
  })

  it('rounds shared coordinates and canonical camera values', () => {
    expect(
      roundMapCameraState(
        {
          latitude: 59.43749,
          longitude: 24.75351,
          zoom: 8.246,
          bearing: -0.04,
          pitch: 44.96,
        },
        3,
      ),
    ).toEqual({
      latitude: 59.437,
      longitude: 24.754,
      zoom: 8.25,
      bearing: 0,
      pitch: 45,
    })
  })

  it('wraps MapLibre world-copy longitudes before sharing', () => {
    expect(
      roundMapCameraState(
        {
          latitude: 59.437,
          longitude: 384.75351,
          zoom: 8.246,
          bearing: 0,
          pitch: 0,
        },
        3,
      ),
    ).toEqual({
      latitude: 59.437,
      longitude: 24.754,
      zoom: 8.25,
      bearing: 0,
      pitch: 0,
    })
  })
})
