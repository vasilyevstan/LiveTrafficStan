import { describe, expect, it } from 'vitest'
import type {
  ModeledOrbitalPosition,
  OrbitalCatalogSnapshot,
  OrbitalControllerState,
  OrbitalObject,
} from './orbital'
import {
  DEFAULT_ORBITAL_DISCOVERY_FILTERS,
  deriveOrbitalPopulationCounts,
  discoverOrbitalCatalog,
  orbitalCatalogPage,
  orbitalFiltersSignature,
  selectOrbitalDisplay,
  type OrbitalDiscoveryFilters,
  type OrbitalDisplayLimits,
} from './orbitalDiscovery'
import { orbitalViewportSignature } from './orbitalViewport'

const limits: OrbitalDisplayLimits = {
  worldMaximumZoom: 2,
  midMaximumZoom: 4,
  worldLimit: 192,
  midLimit: 384,
  maximumRecords: 512,
}

const object = (
  noradCatalogId: string,
  overrides: Partial<OrbitalObject> = {},
): OrbitalObject => ({
  noradCatalogId,
  name: `OBJECT ${noradCatalogId}`,
  internationalDesignator: `2026-${noradCatalogId.padStart(3, '0')}A`,
  objectType: 'PAY',
  epoch: '2026-09-30T18:00:00.000Z',
  meanMotion: 15,
  eccentricity: 0.001,
  inclination: 51.6,
  rightAscensionOfAscendingNode: 1,
  argumentOfPericenter: 2,
  meanAnomaly: 3,
  ephemerisType: 0,
  classificationType: 'U',
  elementSetNumber: 1,
  revolutionAtEpoch: 1,
  bstar: 0,
  meanMotionDot: 0,
  meanMotionDdot: 0,
  sourceGroups: ['visual'],
  displayOrder: Number(noradCatalogId),
  ...overrides,
})

const position = (
  index: number,
  overrides: Partial<ModeledOrbitalPosition> = {},
): ModeledOrbitalPosition => ({
  id: `orbital:${index}`,
  noradCatalogId: String(index),
  name: `OBJECT ${index}`,
  internationalDesignator: `2026-${String(index).padStart(3, '0')}A`,
  objectType: 'PAY',
  sourceGroups: ['visual'],
  displayOrder: index,
  elementEpoch: 1,
  snapshotRetrievedAt: 2,
  snapshotSha256: 'a'.repeat(64),
  modeledFor: 3,
  latitude: index === 1 ? 0 : 50,
  longitude: index === 1 ? 0 : 100,
  altitudeKm: 600,
  velocityKmPerSecond: 7.6,
  ...overrides,
})

const filters = (
  overrides: Partial<OrbitalDiscoveryFilters> = {},
): OrbitalDiscoveryFilters => ({
  ...DEFAULT_ORBITAL_DISCOVERY_FILTERS,
  ...overrides,
})

describe('orbital discovery policy', () => {
  it('does not claim a display tier before a settled raw zoom exists', () => {
    const display = selectOrbitalDisplay(
      [position(1)],
      filters(),
      undefined,
      null,
      limits,
    )

    expect(display).toMatchObject({
      available: false,
      tier: 'unavailable',
      shownIds: [],
      matchingShownIds: [],
      zoomHiddenCount: 0,
    })
  })

  it('uses exact zoom boundaries, stable display order, and the 192-object world tier', () => {
    const positions = Array.from({ length: 512 }, (_, index) =>
      position(512 - index),
    )

    const belowTwo = selectOrbitalDisplay(
      positions,
      filters(),
      1.999,
      null,
      limits,
    )
    expect(belowTwo.tier).toBe('world')
    expect(belowTwo.shownIds).toHaveLength(192)
    expect(belowTwo.shownIds.slice(0, 3)).toEqual([
      'orbital:1',
      'orbital:2',
      'orbital:3',
    ])
    expect(belowTwo.shownIds).not.toContain('orbital:193')

    const atTwo = selectOrbitalDisplay(
      positions,
      filters(),
      2,
      null,
      limits,
    )
    expect(atTwo.tier).toBe('mid')
    expect(atTwo.shownIds).toHaveLength(384)

    expect(
      selectOrbitalDisplay(
        positions,
        filters(),
        3.999,
        null,
        limits,
      ).shownIds,
    ).toHaveLength(384)

    const atFour = selectOrbitalDisplay(
      positions,
      filters(),
      4,
      null,
      limits,
    )
    expect(atFour.tier).toBe('local')
    expect(atFour.shownIds).toHaveLength(512)
  })

  it('shows one exact safe selected exception for zoom or exact filters', () => {
    const positions = Array.from({ length: 200 }, (_, index) =>
      position(index + 1),
    )
    const zoomException = selectOrbitalDisplay(
      positions,
      filters(),
      0,
      'orbital:200',
      limits,
    )
    expect(zoomException.shownIds).toHaveLength(193)
    expect(zoomException.matchingShownIds).toHaveLength(193)
    expect(zoomException.shownIds.at(-1)).toBe('orbital:200')
    expect(zoomException).toMatchObject({
      selectedException: true,
      selectedFiltered: false,
      selectedZoomHidden: true,
      zoomHiddenCount: 7,
    })

    const filteredException = selectOrbitalDisplay(
      positions,
      filters({ objectType: 'R/B' }),
      4,
      'orbital:200',
      limits,
    )
    expect(filteredException.shownIds).toEqual(['orbital:200'])
    expect(filteredException.matchingShownIds).toEqual([])
    expect(filteredException).toMatchObject({
      selectedException: true,
      selectedFiltered: true,
      selectedZoomHidden: false,
    })
  })

  it('ranks exact, prefix, and substring matches without stripping punctuation', () => {
    const records = [
      object('9', {
        name: 'X ISS-ZARYA X',
        displayOrder: 1,
      }),
      object('8', {
        name: 'ISS-ZARYA TEST',
        displayOrder: 2,
      }),
      object('7', {
        name: 'ISS-ZARYA',
        displayOrder: 3,
      }),
      object('6', {
        name: 'OTHER',
        internationalDesignator: 'ISS-ZARYA',
        displayOrder: 4,
      }),
    ]

    expect(
      discoverOrbitalCatalog(records, 'iss-zarya', filters()).map(
        ({ noradCatalogId }) => noradCatalogId,
      ),
    ).toEqual(['7', '6', '8', '9'])
    expect(discoverOrbitalCatalog(records, 'iss zarya', filters())).toEqual(
      [],
    )
  })

  it('uses exact type/source filters and deterministic tie breakers', () => {
    const records = [
      object('12', {
        name: 'ZETA SCIENCE',
        objectType: 'PAY',
        sourceGroups: ['science'],
        displayOrder: 10,
      }),
      object('10', {
        name: 'ALPHA SCIENCE',
        objectType: 'PAY',
        sourceGroups: ['science'],
        displayOrder: 10,
      }),
      object('11', {
        name: 'ALPHA SCIENCE',
        objectType: 'PAY',
        sourceGroups: ['science'],
        displayOrder: 10,
      }),
      object('13', {
        name: 'ALPHA BODY',
        objectType: 'R/B',
        sourceGroups: ['science'],
        displayOrder: 1,
      }),
      object('14', {
        name: 'ALPHA VISUAL',
        objectType: 'PAY',
        sourceGroups: ['visual'],
        displayOrder: 1,
      }),
    ]

    expect(
      discoverOrbitalCatalog(
        records,
        '',
        filters({ objectType: 'PAY', sourceGroup: 'science' }),
      ).map(({ noradCatalogId }) => noradCatalogId),
    ).toEqual(['10', '11', '12'])
  })

  it('pages twenty rows with truthful clamped ranges', () => {
    const values = Array.from({ length: 45 }, (_, index) => index + 1)
    expect(orbitalCatalogPage(values, 0, 20)).toMatchObject({
      page: 0,
      pageCount: 3,
      rows: values.slice(0, 20),
      rangeStart: 1,
      rangeEnd: 20,
      listedRowCount: 45,
    })
    expect(orbitalCatalogPage(values, 9, 20)).toMatchObject({
      page: 2,
      rows: values.slice(40),
      rangeStart: 41,
      rangeEnd: 45,
    })
    expect(orbitalCatalogPage([], 4, 20)).toMatchObject({
      page: 0,
      pageCount: 1,
      rows: [],
      rangeStart: 0,
      rangeEnd: 0,
      listedRowCount: 0,
    })
  })

  it('keeps catalog, model, footprint, shown, and pass counts distinct', () => {
    const records = [
      object('1'),
      object('2', { objectType: 'R/B' }),
      object('3'),
    ]
    const snapshot: OrbitalCatalogSnapshot = {
      schemaVersion: 2,
      sourceContractVersion: 2,
      catalogId: 'celestrak-curated-v1',
      sources: [],
      retrievedAt: '2026-09-30T18:00:00.000Z',
      publishedAt: '2026-09-30T18:01:00.000Z',
      recordCount: records.length,
      sha256: 'a'.repeat(64),
      records,
    }
    const state: OrbitalControllerState = {
      phase: 'ready',
      acceptedCount: 2,
      snapshot,
      positions: [position(1), position(2, { objectType: 'R/B' })],
      prediction: {
        mode: 'local',
        results: [],
        totalResults: 2,
        inViewCount: 1,
        futureCrossingCount: 1,
        trackSegments: [],
      },
    }
    const activeFilters = filters({ objectType: 'PAY' })
    const display = selectOrbitalDisplay(
      state.positions,
      activeFilters,
      4,
      null,
      limits,
    )
    const localViewport = {
      kind: 'local' as const,
      center: { latitude: 0, longitude: 0 },
      polygon: [
        { latitude: -10, longitude: -10 },
        { latitude: -10, longitude: 10 },
        { latitude: 10, longitude: 10 },
        { latitude: 10, longitude: -10 },
      ],
    }
    const currentState: OrbitalControllerState = {
      ...state,
      prediction: {
        ...state.prediction,
        filtersSignature: orbitalFiltersSignature(activeFilters),
        viewportSignature: orbitalViewportSignature(localViewport),
      },
    }

    expect(
      deriveOrbitalPopulationCounts(
        currentState,
        activeFilters,
        display,
        localViewport,
      ),
    ).toEqual({
      catalogCount: 3,
      acceptedCount: 2,
      modeledNowCount: 2,
      catalogMatchCount: 2,
      modeledMatchCount: 1,
      inFootprintCount: 1,
      shownInFootprintCount: 1,
      futureCrossingCount: 1,
    })

    expect(
      deriveOrbitalPopulationCounts(
        {
          ...currentState,
          prediction: {
            ...currentState.prediction,
            mode: 'world',
            inViewCount: 0,
            futureCrossingCount: 99,
          },
        },
        activeFilters,
        display,
        localViewport,
      ),
    ).toEqual({
      catalogCount: 3,
      acceptedCount: 2,
      modeledNowCount: 2,
      catalogMatchCount: 2,
      modeledMatchCount: 1,
      inFootprintCount: 1,
      shownInFootprintCount: 1,
    })

    const staleFilterCounts = deriveOrbitalPopulationCounts(
      {
        ...currentState,
        prediction: {
          ...currentState.prediction,
          filtersSignature: orbitalFiltersSignature(filters()),
          futureCrossingCount: 99,
        },
      },
      activeFilters,
      display,
      localViewport,
    )
    expect(staleFilterCounts).toMatchObject({
      inFootprintCount: 1,
      shownInFootprintCount: 1,
    })
    expect(staleFilterCounts.futureCrossingCount).toBeUndefined()

    const filteredExceptionDisplay = selectOrbitalDisplay(
      state.positions,
      filters({ objectType: 'DEB' }),
      4,
      'orbital:1',
      limits,
    )
    expect(
      deriveOrbitalPopulationCounts(
        {
          ...currentState,
          prediction: {
            ...currentState.prediction,
            mode: 'invalid',
          },
        },
        filters({ objectType: 'DEB' }),
        filteredExceptionDisplay,
        localViewport,
      ),
    ).toEqual({
      catalogCount: 3,
      acceptedCount: 2,
      modeledNowCount: 2,
      catalogMatchCount: 0,
      modeledMatchCount: 0,
      inFootprintCount: 0,
      shownInFootprintCount: 0,
    })

    expect(
      deriveOrbitalPopulationCounts(
        {
          ...currentState,
          prediction: {
            ...currentState.prediction,
            mode: 'invalid',
          },
        },
        activeFilters,
        display,
        {
          kind: 'invalid',
          reason: 'invalid-geometry',
          message: 'Invalid geometry.',
        },
      ),
    ).toEqual({
      catalogCount: 3,
      acceptedCount: 2,
      modeledNowCount: 2,
      catalogMatchCount: 2,
      modeledMatchCount: 1,
    })
  })
})
