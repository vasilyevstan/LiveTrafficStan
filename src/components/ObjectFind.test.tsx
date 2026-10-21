import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_ORBITAL_PREDICTION, type ModeledOrbitalPosition, type OrbitalControllerState, type OrbitalObject } from '../domain/orbital'
import type { DiscoveryMatch, DiscoveryResponse } from '../domain/objectDiscovery'
import { qualifiedLastReport } from '../domain/objectDiscovery'
import { DISCOVERY_CONFIG } from '../config/discoveryConfig'
import { ObjectFind } from './ObjectFind'

const resultActions = vi.hoisted(() => {
  const actions: ((originId: string) => void)[] = []
  return actions
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
const render = (overrides: Partial<Parameters<typeof ObjectFind>[0]> = {}) => renderToStaticMarkup(
  <ObjectFind
    kind="ships" kindSelect={<label>Find class</label>} currentView={<p>Incumbent live discovery</p>}
    mobile active paused={false} currentViewRequest={0} now={now} navigationDisabled={false} onNavigate={vi.fn()}
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
  resultActions.splice(0)
})

describe('scoped Find presentation boundaries', () => {
  it('uses the same focused current-view flow on desktop without a redundant catalog wrapper or lookup request', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const html = render({ mobile: false })
    expect(html).toContain('Incumbent live discovery')
    expect(html).not.toContain('Satellites, airports, ports &amp; lookups')
    expect(html).toContain('<option value="view" selected="">In view</option>')
    expect(html).not.toContain('Look up')
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it.each([false, true])('shows only satellite search and a single subordinate source disclosure (%s)', (mobile) => {
    const html = render({ kind: 'orbits', mobile, curated: orbitalState, orbitalVisible: true })
    expect(html).not.toContain('Incumbent live discovery')
    expect(html).not.toContain('object-find-extra')
    expect(html).toContain('1 match in loaded catalog')
    expect(html.match(/<details/g)).toHaveLength(1)
    expect(html).toContain('Times, source &amp; limits')
    expect(html).toContain('Go to satellite')
  })
  it('navigates with exact orbital identity and opaque origin, not a generic coordinate-only jump', () => {
    const onOrbitalNavigate = vi.fn(() => true)
    const onNavigate = vi.fn()
    render({ kind: 'orbits', curated: orbitalState, orbitalVisible: true, onOrbitalNavigate, onNavigate })
    expect(resultActions).toHaveLength(1)
    resultActions[0]('opaque-orbital-origin')
    expect(onOrbitalNavigate).toHaveBeenCalledExactlyOnceWith('orbital:100460', 'opaque-orbital-origin')
    expect(onNavigate).not.toHaveBeenCalled()
  })
  it('retains Starlink ownership in exact navigation', () => {
    const onOrbitalNavigate = vi.fn(() => true)
    render({
      kind: 'orbits', orbitalVisible: true, onOrbitalNavigate,
      starlink: { ...orbitalState, positions: [{ ...position, id: 'orbital:starlink:100460', owner: 'starlink' }] },
    })
    resultActions[0]('opaque-starlink-origin')
    expect(onOrbitalNavigate).toHaveBeenCalledExactlyOnceWith('orbital:starlink:100460', 'opaque-starlink-origin')
  })
  it('explains an old element epoch despite a fresh catalog retrieval without offering a false current location', () => {
    const html = render({
      kind: 'orbits', orbitalVisible: true,
      curated: {
        ...orbitalState, positions: [],
        snapshot: { ...snapshot, records: [{ ...record, epoch: new Date(now - 22 * 24 * 60 * 60_000).toISOString() }] },
      },
    })
    expect(html).toContain('Cannot locate: elements are 22 days old (14-day limit).')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Go to satellite<\/button>/)
    expect(html).not.toContain('Modeled position unavailable')
  })
  it('keeps explicit Enable available for a loaded catalog after ORBITS is switched off', () => {
    const load = vi.fn()
    const html = render({ kind: 'orbits', curated: { ...orbitalState, phase: 'disabled' }, onLoadOrbits: load })
    expect(html).toContain('Enable ORBITS to locate this satellite.')
    expect(html).toMatch(/<button type="button">Enable ORBITS<\/button>/)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Go to satellite<\/button>/)
    expect(load).not.toHaveBeenCalled()
  })
  it.each([
    ['paused-history', 'Return to LIVE'],
    ['paused-capture', 'Return to the map'],
    ['paused-hidden', 'while this tab is hidden'],
    ['offline', 'Reconnect'],
  ] as const)('explains the existing %s pause without substituting old coordinates', (phase, message) => {
    const html = render({ kind: 'orbits', curated: { ...orbitalState, phase }, orbitalVisible: true })
    expect(html).toContain(message)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Go to satellite<\/button>/)
  })
  it('does not automatically download or enable an unloaded static/orbital catalog', () => {
    const fetchMock = vi.fn()
    const load = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    for (const [kind, label] of [
      ['airports', 'Airport name, city, ICAO or IATA'],
      ['ports', 'Port name'],
      ['orbits', 'Satellite / orbital name, NORAD or COSPAR'],
    ] as const) {
      const html = render({ kind, onLoadAirports: load, onLoadPorts: load, onLoadOrbits: load })
      expect(html).toContain(label)
      expect(html).toContain('type="search"')
      expect(html).toContain('Catalog not loaded')
      expect(html).not.toContain('0 matches')
    }
    expect(fetchMock).not.toHaveBeenCalled()
    expect(load).not.toHaveBeenCalled()
  })
  it('keeps the local orbital query available while loading without reporting a false empty result', () => {
    const html = render({
      kind: 'orbits', orbitalVisible: true,
      curated: { ...empty, phase: 'loading' },
    })
    expect(html).toContain('Satellite / orbital name, NORAD or COSPAR')
    expect(html).toContain('type="search"')
    expect(html).toContain('Catalog loading.')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Retry catalogs<\/button>/)
    expect(html).not.toContain('0 matches')
  })
  it('uses loaded static coordinates for explicit navigation, not synthetic traffic or hidden-layer activation', () => {
    const html = render({
      kind: 'ports', portsReady: true,
      ports: [{ id: 'port:outside', name: 'OUTSIDE PORT', rank: 1, latitude: -30, longitude: 140 }],
    })
    expect(html).toContain('OUTSIDE PORT')
    expect(html).toContain('Generalized static location')
    expect(html).toContain('Go to port')
    expect(html).not.toContain('vessel:')
    expect(html).not.toContain('port:outside')
  })
  it('passes exact airport identity and the actual opaque origin to navigate-and-details', () => {
    const onAirportNavigate = vi.fn(() => true)
    const onNavigate = vi.fn()
    render({
      kind: 'airports', airportsReady: true, onAirportNavigate, onNavigate,
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
      kind: 'ports', portsReady: true, onPortNavigate, onNavigate,
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
    const html = render({ kind: 'airports', airportsError: 'Catalog checksum failed.', onLoadAirports: load })
    expect(html).toContain('Catalog checksum failed.')
    expect(html).not.toContain('0 matches')
    expect(load).not.toHaveBeenCalled()
    expect(render({ kind: 'airports', airportsReady: true })).toContain('0 matches in loaded catalog')
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
})
