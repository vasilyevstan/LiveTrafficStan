import type { Map as MapLibreMap } from 'maplibre-gl'
import { describe, expect, it, vi } from 'vitest'
import type { DisplayTrain } from '../domain/trains'
import { LAYER_SELECTED_TRAIL } from './trafficStyle'
import {
  LAYER_TRAIN_LABELS,
  LAYER_TRAIN_POINTS,
  SOURCE_TRAINS,
  TRAIN_LAYER_IDS,
  installTrainStyle,
  setTrainModelsActive,
  trainFeatures,
  trainPointFilter,
} from './trainStyle'

const baseStyle = () => ({
  version: 8 as const,
  glyphs: 'https://tiles.example.test/{fontstack}/{range}.pbf',
  sources: {},
  layers: [
    {
      id: 'base-label',
      type: 'symbol' as const,
      source: 'base',
      layout: { 'text-font': ['Noto Sans Regular'] },
    },
  ],
})

const train = (overrides: Partial<DisplayTrain> = {}): DisplayTrain => ({
  id: 'train:fintraffic:2026-11-14:9',
  sourceId: 'fintraffic',
  name: 'IC 9',
  trainNumber: '9',
  category: 'long-distance',
  longitude: 24.94,
  latitude: 60.17,
  observedAt: 100_000,
  courseDegrees: 12,
  courseOrigin: 'derived',
  freshness: 'current',
  ...overrides,
})

const fakeMap = () => {
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>()
  const sourceOptions = new Map<string, unknown>()
  const layers = new Map<string, Record<string, unknown>>([
    [LAYER_SELECTED_TRAIL, { id: LAYER_SELECTED_TRAIL }],
  ])
  const properties = new Map<string, unknown>()
  const filters = new Map<string, unknown>()
  const addSource = vi.fn((id: string, options: unknown) => {
    sources.set(id, { setData: vi.fn() })
    sourceOptions.set(id, options)
  })
  const addLayer = vi.fn((layer: Record<string, unknown>, before?: string) => {
    layers.set(layer.id as string, { ...layer, before })
  })
  const map = {
    getStyle: baseStyle,
    getSource: (id: string) => sources.get(id),
    addSource,
    getLayer: (id: string) => layers.get(id),
    addLayer,
    setPaintProperty: (id: string, property: string, value: unknown) => {
      properties.set(`${id}:${property}`, value)
    },
    setLayoutProperty: (id: string, property: string, value: unknown) => {
      properties.set(`${id}:${property}`, value)
    },
    setFilter: (id: string, filter: unknown) => {
      filters.set(id, filter)
    },
  } as unknown as MapLibreMap
  return { map, sources, sourceOptions, layers, properties, filters, addSource, addLayer }
}

describe('train style', () => {
  it('creates selectable features that mark stale and unoriented trains', () => {
    const features = trainFeatures(
      [
        train(),
        train({
          id: 'train:lirr:1234',
          sourceId: 'lirr',
          name: 'LIRR 1234',
          trainNumber: undefined,
          category: 'commuter',
          courseDegrees: undefined,
          courseOrigin: undefined,
          freshness: 'stale',
        }),
      ],
      'train:lirr:1234',
    )

    expect(features.features.map(({ properties }) => properties)).toEqual([
      {
        id: 'train:fintraffic:2026-11-14:9',
        label: '9',
        category: 'long-distance',
        selected: false,
        stale: false,
        oriented: true,
      },
      {
        id: 'train:lirr:1234',
        label: 'LIRR 1234',
        category: 'commuter',
        selected: true,
        stale: true,
        oriented: false,
      },
    ])
    expect(features.features[0].geometry.coordinates).toEqual([24.94, 60.17])
  })

  it('keeps only unoriented dots while 3D train models are active', () => {
    expect(trainPointFilter(false)).toEqual(['boolean', true])
    expect(trainPointFilter(true)).toEqual(['!=', ['get', 'oriented'], true])
  })

  it('is idempotent, attributed, theme-aware, and installs below traffic', () => {
    const { map, sources, sourceOptions, layers, properties, filters, addSource, addLayer } =
      fakeMap()
    const data = trainFeatures([train()], null)

    installTrainStyle(map, data, 'light', true, false)
    installTrainStyle(map, data, 'dark', false, true)

    expect(addSource).toHaveBeenCalledTimes(1)
    const attribution = (sourceOptions.get(SOURCE_TRAINS) as { attribution: string })
      .attribution
    for (const source of ['Fintraffic', 'Entur', 'MBTA', 'MTA']) {
      expect(attribution).toContain(source)
    }
    expect(sources.get(SOURCE_TRAINS)?.setData).toHaveBeenCalledTimes(1)
    expect(addLayer).toHaveBeenCalledTimes(TRAIN_LAYER_IDS.length)
    expect(addLayer.mock.calls.every(([, before]) => before === LAYER_SELECTED_TRAIL)).toBe(
      true,
    )
    expect(layers.get(LAYER_TRAIN_LABELS)).toMatchObject({
      minzoom: 10,
      layout: { 'text-font': ['Noto Sans Regular'] },
    })
    expect(properties.get(`${LAYER_TRAIN_POINTS}:circle-color`)).toEqual([
      'case',
      ['==', ['get', 'category'], 'freight'],
      '#fb923c',
      '#a3e635',
    ])
    expect(properties.get(`${LAYER_TRAIN_POINTS}:visibility`)).toBe('none')
    expect(filters.get(LAYER_TRAIN_POINTS)).toEqual(trainPointFilter(true))

    setTrainModelsActive(map, false)
    expect(filters.get(LAYER_TRAIN_POINTS)).toEqual(trainPointFilter(false))
  })
})
