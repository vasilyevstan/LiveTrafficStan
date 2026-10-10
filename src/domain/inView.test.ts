import { describe, expect, it } from 'vitest'
import {
  EMPTY_ORBITAL_PREDICTION,
  orbitalFeatureId,
  type ModeledOrbitalPosition,
  type OrbitalControllerState,
} from './orbital'
import {
  DEFAULT_ORBITAL_DISCOVERY_FILTERS,
  selectOrbitalDisplay,
  type OrbitalDiscoveryFilters,
} from './orbitalDiscovery'
import type { OrbitalViewport } from './orbitalViewport'
import {
  aircraftInViewAvailability,
  deriveOrbitalInView,
  inViewPage,
  rankVesselsInView,
  vesselInViewAvailability,
  vesselInViewMeasurement,
} from './inView'
import { APP_CONFIG } from '../config/appConfig'
import { displayTraffic } from '../traffic/freshness'
import type { DisplayVessel } from './traffic'
import { DEFAULT_VESSEL_FILTERS, filterVessels } from './vesselFilters'

const now = Date.UTC(2026, 9, 9, 12)
const position = (
  index: number,
  overrides: Partial<ModeledOrbitalPosition> = {},
): ModeledOrbitalPosition => ({
  id: orbitalFeatureId(String(index), overrides.owner ?? 'curated'),
  noradCatalogId: String(index),
  name: `OBJECT ${index}`,
  internationalDesignator: `2026-${index}A`,
  objectType: 'PAY',
  sourceGroups: ['visual'],
  displayOrder: index,
  elementEpoch: now - 60_000,
  snapshotRetrievedAt: now - 30_000,
  snapshotSha256: 'a'.repeat(64),
  modeledFor: now,
  latitude: 0,
  longitude: 0,
  altitudeKm: 550,
  velocityKmPerSecond: 7.6,
  ...overrides,
})

const source = (
  positions: readonly ModeledOrbitalPosition[],
  phase: OrbitalControllerState['phase'] = 'ready',
  filters: OrbitalDiscoveryFilters = DEFAULT_ORBITAL_DISCOVERY_FILTERS,
  selectedId: string | null = null,
  zoom = 5,
) => ({
  state: {
    phase,
    acceptedCount: Math.max(1, positions.length),
    positions: [...positions],
    prediction: EMPTY_ORBITAL_PREDICTION,
  },
  display: selectOrbitalDisplay(positions, filters, zoom, selectedId, {
    worldMaximumZoom: 2,
    midMaximumZoom: 4,
    worldLimit: 2,
    midLimit: 4,
    maximumRecords: 512,
  }),
})

const localViewport: OrbitalViewport = {
  kind: 'local',
  center: { latitude: 0, longitude: 0 },
  polygon: [
    { latitude: -1, longitude: -1 },
    { latitude: -1, longitude: 1 },
    { latitude: 1, longitude: 1 },
    { latitude: 1, longitude: -1 },
  ],
}

const model = (
  overrides: Partial<Parameters<typeof deriveOrbitalInView>[0]> = {},
) => deriveOrbitalInView({
  enabled: true,
  historyActive: false,
  curated: source([position(1)]),
  starlink: source([]),
  viewport: localViewport,
  selectedId: null,
  ...overrides,
})

describe('current orbital in-view population', () => {
  it('deduplicates exact NORAD with curated ownership and complete source clocks', () => {
    const curated = position(1)
    const sample = position(1, {
      owner: 'starlink',
      name: 'SAMPLE 1',
      sourceGroups: ['starlink'],
      elementEpoch: now - 90_000,
      snapshotRetrievedAt: now - 60_000,
      snapshotSha256: 'b'.repeat(64),
      modeledFor: now - 1_000,
    })
    const options = {
      curated: source([curated]),
      starlink: source([sample]),
    }
    const normal = model(options)
    expect(normal.rows).toHaveLength(1)
    expect(normal.shownCount).toBe(1)
    expect(normal.rows[0].position).toBe(curated)
    const selected = model({ ...options, selectedId: sample.id })
    expect(selected.rows).toHaveLength(1)
    expect(selected.rows[0].position).toBe(sample)
    expect(selected.selectedOutside).toBeUndefined()
    expect(sample.snapshotSha256).toBe('b'.repeat(64))
    expect(curated.snapshotSha256).toBe('a'.repeat(64))
  })

  it('does not deduplicate names or designators across different exact NORAD identities', () => {
    const first = position(1, { name: 'SAME', internationalDesignator: '2026-001A' })
    const second = position(2, { name: 'SAME', internationalDesignator: '2026-001A' })
    expect(model({
      curated: source([first]),
      starlink: source([second]),
    }).rows).toHaveLength(2)
  })

  it('counts individual modeled objects, not display-tier symbols or future crossings', () => {
    const positions = Array.from({ length: 45 }, (_, index) => position(index + 1))
    const curated = source(positions, 'ready', undefined, null, 1)
    curated.state.prediction = {
      ...EMPTY_ORBITAL_PREDICTION,
      mode: 'local',
      futureCrossingCount: 99,
    }
    const result = model({ curated })
    expect(result.rows).toHaveLength(45)
    expect(result.shownCount).toBe(2)
    expect(result.rows.filter(({ shown }) => shown)).toHaveLength(2)
    expect(result).not.toHaveProperty('futureCrossingCount')
  })

  it('combines display visibility without replacing the canonical complete position', () => {
    const canonical = position(9)
    const sample = position(9, { owner: 'starlink', sourceGroups: ['starlink'] })
    const result = model({
      curated: source([position(1), position(2), canonical], 'ready', undefined, null, 1),
      starlink: source([sample]),
    })
    expect(result.rows.find(({ position: value }) => value.noradCatalogId === '9'))
      .toEqual({ position: canonical, shown: true })
    expect(result.shownCount).toBe(3)
  })

  it('filters the full current local footprint and handles wrapped longitude', () => {
    expect(model({
      curated: source([position(1), position(2, { longitude: 20 })]),
    }).rows.map(({ position: value }) => value.id)).toEqual(['orbital:1'])
    const wrapped: OrbitalViewport = {
      kind: 'local',
      center: { latitude: 0, longitude: 180 },
      polygon: [
        { latitude: -5, longitude: 170 },
        { latitude: -5, longitude: 190 },
        { latitude: 5, longitude: 190 },
        { latitude: 5, longitude: 170 },
      ],
    }
    const positions = [
      position(1, { longitude: 179 }),
      position(2, { longitude: -179 }),
      position(3, { longitude: 0 }),
    ]
    expect(model({ curated: source(positions), viewport: wrapped }).rows)
      .toHaveLength(2)
    expect(model({ curated: source(positions), viewport: { kind: 'world' } }).rows)
      .toHaveLength(3)
  })

  it.each([
    undefined,
    { kind: 'invalid', reason: 'invalid-geometry', message: 'Globe limb.' } as const,
  ])('reports unavailable, not zero, for unsettled or unsafe geometry %j', (viewport) => {
    expect(model({ viewport })).toMatchObject({
      available: false,
      rows: [],
      shownCount: 0,
      message: expect.stringContaining('counts unavailable'),
    })
  })

  it('keeps selected objects outside the footprint or filters separate from totals', () => {
    const outside = position(2, { longitude: 10 })
    const selectedOutside = model({
      curated: source([position(1), outside]),
      selectedId: outside.id,
    })
    expect(selectedOutside.rows).toHaveLength(1)
    expect(selectedOutside.selectedOutside).toEqual({ position: outside, reason: 'view' })

    const excluded = position(2, { objectType: 'DEB' })
    const selectedFiltered = model({
      curated: source(
        [position(1), excluded],
        'ready',
        { ...DEFAULT_ORBITAL_DISCOVERY_FILTERS, objectType: 'PAY' },
        excluded.id,
      ),
      selectedId: excluded.id,
    })
    expect(selectedFiltered.rows).toHaveLength(1)
    expect(selectedFiltered.shownCount).toBe(1)
    expect(selectedFiltered.selectedOutside).toEqual({
      position: excluded,
      reason: 'filters',
    })
  })

  it.each(['loading', 'disabled', 'unavailable', 'clock-invalid', 'paused-hidden', 'paused-history'] as const)(
    'does not reuse unsafe %s source positions, while keeping the other source usable',
    (phase) => {
      const result = model({
        curated: source([position(1)], phase),
        starlink: source([position(2, { owner: 'starlink' })]),
      })
      expect(result.available).toBe(true)
      expect(result.partial).toBe(true)
      expect(result.rows.map(({ position: value }) => value.noradCatalogId)).toEqual(['2'])
      expect(result.sourceMessages[0]).toContain('Curated catalog')
    },
  )

  it.each(['refreshing', 'stale', 'offline'] as const)(
    'qualifies safe retained %s positions without labeling them live',
    (phase) => {
      const result = model({ curated: source([position(1)], phase) })
      expect(result.available).toBe(true)
      expect(result.rows).toHaveLength(1)
      expect(result.sourceMessages.join(' ')).toMatch(/updating|stale|offline/)
    },
  )

  it('does not turn a refresh awaiting propagation, an outage, or initial offline into empty results', () => {
    const refreshing = source([], 'refreshing')
    refreshing.state.acceptedCount = 0
    for (const curated of [refreshing, source([], 'offline'), source([], 'unavailable')]) {
      const result = model({ curated, starlink: source([], 'loading') })
      expect(result.available).toBe(false)
      expect(result.message).toContain('not a confirmed empty view')
    }
  })

  it('distinguishes a successful empty footprint from unavailable propagation', () => {
    const result = model({
      curated: source([position(1, { longitude: 10 })]),
      starlink: source([position(2, { longitude: 20 })]),
    })
    expect(result).toMatchObject({ available: true, partial: false, rows: [], shownCount: 0 })
    expect(result.message).toBeUndefined()
    expect(model({ curated: source([], 'empty') }).sourceMessages)
      .toContain('Curated catalog: no safe modeled positions.')
  })

  it('honors parent off and HISTORY before considering retained state', () => {
    expect(model({ enabled: false })).toMatchObject({
      available: false,
      rows: [],
      shownCount: 0,
      message: 'ORBITS is off. Enable it in the main controls.',
    })
    expect(model({ historyActive: true })).toMatchObject({
      available: false,
      rows: [],
      message: expect.stringContaining('HISTORY'),
    })
  })
})

describe.each([
  { name: 'aircraft', availability: aircraftInViewAvailability },
  { name: 'ships', availability: vesselInViewAvailability },
])('$name in-view availability', ({ availability }) => {
  const options = {
    historyActive: false,
    viewportReady: true,
    viewportEligible: true,
    online: true,
    status: { phase: 'live' as const, paused: false },
    count: 0,
  }

  it('allows a successful empty view and labels updating without replacing current observations', () => {
    expect(availability(options)).toEqual({ available: true })
    expect(availability({
      ...options, status: { ...options.status, updating: true }, count: 25,
    })).toMatchObject({
      available: true,
      message: expect.stringContaining('Updating'),
    })
  })

  it.each([0, 25])('keeps HISTORY, unsettled view, and last-local context out of count %i', (count) => {
    for (const overrides of [
      { historyActive: true },
      { viewportReady: false },
      { viewportEligible: false },
    ]) {
      expect(availability({ ...options, ...overrides, count }).available)
        .toBe(false)
    }
    expect(availability({ ...options, viewportEligible: false }).message)
      .toContain('last-local samples are not live counts')
  })

  it.each(['idle', 'loading', 'error'] as const)('distinguishes %s from a confirmed empty result', (phase) => {
    expect(availability({
      ...options, status: { phase, paused: false },
    }).available).toBe(false)
    expect(availability({
      ...options, count: 5, status: { phase, paused: false },
    }).available).toBe(true)
  })

  it('qualifies offline and paused retained observations, without claiming zero coverage', () => {
    expect(availability({ ...options, online: false })).toMatchObject({
      available: false,
      message: expect.stringContaining('Offline'),
    })
    expect(availability({ ...options, online: false, count: 1 }).available)
      .toBe(true)
    expect(availability({
      ...options, count: 1, status: { phase: 'live', paused: true },
    })).toMatchObject({
      available: true,
      message: expect.stringContaining('updates paused'),
    })
  })
})

const vessel = (
  index: number,
  overrides: Partial<DisplayVessel> = {},
): DisplayVessel => ({
  id: `vessel:${257000000 + index}`,
  kind: 'vessel',
  provider: 'Digitraffic',
  mmsi: 257000000 + index,
  name: `VESSEL ${index}`,
  vesselCategory: 'cargo',
  navigationCategory: 'underway',
  lengthMeters: 100,
  draughtMeters: 6,
  position: { latitude: 59.4, longitude: 24.7, observedAt: now },
  receivedAt: now,
  markerIcon: 'vessel-cargo',
  markerScale: 1,
  freshness: 'live',
  ...overrides,
})

describe('ranked ships in view', () => {
  it('returns only the twenty longest while preserving full counts and original observations', () => {
    const observations = Object.freeze(Array.from({ length: 45 }, (_, index) =>
      Object.freeze(vessel(index + 1, { lengthMeters: 50 + index })),
    ))
    const result = rankVesselsInView(observations, 'length')
    expect(result.rows).toHaveLength(20)
    expect(result.rankableCount).toBe(45)
    expect(result.unrankedCount).toBe(0)
    expect(result.rows[0]).toBe(observations[44])
    expect(result.rows[19]).toBe(observations[25])
    expect(observations[0].lengthMeters).toBe(50)
    expect(result.rows.every((row) => observations.includes(row))).toBe(true)
  })

  it('ranks length and reported draught independently rather than inventing a combined size', () => {
    const long = vessel(1, { lengthMeters: 300, draughtMeters: 4 })
    const deep = vessel(2, { lengthMeters: 180, draughtMeters: 12 })
    const middle = vessel(3, { lengthMeters: 250, draughtMeters: 9 })
    const observations = [long, deep, middle]
    expect(rankVesselsInView(observations, 'length').rows).toEqual([long, middle, deep])
    expect(rankVesselsInView(observations, 'draught').rows).toEqual([deep, middle, long])
    expect(observations).toEqual([long, deep, middle])
  })

  it.each(['length', 'draught'] as const)('breaks %s ties by the other report, then exact MMSI', (ranking) => {
    const first = vessel(1, { lengthMeters: 200, draughtMeters: 8 })
    const second = vessel(2, { lengthMeters: 200, draughtMeters: 8 })
    const lesser = vessel(3, ranking === 'length'
      ? { lengthMeters: 200, draughtMeters: 7 }
      : { lengthMeters: 150, draughtMeters: 8 })
    const observations = [lesser, second, first]
    expect(rankVesselsInView(observations, ranking).rows).toEqual([first, second, lesser])
    expect(rankVesselsInView([...observations].reverse(), ranking).rows)
      .toEqual([first, second, lesser])
  })

  it.each(['length', 'draught'] as const)('excludes unknown/nonpositive/nonfinite %s without changing the other ranking', (ranking) => {
    const invalid = [undefined, 0, -1, Number.NaN, Infinity, -Infinity]
    const observations = invalid.map((value, index) =>
      vessel(index + 1, ranking === 'length'
        ? { lengthMeters: value }
        : { draughtMeters: value }),
    )
    const result = rankVesselsInView(observations, ranking)
    expect(result).toEqual({ rows: [], rankableCount: 0, unrankedCount: 6 })
    for (const observation of observations) {
      expect(vesselInViewMeasurement(observation, ranking)).toBeUndefined()
    }
    expect(rankVesselsInView(observations, ranking === 'length' ? 'draught' : 'length').rows)
      .toHaveLength(6)
  })

  it('keeps existing filter/expiry exclusions and retains stale, complete source objects', () => {
    const observations = [
      vessel(1, { lengthMeters: 40 }),
      vessel(2, {
        lengthMeters: 400,
        position: { latitude: 59.4, longitude: 24.7, observedAt: now - APP_CONFIG.marine.expireAfterMs - 1 },
      }),
      vessel(3, {
        lengthMeters: 250,
        metadataObservedAt: now - 60_000,
        position: { latitude: 59.4, longitude: 24.7, observedAt: now - APP_CONFIG.marine.staleAfterMs - 1 },
      }),
      vessel(4, { lengthMeters: 150 }),
    ]
    const current = displayTraffic(observations, now, APP_CONFIG.marine)
    const filtered = filterVessels(current, DEFAULT_VESSEL_FILTERS, {
      displayTime: now, expireAfterMs: APP_CONFIG.marine.expireAfterMs,
    })
    const ranked = rankVesselsInView(filtered, 'length')
    expect(ranked.rows.map(({ id }) => id)).toEqual([vessel(3).id, vessel(4).id])
    expect(ranked.rows[0]).toBe(filtered[0])
    expect(ranked.rows[0].freshness).toBe('stale')
    expect(ranked.rows[0].metadataObservedAt).toBe(now - 60_000)
    const searched = filterVessels(current, { ...DEFAULT_VESSEL_FILTERS, query: 'VESSEL 4' }, {
      displayTime: now, expireAfterMs: APP_CONFIG.marine.expireAfterMs,
    })
    expect(rankVesselsInView(searched, 'draught').rows.map(({ id }) => id))
      .toEqual([vessel(4).id])
  })

  it('qualifies partial marine operation without discarding useful observations or updating state', () => {
    const options = {
      historyActive: false, viewportReady: true, viewportEligible: true,
      online: true, count: 5,
      status: { phase: 'live' as const, paused: false, updating: true, error: 'Digitraffic: unavailable' },
    }
    expect(vesselInViewAvailability(options)).toMatchObject({
      available: true,
      message: 'Updating ships; current observations retained. Partial · Digitraffic: unavailable',
    })
    expect(vesselInViewAvailability({ ...options, historyActive: true }))
      .toMatchObject({ available: false, message: expect.stringContaining('HISTORY') })
    expect(vesselInViewAvailability({ ...options, viewportEligible: false }))
      .toMatchObject({ available: false, message: expect.stringContaining('Zoom in') })
  })
})

describe('bounded, focus-preserving in-view pages', () => {
  const rows = Array.from({ length: 45 }, (_, index) => ({ key: String(index) }))

  it('keeps complete totals with no more than twenty rows on every page', () => {
    for (const [page, size] of [[0, 20], [1, 20], [2, 5]]) {
      const result = inViewPage(rows, page, 20, null)
      expect(result.rows).toHaveLength(size)
      expect(result.listedRowCount).toBe(45)
      expect(result.pageCount).toBe(3)
    }
    expect(inViewPage(rows, 100, 20, null).page).toBe(2)
  })

  it('anchors the focused identity when updates move it across a page boundary', () => {
    const focused = rows[19]
    expect(inViewPage(rows, 0, 20, focused.key).rows).toContain(focused)
    const updated = [{ key: 'new' }, ...rows]
    const page = inViewPage(updated, 0, 20, focused.key)
    expect(page.page).toBe(1)
    expect(page.rows[0]).toBe(focused)
  })

  it('clamps after the focused entity expires and handles empty results', () => {
    expect(inViewPage(rows.slice(0, 10), 2, 20, '44')).toMatchObject({
      page: 0, listedRowCount: 10, rangeStart: 1, rangeEnd: 10,
    })
    expect(inViewPage([], 2, 20, '44')).toMatchObject({
      page: 0, rows: [], listedRowCount: 0, rangeStart: 0, rangeEnd: 0,
    })
  })
})
