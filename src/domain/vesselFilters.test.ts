import { describe, expect, it } from 'vitest'
import { APP_CONFIG } from '../config/appConfig'
import { displayTraffic } from '../traffic/freshness'
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
  expireAfterMs: 600_000,
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

  it('shows exact sailing and pleasure craft from eight metres at any reported speed', () => {
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
        vesselType: 'Pleasure craft',
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
      vessel('6', {
        ...baseYacht,
        vesselType: 'Pleasure craft',
        speedKph: undefined,
      }),
      vessel('7', {
        ...baseYacht,
        name: 'PLEASURE YACHT',
        vesselType: 'Other vessel',
      }),
    ]

    expect(
      filterVessels(values, DEFAULT_VESSEL_FILTERS, context).map(
        ({ id }) => id,
      ),
    ).toEqual(['vessel:1', 'vessel:3', 'vessel:4', 'vessel:5', 'vessel:6'])
  })

  it.each(['Sailing vessel', 'Pleasure craft'])(
    'honors every reported-speed choice for %s without a hidden movement gate',
    (vesselType) => {
      const values = [0, 0.999 * ONE_KNOT_KPH, ONE_KNOT_KPH, 5, undefined]
        .map((speedKph, index) => vessel(String(index + 1), {
          vesselCategory: 'other',
          vesselType,
          lengthMeters: 8,
          speedKph,
        }))

      for (const [reportedSpeed, expected] of [
        ['all', ['vessel:1', 'vessel:2', 'vessel:3', 'vessel:4', 'vessel:5']],
        ['under-one-knot', ['vessel:1', 'vessel:2']],
        ['one-knot-or-more', ['vessel:3', 'vessel:4']],
        ['unknown', ['vessel:5']],
      ] as const) {
        expect(
          filterVessels(values, {
            ...DEFAULT_VESSEL_FILTERS,
            reportedSpeed,
          }, context).map(({ id }) => id),
        ).toEqual(expected)
      }
    },
  )

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
      vessel('negative-speed', {
        ...baseYacht,
        speedKph: -1,
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
        expireAfterMs: 600_000,
      }),
    ).toBe(false)
    expect(
      matchesVesselFilters(validYacht, DEFAULT_VESSEL_FILTERS, {
        displayTime: context.displayTime,
        expireAfterMs: -1,
      }),
    ).toBe(false)
    expect(
      matchesVesselFilters(validYacht, DEFAULT_VESSEL_FILTERS, {
        displayTime: context.displayTime,
        expireAfterMs: Number.POSITIVE_INFINITY,
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
      [120_001, true],
      [600_000, true],
      [600_001, false],
      [-1, false],
    ] as const) {
      expect(
        matchesVesselFilters(yacht, DEFAULT_VESSEL_FILTERS, {
          displayTime: yacht.position.observedAt + age,
          expireAfterMs: 600_000,
        }),
      ).toBe(expected)
    }
  })

  it('keeps stopped yachts visibly stale until normal marine expiry', () => {
    const yacht = vessel('1', {
      vesselCategory: 'other',
      vesselType: 'Pleasure craft',
      lengthMeters: 16,
      speedKph: 0,
    })

    expect(APP_CONFIG.marine.staleAfterMs).toBe(120_000)
    expect(APP_CONFIG.marine.expireAfterMs).toBe(600_000)
    for (const [age, freshness] of [
      [120_000, 'live'],
      [120_001, 'stale'],
      [123_591, 'stale'],
      [600_000, 'stale'],
      [600_001, undefined],
    ] as const) {
      const displayTime = yacht.position.observedAt + age
      const current = displayTraffic([yacht], displayTime, APP_CONFIG.marine)
      const shown = filterVessels(current, DEFAULT_VESSEL_FILTERS, {
        displayTime,
        expireAfterMs: APP_CONFIG.marine.expireAfterMs,
      })
      expect(shown.map(({ id, freshness }) => ({ id, freshness }))).toEqual(
        freshness ? [{ id: yacht.id, freshness }] : [],
      )
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
