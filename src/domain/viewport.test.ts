import { describe, expect, it } from 'vitest'
import { distanceKm } from './geo'
import {
  assessTrafficViewport,
  isCoordinateInViewport,
} from './viewport'

const limits = {
  coordinatePrecision: 3,
  maximumRadiusKm: 100,
}

const assessmentFor = (
  perimeter: readonly { latitude: number; longitude: number }[],
  center = { latitude: 0, longitude: 0 },
  pitchDegrees = 0,
) =>
  assessTrafficViewport(
    {
      center,
      perimeter,
      pitchDegrees,
    },
    limits,
  )

describe('assessTrafficViewport', () => {
  it('rounds the center before calculating a conservative radius', () => {
    const assessment = assessmentFor(
      [
        { latitude: 0.1, longitude: -0.1 },
        { latitude: 0.1, longitude: 0.1 },
        { latitude: -0.1, longitude: 0.1 },
        { latitude: -0.1, longitude: -0.1 },
      ],
      { latitude: 0.00049, longitude: 0.00049 },
    )

    expect(assessment.kind).toBe('eligible')
    if (assessment.kind !== 'eligible') return
    expect(assessment.viewport.center).toEqual({
      latitude: 0,
      longitude: 0,
      label: 'Map view',
    })
    expect(assessment.viewport.enclosingRadiusKm).toBeGreaterThan(15)
  })

  it('accepts the exact 100 km boundary and rejects a larger footprint', () => {
    const longitudeAt100Km = (100 / 6_371) * (180 / Math.PI)
    const exact = assessmentFor([
      { latitude: 0.01, longitude: -0.01 },
      { latitude: 0, longitude: longitudeAt100Km },
      { latitude: -0.01, longitude: -0.01 },
      { latitude: 0, longitude: -0.02 },
    ])
    const over = assessmentFor([
      { latitude: 0.01, longitude: -0.01 },
      { latitude: 0, longitude: longitudeAt100Km + 0.000_02 },
      { latitude: -0.01, longitude: -0.01 },
      { latitude: 0, longitude: -0.02 },
    ])

    expect(exact).toMatchObject({
      kind: 'eligible',
      viewport: { enclosingRadiusKm: 100 },
    })
    expect(over).toMatchObject({
      kind: 'ineligible',
      reason: 'too-wide',
      message: 'Zoom in to see live traffic',
      viewport: {
        center: {
          latitude: 0,
          longitude: 0,
          label: 'Map view',
        },
      },
    })
    if (over.kind === 'ineligible') {
      expect(over.viewport?.enclosingRadiusKm).toBeGreaterThan(100)
    }
  })

  it('unwraps a bounded antimeridian footprint without treating it as global', () => {
    const assessment = assessmentFor(
      [
        { latitude: 0.2, longitude: 179.7 },
        { latitude: 0.2, longitude: -179.9 },
        { latitude: -0.2, longitude: -179.9 },
        { latitude: -0.2, longitude: 179.7 },
      ],
      { latitude: 0, longitude: 179.9 },
    )

    expect(assessment.kind).toBe('eligible')
    if (assessment.kind !== 'eligible') return
    expect(isCoordinateInViewport(
      { latitude: 0, longitude: -179.95 },
      assessment.viewport,
    )).toBe(true)
    expect(isCoordinateInViewport(
      { latitude: 0, longitude: 179.5 },
      assessment.viewport,
    )).toBe(false)
  })

  it('rejects world-spanning, degenerate, and non-finite footprints', () => {
    expect(
      assessmentFor([
        { latitude: 10, longitude: -100 },
        { latitude: 10, longitude: 100 },
        { latitude: -10, longitude: 100 },
        { latitude: -10, longitude: -100 },
      ]),
    ).toMatchObject({ kind: 'ineligible', reason: 'too-wide' })
    expect(
      assessmentFor([
        { latitude: 1, longitude: 1 },
        { latitude: 1, longitude: 1 },
        { latitude: 1, longitude: 1 },
        { latitude: 1, longitude: 1 },
      ]),
    ).toMatchObject({ kind: 'ineligible', reason: 'invalid' })
    expect(
      assessmentFor([
        { latitude: 1, longitude: Number.NaN },
        { latitude: 1, longitude: 1 },
        { latitude: -1, longitude: 1 },
        { latitude: -1, longitude: -1 },
      ]),
    ).toMatchObject({ kind: 'ineligible', reason: 'invalid' })
  })

  it('offers tilt reduction when a pitched view is over budget', () => {
    const assessment = assessmentFor(
      [
        { latitude: 2, longitude: -2 },
        { latitude: 2, longitude: 2 },
        { latitude: -2, longitude: 2 },
        { latitude: -2, longitude: -2 },
      ],
      { latitude: 0, longitude: 0 },
      45,
    )

    expect(assessment).toMatchObject({
      kind: 'ineligible',
      message: 'Zoom in or reduce tilt to see live traffic',
    })
  })
})

describe('isCoordinateInViewport', () => {
  it('uses the actual rotated polygon rather than only its enclosing circle', () => {
    const assessment = assessmentFor([
      { latitude: 0.5, longitude: 0 },
      { latitude: 0, longitude: 0.5 },
      { latitude: -0.5, longitude: 0 },
      { latitude: 0, longitude: -0.5 },
    ])
    expect(assessment.kind).toBe('eligible')
    if (assessment.kind !== 'eligible') return

    expect(
      isCoordinateInViewport(
        { latitude: 0.2, longitude: 0.2 },
        assessment.viewport,
      ),
    ).toBe(true)
    expect(
      distanceKm(
        assessment.viewport.center,
        { latitude: 0.3, longitude: 0.3 },
      ),
    ).toBeLessThan(assessment.viewport.enclosingRadiusKm)
    expect(
      isCoordinateInViewport(
        { latitude: 0.3, longitude: 0.3 },
        assessment.viewport,
      ),
    ).toBe(false)
    expect(
      isCoordinateInViewport(
        { latitude: 0.5, longitude: 0 },
        assessment.viewport,
      ),
    ).toBe(true)
  })
})
