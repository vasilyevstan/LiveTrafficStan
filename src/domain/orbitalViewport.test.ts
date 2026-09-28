import { describe, expect, it } from 'vitest'
import {
  assessOrbitalViewport,
  orbitalPointInPolygon,
  orbitalSegmentEntryFraction,
  unwrapOrbitalLongitude,
} from './orbitalViewport'

const localSample = {
  center: { latitude: 59.4, longitude: 179 },
  perimeter: [
    { latitude: 58, longitude: 177 },
    { latitude: 58, longitude: -179 },
    { latitude: 61, longitude: -179 },
    { latitude: 61, longitude: 177 },
  ],
  longitudeSpanDegrees: 4,
}

describe('orbital viewport geometry', () => {
  it('keeps a dateline-adjacent local footprint safely unwrapped', () => {
    expect(assessOrbitalViewport(localSample, 3)).toEqual({
      kind: 'local',
      center: { latitude: 59.4, longitude: 179 },
      polygon: [
        { latitude: 58, longitude: 177 },
        { latitude: 58, longitude: 181 },
        { latitude: 61, longitude: 181 },
        { latitude: 61, longitude: 177 },
      ],
    })
  })

  it('distinguishes the whole world from an unsafe partial world span', () => {
    expect(
      assessOrbitalViewport(
        {
          center: { latitude: 0, longitude: 0 },
          perimeter: [
            { latitude: -85, longitude: -180 },
            { latitude: -85, longitude: 180 },
            { latitude: 85, longitude: 180 },
            { latitude: 85, longitude: -180 },
          ],
          longitudeSpanDegrees: 360,
        },
        3,
      ),
    ).toEqual({ kind: 'world' })

    expect(
      assessOrbitalViewport(
        { ...localSample, longitudeSpanDegrees: 360 },
        3,
      ),
    ).toMatchObject({
      kind: 'invalid',
      reason: 'world-spanning',
    })

    const invalid = assessOrbitalViewport(
      {
        ...localSample,
        perimeter: [
          { latitude: -20, longitude: -100 },
          { latitude: -20, longitude: 100 },
          { latitude: 20, longitude: 100 },
          { latitude: 20, longitude: -100 },
        ],
        longitudeSpanDegrees: 200,
      },
      3,
    )
    expect(invalid).toMatchObject({
      kind: 'invalid',
      reason: 'world-spanning',
    })
  })

  it('finds points and the first segment entry without joining dateline gaps', () => {
    const viewport = assessOrbitalViewport(localSample, 3)
    expect(viewport.kind).toBe('local')
    if (viewport.kind !== 'local') return

    expect(
      orbitalPointInPolygon(59, unwrapOrbitalLongitude(-179.5, 179), viewport.polygon),
    ).toBe(true)
    expect(
      orbitalSegmentEntryFraction(
        { latitude: 59, longitude: 175 },
        { latitude: 59, longitude: 179 },
        viewport.polygon,
      ),
    ).toBeCloseTo(0.5)
    expect(
      orbitalSegmentEntryFraction(
        { latitude: 0, longitude: 179 },
        { latitude: 0, longitude: -179 },
        viewport.polygon,
      ),
    ).toBeUndefined()
  })

  it('rejects invalid and degenerate samples explicitly', () => {
    expect(
      assessOrbitalViewport(
        {
          center: { latitude: Number.NaN, longitude: 0 },
          perimeter: [],
          longitudeSpanDegrees: Number.NaN,
        },
        3,
      ),
    ).toMatchObject({ kind: 'invalid', reason: 'invalid-geometry' })
    expect(
      assessOrbitalViewport(
        {
          center: { latitude: 0, longitude: 0 },
          perimeter: [
            { latitude: 1, longitude: 1 },
            { latitude: 1, longitude: 1 },
            { latitude: 1, longitude: 1 },
            { latitude: 1, longitude: 1 },
          ],
          longitudeSpanDegrees: 1,
        },
        3,
      ),
    ).toMatchObject({ kind: 'invalid', reason: 'degenerate' })
  })
})
