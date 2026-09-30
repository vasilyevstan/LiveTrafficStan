import { describe, expect, it } from 'vitest'
import {
  EMPTY_ORBITAL_PREDICTION,
  type OrbitalControllerState,
} from '../domain/orbital'
import type {
  OrbitalDisplaySelection,
  OrbitalPopulationCounts,
} from '../domain/orbitalDiscovery'
import { formatOrbitalSummary } from './orbitalSummary'

const state: OrbitalControllerState = {
  phase: 'ready',
  acceptedCount: 200,
  positions: [],
  prediction: EMPTY_ORBITAL_PREDICTION,
}

const counts = (
  modeledMatchCount: number,
): OrbitalPopulationCounts => ({
  catalogCount: 200,
  acceptedCount: 200,
  modeledNowCount: 200,
  catalogMatchCount: modeledMatchCount,
  modeledMatchCount,
})

const display = (
  matchingShownCount: number,
  overrides: Partial<OrbitalDisplaySelection> = {},
): OrbitalDisplaySelection => ({
  available: true,
  tier: 'world',
  limit: 192,
  shownIds: Array.from(
    { length: matchingShownCount },
    (_, index) => `orbital:${index + 1}`,
  ),
  shownPositions: [],
  matchingShownIds: Array.from(
    { length: matchingShownCount },
    (_, index) => `orbital:${index + 1}`,
  ),
  matchingShownPositions: [],
  matchingPositions: [],
  zoomHiddenCount: 0,
  selectedException: false,
  selectedFiltered: false,
  selectedZoomHidden: false,
  ...overrides,
})

describe('formatOrbitalSummary', () => {
  it('keeps a filter-excluded selection outside matching totals', () => {
    expect(
      formatOrbitalSummary({
        visible: true,
        historyActive: false,
        state,
        display: display(0, {
          shownIds: ['orbital:200'],
          selectedException: true,
          selectedFiltered: true,
        }),
        counts: counts(0),
      }),
    ).toBe(
      'ORBITS · 0 MATCHING / 200 CATALOG · +1 SELECTED EXCEPTION',
    )
  })

  it('includes a matching zoom exception without exceeding modeled matches', () => {
    const summary = formatOrbitalSummary({
      visible: true,
      historyActive: false,
      state,
      display: display(193, {
        selectedException: true,
        selectedZoomHidden: true,
        zoomHiddenCount: 7,
      }),
      counts: counts(200),
    })

    expect(summary).toBe(
      'ORBITS · 193 SHOWN / 200 MODELED · 1 SELECTED EXCEPTION',
    )
    expect(summary).not.toContain('201 SHOWN')
  })

  it('does not claim shown counts before a settled raw zoom exists', () => {
    expect(
      formatOrbitalSummary({
        visible: true,
        historyActive: false,
        state,
        display: display(0, {
          available: false,
          tier: 'unavailable',
          limit: 0,
        }),
        counts: counts(200),
      }),
    ).toBe('ORBITS · MAP COUNTS UNAVAILABLE')
  })
})
