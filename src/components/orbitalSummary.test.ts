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
  overrides: Partial<OrbitalPopulationCounts> = {},
): OrbitalPopulationCounts => ({
  catalogCount: 200,
  acceptedCount: 200,
  modeledNowCount: 200,
  catalogMatchCount: modeledMatchCount,
  modeledMatchCount,
  ...overrides,
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
        horizonMs: 90 * 60_000,
        state,
        display: display(0, {
          shownIds: ['orbital:200'],
          selectedException: true,
          selectedFiltered: true,
        }),
        counts: counts(0, {
          inFootprintCount: 0,
          shownInFootprintCount: 0,
          futureCrossingCount: 0,
        }),
      }),
    ).toBe(
      'ORBITS · 0 SHOWN · 0 PASSES ≤90M · +1 SELECTED EXCEPTION',
    )
  })

  it('uses the actually rendered map population with a matching zoom exception', () => {
    const summary = formatOrbitalSummary({
      visible: true,
      historyActive: false,
      horizonMs: 90 * 60_000,
      state,
      display: display(193, {
        selectedException: true,
        selectedZoomHidden: true,
        zoomHiddenCount: 7,
      }),
      counts: counts(200, {
        inFootprintCount: 12,
        shownInFootprintCount: 8,
        futureCrossingCount: 3,
      }),
    })

    expect(summary).toBe(
      'ORBITS · 8 SHOWN · 3 PASSES ≤90M · 1 SELECTED EXCEPTION',
    )
    expect(summary).not.toContain('193 SHOWN')
  })

  it('does not claim shown counts before a settled raw zoom exists', () => {
    expect(
      formatOrbitalSummary({
        visible: true,
        historyActive: false,
        horizonMs: 90 * 60_000,
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

  it.each([
    [0, '0 PASSES'],
    [1, '1 PASS'],
    [2, '2 PASSES'],
  ])('distinguishes %i predicted crossings', (passCount, label) => {
    expect(
      formatOrbitalSummary({
        visible: true,
        historyActive: false,
        horizonMs: 90 * 60_000,
        state,
        display: display(4),
        counts: counts(4, {
          inFootprintCount: 4,
          shownInFootprintCount: 4,
          futureCrossingCount: passCount,
        }),
      }),
    ).toBe(`ORBITS · 4 SHOWN · ${label} ≤90M`)
  })

  it('reports a pending prediction without presenting it as zero', () => {
    expect(
      formatOrbitalSummary({
        visible: true,
        historyActive: false,
        horizonMs: 90 * 60_000,
        state: { ...state, phase: 'refreshing' },
        display: display(4),
        counts: counts(4, {
          inFootprintCount: 4,
          shownInFootprintCount: 4,
        }),
      }),
    ).toBe('ORBITS · 4 SHOWN · PASSES UPDATING')
  })
})
