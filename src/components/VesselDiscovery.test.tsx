import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DisplayVessel } from '../domain/traffic'
import {
  DEFAULT_VESSEL_FILTERS,
  VESSEL_RESULT_LIMIT,
} from '../domain/vesselFilters'
import { VesselDiscovery } from './VesselDiscovery'

const vessel = (index: number): DisplayVessel => ({
  id: `vessel:${index}`,
  kind: 'vessel',
  provider: 'Digitraffic',
  mmsi: 230000000 + index,
  imo: 9000000 + index,
  name: `TEST SHIP ${index}`,
  callSign: `TEST${index}`,
  vesselCategory: 'cargo',
  navigationCategory: 'underway',
  lengthMeters: 100,
  position: {
    latitude: 59.4,
    longitude: 24.7,
    observedAt: 1_800_000_000_000,
  },
  receivedAt: 1_800_000_000_000,
  markerIcon: 'vessel-cargo',
  markerScale: 1,
  freshness: 'live',
})

const renderDiscovery = (
  overrides: Partial<Parameters<typeof VesselDiscovery>[0]> = {},
) =>
  renderToStaticMarkup(
    <VesselDiscovery
      filters={DEFAULT_VESSEL_FILTERS}
      vessels={[vessel(1)]}
      totalVessels={3}
      vesselsVisible
      emptyMessage="No current ships in this view."
      units="metric"
      onFiltersChange={() => undefined}
      onSelect={() => undefined}
      {...overrides}
    />,
  )

describe('VesselDiscovery', () => {
  it('exposes the released default, explicit unknown behavior, count, and native controls', () => {
    const html = renderDiscovery()

    expect(html).toContain('Vessel discovery')
    expect(html).toContain('Name, callsign, MMSI, or IMO')
    expect(html).toContain(
      'non-yachts 50 m or longer · non-yachts with unknown length hidden',
    )
    expect(html).toContain('1 of 3 ships shown')
    expect(html).toContain('Reported speed')
    expect(html).toContain('Non-yacht minimum length')
    expect(html).toContain('Maximum length (all vessels)')
    expect(html).toContain('Include non-yachts with unknown length')
    expect(html).toContain('Sailing and pleasure craft')
    expect(html).toContain('Class B yacht coverage is incomplete')
    expect(html).toContain('RESET FILTERS')
  })

  it('bounds result buttons and disables invisible selection while SHIPS is hidden', () => {
    const vessels = Array.from(
      { length: VESSEL_RESULT_LIMIT + 3 },
      (_, index) => vessel(index),
    )
    const html = renderDiscovery({
      filters: { ...DEFAULT_VESSEL_FILTERS, query: 'test' },
      vessels,
      totalVessels: vessels.length,
      vesselsVisible: false,
    })

    expect((html.match(/<li>/g) ?? [])).toHaveLength(VESSEL_RESULT_LIMIT)
    expect(html).toContain('SHIPS layer hidden')
    expect(html).toContain('disabled=""')
    expect(html).toContain('Show the SHIPS layer')
    expect(html).toContain('id="vessel-discovery-result-vessel:0"')
    expect(html).toContain(
      `Showing the first ${VESSEL_RESULT_LIMIT} of ${vessels.length} matches`,
    )
  })

  it('keeps no-current and no-match states distinct', () => {
    expect(
      renderDiscovery({ vessels: [], totalVessels: 0 }),
    ).toContain('No current ships in this view.')
    expect(
      renderDiscovery({
        filters: { ...DEFAULT_VESSEL_FILTERS, query: 'missing' },
        vessels: [],
        totalVessels: 4,
      }),
    ).toContain('No ships match the current vessel filters.')
  })
})
