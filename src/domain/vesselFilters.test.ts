import { describe, expect, it } from 'vitest'
import type { Vessel } from './traffic'
import {
  DEFAULT_VESSEL_FILTERS,
  filterVessels,
  isDefaultVesselFilters,
  matchesVesselFilters,
  ONE_KNOT_KPH,
  orderVesselSearchResults,
  vesselFilterSummary,
  withMinimumVesselLength,
} from './vesselFilters'

const context = {
  displayTime: 120_001,
  staleAfterMs: 120_000,
}

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
      filterVessels(values, DEFAULT_VESSEL_FILTERS, context).map(
        ({ id }) => id,
      ),
    ).toEqual(['vessel:2', 'vessel:4'])
    expect(
      filterVessels(
        values,
        {
          ...DEFAULT_VESSEL_FILTERS,
          includeUnknownLength: true,
        },
        context,
      ).map(({ id }) => id),
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
        filterVessels(
          values,
          {
            ...DEFAULT_VESSEL_FILTERS,
            query,
          },
          context,
        ).map(({ id }) => id),
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

    expect(
      filterVessels(values, filters, context).map(({ id }) => id),
    ).toEqual(['vessel:1'])
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
      filterVessels(
        values,
        {
          ...DEFAULT_VESSEL_FILTERS,
          category: 'unknown',
        },
        context,
      ).map(({ id }) => id),
    ).toEqual(['vessel:1'])
    expect(
      filterVessels(
        values,
        {
          ...DEFAULT_VESSEL_FILTERS,
          navigation: 'unknown',
        },
        context,
      ).map(({ id }) => id),
    ).toEqual(['vessel:1'])
    expect(
      filterVessels(
        values,
        {
          ...DEFAULT_VESSEL_FILTERS,
          reportedSpeed: 'unknown',
        },
        context,
      ).map(({ id }) => id),
    ).toEqual(['vessel:1'])
  })

  it('keeps the global maximum when the non-yacht minimum increases', () => {
    const current = {
      ...DEFAULT_VESSEL_FILTERS,
      minimumLengthMeters: 25 as const,
      maximumLengthMeters: 49 as const,
    }

    expect(withMinimumVesselLength(current, 50)).toMatchObject({
      minimumLengthMeters: 50,
      maximumLengthMeters: 49,
    })
  })

  it('summarizes and recognizes the exact reset state', () => {
    expect(isDefaultVesselFilters(DEFAULT_VESSEL_FILTERS)).toBe(true)
    expect(vesselFilterSummary(DEFAULT_VESSEL_FILTERS)).toBe(
      'non-yachts 50 m or longer · non-yachts with unknown length hidden',
    )
    expect(
      isDefaultVesselFilters({
        ...DEFAULT_VESSEL_FILTERS,
        query: 'ship',
      }),
    ).toBe(false)
  })

  it('changes speed labels without changing the one-knot filter boundary', () => {
    const filters = {
      ...DEFAULT_VESSEL_FILTERS,
      reportedSpeed: 'one-knot-or-more' as const,
    }
    expect(vesselFilterSummary(filters, 'metric')).toContain(
      '1.9 km/h or faster',
    )
    expect(
      vesselFilterSummary(filters, 'aviation-nautical'),
    ).toContain('1 kn or faster')
    expect(
      matchesVesselFilters(
        vessel('1', {
          speedKph: ONE_KNOT_KPH,
          lengthMeters: 50,
        }),
        filters,
        context,
      ),
    ).toBe(true)
  })

  it('shows exact sailing and pleasure craft only when the moving-yacht gate passes', () => {
    const baseYacht = {
      vesselCategory: 'other' as const,
      vesselType: 'Sailing vessel',
      lengthMeters: 8,
      speedKph: ONE_KNOT_KPH,
      position: {
        latitude: 59,
        longitude: 24,
        observedAt: 1,
      },
    }
    const values = [
      vessel('1', baseYacht),
      vessel('2', {
        ...baseYacht,
        vesselType: 'Pleasure craft',
        lengthMeters: 7.999,
      }),
      vessel('3', {
        ...baseYacht,
        speedKph: 0.999 * ONE_KNOT_KPH,
      }),
      vessel('4', {
        ...baseYacht,
        lengthMeters: 70,
        speedKph: 0,
      }),
      vessel('5', {
        ...baseYacht,
        vesselType: 'Cargo vessel',
        vesselCategory: 'cargo',
        lengthMeters: 70,
        speedKph: 0,
      }),
    ]

    expect(
      filterVessels(values, DEFAULT_VESSEL_FILTERS, context).map(
        ({ id }) => id,
      ),
    ).toEqual(['vessel:1', 'vessel:5'])
  })

  it('rejects yacht eligibility when a required reported value is missing or invalid', () => {
    const baseYacht = {
      vesselCategory: 'other' as const,
      vesselType: 'Sailing vessel',
      lengthMeters: 20,
      speedKph: ONE_KNOT_KPH,
    }
    const values = [
      vessel('missing-length', {
        ...baseYacht,
        lengthMeters: undefined,
      }),
      vessel('invalid-length', {
        ...baseYacht,
        lengthMeters: Number.NaN,
      }),
      vessel('missing-speed', {
        ...baseYacht,
        speedKph: undefined,
      }),
      vessel('invalid-speed', {
        ...baseYacht,
        speedKph: Number.POSITIVE_INFINITY,
      }),
      vessel('invalid-time', {
        ...baseYacht,
        position: {
          latitude: 59,
          longitude: 24,
          observedAt: Number.NaN,
        },
      }),
    ]

    expect(
      filterVessels(values, DEFAULT_VESSEL_FILTERS, context),
    ).toEqual([])
    const validYacht = vessel('valid', baseYacht)
    expect(
      matchesVesselFilters(validYacht, DEFAULT_VESSEL_FILTERS, {
        displayTime: Number.NaN,
        staleAfterMs: 120_000,
      }),
    ).toBe(false)
    expect(
      matchesVesselFilters(validYacht, DEFAULT_VESSEL_FILTERS, {
        displayTime: context.displayTime,
        staleAfterMs: -1,
      }),
    ).toBe(false)
  })

  it('uses exact live or playback time and rejects future yacht reports', () => {
    const yacht = vessel('1', {
      vesselCategory: 'other',
      vesselType: 'Pleasure craft',
      lengthMeters: 20,
      speedKph: ONE_KNOT_KPH,
      position: {
        latitude: 59,
        longitude: 24,
        observedAt: 1_000,
      },
    })

    for (const [age, expected] of [
      [0, true],
      [120_000, true],
      [120_001, false],
      [-1, false],
    ] as const) {
      expect(
        matchesVesselFilters(yacht, DEFAULT_VESSEL_FILTERS, {
          displayTime: yacht.position.observedAt + age,
          staleAfterMs: 120_000,
        }),
      ).toBe(expected)
    }
  })

  it('keeps every existing filter restrictive for eligible yachts', () => {
    const yacht = vessel('1', {
      name: 'WIND',
      vesselCategory: 'other',
      navigationCategory: 'underway',
      vesselType: 'Sailing vessel',
      lengthMeters: 30,
      speedKph: ONE_KNOT_KPH,
    })

    expect(
      matchesVesselFilters(
        yacht,
        {
          ...DEFAULT_VESSEL_FILTERS,
          maximumLengthMeters: 24,
        },
        context,
      ),
    ).toBe(false)
    expect(
      matchesVesselFilters(
        yacht,
        {
          ...DEFAULT_VESSEL_FILTERS,
          navigation: 'moored',
        },
        context,
      ),
    ).toBe(false)
    expect(
      matchesVesselFilters(
        yacht,
        {
          ...DEFAULT_VESSEL_FILTERS,
          category: 'cargo',
        },
        context,
      ),
    ).toBe(false)
    expect(
      matchesVesselFilters(
        yacht,
        {
          ...DEFAULT_VESSEL_FILTERS,
          reportedSpeed: 'under-one-knot',
        },
        context,
      ),
    ).toBe(false)
    expect(
      matchesVesselFilters(
        yacht,
        {
          ...DEFAULT_VESSEL_FILTERS,
          query: 'missing',
        },
        context,
      ),
    ).toBe(false)
  })
})
