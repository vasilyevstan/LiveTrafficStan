import type { Map as MapLibreMap } from 'maplibre-gl'
import { describe, expect, it, vi } from 'vitest'
import type { DisplayWeatherObservation } from '../domain/weatherObservations'
import { LAYER_SELECTED_TRAIL } from './trafficStyle'
import {
  LAYER_WEATHER_LABELS,
  LAYER_WEATHER_POINTS,
  SOURCE_WEATHER,
  WEATHER_LAYER_IDS,
  installWeatherStyle,
  weatherFeatures,
} from './weatherStyle'

const observation: DisplayWeatherObservation = {
  id: 'weather:EETN',
  stationId: 'EETN',
  siteName: 'Tallinn Airport',
  longitude: 24.801,
  latitude: 59.413,
  observedAt: 100_000,
  reportType: 'METAR',
  flightCategory: 'VFR',
  rawObservation: 'METAR EETN fixture',
  freshness: 'current',
}

describe('weather style', () => {
  it('creates selectable non-color-only features', () => {
    expect(weatherFeatures([observation], observation.id)).toEqual({
      type: 'FeatureCollection',
      features: [
        expect.objectContaining({
          id: observation.id,
          properties: expect.objectContaining({
            id: observation.id,
            stationId: 'EETN',
            category: 'VFR',
            selected: true,
          }),
        }),
      ],
    })
  })

  it('is idempotent, attributed, theme-aware, and installs below traffic', () => {
    const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>()
    const sourceOptions = new Map<string, unknown>()
    const layers = new Map<string, Record<string, unknown>>([
      [LAYER_SELECTED_TRAIL, { id: LAYER_SELECTED_TRAIL }],
    ])
    const paint = new Map<string, unknown>()
    const visibility = new Map<string, unknown>()
    const addSource = vi.fn((id: string, options: unknown) => {
      sources.set(id, { setData: vi.fn() })
      sourceOptions.set(id, options)
    })
    const addLayer = vi.fn(
      (layer: Record<string, unknown>, before?: string) => {
        layers.set(layer.id as string, { ...layer, before })
      },
    )
    const map = {
      getSource: (id: string) => sources.get(id),
      addSource,
      getLayer: (id: string) => layers.get(id),
      addLayer,
      setPaintProperty: (id: string, property: string, value: unknown) => {
        paint.set(`${id}:${property}`, value)
      },
      setLayoutProperty: (id: string, property: string, value: unknown) => {
        visibility.set(`${id}:${property}`, value)
      },
    } as unknown as MapLibreMap
    const data = weatherFeatures([observation], null)

    installWeatherStyle(map, data, 'light', true)
    installWeatherStyle(map, data, 'dark', false)

    expect(addSource).toHaveBeenCalledTimes(1)
    expect(sourceOptions.get(SOURCE_WEATHER)).toMatchObject({
      attribution: expect.stringContaining('Aviation Weather Center'),
    })
    expect(sources.get(SOURCE_WEATHER)?.setData).toHaveBeenCalledTimes(1)
    expect(addLayer).toHaveBeenCalledTimes(WEATHER_LAYER_IDS.length)
    expect(
      addLayer.mock.calls.every(
        ([, before]) => before === LAYER_SELECTED_TRAIL,
      ),
    ).toBe(true)
    expect(layers.get(LAYER_WEATHER_LABELS)).toMatchObject({
      layout: {
        'text-field': expect.arrayContaining(['case']),
      },
    })
    expect(
      paint.get(`${LAYER_WEATHER_POINTS}:circle-stroke-color`),
    ).toBe('#effcff')
    expect(
      visibility.get(`${LAYER_WEATHER_POINTS}:visibility`),
    ).toBe('none')
  })
})
