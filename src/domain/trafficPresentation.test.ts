import { describe, expect, it } from 'vitest'
import type { Aircraft, Vessel } from './traffic'
import {
  AIRCRAFT_ALTITUDE_MARKER_ICONS,
  TRAFFIC_STYLE_IMAGE_IDS,
  aircraftAltitudeBand,
  aircraftAltitudeBandLabel,
  aircraftRenderIcon,
  aircraftVerticalTrend,
  isReportedYacht,
  trafficPresentation,
  trafficMotionState,
  vesselNavigationMotionConflict,
  vesselRenderIcon,
} from './trafficPresentation'
import { ONE_KNOT_KPH } from './vesselFilters'

const aircraft = (
  overrides: Partial<Aircraft> = {},
): Aircraft => ({
  id: 'aircraft:abc123',
  kind: 'aircraft',
  provider: 'test',
  hex: 'abc123',
  position: {
    latitude: 59,
    longitude: 24,
    observedAt: 1,
  },
  receivedAt: 1,
  markerIcon: 'aircraft',
  markerScale: 1,
  ...overrides,
})

const vessel = (
  overrides: Partial<Vessel> = {},
): Vessel => ({
  id: 'vessel:230000001',
  kind: 'vessel',
  provider: 'test',
  mmsi: 230000001,
  vesselCategory: 'unknown',
  navigationCategory: 'unknown',
  position: {
    latitude: 59,
    longitude: 24,
    observedAt: 1,
  },
  receivedAt: 1,
  markerIcon: 'vessel',
  markerScale: 1,
  ...overrides,
})

describe('traffic presentation', () => {
  it('uses the exact one-knot traffic motion boundary', () => {
    expect(trafficMotionState(undefined)).toBe('unknown')
    expect(trafficMotionState(Number.NaN)).toBe('unknown')
    expect(trafficMotionState(-0.001)).toBe('unknown')
    expect(trafficMotionState(0)).toBe('slow-stopped')
    expect(trafficMotionState(0.999 * ONE_KNOT_KPH)).toBe(
      'slow-stopped',
    )
    expect(trafficMotionState(ONE_KNOT_KPH)).toBe('moving')
  })

  it('uses only exact reported vessel types for render-only shapes', () => {
    expect(
      vesselRenderIcon(vessel({ vesselType: 'Sailing vessel' })),
    ).toBe('vessel-sailing')
    expect(
      vesselRenderIcon(vessel({ vesselType: 'Pleasure craft' })),
    ).toBe('vessel-pleasure')
    expect(
      vesselRenderIcon(vessel({ vesselType: 'High-speed craft' })),
    ).toBe('vessel-highspeed')
    expect(
      vesselRenderIcon(
        vessel({
          vesselType: 'Cargo vessel',
          markerIcon: 'vessel-cargo',
        }),
      ),
    ).toBe('vessel-cargo')
    expect(
      vesselRenderIcon(vessel({ name: 'MY YACHT', vesselType: undefined })),
    ).toBe('vessel')

    expect(isReportedYacht(vessel({ vesselType: 'Sailing vessel' }))).toBe(
      true,
    )
    expect(isReportedYacht(vessel({ vesselType: 'Pleasure craft' }))).toBe(
      true,
    )
    expect(isReportedYacht(vessel({ vesselType: 'Cargo vessel' }))).toBe(
      false,
    )
  })

  it('rotates only moving vessel silhouettes and exposes status conflicts', () => {
    const moving = vessel({
      speedKph: ONE_KNOT_KPH,
      courseDegrees: 123,
      navigationCategory: 'moored',
    })
    const stopped = vessel({
      speedKph: ONE_KNOT_KPH - 0.001,
      courseDegrees: 123,
    })

    expect(trafficPresentation(moving)).toMatchObject({
      kind: 'vessel',
      headingDegrees: 123,
      motionState: 'moving',
      navigationConflict: true,
    })
    expect(trafficPresentation(stopped)).toMatchObject({
      kind: 'vessel',
      headingDegrees: 0,
      motionState: 'slow-stopped',
      navigationConflict: false,
    })
    expect(vesselNavigationMotionConflict(moving)).toBe(true)
  })

  it('classifies reported barometric altitude without inferring ground', () => {
    expect(aircraftAltitudeBand(undefined)).toBe('unknown')
    expect(aircraftAltitudeBand(Number.NaN)).toBe('unknown')
    expect(aircraftAltitudeBand(-10)).toBe('low')
    expect(aircraftAltitudeBand(0)).toBe('low')
    expect(aircraftAltitudeBand(999.999)).toBe('low')
    expect(aircraftAltitudeBand(1_000)).toBe('medium')
    expect(aircraftAltitudeBand(2_999.999)).toBe('medium')
    expect(aircraftAltitudeBand(3_000)).toBe('high')
    expect(aircraftAltitudeBand(9_999.999)).toBe('high')
    expect(aircraftAltitudeBand(10_000)).toBe('cruise')
    expect(aircraftAltitudeBandLabel('low')).not.toContain('ground')
    expect(aircraftRenderIcon('aircraft-heavy', 'high')).toBe(
      'aircraft-heavy-high',
    )
  })

  it('uses the exact 200 ft/min vertical trend boundary', () => {
    expect(aircraftVerticalTrend(undefined)).toBe('unknown')
    expect(aircraftVerticalTrend(Number.POSITIVE_INFINITY)).toBe('unknown')
    expect(aircraftVerticalTrend(1.015)).toBe('small')
    expect(aircraftVerticalTrend(1.016)).toBe('climb')
    expect(aircraftVerticalTrend(-1.015)).toBe('small')
    expect(aircraftVerticalTrend(-1.016)).toBe('descent')
  })

  it('keeps style image IDs bounded and unique', () => {
    expect(new Set(TRAFFIC_STYLE_IMAGE_IDS).size).toBe(
      TRAFFIC_STYLE_IMAGE_IDS.length,
    )
    expect(AIRCRAFT_ALTITUDE_MARKER_ICONS).toHaveLength(20)
    expect(
      trafficPresentation(
        aircraft({
          altitudeMeters: 10_000,
          verticalSpeedMps: -1.016,
          speedKph: 0,
          courseDegrees: 120,
        }),
      ),
    ).toMatchObject({
      markerIcon: 'aircraft-cruise',
      headingDegrees: 0,
      altitudeBand: 'cruise',
      verticalTrend: 'descent',
      motionState: 'slow-stopped',
    })
  })
})
