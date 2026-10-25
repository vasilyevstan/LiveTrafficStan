import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_ORBITAL_PREDICTION, type ModeledOrbitalPosition, type OrbitalControllerState, type OrbitalObject } from '../domain/orbital'
import type { DiscoveryMatch, DiscoveryResponse } from '../domain/objectDiscovery'
import { qualifiedLastReport, SHIP_POSITION_SOURCE } from '../domain/objectDiscovery'
import { DISCOVERY_CONFIG } from '../config/discoveryConfig'
import { IdentityResults, ObjectFind } from './ObjectFind'
import type { LocationSearchModel } from './useLocationSearchModel'
import type { DisplayAircraft, DisplayVessel } from '../domain/traffic'
import { parseLocationInput } from '../domain/locationInput'
import type { FormEvent } from 'react'

const resultActions = vi.hoisted(() => {
  const actions: ((originId: string) => void)[] = []
  return actions
})
const findInputRender = vi.hoisted(() =>
  vi.fn<(props: Parameters<typeof import('./LocationSearch').LocationSearchInput>[0]) => void>(),
)
vi.mock('./LocationSearch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./LocationSearch')>()
  return {
    ...actual,
    LocationSearchInput: (props: Parameters<typeof actual.LocationSearchInput>[0]) => {
      findInputRender(props)
      return <actual.LocationSearchInput {...props} />
    },
  }
})
vi.mock('./ObjectResultButton', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./ObjectResultButton')>()
  return {
    ObjectResultButton: (props: Parameters<typeof actual.ObjectResultButton>[0]) => {
      resultActions.push(props.onSelect)
      return <actual.ObjectResultButton {...props} />
    },
  }
})

const now = Date.UTC(2026, 9, 14, 12)
const empty = { phase: 'disabled', acceptedCount: 0, positions: [], prediction: EMPTY_ORBITAL_PREDICTION } as const
const record: OrbitalObject = {
  noradCatalogId: '100460', name: 'TEST SIX-DIGIT ORBIT', internationalDesignator: '2026-001A', objectType: 'PAY',
  epoch: new Date(now - 60_000).toISOString(), meanMotion: 15, eccentricity: 0.001, inclination: 53,
  rightAscensionOfAscendingNode: 0, argumentOfPericenter: 0, meanAnomaly: 0, ephemerisType: 0,
  classificationType: 'U', elementSetNumber: 1, revolutionAtEpoch: 1, bstar: 0, meanMotionDot: 0, meanMotionDdot: 0,
  sourceGroups: ['visual'], displayOrder: 0,
}
const snapshot = {
  schemaVersion: 1, sourceContractVersion: 1, catalogId: 'test', sources: [],
  retrievedAt: new Date(now - 30_000).toISOString(), publishedAt: new Date(now - 20_000).toISOString(),
  recordCount: 1, sha256: 'a'.repeat(64), records: [record],
}
const position: ModeledOrbitalPosition = {
  id: 'orbital:100460', noradCatalogId: '100460', name: record.name, internationalDesignator: record.internationalDesignator,
  objectType: 'PAY', sourceGroups: ['visual'], displayOrder: 0, elementEpoch: Date.parse(record.epoch),
  snapshotRetrievedAt: Date.parse(snapshot.retrievedAt), snapshotSha256: snapshot.sha256,
  modeledFor: now, latitude: 0, longitude: 0, altitudeKm: 550, velocityKmPerSecond: 7.6,
}
const orbitalState: OrbitalControllerState = {
  phase: 'ready', acceptedCount: 1, positions: [position], prediction: EMPTY_ORBITAL_PREDICTION, snapshot,
}
const model = (value = ''): LocationSearchModel => ({
  value, handleChange: vi.fn(), handleSubmit: vi.fn(), handleKeyDown: vi.fn(), selectResult: vi.fn(),
  clear: vi.fn(), cancel: vi.fn(), pause: vi.fn(),
})
const render = (overrides: Partial<Parameters<typeof ObjectFind>[0]> = {}) => renderToStaticMarkup(
  <ObjectFind
    model={model('TEST')} inputRef={{ current: null }} maximumQueryLength={100} placeSearchState={{ phase: 'idle' }}
    mobile active paused={false} now={now} navigationDisabled={false} onNavigate={vi.fn()}
    aircraft={[]} vessels={[]} aircraftVisible vesselsVisible selectableVesselIds={new Set()}
    onAircraftSelect={vi.fn()} onVesselSelect={vi.fn()}
    onBeginShipLocate={vi.fn(() => null)}
    airports={[]} airportsReady={false} airportsLoading={false} onLoadAirports={vi.fn()}
    onAirportNavigate={vi.fn(() => true)}
    ports={[]} portsReady={false} portsLoading={false} onLoadPorts={vi.fn()}
    onPortNavigate={vi.fn(() => true)}
    curated={empty} starlink={empty} selectedOrbitalId={null} orbitalVisible={false} onLoadOrbits={vi.fn()}
    onOrbitalNavigate={vi.fn(() => true)}
    {...overrides}
  />,
)
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  resultActions.splice(0)
  findInputRender.mockClear()
})

describe('unified compact Find presentation boundaries', () => {
  it.each([false, true])('uses one input and no object, method or scope selectors (%s)', (mobile) => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const html = render({ mobile, model: model() })
    expect(html.match(/type="search"/g)).toHaveLength(1)
    expect(html).not.toContain('<select')
    expect(html).not.toContain('In view</option>')
    expect(html).toContain('Find objects or places')
    expect(html).toContain('Names, IDs, callsigns or coordinates.')
    expect(html).toContain('Text sent in <a')
    expect(html).toContain('>Photon URL</a>')
    expect(html).toContain('© OpenStreetMap')
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it.each([false, true])('includes loaded satellites without a separate class or tall action block (%s)', (mobile) => {
    const html = render({ mobile, curated: orbitalState, orbitalVisible: true })
    expect(html).toContain('1 match.')
    expect(html.match(/object-find-result__action/g)).toHaveLength(1)
    expect(html).toContain('<summary>Sources</summary>')
    expect(html).toContain('Go to satellite')
  })
  it('navigates with exact orbital identity and opaque origin, not a generic coordinate-only jump', () => {
    const onOrbitalNavigate = vi.fn(() => true)
    const onNavigate = vi.fn()
    render({ curated: orbitalState, orbitalVisible: true, onOrbitalNavigate, onNavigate })
    expect(resultActions).toHaveLength(1)
    resultActions[0]('opaque-orbital-origin')
    expect(onOrbitalNavigate).toHaveBeenCalledExactlyOnceWith('orbital:100460', 'opaque-orbital-origin')
    expect(onNavigate).not.toHaveBeenCalled()
  })
  it('retains Starlink ownership in exact navigation', () => {
    const onOrbitalNavigate = vi.fn(() => true)
    render({
      orbitalVisible: true, onOrbitalNavigate,
      starlink: { ...orbitalState, positions: [{ ...position, id: 'orbital:starlink:100460', owner: 'starlink' }] },
    })
    resultActions[0]('opaque-starlink-origin')
    expect(onOrbitalNavigate).toHaveBeenCalledExactlyOnceWith('orbital:starlink:100460', 'opaque-starlink-origin')
  })
  it('explains an old element epoch despite a fresh catalog retrieval without offering a false current location', () => {
    const html = render({
      orbitalVisible: true,
      curated: {
        ...orbitalState, positions: [],
        snapshot: { ...snapshot, records: [{ ...record, epoch: new Date(now - 22 * 24 * 60 * 60_000).toISOString() }] },
      },
    })
    expect(html).toContain('Cannot locate: elements are 22 days old (14-day limit).')
    expect(html).toMatch(/<button[^>]*aria-label="Go to satellite[^"]*"[^>]*disabled=""[^>]*>Go<\/button>/)
    expect(html).not.toContain('Modeled position unavailable')
  })
  it('keeps explicit Enable available for a loaded catalog after ORBITS is switched off', () => {
    const load = vi.fn()
    const html = render({ curated: { ...orbitalState, phase: 'disabled' }, onLoadOrbits: load })
    expect(html).toContain('Enable ORBITS to locate this satellite.')
    expect(html).toMatch(/<button type="button">Enable ORBITS<\/button>/)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Go<\/button>/)
    expect(load).not.toHaveBeenCalled()
  })
  it.each([
    ['paused-history', 'Return to LIVE'],
    ['paused-capture', 'Return to the map'],
    ['paused-hidden', 'while this tab is hidden'],
    ['offline', 'Reconnect'],
  ] as const)('explains the existing %s pause without substituting old coordinates', (phase, message) => {
    const html = render({ curated: { ...orbitalState, phase }, orbitalVisible: true })
    expect(html).toContain(message)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Go<\/button>/)
  })
  it('does not automatically download or enable an unloaded static/orbital catalog', () => {
    const fetchMock = vi.fn()
    const load = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const html = render({ onLoadAirports: load, onLoadPorts: load, onLoadOrbits: load })
    expect(html).toContain('type="search"')
    expect(html).toContain('Some satellite catalogs are not loaded or usable.')
    expect(html).not.toContain('0 matches')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(load).not.toHaveBeenCalled()
  })
  it('keeps the local orbital query available while loading without reporting a false empty result', () => {
    const html = render({
      orbitalVisible: true,
      curated: { ...empty, phase: 'loading' },
    })
    expect(html).toContain('type="search"')
    expect(html).toContain('not loaded or usable')
    expect(html).toContain('Retry satellite catalogs')
    expect(html).not.toContain('0 matches')
  })
  it('uses loaded static coordinates for explicit navigation, not synthetic traffic or hidden-layer activation', () => {
    const html = render({
      model: model('OUTSIDE'), portsReady: true,
      ports: [{ id: 'port:outside', name: 'OUTSIDE PORT', rank: 1, latitude: -30, longitude: 140 }],
    })
    expect(html).toContain('OUTSIDE PORT')
    expect(html).toContain('generalized static location')
    expect(html).toContain('Go to port')
    expect(html).not.toContain('vessel:')
    expect(html).not.toContain('port:outside')
  })
  it('passes exact airport identity and the actual opaque origin to navigate-and-details', () => {
    const onAirportNavigate = vi.fn(() => true)
    const onNavigate = vi.fn()
    render({
      model: model('Tallinn'), airportsReady: true, onAirportNavigate, onNavigate,
      airports: [{
        id: 'airport:1', ident: 'EETN', name: 'Tallinn Airport', kind: 'large',
        isoCountry: 'EE', latitude: 59.4133, longitude: 24.8328,
      }],
    })
    expect(onAirportNavigate).not.toHaveBeenCalled()
    expect(resultActions).toHaveLength(1)
    resultActions[0]('opaque-airport-origin')
    expect(onAirportNavigate).toHaveBeenCalledExactlyOnceWith('airport:1', 'opaque-airport-origin')
    expect(onNavigate).not.toHaveBeenCalled()
  })
  it('passes port identity and origin without substituting the generic coordinate action', () => {
    const onPortNavigate = vi.fn(() => true)
    const onNavigate = vi.fn()
    render({
      model: model('OUTSIDE'), portsReady: true, onPortNavigate, onNavigate,
      ports: [{ id: 'port:outside', name: 'OUTSIDE PORT', rank: 1, latitude: -30, longitude: 140 }],
    })
    expect(onPortNavigate).not.toHaveBeenCalled()
    expect(resultActions).toHaveLength(1)
    resultActions[0]('opaque-port-origin')
    expect(onPortNavigate).toHaveBeenCalledExactlyOnceWith('port:outside', 'opaque-port-origin')
    expect(onNavigate).not.toHaveBeenCalled()
  })
  it('keeps an unavailable off-layer catalog distinct from a successful empty search', () => {
    const load = vi.fn()
    const html = render({ airportsError: 'Catalog checksum failed.', onLoadAirports: load })
    expect(html).toContain('Catalog checksum failed.')
    expect(html).not.toContain('0 matches')
    expect(load).not.toHaveBeenCalled()
    expect(render({ airportsReady: true })).toContain('Press Search to include online results')
  })

  it('shows mixed received, catalog and place results with flags and source-qualified locality hints', () => {
    const aircraft: DisplayAircraft = {
      kind: 'aircraft', id: 'aircraft:4840d6', hex: '4840d6', callsign: 'TEST FLIGHT',
      provider: 'ADSB.lol', markerIcon: 'aircraft', markerScale: 1, receivedAt: now, freshness: 'live',
      position: { latitude: 59.4, longitude: 24.7, observedAt: now },
    }
    const vessel: DisplayVessel = {
      kind: 'vessel', id: 'vessel:230123456', mmsi: 230123456, name: 'TEST SHIP', provider: 'Digitraffic',
      markerIcon: 'vessel', markerScale: 1, receivedAt: now, freshness: 'live',
      vesselCategory: 'cargo', navigationCategory: 'unknown',
      position: { latitude: 59.4, longitude: 24.7, observedAt: now },
    }
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const html = render({
      aircraft: [aircraft], vessels: [vessel], selectableVesselIds: new Set([vessel.id]),
      airportsReady: true, airports: [{
        id: 'airport:1', name: 'TEST Airport', ident: 'TEST', municipality: 'Tallinn', isoCountry: 'EE',
        kind: 'large', latitude: 59.4, longitude: 24.7,
      }],
      portsReady: true, ports: [{ id: 'port:test', name: 'TEST PORT', rank: 1, latitude: 59.4, longitude: 24.7 }],
      curated: orbitalState, orbitalVisible: true,
      placeSearchState: { phase: 'results', query: 'TEST', results: [{
        id: 'place:test', label: 'TEST Place, Tallinn, Estonia', center: { latitude: 59.4, longitude: 24.7, label: 'TEST Place' },
      }] },
    })
    expect(html).toContain('6 matches.')
    expect(html.match(/class="object-find-result"/g)).toHaveLength(6)
    expect(html).toContain('aria-label="MMSI flag state: Finland"')
    expect(html).toContain('aria-label="ICAO24 allocation: Netherlands"')
    expect(html).toContain('🇫🇮')
    expect(html).toContain('Tallinn · EE')
    expect(html).toContain('TEST Place, Tallinn, Estonia')
    expect(html).not.toContain('object-find-result__details')
    expect(html).not.toContain('object-find-result__information')
    expect(html).not.toContain('object-find-result__country')
    expect(html).not.toMatch(/<li class="object-find-result">(?:(?!<\/li>)[\s\S])*<(?:details|summary|p)[ >]/)
    expect(html).toContain('Report just now')
    expect(html).toContain('OurAirports · static')
    expect(html).toContain('Natural Earth · static')
    expect(html).toContain('Modeled just now')
    expect(html).not.toMatch(/id="[^"]*(230123456|4840d6|100460)/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('deduplicates received and cached exact identities without enriching live entities from identity results', () => {
    const ship: DisplayVessel = {
      kind: 'vessel', id: 'vessel:230123456', mmsi: 230123456, name: 'TEST SHIP', provider: 'Digitraffic',
      markerIcon: 'vessel', markerScale: 1, receivedAt: now, freshness: 'live',
      vesselCategory: 'cargo', navigationCategory: 'unknown',
      position: { latitude: 59.4, longitude: 24.7, observedAt: now },
    }
    const cached: DiscoveryMatch = {
      objectClass: 'ships', key: 'digitraffic:230123456', name: 'TEST DIFFERENT METADATA',
      identifiers: { mmsi: '230123456' }, metadataReportedAt: now, location: null,
      source: { name: 'Digitraffic', code: 'Digitraffic', credit: 'Fintraffic CC BY 4.0' },
    }
    const html = render({
      vessels: [ship], discoverMarineMetadata: () => ({ loaded: true, result: {
        objectClass: 'ships', retrievedAt: now, matches: [cached], truncated: false, rejectedRecords: 0,
      } }),
    })
    expect(html).toContain('1 match.')
    expect(html).not.toContain('TEST DIFFERENT METADATA')
    expect(html).toContain('Hidden by SHIPS or map filters.')
    expect(ship.name).toBe('TEST SHIP')
  })

  it('bounds a mixed list to the existing 20-row page without reducing its honest count', () => {
    const html = render({
      portsReady: true,
      ports: Array.from({ length: 27 }, (_, index) => ({
        id: `port:${index}`, name: `TEST PORT ${index}`, rank: index, latitude: 0, longitude: 0,
      })),
    })
    expect(html).toContain('27 matches · 1–20.')
    expect(html.match(/class="object-find-result"/g)).toHaveLength(20)
    expect(html).toContain('>Next</button>')
  })
})

describe('unified explicit submission and immediate cancellation', () => {
  const event = () => ({ preventDefault: () => undefined }) as FormEvent<HTMLFormElement>
  const input = () => {
    const props = findInputRender.mock.lastCall?.[0]
    if (!props) throw Error('Unified Find input was not rendered')
    return props.model
  }
  it('submits each compatible fixed source once, loads static catalogs once, and does not enable orbits', async () => {
    vi.stubGlobal('document', { hidden: false })
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('window', { setTimeout, clearTimeout })
    const fetchMock = vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify({
      objectClass: url.endsWith('ships') ? 'ships' : 'aircraft', retrievedAt: Date.now(),
      truncated: false, rejectedRecords: 0, matches: [],
    }), { headers: { 'Content-Type': 'application/json' } })))
    vi.stubGlobal('fetch', fetchMock)
    const onLoadAirports = vi.fn(), onLoadPorts = vi.fn(), onLoadOrbits = vi.fn()
    const handleSubmit = vi.fn(() => parseLocationInput('TEST', 3, 100))
    render({ model: { ...model('TEST'), handleSubmit }, onLoadAirports, onLoadPorts, onLoadOrbits })
    expect(fetchMock).not.toHaveBeenCalled()
    input().handleSubmit(event())
    input().handleSubmit(event())
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(handleSubmit).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/find/ships', '/api/find/aircraft'])
    expect(onLoadAirports).toHaveBeenCalledOnce()
    expect(onLoadPorts).toHaveBeenCalledOnce()
    expect(onLoadOrbits).not.toHaveBeenCalled()
  })
  it.each(['59.437, 24.754', '59..437, 24.754'])('keeps coordinate intent local for %s', (value) => {
    const fetchMock = vi.fn(), load = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render({ model: { ...model(value), handleSubmit: () => parseLocationInput(value, 3, 100) },
      onLoadAirports: load, onLoadPorts: load, onLoadOrbits: load })
    input().handleSubmit(event())
    expect(fetchMock).not.toHaveBeenCalled()
    expect(load).not.toHaveBeenCalled()
  })
  it('aborts both independent lookups on Clear without waiting for an effect or resetting source deadlines', async () => {
    vi.stubGlobal('document', { hidden: false })
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('window', { setTimeout, clearTimeout })
    const pending: { signal: AbortSignal; resolve: (response: Response) => void }[] = []
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((resolve) => {
      if (!(init.signal instanceof AbortSignal)) throw Error('Missing request cancellation')
      pending.push({ signal: init.signal, resolve })
    }))
    vi.stubGlobal('fetch', fetchMock)
    render({ model: { ...model('TEST'), handleSubmit: () => parseLocationInput('TEST', 3, 100) } })
    input().handleSubmit(event())
    expect(pending).toHaveLength(2)
    input().clear()
    expect(pending.every(({ signal }) => signal.aborted)).toBe(true)
    for (const { resolve } of pending) resolve(new Response('{}', { headers: { 'Content-Type': 'application/json' } }))
    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('last-report navigation qualification at display and action time', () => {
  const match: DiscoveryMatch = {
    objectClass: 'aircraft', key: 'adsb-lol:abc123', identifiers: { icao24: 'abc123' },
    source: { name: 'ADSB.lol', code: 'ADSB.lol', credit: 'ADSB.lol · ODbL 1.0' },
    metadataReportedAt: now, location: { latitude: 59, longitude: 24, reportedAt: now },
  }
  const result: DiscoveryResponse = { objectClass: 'aircraft', retrievedAt: now, matches: [match], truncated: false, rejectedRecords: 0 }
  it('requires a current qualified aircraft last report, never a ship metadata point', () => {
    expect(qualifiedLastReport(match, result, now)).toBe(match.location)
    expect(qualifiedLastReport({ ...match, objectClass: 'ships' }, result, now)).toBeNull()
    expect(qualifiedLastReport({ ...match, location: null }, result, now)).toBeNull()
  })
  it('reevaluates original position age, retrieval age and backwards clock jumps without refetching', () => {
    expect(qualifiedLastReport(match, result, now + DISCOVERY_CONFIG.maximumAircraftSnapshotAgeMs + 1)).toBeNull()
    expect(qualifiedLastReport({ ...match, location: { ...match.location!, reportedAt: now - DISCOVERY_CONFIG.maximumAircraftPositionAgeMs - 1 } }, result, now)).toBeNull()
    expect(qualifiedLastReport(match, result, now - DISCOVERY_CONFIG.futureToleranceMs - 1)).toBeNull()
    expect(qualifiedLastReport(match, result, now + DISCOVERY_CONFIG.maximumAircraftSnapshotAgeMs)).not.toBeNull()
  })
  it('qualifies an explicitly tagged ship track but never ordinary REST geometry or metadata time', () => {
    const ship: DiscoveryMatch = {
      ...match, objectClass: 'ships', key: 'open-waters:230123456', identifiers: { mmsi: '230123456' },
      source: { name: 'Open Waters AIS', code: SHIP_POSITION_SOURCE, credit: 'Fintraffic · CC BY 4.0' },
      metadataReportedAt: null,
    }
    const response = { ...result, objectClass: 'ships' as const, matches: [ship] }
    expect(qualifiedLastReport(ship, response, now)).toBe(ship.location)
    expect(qualifiedLastReport({ ...ship, metadataReportedAt: now }, response, now)).toBeNull()
    expect(qualifiedLastReport({ ...ship, source: { ...ship.source, code: 'digitraffic:station' } }, response, now)).toBeNull()
    expect(qualifiedLastReport(ship, response, now + DISCOVERY_CONFIG.maximumShipSnapshotAgeMs + 1)).toBeNull()
    expect(qualifiedLastReport({ ...ship, location: { ...ship.location!, reportedAt: now - DISCOVERY_CONFIG.shipPositionWindowMs } }, response, now)).not.toBeNull()
    expect(qualifiedLastReport({ ...ship, location: { ...ship.location!, reportedAt: now - DISCOVERY_CONFIG.shipPositionWindowMs - 1 } }, response, now)).toBeNull()
  })
})

describe('explicit ship Locate row presentation', () => {
  const ship: DiscoveryMatch = {
    objectClass: 'ships', key: 'open-waters:230123456', name: 'TEST SHIP',
    identifiers: { mmsi: '230123456' }, location: null, metadataReportedAt: now - 1_000,
    source: { name: 'Open Waters AIS', code: 'digitraffic:station', credit: 'Identity source credit' },
  }
  const result: DiscoveryResponse = {
    objectClass: 'ships', retrievedAt: now, truncated: false, rejectedRecords: 0,
    matches: [ship, { ...ship, key: 'open-waters:230123457', name: 'OTHER SHIP', identifiers: { mmsi: '230123457' } }],
  }
  type Locate = NonNullable<Parameters<typeof IdentityResults>[0]['shipLocate']>
  const locator = (overrides: Partial<Locate> = {}): Locate => ({
    key: null, state: { phase: 'idle' }, disabled: false, onLocate: vi.fn(), ...overrides,
  })
  const renderShips = (shipLocate?: Locate, navigationDisabled = false) => renderToStaticMarkup(
    <IdentityResults result={result} now={now} navigationDisabled={navigationDisabled} onNavigate={vi.fn()} shipLocate={shipLocate} />,
  )
  it('renders one named Locate per outside-view identity and performs no request during rendering', () => {
    const fetchMock = vi.fn()
    const onLocate = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const html = renderShips(locator({ onLocate }))
    expect(html).toContain('2 matches')
    expect(html).toContain('aria-label="Locate TEST SHIP, MMSI 230123456"')
    expect(html).toContain('aria-label="Locate OTHER SHIP, MMSI 230123457"')
    expect(html.match(/>Locate<\/button>/g)).toHaveLength(2)
    expect(html).not.toContain('This source cannot locate')
    expect(html).not.toMatch(/id="[^"]*230123456/)
    expect(onLocate).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    resultActions[0]('opaque-origin')
    expect(onLocate).toHaveBeenCalledExactlyOnceWith(ship)
  })
  it('keeps Received identity-only and retains qualified aircraft last-report navigation', () => {
    const html = renderShips()
    expect(html).toContain('Identity only')
    expect(html).not.toContain('>Locate</button>')
    expect(resultActions).toHaveLength(0)
    const aircraft: DiscoveryMatch = {
      objectClass: 'aircraft', key: 'adsb-lol:abc123', identifiers: { icao24: 'abc123' },
      metadataReportedAt: now, source: { name: 'ADSB.lol', code: 'ADSB.lol', credit: 'ADSB.lol · ODbL 1.0' },
      location: { latitude: 59.44, longitude: 24.75, reportedAt: now },
    }
    const aircraftHtml = renderToStaticMarkup(<IdentityResults
      result={{ ...result, objectClass: 'aircraft', matches: [aircraft] }}
      now={now} navigationDisabled={false} onNavigate={vi.fn()}
    />)
    expect(aircraftHtml).toContain('Go to last report')
    expect(aircraftHtml).toContain('>Locate</button>')
    expect(aircraftHtml).not.toContain('aria-label="Locate ')
  })
  it('retains the same result buttons while one row is busy instead of replacing the list or disabling its native focus', () => {
    const idle = renderShips(locator())
    resultActions.splice(0)
    const onLocate = vi.fn()
    const busy = renderShips(locator({
      key: ship.key, state: { phase: 'loading', request: { objectClass: 'ships', by: 'position', query: '230123456' } },
      onLocate,
    }))
    expect(busy).toContain('TEST SHIP')
    expect(busy).toContain('OTHER SHIP')
    expect(busy).toContain('aria-busy="true"')
    expect(busy).toContain('aria-disabled="true"')
    expect(busy).not.toContain(' disabled=""')
    expect([...busy.matchAll(/<button id="([^"]+)"/g)].map((match) => match[1]))
      .toEqual([...idle.matchAll(/<button id="([^"]+)"/g)].map((match) => match[1]))
    resultActions[0]('opaque-origin')
    expect(onLocate).not.toHaveBeenCalled()
  })
  it.each([
    ['Position unavailable: no reports in the last 24 hours.', { phase: 'results', request: { objectClass: 'ships', by: 'position', query: '230123456' }, result: { ...result, matches: [] } }],
    ['Lookup timed out. The map and local search still work.', { phase: 'error', message: 'Lookup timed out. The map and local search still work.' }],
    ['Lookup is limited. Try again in 45s.', { phase: 'error', message: 'Lookup is limited. Try again in 45s.', retryAt: now + 45_000 }],
  ] as const)('keeps missing reports, timeout and limits explicit beside the exact row: %s', (message, state) => {
    const html = renderShips(locator({ key: ship.key, message, state }))
    expect(html).toContain(message)
    expect(html).toContain('TEST SHIP')
    expect(html).toContain('OTHER SHIP')
    expect(html.match(/>Locate<\/button>/g)).toHaveLength(2)
  })
  it('separates observation and retrieval time from identity metadata and credits the actual track without claiming live selection', () => {
    const located: DiscoveryMatch = {
      ...ship, metadataReportedAt: null,
      source: { name: 'Open Waters AIS', code: SHIP_POSITION_SOURCE, credit: 'Complete original track credit' },
      location: { latitude: 59.44, longitude: 24.75, reportedAt: now - 5_000 },
    }
    const html = renderShips(locator({
      key: ship.key, message: 'Report found; a newer action kept the map unchanged.',
      state: {
        phase: 'results', request: { objectClass: 'ships', by: 'position', query: '230123456' },
        result: { ...result, matches: [located] },
      },
    }))
    expect(html).toContain('a newer action kept the map unchanged')
    expect(html).toContain(new Date(now - 5_000).toISOString())
    expect(html).toContain(new Date(now - 1_000).toISOString())
    expect(html).toContain('Complete original track credit')
    expect(html).toContain('Identity source credit')
    expect(html).toContain('Last report 5 sec ago')
    expect(html).toContain(`dateTime="${new Date(now - 5_000).toISOString()}"`)
    expect(html).not.toContain('<p>Position')
    expect(html).not.toContain('search does not supply a position or city')
    expect(html).not.toContain('vessel:230123456')
  })
  it('keeps successful Locate compact with one source/age label and no expandable dossier', () => {
    const located: DiscoveryMatch = {
      ...ship, metadataReportedAt: null,
      source: { name: 'Open Waters AIS', code: SHIP_POSITION_SOURCE, credit: 'Complete original track credit' },
      location: { latitude: 59.44, longitude: 24.75, reportedAt: now - 60 * 60_000 },
    }
    const html = renderShips(locator({
      key: ship.key,
      state: {
        phase: 'results', request: { objectClass: 'ships', by: 'position', query: '230123456' },
        result: { ...result, retrievedAt: now - 1_000, matches: [located] },
      },
    }))
    expect(html).toContain('Open Waters AIS · <time')
    expect(html).toContain('Last report 1 hr ago')
    expect(html).toContain(`Position retrieved ${new Date(now - 1_000).toISOString()}`)
    expect(html).toContain('Complete original track credit')
    expect(html.match(/>Locate<\/button>/g)).toHaveLength(2)
    expect(html).not.toContain('<details')
    expect(html).not.toContain('<summary')
    expect(html).not.toContain('Centered on the reported position')
    expect(html).not.toContain('<p>Metadata')
    expect(html).not.toContain('<p>Retrieved')
  })
  it('keeps an explicit paused/navigation-disabled action disabled without requesting a position', () => {
    const html = renderShips(locator({ disabled: true }))
    expect(html.match(/ disabled=""/g)).toHaveLength(2)
    expect(renderShips(locator(), true).match(/ disabled=""/g)).toHaveLength(2)
  })
})
