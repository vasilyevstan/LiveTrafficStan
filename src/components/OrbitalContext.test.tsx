import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type {
  ModeledOrbitalPosition,
  OrbitalControllerState,
} from '../domain/orbital'
import type {
  OrbitalDisplaySelection,
  OrbitalPopulationCounts,
} from '../domain/orbitalDiscovery'
import { DEFAULT_ORBITAL_DISCOVERY_FILTERS } from '../domain/orbitalDiscovery'
import { OrbitalContext } from './OrbitalContext'

const now = Date.UTC(2026, 8, 30, 19)

const position: ModeledOrbitalPosition = {
  id: 'orbital:25544',
  noradCatalogId: '25544',
  name: 'ISS (ZARYA)',
  internationalDesignator: '1998-067A',
  objectType: 'PAY',
  sourceGroups: ['visual', 'stations'],
  displayOrder: 25544,
  elementEpoch: now,
  snapshotRetrievedAt: now,
  snapshotSha256: 'a'.repeat(64),
  modeledFor: now,
  latitude: 0,
  longitude: 0,
  altitudeKm: 420,
  velocityKmPerSecond: 7.7,
}

const display: OrbitalDisplaySelection = {
  available: true,
  tier: 'world',
  limit: 192,
  shownIds: [position.id],
  shownPositions: [position],
  matchingShownIds: [position.id],
  matchingShownPositions: [position],
  matchingPositions: [position],
  zoomHiddenCount: 0,
  selectedException: false,
  selectedFiltered: false,
  selectedZoomHidden: false,
}

const counts: OrbitalPopulationCounts = {
  catalogCount: 462,
  acceptedCount: 460,
  modeledNowCount: 438,
  catalogMatchCount: 462,
  modeledMatchCount: 438,
  inFootprintCount: 12,
  shownInFootprintCount: 8,
  futureCrossingCount: 3,
}

const renderContext = (
  state: OrbitalControllerState,
  overrides: {
    display?: OrbitalDisplaySelection
    counts?: OrbitalPopulationCounts
  } = {},
) =>
  renderToStaticMarkup(
    <OrbitalContext
      state={state}
      selectedId={null}
      horizonMs={90 * 60_000}
      now={now}
      filters={DEFAULT_ORBITAL_DISCOVERY_FILTERS}
      display={overrides.display ?? display}
      counts={overrides.counts ?? counts}
      maximumQueryLength={64}
      pageSize={20}
      onFiltersChange={() => undefined}
      onSelect={() => undefined}
    />,
  )

describe('OrbitalContext', () => {
  it('uses geographic shown, in-map, and pass wording without optical claims', () => {
    const html = renderContext({
      phase: 'ready',
      acceptedCount: 460,
      positions: [position],
      prediction: {
        mode: 'local',
        totalResults: 1,
        inViewCount: 1,
        futureCrossingCount: 0,
        trackSegments: [],
        results: [
          {
            id: position.id,
            noradCatalogId: position.noradCatalogId,
            name: position.name,
            objectType: position.objectType,
            currentlyInView: true,
            firstCrossingAt: now,
          },
        ],
      },
    })

    expect(html).toContain('8 SHOWN · 12 IN MAP · 3 PASSES ≤90M')
    expect(html).toContain('462 catalog · 460 accepted')
    expect(html).toContain('in map now')
    expect(html).toContain(
      'Purpose: Crewed microgravity science laboratory',
    )
    expect(html).toContain('not live or optical visibility')
    expect(html).not.toContain('VISIBLE')
  })

  it('labels nearby community context separately from mission purpose', () => {
    const cosmos: ModeledOrbitalPosition = {
      ...position,
      id: 'orbital:19210',
      noradCatalogId: '19210',
      name: 'COSMOS 1953',
      internationalDesignator: '1988-050A',
    }
    const html = renderContext({
      phase: 'ready',
      acceptedCount: 1,
      positions: [cosmos],
      prediction: {
        mode: 'local',
        totalResults: 1,
        inViewCount: 1,
        futureCrossingCount: 0,
        trackSegments: [],
        results: [{
          id: cosmos.id,
          noradCatalogId: cosmos.noradCatalogId,
          name: cosmos.name,
          objectType: cosmos.objectType,
          currentlyInView: true,
          firstCrossingAt: now,
        }],
      },
    })
    expect(html).toContain('Community context: Tselina-D spacecraft')
    expect(html).not.toContain('Purpose: Tselina-D')
  })

  it('states zoom-hidden and selected-exception conditions in text', () => {
    const html = renderContext(
      {
        phase: 'ready',
        acceptedCount: 460,
        positions: [position],
        prediction: {
          mode: 'world',
          results: [],
          totalResults: 438,
          inViewCount: 438,
          futureCrossingCount: 0,
          trackSegments: [],
        },
      },
      {
        display: {
          ...display,
          shownIds: [position.id],
          zoomHiddenCount: 246,
          selectedException: true,
          selectedZoomHidden: true,
        },
      },
    )

    expect(html).toContain(
      '246 matching modeled objects are hidden by this zoom tier',
    )
    expect(html).toContain(
      '1 matching selected exception is included in SHOWN despite the current zoom tier',
    )
  })

  it('does not present invalid-footprint counts as known zeros', () => {
    const html = renderContext(
      {
        phase: 'ready',
        acceptedCount: 460,
        positions: [],
        prediction: {
          mode: 'invalid',
          results: [],
          totalResults: 0,
          inViewCount: 0,
          futureCrossingCount: 0,
          trackSegments: [],
          message: 'Upcoming crossings are unavailable for this view.',
        },
      },
      {
        counts: {
          ...counts,
          modeledMatchCount: 438,
          inFootprintCount: undefined,
          shownInFootprintCount: undefined,
          futureCrossingCount: 0,
        },
      },
    )

    expect(html).toContain('MAP-AREA COUNTS UNAVAILABLE · 438 MODELED')
    expect(html).not.toContain('0 IN MAP')
  })

  it('keeps current map counts while a compatible prediction is pending', () => {
    const html = renderContext(
      {
        phase: 'refreshing',
        acceptedCount: 460,
        positions: [position],
        prediction: {
          mode: 'world',
          results: [],
          totalResults: 438,
          inViewCount: 438,
          futureCrossingCount: 0,
          trackSegments: [],
        },
      },
      {
        counts: {
          ...counts,
          futureCrossingCount: undefined,
        },
      },
    )

    expect(html).toContain('8 SHOWN · 12 IN MAP · PASSES UPDATING')
    expect(html).not.toContain('PASSES UNAVAILABLE')
  })
})
