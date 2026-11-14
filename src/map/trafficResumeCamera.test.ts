import { describe, expect, it } from 'vitest'
import {
  MAP_CAMERA_LIMITS,
  type MapCameraState,
} from '../domain/mapCamera'
import type { TrafficViewport } from '../domain/viewport'
import { marineResumeCamera } from './trafficResumeCamera'

const camera: MapCameraState = {
  latitude: 59.437,
  longitude: 24.754,
  zoom: 8,
  bearing: 28,
  pitch: 60,
}

const viewport = (
  measuredRadiusKm: number,
  enclosingRadiusKm = Math.ceil(measuredRadiusKm * 1_000) / 1_000,
): TrafficViewport => ({
  center: {
    latitude: camera.latitude,
    longitude: camera.longitude,
    label: 'Map view',
  },
  enclosingRadiusKm,
  measuredRadiusKm,
  polygon: [
    { latitude: 59, longitude: 24 },
    { latitude: 59, longitude: 25 },
    { latitude: 60, longitude: 25 },
    { latitude: 60, longitude: 24 },
  ],
})

describe('marine resume camera', () => {
  it('preserves the pitched camera and only increases zoom', () => {
    const result = marineResumeCamera(camera, viewport(220), 100)

    expect(result).toEqual({
      ...camera,
      zoom: camera.zoom + Math.log2(220 / 90),
    })
    expect(result?.zoom).toBeGreaterThan(camera.zoom)
  })

  it('uses the measured radius rather than outward transport rounding', () => {
    expect(marineResumeCamera(camera, viewport(100, 100.001), 100))
      .toBe(camera)
  })

  it('keeps an already eligible camera unchanged', () => {
    expect(marineResumeCamera(camera, viewport(99.999), 100)).toBe(camera)
  })

  it('supports viewports without a measured radius', () => {
    const withoutMeasurement = {
      ...viewport(150),
      measuredRadiusKm: undefined,
    }

    expect(marineResumeCamera(camera, withoutMeasurement, 100)?.zoom)
      .toBe(camera.zoom + Math.log2(150 / 90))
  })

  it.each([
    [Number.NaN, 100],
    [Number.POSITIVE_INFINITY, 100],
    [0, 100],
    [-1, 100],
    [150, Number.NaN],
    [150, Number.POSITIVE_INFINITY],
    [150, 0],
    [150, -1],
  ])(
    'rejects a measured radius of %s with a maximum of %s',
    (measuredRadiusKm, maximumRadiusKm) => {
      expect(
        marineResumeCamera(
          camera,
          viewport(measuredRadiusKm),
          maximumRadiusKm,
        ),
      ).toBeUndefined()
    },
  )

  it('fails closed when the conservative zoom exceeds the map limit', () => {
    const maximumZoomCamera = {
      ...camera,
      zoom: MAP_CAMERA_LIMITS.maximumZoom,
    }

    expect(
      marineResumeCamera(maximumZoomCamera, viewport(100.001), 100),
    ).toBeUndefined()
  })
})
