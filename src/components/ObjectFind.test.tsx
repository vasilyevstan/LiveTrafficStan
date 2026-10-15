import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_ORBITAL_PREDICTION } from '../domain/orbital'
import type { DiscoveryMatch, DiscoveryResponse } from '../domain/objectDiscovery'
import { qualifiedLastReport } from '../domain/objectDiscovery'
import { DISCOVERY_CONFIG } from '../config/discoveryConfig'
import { ObjectFind } from './ObjectFind'

const now = Date.UTC(2026, 9, 14, 12)
const empty = { phase: 'disabled', acceptedCount: 0, positions: [], prediction: EMPTY_ORBITAL_PREDICTION } as const
const render = (overrides: Partial<Parameters<typeof ObjectFind>[0]> = {}) => renderToStaticMarkup(
  <ObjectFind
    kind="ships" kindSelect={<label>Find class</label>} currentView={<p>Incumbent live discovery</p>}
    mobile active paused={false} currentViewRequest={0} now={now} navigationDisabled={false} onNavigate={vi.fn()}
    airports={[]} airportsReady={false} airportsLoading={false} onLoadAirports={vi.fn()}
    ports={[]} portsReady={false} portsLoading={false} onLoadPorts={vi.fn()}
    curated={empty} starlink={empty} selectedOrbitalId={null} orbitalVisible={false} onLoadOrbits={vi.fn()}
    {...overrides}
  />,
)
afterEach(() => vi.unstubAllGlobals())

describe('scoped Find presentation boundaries', () => {
  it('keeps incumbent desktop discovery and starts the additive entry collapsed with zero requests', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const html = render({ mobile: false })
    expect(html).toContain('Incumbent live discovery')
    expect(html).toContain('Outside this view &amp; loaded catalogs')
    expect(html).not.toMatch(/<details[^>]*open=/)
    expect(html).toContain('Sent on submit to Open Waters; no Home or view coordinates.')
    expect(html).toContain('Free exact IMO lookup is unavailable')
    expect(html).toContain('identity-only')
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('does not automatically download or enable an unloaded static/orbital catalog', () => {
    const fetchMock = vi.fn()
    const load = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    for (const kind of ['airports', 'ports', 'orbits'] as const) {
      const html = render({ kind, onLoadAirports: load, onLoadPorts: load, onLoadOrbits: load })
      expect(html).toContain('Catalog not loaded')
      expect(html).not.toContain('0 matches')
    }
    expect(fetchMock).not.toHaveBeenCalled()
    expect(load).not.toHaveBeenCalled()
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
