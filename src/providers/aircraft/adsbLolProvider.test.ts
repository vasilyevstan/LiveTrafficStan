import { describe, expect, it } from 'vitest'
import {
  aircraftQueryRadiusNauticalMiles,
  normalizeAdsbLolResponse,
} from './adsbLolProvider'

const query = {
  center: {
    latitude: 59.437,
    longitude: 24.7536,
    label: 'Tallinn',
  },
  radiusKm: 20,
}

describe('normalizeAdsbLolResponse', () => {
  it('normalizes reliable aircraft fields and metric units', () => {
    const receivedAt = 1_800_000_000_000
    const result = normalizeAdsbLolResponse(
      {
        now: receivedAt,
        ac: [
          {
            hex: 'abc123',
            lat: 59.45,
            lon: 24.8,
            seen_pos: 2,
            flight: ' TST123 ',
            r: 'ES-ABC',
            t: 'A320',
            category: 'A3',
            alt_baro: 10_000,
            gs: 100,
            track: 91,
            true_heading: 94,
            baro_rate: 600,
            squawk: '7000',
          },
        ],
      },
      query,
      receivedAt,
    )

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'aircraft:abc123',
      hex: 'ABC123',
      callsign: 'TST123',
      registration: 'ES-ABC',
      aircraftType: 'A320',
      category: 'Large aircraft',
      altitudeMeters: 3_048,
      courseDegrees: 91,
      headingDegrees: 94,
      verticalSpeedMps: 3.048,
      markerIcon: 'aircraft',
      markerScale: 1.08,
    })

    expect(result[0]?.speedKph).toBeCloseTo(185.2)
    expect(result[0]?.position.observedAt).toBe(receivedAt - 2_000)
  })

  it('uses a ground altitude and ignores entries outside the requested radius', () => {
    const result = normalizeAdsbLolResponse(
      {
        now: 1_800_000_000_000,
        ac: [
          {
            hex: 'ground1',
            lat: 59.44,
            lon: 24.75,
            alt_baro: 'ground',
            messages: 1,
            seen: 0,
          },
          {
            hex: 'faraway',
            lat: 60.2,
            lon: 25.5,
          },
          {
            hex: 'missing-position',
          },
        ],
      },
      query,
      1_800_000_000_000,
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.altitudeMeters).toBe(0)
  })

  it('maps only reported emitter categories to the bounded icon vocabulary', () => {
    const aircraft = normalizeAdsbLolResponse(
      {
        now: 1_800_000_000_000,
        ac: [
          { hex: 'a10001', lat: 59.44, lon: 24.75, category: 'A1' },
          { hex: 'a20002', lat: 59.44, lon: 24.75, category: 'A2' },
          { hex: 'a30003', lat: 59.44, lon: 24.75, category: 'A3' },
          { hex: 'a40004', lat: 59.44, lon: 24.75, category: 'A4' },
          { hex: 'a50005', lat: 59.44, lon: 24.75, category: 'A5' },
          { hex: 'a60006', lat: 59.44, lon: 24.75, category: 'A6' },
          { hex: 'a70007', lat: 59.44, lon: 24.75, category: 'A7' },
          {
            hex: 'unknown',
            lat: 59.44,
            lon: 24.75,
            category: 'A8',
            t: 'H125',
            gs: 500,
          },
          {
            hex: 'missing',
            lat: 59.44,
            lon: 24.75,
            t: 'HELICOPTER',
            gs: 0,
          },
        ],
      },
      query,
      1_800_000_000_000,
    )

    expect(
      aircraft.map(({ category, markerIcon, markerScale }) => ({
        category,
        markerIcon,
        markerScale,
      })),
    ).toEqual([
      {
        category: 'Light aircraft',
        markerIcon: 'aircraft-light',
        markerScale: 0.78,
      },
      {
        category: 'Small aircraft',
        markerIcon: 'aircraft-light',
        markerScale: 0.9,
      },
      {
        category: 'Large aircraft',
        markerIcon: 'aircraft',
        markerScale: 1.08,
      },
      {
        category: 'Large aircraft',
        markerIcon: 'aircraft',
        markerScale: 1.08,
      },
      {
        category: 'Heavy aircraft',
        markerIcon: 'aircraft-heavy',
        markerScale: 1.22,
      },
      {
        category: 'High-performance aircraft',
        markerIcon: 'aircraft',
        markerScale: 1,
      },
      {
        category: 'Rotorcraft',
        markerIcon: 'helicopter',
        markerScale: 0.92,
      },
      {
        category: undefined,
        markerIcon: 'aircraft',
        markerScale: 0.94,
      },
      {
        category: undefined,
        markerIcon: 'aircraft',
        markerScale: 0.94,
      },
    ])
  })

  it('rejects a malformed top-level response', () => {
    expect(() =>
      normalizeAdsbLolResponse({ aircraft: [] }, query, Date.now()),
    ).toThrow(/malformed aircraft response/)
  })
})

describe('aircraftQueryRadiusNauticalMiles', () => {
  it('rounds an eligible 100 km viewport outward to 54 nautical miles', () => {
    expect(aircraftQueryRadiusNauticalMiles(100)).toBe(54)
    expect(54 * 1.852).toBeCloseTo(100.008)
  })
})
