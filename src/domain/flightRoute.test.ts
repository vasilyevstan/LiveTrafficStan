import { describe, expect, it } from 'vitest'
import {
  flightRouteIdentity,
  flightRouteIdentityKey,
} from './flightRoute'

describe('flight route identity', () => {
  it('normalizes an ICAO flight callsign, ICAO24, and registration', () => {
    const identity = flightRouteIdentity({
      hex: ' abc123 ',
      callsign: ' tst00123 ',
      registration: ' es-abc ',
      position: {
        latitude: 59.437,
        longitude: 24.7536,
      },
    })

    expect(identity).toEqual({
      callsign: 'TST123',
      icao24: 'ABC123',
      registration: 'ES-ABC',
      latitude: 59.437,
      longitude: 24.7536,
    })
    expect(flightRouteIdentityKey(identity!)).toBe(
      'TST123|ABC123|ES-ABC',
    )
  })

  it.each([
    { hex: '~12345', callsign: 'TST123' },
    { hex: 'ABC123', callsign: undefined },
    { hex: 'ABC123', callsign: 'TS123' },
    { hex: 'ABC123', callsign: 'TST-123' },
    { hex: 'ABC123', callsign: 'TSTABC' },
    { hex: 'ABC123', callsign: 'TST1A2' },
    { hex: 'ABC123', callsign: 'TST123456' },
  ])('rejects an unsafe route identity', (aircraft) => {
    expect(
      flightRouteIdentity({
        ...aircraft,
        registration: undefined,
        position: {
          latitude: 59.437,
          longitude: 24.7536,
        },
      }),
    ).toBeUndefined()
  })

  it('rejects an aircraft without a valid current position', () => {
    expect(
      flightRouteIdentity({
        hex: 'ABC123',
        callsign: 'TST123',
        registration: undefined,
        position: {
          latitude: 91,
          longitude: 24.7536,
        },
      }),
    ).toBeUndefined()
  })
})
