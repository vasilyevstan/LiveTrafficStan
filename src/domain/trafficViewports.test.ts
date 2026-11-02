import { describe, expect, it } from 'vitest'
import { assessTrafficViewport } from './viewport'
import {
  trafficQueryForViewport,
  trafficViewportScopes,
} from './trafficViewports'

const longitudeAtKm = (kilometers: number) =>
  (kilometers / 6_371) * (180 / Math.PI)

const assess = (radiusKm: number) =>
  assessTrafficViewport(
    {
      center: { latitude: 0, longitude: 0 },
      perimeter: [
        { latitude: 0.01, longitude: -0.01 },
        { latitude: 0, longitude: longitudeAtKm(radiusKm) },
        { latitude: -0.01, longitude: -0.01 },
        { latitude: 0, longitude: -0.02 },
      ],
      pitchDegrees: 0,
    },
    { coordinatePrecision: 3, maximumRadiusKm: 250 },
  )

describe('traffic viewport scopes', () => {
  it('uses one assessment to derive independent 100 km marine and 250 km aircraft queries', () => {
    const at100 = trafficViewportScopes(assess(100), 100)
    expect(trafficQueryForViewport(at100.aircraft)?.radiusKm).toBe(100.001)
    expect(trafficQueryForViewport(at100.marine)?.radiusKm).toBe(100)

    const over100 = trafficViewportScopes(assess(100.01), 100)
    expect(trafficQueryForViewport(over100.aircraft)?.radiusKm)
      .toBeGreaterThan(100)
    expect(trafficQueryForViewport(over100.marine)).toBeNull()

    const at250 = trafficViewportScopes(assess(250), 100)
    expect(trafficQueryForViewport(at250.aircraft)?.radiusKm).toBe(250)
    expect(trafficQueryForViewport(at250.marine)).toBeNull()

    const over250 = trafficViewportScopes(assess(250.01), 100)
    expect(over250).toEqual({ aircraft: null, marine: null })
  })

  it('fails closed for discontinuous geometry without creating either query', () => {
    const assessment = assessTrafficViewport(
      {
        center: { latitude: 0, longitude: 0 },
        perimeter: [
          { latitude: 1, longitude: -1 },
          { latitude: 1, longitude: 1 },
          { latitude: -1, longitude: 1 },
          { latitude: -1, longitude: -1 },
        ],
        pitchDegrees: 0,
        surfaceIsContinuous: false,
      },
      { coordinatePrecision: 3, maximumRadiusKm: 250 },
    )
    expect(trafficViewportScopes(assessment, 100)).toEqual({
      aircraft: null,
      marine: null,
    })
  })
})
