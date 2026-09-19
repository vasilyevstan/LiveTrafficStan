import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  AIRCRAFT_RESULT_LIMIT,
  AIRCRAFT_SEARCH_MAX_LENGTH,
} from '../domain/aircraftSearch'
import type { DisplayAircraft } from '../domain/traffic'
import { AircraftDiscovery } from './AircraftDiscovery'

const aircraft = (index: number): DisplayAircraft => ({
  id: `aircraft:${index}`,
  kind: 'aircraft',
  provider: 'ADSB.lol',
  hex: index.toString(16).padStart(6, '0'),
  callsign: `TEST${index}`,
  registration: `ES-${index}`,
  aircraftType: 'A320',
  position: {
    latitude: 59.4,
    longitude: 24.7,
    observedAt: 1_800_000_000_000,
  },
  receivedAt: 1_800_000_000_000,
  markerIcon: 'aircraft',
  markerScale: 1,
  freshness: index === 1 ? 'stale' : 'live',
})

const renderDiscovery = (
  overrides: Partial<Parameters<typeof AircraftDiscovery>[0]> = {},
) =>
  renderToStaticMarkup(
    <AircraftDiscovery
      query=""
      aircraft={[aircraft(1)]}
      totalAircraft={3}
      aircraftVisible
      emptyMessage="No current aircraft are shown in this view."
      onQueryChange={() => undefined}
      onSelect={() => undefined}
      {...overrides}
    />,
  )

describe('AircraftDiscovery', () => {
  it('uses bounded native local-search controls and reports the current corpus', () => {
    const html = renderDiscovery()

    expect(html).toContain('Aircraft discovery')
    expect(html).toContain('Callsign, registration, ICAO24, or type')
    expect(html).toContain(`maxLength="${AIRCRAFT_SEARCH_MAX_LENGTH}"`)
    expect(html).toContain('3 aircraft in view')
    expect(html).toContain('local to the current visible traffic area')
  })

  it('bounds result buttons and disables selection while AIRCRAFT is hidden', () => {
    const entities = Array.from(
      { length: AIRCRAFT_RESULT_LIMIT + 3 },
      (_, index) => aircraft(index),
    )
    const html = renderDiscovery({
      query: 'test',
      aircraft: entities,
      totalAircraft: entities.length,
      aircraftVisible: false,
    })

    expect((html.match(/<li>/g) ?? [])).toHaveLength(AIRCRAFT_RESULT_LIMIT)
    expect(html).toContain('AIRCRAFT layer hidden')
    expect(html).toContain('disabled=""')
    expect(html).toContain('Show the AIRCRAFT layer')
    expect(html).toContain(
      `Showing the first ${AIRCRAFT_RESULT_LIMIT} of ${entities.length}`,
    )
    expect(html).toContain('STALE')
  })

  it('keeps no-current and no-match states distinct', () => {
    expect(
      renderDiscovery({ aircraft: [], totalAircraft: 0 }),
    ).toContain('No current aircraft are shown in this view.')
    expect(
      renderDiscovery({
        query: 'missing',
        aircraft: [],
        totalAircraft: 4,
      }),
    ).toContain('No aircraft match the current search.')
  })
})
