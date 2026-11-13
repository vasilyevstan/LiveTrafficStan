import { describe, expect, it } from 'vitest'
import {
  LAYER_ORBITAL_HIGHLIGHT,
  LAYER_ORBITAL_POINTS,
  LAYER_STARLINK_HIGHLIGHT,
  LAYER_STARLINK_POINTS,
} from '../orbitalStyle'
import {
  exactEligibleFeatureId,
  uniqueCanonicalOrbitalFeatureId,
  uniqueEligibleFeatureId,
} from '../touchPicking'
import { LAYER_AIRCRAFT } from '../trafficStyle'
import {
  activeModelGroups,
  INACTIVE_MODEL_ACTIVITY,
  modelPickFeatures,
  ORBITAL_MODEL_GROUPS,
  resolveModelActivity,
  sameModelActivity,
  TRAFFIC_MODEL_GROUPS,
  visibleFlatOrbitalFeatures,
  type ModelActivity,
  type ModelActivityInput,
} from './modelActivity'

const input = (
  overrides: Partial<ModelActivityInput> = {},
): ModelActivityInput => ({
  available: true,
  captured: false,
  zoom: 12,
  clusteringEnabled: true,
  clusterMaximumZoom: 10,
  aircraftVisible: true,
  vesselsVisible: true,
  orbitalVisible: true,
  starlinkVisible: true,
  ...overrides,
})

const ALL_ACTIVE: ModelActivity = {
  aircraft: true,
  vessels: true,
  orbital: true,
  starlink: true,
}

describe('resolveModelActivity', () => {
  it('keeps every group on the flat path until the runtime is available', () => {
    expect(resolveModelActivity(input({ available: false }))).toBe(
      INACTIVE_MODEL_ACTIVITY,
    )
    expect(Object.values(INACTIVE_MODEL_ACTIVITY)).toEqual([
      false,
      false,
      false,
      false,
    ])
  })

  it('keeps captured views on the flat path', () => {
    expect(resolveModelActivity(input({ captured: true }))).toBe(
      INACTIVE_MODEL_ACTIVITY,
    )
  })

  it('draws each visible group independently', () => {
    expect(resolveModelActivity(input())).toEqual(ALL_ACTIVE)
    expect(
      resolveModelActivity(
        input({ aircraftVisible: false, starlinkVisible: false }),
      ),
    ).toEqual({ aircraft: false, vessels: true, orbital: true, starlink: false })
    expect(
      resolveModelActivity(
        input({ vesselsVisible: false, orbitalVisible: false }),
      ),
    ).toEqual({ aircraft: true, vessels: false, orbital: false, starlink: true })
  })

  it.each([
    { zoom: 9.5, traffic: false },
    { zoom: 10, traffic: false },
    { zoom: 10.99, traffic: false },
    { zoom: 11, traffic: true },
    { zoom: 14.5, traffic: true },
  ])(
    'replaces traffic only past the integer cluster tile zoom ($zoom)',
    ({ zoom, traffic }) => {
      expect(resolveModelActivity(input({ zoom }))).toEqual({
        aircraft: traffic,
        vessels: traffic,
        orbital: true,
        starlink: true,
      })
    },
  )

  it('replaces traffic at any zoom when clustering is disabled', () => {
    expect(
      resolveModelActivity(input({ zoom: 2, clusteringEnabled: false })),
    ).toEqual(ALL_ACTIVE)
  })
})

describe('model activity groups', () => {
  it('detects a change in any one group', () => {
    expect(sameModelActivity(ALL_ACTIVE, { ...ALL_ACTIVE })).toBe(true)
    for (const group of [...TRAFFIC_MODEL_GROUPS, ...ORBITAL_MODEL_GROUPS]) {
      expect(
        sameModelActivity(ALL_ACTIVE, { ...ALL_ACTIVE, [group]: false }),
      ).toBe(false)
    }
  })

  it('lists only active groups in the requested order', () => {
    const activity: ModelActivity = {
      aircraft: false,
      vessels: true,
      orbital: true,
      starlink: false,
    }
    expect(activeModelGroups(activity, TRAFFIC_MODEL_GROUPS)).toEqual([
      'vessels',
    ])
    expect(activeModelGroups(activity, ORBITAL_MODEL_GROUPS)).toEqual([
      'orbital',
    ])
    expect(
      activeModelGroups(INACTIVE_MODEL_ACTIVITY, [
        ...TRAFFIC_MODEL_GROUPS,
        ...ORBITAL_MODEL_GROUPS,
      ]),
    ).toEqual([])
  })
})

describe('model picks', () => {
  it('feed the existing exact and touch rules nearest-first', () => {
    const features = [
      ...modelPickFeatures([
        { group: 'aircraft', id: 'aircraft:near', distance: 1 },
        { group: 'aircraft', id: 'aircraft:far', distance: 6 },
      ]),
      { properties: { id: 'aircraft:flat' } },
    ]

    expect(features.slice(0, 2)).toEqual([
      { properties: { id: 'aircraft:near' } },
      { properties: { id: 'aircraft:far' } },
    ])
    expect(
      exactEligibleFeatureId(
        features,
        new Set(['aircraft:far', 'aircraft:near']),
      ),
    ).toBe('aircraft:near')
    expect(exactEligibleFeatureId(features, new Set(['aircraft:far']))).toBe(
      'aircraft:far',
    )
    expect(
      uniqueEligibleFeatureId(
        features,
        new Set(['aircraft:near', 'aircraft:far']),
      ),
    ).toBeNull()
    expect(
      uniqueEligibleFeatureId(features, new Set(['aircraft:near'])),
    ).toBe('aircraft:near')
  })

  it('keep one orbital object canonical across model and highlight hits', () => {
    const features = [
      ...modelPickFeatures([
        { group: 'orbital', id: 'orbital:25544', distance: 2 },
      ]),
      { layer: { id: LAYER_ORBITAL_HIGHLIGHT }, properties: { id: 'orbital:25544' } },
    ]
    expect(
      uniqueCanonicalOrbitalFeatureId(features, new Set(['orbital:25544'])),
    ).toBe('orbital:25544')
  })
})

describe('visibleFlatOrbitalFeatures', () => {
  const feature = (
    layer: string,
    properties: Record<string, unknown> | null,
  ) => ({ layer: { id: layer }, properties })
  const features = [
    feature(LAYER_ORBITAL_POINTS, { id: 'orbital:25544', featuredLabel: 'ISS' }),
    feature(LAYER_ORBITAL_POINTS, { id: 'orbital:20580' }),
    feature(LAYER_ORBITAL_HIGHLIGHT, { id: 'orbital:20580' }),
    feature(LAYER_STARLINK_POINTS, { id: 'orbital:starlink:44713' }),
    feature(LAYER_STARLINK_HIGHLIGHT, { id: 'orbital:starlink:44713' }),
    feature(LAYER_AIRCRAFT, { id: 'aircraft:abc123' }),
    feature(LAYER_ORBITAL_POINTS, null),
  ]

  it('keeps every flat hit while no orbital group is model-drawn', () => {
    expect(
      visibleFlatOrbitalFeatures(features, INACTIVE_MODEL_ACTIVITY),
    ).toEqual(features)
    expect(
      visibleFlatOrbitalFeatures(features, {
        ...INACTIVE_MODEL_ACTIVITY,
        aircraft: true,
        vessels: true,
      }),
    ).toEqual(features)
  })

  it('drops invisible ground icons but keeps featured labels and highlights', () => {
    expect(
      visibleFlatOrbitalFeatures(features, {
        ...INACTIVE_MODEL_ACTIVITY,
        orbital: true,
      }),
    ).toEqual([features[0], features[2], features[3], features[4], features[5]])
    expect(
      visibleFlatOrbitalFeatures(features, {
        ...INACTIVE_MODEL_ACTIVITY,
        starlink: true,
      }),
    ).toEqual([
      features[0],
      features[1],
      features[2],
      features[4],
      features[5],
      features[6],
    ])
  })
})
