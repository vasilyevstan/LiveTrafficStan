import { describe, expect, it } from 'vitest'
import type { Aircraft, Vessel } from '../domain/traffic'
import { trafficTooltipSummary } from './trafficTooltip'

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
  id: 'vessel:230123456',
  kind: 'vessel',
  provider: 'test',
  mmsi: 230123456,
  vesselCategory: 'other',
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

describe('trafficTooltipSummary', () => {
  it('uses already-loaded aircraft callsign and reported type truthfully', () => {
    expect(
      trafficTooltipSummary(
        aircraft({
          callsign: '  TST123  ',
          aircraftType: 'A320',
          registration: 'N123TS',
        }),
      ),
    ).toEqual({
      title: 'Flight / callsign: TST123',
      details: [
        'Reported aircraft type: A320',
        'Registration: N123TS',
      ],
    })
  })

  it('falls back to ICAO24 without claiming missing aircraft metadata', () => {
    expect(trafficTooltipSummary(aircraft())).toEqual({
      title: 'Aircraft: ABC123',
      details: [
        'Reported aircraft type: unreported',
        'ICAO24: ABC123',
      ],
    })
  })

  it('labels vessel destination as AIS data rather than a complete route', () => {
    expect(
      trafficTooltipSummary(
        vessel({
          name: 'Test Vessel',
          destination: 'Helsinki',
        }),
      ),
    ).toEqual({
      title: 'Test Vessel',
      details: [
        'Flag: Finland (FI)',
        'AIS destination: Helsinki',
      ],
    })
  })

  it('keeps provider markup-like text as plain summary data', () => {
    expect(
      trafficTooltipSummary(
        vessel({
          name: '<img src=x onerror=alert(1)>',
          destination: '<script>alert(1)</script>',
        }),
      ),
    ).toMatchObject({
      title: '<img src=x onerror=alert(1)>',
      details: [
        'Flag: Finland (FI)',
        'AIS destination: <script>alert(1)</script>',
      ],
    })
  })
})
