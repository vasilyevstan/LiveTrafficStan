import { describe, expect, it } from 'vitest'
import type { DisplayAircraft } from './traffic'
import {
  aircraftViewName,
  aircraftViewPosition,
  aircraftViewUnavailableReason,
  interpolateAircraftViewPosition,
  type AircraftViewPosition,
} from './aircraftView'

const aircraft: DisplayAircraft = {
  id: 'aircraft:511123', kind: 'aircraft', provider: 'ADSB.lol', hex: '511123',
  registration: 'ES-ABC', aircraftType: 'A320', callsign: 'TST123',
  position: { latitude: 59.4, longitude: 24.7, observedAt: 1_000 },
  receivedAt: 1_000, markerIcon: 'aircraft', markerScale: 1, freshness: 'live',
  altitudeMeters: 10_000, courseDegrees: 90, headingDegrees: 80,
}

const at = (observedAt: number, patch: Partial<AircraftViewPosition> = {}): AircraftViewPosition => ({
  id: 'aircraft:511123', name: 'TST123', latitude: 0, longitude: 0, altitudeKm: 10,
  travelBearingDegrees: 90, observedAt, ...patch,
})

describe('aircraft view eligibility', () => {
  it.each<[string, Partial<DisplayAircraft> | undefined, 'auto' | 'flat', RegExp | undefined]>([
    ['flat projection', {}, 'flat', /Auto projection/],
    ['missing aircraft', undefined, 'auto', /live aircraft position is needed/],
    ['stale freshness', { freshness: 'stale' }, 'auto', /needs a live aircraft position/],
    ['invalid latitude', { position: { latitude: NaN, longitude: 0, observedAt: 1 } }, 'auto', /cannot be represented/],
    ['invalid longitude', { position: { latitude: 0, longitude: 181, observedAt: 1 } }, 'auto', /cannot be represented/],
    ['polar latitude', { position: { latitude: 86, longitude: 0, observedAt: 1 } }, 'auto', /cannot be represented/],
    ['missing altitude', { altitudeMeters: undefined }, 'auto', /reported altitude/],
    ['ground altitude', { altitudeMeters: 0 }, 'auto', /reports ground/],
    ['negative altitude', { altitudeMeters: -30 }, 'auto', /above the sea-level map/],
    ['low airborne altitude', { altitudeMeters: 30 }, 'auto', undefined],
    ['formerly gated altitude', { altitudeMeters: 299 }, 'auto', undefined],
    ['eligible', {}, 'auto', undefined],
  ])('%s', (_name, patch, projection, reason) => {
    const result = aircraftViewUnavailableReason(patch && { ...aircraft, ...patch }, projection)
    if (reason) expect(result).toMatch(reason)
    else expect(result).toBeUndefined()
  })

  it('names by callsign, registration, then hex', () => {
    expect(aircraftViewName(aircraft)).toBe('TST123')
    expect(aircraftViewName({ ...aircraft, callsign: ' ' })).toBe('ES-ABC')
    expect(aircraftViewName({ ...aircraft, callsign: undefined, registration: undefined })).toBe('511123')
  })
})

describe('aircraft view position', () => {
  it('maps the observation to a kilometre eye with course, heading, then previous bearing', () => {
    expect(aircraftViewPosition(aircraft)).toEqual({
      id: aircraft.id, name: 'TST123', latitude: 59.4, longitude: 24.7, altitudeKm: 10,
      travelBearingDegrees: 90, observedAt: 1_000,
    })
    expect(aircraftViewPosition({ ...aircraft, courseDegrees: undefined })?.travelBearingDegrees).toBe(80)
    expect(aircraftViewPosition({ ...aircraft, courseDegrees: 360, headingDegrees: NaN }, 45)
      ?.travelBearingDegrees).toBe(45)
    expect(aircraftViewPosition({ ...aircraft, altitudeMeters: 100 })?.altitudeKm).toBe(0.1)
    expect(aircraftViewPosition({ ...aircraft, altitudeMeters: 0 })).toBeUndefined()
    expect(aircraftViewPosition({ ...aircraft, altitudeMeters: -1 })).toBeUndefined()
  })
})

describe('aircraft view interpolation', () => {
  it('interpolates only between observations and never extrapolates', () => {
    const first = at(0)
    const last = at(20_000, { latitude: 2, altitudeKm: 12, travelBearingDegrees: 110 })
    expect(interpolateAircraftViewPosition(first, last, 10_000)).toMatchObject({
      latitude: 1, altitudeKm: 11, travelBearingDegrees: 100, observedAt: 10_000,
    })
    expect(interpolateAircraftViewPosition(first, last, 0)).toBe(first)
    expect(interpolateAircraftViewPosition(first, last, 20_000)).toBe(last)
    expect(interpolateAircraftViewPosition(first, last, 20_001)).toBeUndefined()
    expect(interpolateAircraftViewPosition(first, last, -1)).toBeUndefined()
    expect(interpolateAircraftViewPosition(first, last, NaN)).toBeUndefined()
  })

  it('takes the shortest path across the antimeridian and north bearing', () => {
    const result = interpolateAircraftViewPosition(
      at(0, { longitude: 179, travelBearingDegrees: 350 }),
      at(20_000, { longitude: -179, travelBearingDegrees: 10 }), 15_000)
    expect(result?.longitude).toBeCloseTo(-179.5, 10)
    expect(result?.travelBearingDegrees).toBeCloseTo(5, 10)
  })

  it('rejects a different aircraft', () => {
    expect(interpolateAircraftViewPosition(at(0), at(20_000, { id: 'aircraft:abcdef' }), 10_000))
      .toBeUndefined()
  })
})
