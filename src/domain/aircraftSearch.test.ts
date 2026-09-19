import { describe, expect, it } from 'vitest'
import type { Aircraft } from './traffic'
import {
  normalizeAircraftSearchQuery,
  orderAircraftSearchResults,
} from './aircraftSearch'

const aircraft = (
  id: string,
  values: Partial<
    Pick<
      Aircraft,
      'callsign' | 'registration' | 'hex' | 'aircraftType'
    >
  >,
): Aircraft => ({
  id,
  kind: 'aircraft',
  provider: 'ADSB.lol',
  hex: values.hex ?? id.replace('aircraft:', ''),
  callsign: values.callsign,
  registration: values.registration,
  aircraftType: values.aircraftType,
  position: {
    latitude: 59.4,
    longitude: 24.7,
    observedAt: 1_800_000_000_000,
  },
  receivedAt: 1_800_000_000_000,
  markerIcon: 'aircraft',
  markerScale: 1,
})

describe('aircraft search', () => {
  it('normalizes whitespace and ranks exact, prefix, then substring matches', () => {
    const entities = [
      aircraft('aircraft:one', { callsign: 'AB MYX781 CD' }),
      aircraft('aircraft:two', { registration: 'MYX781-TEST' }),
      aircraft('aircraft:three', { hex: 'myx781' }),
      aircraft('aircraft:four', { aircraftType: 'A320' }),
    ]

    expect(normalizeAircraftSearchQuery('  myx781  ')).toBe('MYX781')
    expect(
      orderAircraftSearchResults(entities, ' myx781 ').map(({ id }) => id),
    ).toEqual([
      'aircraft:three',
      'aircraft:two',
      'aircraft:one',
    ])
  })

  it('searches callsign, registration, ICAO24, and type literally', () => {
    const entities = [
      aircraft('aircraft:51109b', {
        callsign: 'MYX781',
        registration: 'ES-SAU',
        aircraftType: 'A320',
      }),
      aircraft('aircraft:abc123', {
        callsign: 'TEST[1]',
        registration: 'N12345',
        aircraftType: 'B738',
      }),
    ]

    expect(orderAircraftSearchResults(entities, 'myx')).toHaveLength(1)
    expect(orderAircraftSearchResults(entities, 'es-sau')).toHaveLength(1)
    expect(orderAircraftSearchResults(entities, '51109B')).toHaveLength(1)
    expect(orderAircraftSearchResults(entities, 'a320')).toHaveLength(1)
    expect(orderAircraftSearchResults(entities, '[1]')).toHaveLength(1)
    expect(orderAircraftSearchResults(entities, '*')).toEqual([])
  })

  it('preserves display order for ties and returns a copy for an empty query', () => {
    const entities = [
      aircraft('aircraft:first', { callsign: 'TEST ONE' }),
      aircraft('aircraft:second', { callsign: 'TEST TWO' }),
      aircraft('aircraft:third', {}),
    ]

    expect(
      orderAircraftSearchResults(entities, 'test').map(({ id }) => id),
    ).toEqual(['aircraft:first', 'aircraft:second'])
    const copy = orderAircraftSearchResults(entities, ' ')
    expect(copy).toEqual(entities)
    expect(copy).not.toBe(entities)
  })
})
