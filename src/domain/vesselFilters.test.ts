import { describe, expect, it } from 'vitest'
import type { Vessel } from './traffic'
import {
  DEFAULT_VESSEL_FILTERS,
  filterVessels,
  isDefaultVesselFilters,
  ONE_KNOT_KPH,
  orderVesselSearchResults,
  vesselFilterSummary,
  withMinimumVesselLength,
} from './vesselFilters'

const vessel = (
  id: string,
  overrides: Partial<Vessel> = {},
): Vessel => ({
  id: `vessel:${id}`,
  kind: 'vessel',
  provider: 'test',
  mmsi: Number(id),
  vesselCategory: 'unknown',
  navigationCategory: 'unknown',
  position: {
    latitude: 59,
    longitude: 24,
    observedAt: 1,
  },
  receivedAt: 1,
  markerIcon: 'vessel',
  markerScale: 1,
  ...overrides,
})

describe('vessel filters', () => {
  it('preserves the released 50 metre default and explicit unknown-length behavior', () => {
    const values = [
      vessel('1', { lengthMeters: 49 }),
      vessel('2', { lengthMeters: 50 }),
      vessel('3'),
      vessel('4', { lengthMeters: 140 }),
    ]

    expect(
      filterVessels(values, DEFAULT_VESSEL_FILTERS).map(({ id }) => id),
    ).toEqual(['vessel:2', 'vessel:4'])
    expect(
      filterVessels(values, {
        ...DEFAULT_VESSEL_FILTERS,
        includeUnknownLength: true,
      }).map(({ id }) => id),
    ).toEqual(['vessel:2', 'vessel:3', 'vessel:4'])
  })

  it('searches normalized name, call sign, MMSI, and IMO text locally', () => {
    const values = [
      vessel('230123456', {
        name: ' NORTH   STAR ',
        callSign: 'OJA1',
        imo: 9876543,
        lengthMeters: 100,
      }),
      vessel('230777777', {
        name: 'SOUTH WIND',
        lengthMeters: 100,
      }),
    ]

    for (const query of ['north star', 'oja', '01234', '87654']) {
      expect(
        filterVessels(values, {
          ...DEFAULT_VESSEL_FILTERS,
          query,
        }).map(({ id }) => id),
      ).toEqual(['vessel:230123456'])
    }
  })

  it('orders exact identifiers before text prefixes and other substrings', () => {
    const values = [
      vessel('230000001', {
        name: 'ALPHA 230',
        lengthMeters: 100,
      }),
      vessel('230000002', {
        name: '230 STAR',
        lengthMeters: 100,
      }),
      vessel('230', {
        name: 'OTHER',
        lengthMeters: 100,
      }),
    ]

    expect(
      orderVesselSearchResults(values, '230').map(({ mmsi }) => mmsi),
    ).toEqual([230, 230000002, 230000001])
  })

  it('combines category, navigation, speed, and inclusive length criteria', () => {
    const values = [
      vessel('1', {
        vesselCategory: 'cargo',
        navigationCategory: 'underway',
        speedKph: ONE_KNOT_KPH,
        lengthMeters: 99,
      }),
      vessel('2', {
        vesselCategory: 'cargo',
        navigationCategory: 'underway',
        speedKph: ONE_KNOT_KPH - 0.001,
        lengthMeters: 99,
      }),
      vessel('3', {
        vesselCategory: 'tanker',
        navigationCategory: 'underway',
        speedKph: ONE_KNOT_KPH,
        lengthMeters: 100,
      }),
    ]
    const filters = {
      ...DEFAULT_VESSEL_FILTERS,
      category: 'cargo' as const,
      navigation: 'underway' as const,
      reportedSpeed: 'one-knot-or-more' as const,
      maximumLengthMeters: 99 as const,
    }

    expect(filterVessels(values, filters).map(({ id }) => id)).toEqual([
      'vessel:1',
    ])
  })

  it('treats unknown values as explicit choices rather than known categories', () => {
    const values = [
      vessel('1', { lengthMeters: 100 }),
      vessel('2', {
        vesselCategory: 'other',
        navigationCategory: 'other',
        speedKph: 0,
        lengthMeters: 100,
      }),
    ]

    expect(
      filterVessels(values, {
        ...DEFAULT_VESSEL_FILTERS,
        category: 'unknown',
      }).map(({ id }) => id),
    ).toEqual(['vessel:1'])
    expect(
      filterVessels(values, {
        ...DEFAULT_VESSEL_FILTERS,
        navigation: 'unknown',
      }).map(({ id }) => id),
    ).toEqual(['vessel:1'])
    expect(
      filterVessels(values, {
        ...DEFAULT_VESSEL_FILTERS,
        reportedSpeed: 'unknown',
      }).map(({ id }) => id),
    ).toEqual(['vessel:1'])
  })

  it('clears an incompatible maximum when the minimum increases', () => {
    const current = {
      ...DEFAULT_VESSEL_FILTERS,
      minimumLengthMeters: 25 as const,
      maximumLengthMeters: 49 as const,
    }

    expect(withMinimumVesselLength(current, 50)).toMatchObject({
      minimumLengthMeters: 50,
      maximumLengthMeters: null,
    })
  })

  it('summarizes and recognizes the exact reset state', () => {
    expect(isDefaultVesselFilters(DEFAULT_VESSEL_FILTERS)).toBe(true)
    expect(vesselFilterSummary(DEFAULT_VESSEL_FILTERS)).toBe(
      '50 m or longer · unknown length hidden',
    )
    expect(
      isDefaultVesselFilters({
        ...DEFAULT_VESSEL_FILTERS,
        query: 'ship',
      }),
    ).toBe(false)
  })
})
