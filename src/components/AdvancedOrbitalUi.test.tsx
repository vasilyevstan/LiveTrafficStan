import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EMPTY_ORBITAL_PREDICTION } from '../domain/orbital'
import {
  DEFAULT_ORBITAL_DISCOVERY_FILTERS,
  type OrbitalDisplaySelection,
  type OrbitalPopulationCounts,
} from '../domain/orbitalDiscovery'
import { AdvancedOrbitalControls } from './AdvancedOrbitalUi'

const counts: OrbitalPopulationCounts = {
  catalogCount: 1,
  acceptedCount: 1,
  modeledNowCount: 1,
  catalogMatchCount: 1,
  modeledMatchCount: 1,
  inFootprintCount: 1,
  shownInFootprintCount: 1,
  futureCrossingCount: 0,
}

const display: OrbitalDisplaySelection = {
  available: true,
  tier: 'world',
  limit: 192,
  shownIds: ['orbital:694'],
  shownPositions: [],
  matchingShownIds: ['orbital:694'],
  matchingShownPositions: [],
  matchingPositions: [],
  zoomHiddenCount: 0,
  selectedException: false,
  selectedFiltered: false,
  selectedZoomHidden: false,
}

describe('advanced orbital UI chunk', () => {
  it('renders discovery content after the boundary is requested', () => {
    const html = renderToStaticMarkup(
      <AdvancedOrbitalControls
        orbitalVisible
        live
        orbitalState={{
          phase: 'ready',
          acceptedCount: 1,
          positions: [],
          prediction: {
            ...EMPTY_ORBITAL_PREDICTION,
            mode: 'local',
            totalResults: 1,
            inViewCount: 1,
            results: [{
              id: 'orbital:694',
              noradCatalogId: '694',
              name: 'ATLAS CENTAUR 2',
              objectType: 'PAY',
              currentlyInView: true,
              firstCrossingAt: Date.UTC(2026, 2, 12, 12),
            }],
          },
        }}
        selectedId={null}
        filters={DEFAULT_ORBITAL_DISCOVERY_FILTERS}
        display={display}
        counts={counts}
        starlinkState={{
          phase: 'disabled',
          acceptedCount: 0,
          positions: [],
          prediction: EMPTY_ORBITAL_PREDICTION,
        }}
        starlinkCounts={{ ...counts, catalogCount: 0, acceptedCount: 0 }}
        horizonMs={90 * 60_000}
        now={Date.UTC(2026, 2, 12, 12)}
        maximumQueryLength={64}
        pageSize={20}
        showOrbitalContext
        onFiltersChange={() => undefined}
        onSelect={() => undefined}
        onRetryStarlink={() => undefined}
      />,
    )

    expect(html).toContain('Modeled orbital objects')
    expect(html).toContain('ATLAS CENTAUR 2')
    expect(html).toContain('not live or optical visibility')
  })
})
