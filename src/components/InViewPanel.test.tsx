import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { APP_CONFIG } from '../config/appConfig'
import type { ModeledOrbitalPosition } from '../domain/orbital'
import { displayTraffic } from '../traffic/freshness'
import type { Aircraft, Vessel } from '../domain/traffic'
import { InViewPanel } from './InViewPanel'

const now = Date.UTC(2026, 9, 9, 12)
const observations: Aircraft[] = Array.from({ length: 45 }, (_, index) => ({
  id: `aircraft:${(index + 1).toString(16).padStart(6, '0')}`,
  kind: 'aircraft',
  provider: 'ADSB.lol',
  hex: (index + 1).toString(16).padStart(6, '0'),
  callsign: `TEST ${index + 1}`,
  registration: `ES-T${index + 1}`,
  aircraftType: 'A320',
  position: { latitude: 59.4, longitude: 24.7, observedAt: now },
  receivedAt: now,
  markerIcon: 'aircraft',
  markerScale: 1,
}))
const position: ModeledOrbitalPosition = {
  id: 'orbital:25544',
  noradCatalogId: '25544',
  name: 'ISS (ZARYA)',
  internationalDesignator: '1998-067A',
  objectType: 'PAY',
  sourceGroups: ['stations'],
  displayOrder: 1,
  elementEpoch: now - 60_000,
  snapshotRetrievedAt: now - 30_000,
  snapshotSha256: 'a'.repeat(64),
  modeledFor: now,
  latitude: 0,
  longitude: 0,
  altitudeKm: 400,
  velocityKmPerSecond: 7.6,
}
const vesselObservations: Vessel[] = Array.from({ length: 45 }, (_, index) => ({
  id: `vessel:${257000001 + index}`,
  kind: 'vessel',
  provider: 'Digitraffic',
  mmsi: 257000001 + index,
  name: `VESSEL ${index + 1}`,
  vesselCategory: 'cargo',
  navigationCategory: 'underway',
  lengthMeters: 50 + index * 7,
  draughtMeters: 4 + index / 10,
  position: { latitude: 59.4, longitude: 24.7, observedAt: now },
  receivedAt: now,
  markerIcon: 'vessel-cargo',
  markerScale: 1,
}))

const renderPanel = (
  overrides: Partial<Parameters<typeof InViewPanel>[0]> = {},
) => renderToStaticMarkup(
  <InViewPanel
    aircraft={displayTraffic(observations, now, APP_CONFIG.aircraft)}
    totalAircraft={45}
    aircraftQuery=""
    aircraftVisible
    aircraftAvailability={{ available: true }}
    selectedAircraftId={null}
    onAircraftQueryChange={() => undefined}
    onAircraftSelect={() => undefined}
    vessels={displayTraffic(vesselObservations, now, APP_CONFIG.marine)}
    vesselsVisible
    vesselAvailability={{ available: true }}
    selectedVesselId={null}
    onVesselSelect={() => undefined}
    orbits={{
      available: true,
      rows: [{ position, shown: true }],
      shownCount: 1,
      partial: false,
      sourceMessages: [],
    }}
    selectedOrbitalId={null}
    onOrbitalSelect={() => undefined}
    pageSize={20}
    maximumOrbitalQueryLength={64}
    {...overrides}
  />,
)

describe('InViewPanel', () => {
  it('bounds each page to twenty individual results while retaining the full count', () => {
    const html = renderPanel()
    expect(html).toContain('45 individual aircraft in view')
    expect(html.match(/id="in-view-aircraft-result-/g)).toHaveLength(20)
    expect(html).toContain('1–20 of 45')
    expect(html).toContain('>Previous</button>')
    expect(html).toContain('>Next</button>')
    expect(html).toContain('TEST 20')
    expect(html).not.toContain('TEST 21')
    expect(html).toContain('not cluster symbols or fading last-local samples')
  })

  it('keeps categories accessible and inactive content hidden with local search limits', () => {
    const html = renderPanel()
    expect(html).toContain('class="control-options control-options--three in-view__tabs"')
    expect(html).toContain('role="group" aria-label="In view category"')
    expect(html).toContain(
      'id="in-view-aircraft-tab" type="button" class="is-active" aria-pressed="true"',
    )
    expect(html).toMatch(/id="in-view-orbits-panel"[^>]*hidden=""/)
    expect(html).toMatch(/id="in-view-ships-panel"[^>]*hidden=""/)
    expect(html).toContain('aria-label="Search aircraft in view"')
    expect(html).toContain('aria-label="Search modeled objects in view"')
    expect(html.match(/maxLength="64"/g)).toHaveLength(2)
  })

  it('adds a capped ship shortlist, not a second all-vessel list or another mobile search row', () => {
    const html = renderPanel()
    expect(html).toContain('20 of 45 ranked · 45 in view')
    expect(html.match(/id="in-view-ships-result-/g)).toHaveLength(20)
    expect(html).toContain('>VESSEL 45</strong>')
    expect(html).toContain('>VESSEL 26</strong>')
    expect(html).not.toContain('>VESSEL 25</strong>')
    expect(html).toContain('id="in-view-ships-ranking-length"')
    expect(html).toContain('>Longest</button>')
    expect(html).toContain('>Deepest draught</button>')
    expect(html).toContain('aria-label="Ranked ships in view"')
    expect(html).not.toContain('id="in-view-ships-search"')
    expect(html).toContain('search and vessel filters are in More')
    expect(html).toContain('Reported draught is not water depth')
  })

  it('shows reported measurements and missing-value exclusions without guessing', () => {
    const vessels = displayTraffic([
      { ...vesselObservations[0], draughtMeters: undefined },
      { ...vesselObservations[1], lengthMeters: undefined },
    ], now, APP_CONFIG.marine)
    const html = renderPanel({ vessels })
    expect(html).toContain('1 of 1 ranked · 2 in view')
    expect(html).toContain('Draught not reported')
    expect(html).toContain('1 without reported length; omitted, not zero.')
    expect(html.match(/id="in-view-ships-result-/g)).toHaveLength(1)
  })

  it('distinguishes an empty ship view, unavailable observation state and unrankable measurements', () => {
    expect(renderPanel({ vessels: [] }))
      .toContain('No current ship observations match this view and its filters.')
    const unavailable = renderPanel({
      vesselAvailability: { available: false, message: 'Marine source unavailable. This is not an empty result.' },
    })
    expect(unavailable).not.toContain('in-view-ships-result-')
    expect(unavailable).not.toContain('ranked · 45 in view')
    expect(unavailable).toContain('This is not an empty result.')
    const unknown = renderPanel({
      vessels: displayTraffic([{ ...vesselObservations[0], lengthMeters: undefined }], now, APP_CONFIG.marine),
    })
    expect(unknown).toContain('0 of 0 ranked · 1 in view')
    expect(unknown).toContain('No ships in this view report a usable length.')
    expect(unknown).not.toContain('No current ship observations')
  })

  it('preserves exact vessel selection, stale labels and hidden-layer restrictions without activating anything', () => {
    const onVesselSelect = vi.fn()
    const vessels = displayTraffic([{
      ...vesselObservations[0],
      position: { ...vesselObservations[0].position, observedAt: now - APP_CONFIG.marine.staleAfterMs - 1 },
    }], now, APP_CONFIG.marine)
    const html = renderPanel({
      vessels, vesselsVisible: false, selectedVesselId: vessels[0].id, onVesselSelect,
      vesselAvailability: { available: true, message: 'Offline · last received, unexpired observations only.' },
    })
    expect(html).toContain('1 of 1 ranked · 1 in view · layer hidden')
    expect(html).toMatch(/id="in-view-ships-result-[^"]+"[^>]*aria-pressed="true"[^>]*disabled=""/)
    expect(html).toContain('MMSI 257000001')
    expect(html).toContain('STALE')
    expect(html).toContain('Offline')
    expect(onVesselSelect).not.toHaveBeenCalled()
  })

  it('labels selected ships outside the shortlist without promoting them into the ranking', () => {
    const html = renderPanel({ selectedVesselId: vesselObservations[0].id })
    expect(html).toContain('Selected outside this shortlist: VESSEL 1. Not added to the ranking.')
    expect(html.match(/id="in-view-ships-result-/g)).toHaveLength(20)
    expect(html).not.toContain('id="in-view-ships-result-vessel:257000001"')
  })

  it('qualifies retained and hidden aircraft without enabling a layer or selecting a row', () => {
    const onAircraftSelect = vi.fn()
    const html = renderPanel({
      aircraftVisible: false,
      onAircraftSelect,
      aircraftAvailability: {
        available: true,
        message: 'Offline · last received, unexpired observations only.',
      },
    })
    expect(html).toContain('45 individual aircraft in view · layer hidden')
    expect(html).toContain('Offline')
    expect(html).toMatch(/id="in-view-aircraft-result-[^"]+"[^>]*disabled=""/)
    expect(onAircraftSelect).not.toHaveBeenCalled()
  })

  it('does not render retained historical aircraft or report zero during unavailable coverage', () => {
    const html = renderPanel({
      aircraftAvailability: {
        available: false,
        message: 'HISTORY · current aircraft list paused. Return to Live to resume.',
      },
    })
    expect(html).toContain('Return to Live')
    expect(html).not.toContain('individual aircraft in view')
    expect(html).not.toContain('in-view-aircraft-result-')
    expect(html).not.toContain('No unexpired aircraft')
  })

  it('retains stale row labels and excludes expired observations through the shared display path', () => {
    const stale = {
      ...observations[0],
      position: { ...observations[0].position, observedAt: now - APP_CONFIG.aircraft.staleAfterMs - 1 },
    }
    const expired = {
      ...observations[1],
      position: { ...observations[1].position, observedAt: now - APP_CONFIG.aircraft.expireAfterMs - 1 },
    }
    const aircraft = displayTraffic([stale, expired], now, APP_CONFIG.aircraft)
    const html = renderPanel({ aircraft, totalAircraft: aircraft.length })
    expect(html).toContain('1 individual aircraft in view')
    expect(html).toContain('STALE')
    expect(html).not.toContain('TEST 2')
  })

  it('distinguishes a successful empty view from a local search with no matches', () => {
    expect(renderPanel({ aircraft: [], totalAircraft: 0 }))
      .toContain('No unexpired aircraft in this view.')
    const unmatched = renderPanel({ aircraft: [], aircraftQuery: 'NOT FOUND' })
    expect(unmatched).toContain('0 of 45 match this search.')
    expect(unmatched).toContain('No objects match this search.')
    expect(unmatched).not.toContain('No unexpired aircraft')
  })

  it('retains exact orbital identity, source clocks, selection, and modeling caveats', () => {
    const html = renderPanel({ selectedOrbitalId: position.id })
    expect(html).toContain('1 shown of 1 modeled in view')
    expect(html).toContain('NORAD 25544 · PAY · Curated')
    expect(html).toContain('id="in-view-orbits-result-norad:25544"')
    expect(html).toMatch(/id="in-view-orbits-result-norad:25544"[^>]*aria-pressed="true"/)
    expect(html).toContain(`Element epoch ${new Date(position.elementEpoch).toISOString()}`)
    expect(html).toContain(`Modeled ${new Date(position.modeledFor).toISOString()}`)
    expect(html).toContain(`Retrieved ${new Date(position.snapshotRetrievedAt).toISOString()}`)
    expect(html).toContain('not live telemetry or optical visibility')
    expect(html).toContain('not the full constellation')
  })

  it('labels partial sources, zoom-hidden rows, and selected exceptions outside totals', () => {
    const html = renderPanel({
      orbits: {
        available: true,
        rows: [{ position, shown: false }],
        shownCount: 0,
        partial: true,
        sourceMessages: ['Starlink sample: unavailable. Use More for source details and retry.'],
        selectedOutside: {
          position: { ...position, name: 'OUTSIDE', id: 'orbital:99999' },
          reason: 'view',
        },
      },
    })
    expect(html).toContain('0 shown of 1 modeled in view · partial')
    expect(html).toContain('Starlink sample: unavailable')
    expect(html).toContain('Not shown at this zoom')
    expect(html).toContain('Selected outside this view: OUTSIDE. Not added to these totals.')
    expect(html.match(/id="in-view-orbits-result-/g)).toHaveLength(1)
  })
})
