import { describe, expect, it } from 'vitest'
import {
  isMapCameraState,
  roundMapCameraState,
} from './mapCamera'

describe('map camera state', () => {
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
