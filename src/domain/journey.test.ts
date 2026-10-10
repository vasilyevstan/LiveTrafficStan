import { describe, expect, it } from 'vitest'
import { JOURNEY_CONFIG } from '../config/appConfig'
import type { FlightRouteAirport, FlightRouteViewState } from './flightRoute'
import {
  captureAircraftJourney,
  captureObservedJourney,
  geodesicJourneyArc,
  observedJourneySegments,
} from './journey'
import type { Aircraft, TrailPoint } from './traffic'

const now = 1_800_000_000_000
const position = (longitude: number, observedAt = now): TrailPoint =>
  ({ latitude: 0, longitude, observedAt })
const aircraft: Aircraft = {
  id: 'aircraft:abc123', kind: 'aircraft', hex: 'abc123', callsign: 'TST123',
  registration: 'ES-ABC', position: position(5), receivedAt: now,
  provider: 'ADSB.lol', markerIcon: 'aircraft', markerScale: 1,
}
const airport = (longitude: number): FlightRouteAirport => ({
  name: `Test airport ${longitude}`, icao: `TS${longitude.toString().padStart(2, '0')}`,
  latitude: 0, longitude,
})
const route = (longitudes = [0, 10]): FlightRouteViewState => {
  const airports = longitudes.map(airport)
  return {
    phase: 'available', identityKey: 'TST123|ABC123|ES-ABC',
    route: {
      flightIcao: 'TST123', confidence: 'plausible',
      departure: airports[0]!, arrival: airports.at(-1)!, airports,
      source: { name: 'ADSB.lol', websiteUrl: 'https://www.adsb.lol/' },
    },
  }
}

describe('captured journey geometry and truthfulness', () => {
  it('retains both estimated phases and exact reported position without inventing observations', () => {
    const result = captureAircraftJourney(aircraft, route(), [], 1, now + 5_000)
    expect(result.kind).toBe('available')
    if (result.kind !== 'available') return
    expect(result.snapshot.position).toEqual(aircraft.position)
    expect(result.snapshot.position).not.toBe(aircraft.position)
    expect(result.snapshot.segments.map(s => [s.phase, s.certainty])).toEqual([
      ['past', 'estimated'], ['remaining', 'estimated'],
    ])
    expect(result.snapshot.segments[0]!.points.at(-1)).toEqual({ latitude: 0, longitude: 5 })
    expect(result.snapshot.segments[1]!.points[0]).toEqual({ latitude: 0, longitude: 5 })
    expect(result.snapshot.segments.flatMap(s => s.points).every(p => p.observedAt === undefined)).toBe(true)
    expect(result.snapshot.limitations.join(' ')).toContain('not a filed or flown route')
    expect(Object.isFrozen(result.snapshot)).toBe(true)
    expect(Object.isFrozen(result.snapshot.segments[0]!.points[0])).toBe(true)
  })

  it('prefers received positions, retains their clocks and does not fill reception gaps', () => {
    const trail = [position(1, now - 400_000), position(2, now - 350_000), position(4, now - 20_000)]
    const result = captureAircraftJourney(aircraft, route(), trail, 2, now)
    if (result.kind !== 'available') throw new Error(result.message)
    const received = result.snapshot.segments.filter(s => s.certainty === 'observed')
    expect(received.map(s => s.points.map(p => p.longitude))).toEqual([[1, 2], [4, 5]])
    expect(received[0]!.points[0]!.observedAt).toBe(now - 400_000)
    const estimatedPast = result.snapshot.segments.filter(s => s.phase === 'past' && s.certainty === 'estimated')
    expect(estimatedPast).toHaveLength(1)
    expect(estimatedPast[0]!.points.at(-1)!.longitude).toBe(1)
    trail[0]!.longitude = 99
    expect(received[0]!.points[0]!.longitude).toBe(1)
  })

  it('keeps ordered intermediate airports only when the current leg is unambiguous', () => {
    const result = captureAircraftJourney({ ...aircraft, position: position(30) }, route([0, 20, 40]), [], 3, now)
    if (result.kind !== 'available') throw new Error(result.message)
    expect(result.snapshot.endpoints.map(p => p.longitude)).toEqual([0, 20, 40, 30])
    expect(result.snapshot.segments.filter(s => s.phase === 'past').map(s => s.points.at(-1)!.longitude)).toEqual([20, 30])
    const ambiguous = captureAircraftJourney(
      { ...aircraft, position: position(20) }, route([0, 20, 40]),
      [position(19.9, now - 20_000)], 4, now,
    )
    if (ambiguous.kind !== 'available') throw new Error(ambiguous.message)
    expect(ambiguous.snapshot.segments.every(s => s.certainty === 'observed')).toBe(true)
    expect(ambiguous.snapshot.limitations.join(' ')).toContain('current itinerary leg is ambiguous')
  })

  it('rejects old identity results and rechecks current geographic plausibility without a lookup', () => {
    for (const changed of [
      { ...aircraft, callsign: 'TST456' },
      { ...aircraft, registration: 'ES-DEF' },
      { ...aircraft, position: position(100) },
    ]) {
      const result = captureAircraftJourney(changed, route(), [position(changed.position.longitude - 0.1, now - 10_000)], 5, now)
      if (result.kind !== 'available') throw new Error(result.message)
      expect(result.snapshot.segments.every(s => s.certainty === 'observed')).toBe(true)
    }
  })

  it('keeps missing endpoints unknown and never calls the first observation a departure', () => {
    const result = captureObservedJourney(aircraft, [position(4, now - 10_000)], 6, now)
    if (result.kind !== 'available') throw new Error(result.message)
    expect(result.snapshot.endpoints.map(p => p.role)).toEqual(['captured'])
    expect(result.snapshot.limitations.join(' ')).toContain('first point is not a departure')
    expect(captureObservedJourney(aircraft, [], 7, now).kind).toBe('unavailable')
  })

  it('uses bounded short geodesics over the dateline and refuses ambiguous antipodes', () => {
    const arc = geodesicJourneyArc({ latitude: 60, longitude: 179 }, { latitude: 60, longitude: -179 })!
    expect(arc.length).toBeLessThanOrEqual(JOURNEY_CONFIG.maximumArcPoints)
    expect(arc.every(p => Math.abs(p.longitude) >= 179)).toBe(true)
    expect(geodesicJourneyArc({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 })).toBeUndefined()
    const polar = geodesicJourneyArc({ latitude: 80, longitude: -90 }, { latitude: 80, longitude: 90 })!
    expect(polar.every(p => Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90)).toBe(true)
  })

  it('bounds received points and splits invalid, regressing, future and long-gap input', () => {
    const trail = Array.from({ length: 2_000 }, (_, i) => position(4, now - (2_000 - i) * 1_000))
    const bounded = observedJourneySegments(trail, aircraft.position, 120_000)
    expect(bounded.flat().length).toBeLessThanOrEqual(JOURNEY_CONFIG.maximumObservedPoints)
    const broken = observedJourneySegments([
      position(1, now - 10_000), position(2, now - 9_000),
      { ...position(3, now - 8_000), latitude: NaN },
      position(3, now - 7_000), position(4, now - 6_000),
      position(5, now + 1_000),
    ], aircraft.position, 120_000)
    expect(broken.map(s => s.map(p => p.longitude))).toEqual([[1, 2], [3, 4]])
    expect(captureObservedJourney({ ...aircraft, position: { ...aircraft.position, latitude: NaN } }, trail, 8, now).kind).toBe('unavailable')
  })
})
