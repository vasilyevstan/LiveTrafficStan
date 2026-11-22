import type { FeatureCollection, Point } from 'geojson'
import { describe, expect, it, vi } from 'vitest'
import type { LocatedReportMarker } from '../domain/locatedReport'
import { SOURCE_JOURNEY } from './journeyStyle'
import { installLocatedReportStyle, locatedReportFeatures, locatedReportLabel, SOURCE_LOCATED_REPORT } from './locatedReportStyle'
import { LAYER_SELECTED_TRAIL } from './trafficStyle'

const marker: LocatedReportMarker = {
  liveId: 'vessel:276143000', kind: 'vessel', name: 'KINDRAL KURVITS',
  latitude: 59.45, longitude: 24.75, reportedAt: Date.UTC(2026, 6, 21, 10, 14),
}

const fakeMap = (options: { glyphs?: string; before?: string } = {}) => {
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>()
  const layers = new Set(options.before ? [options.before] : [])
  const state: { data?: FeatureCollection<Point> } = {}
  const map = {
    getSource: vi.fn().mockImplementation((id: string) => sources.get(id)),
    addSource: vi.fn().mockImplementation((id: string, source: { data: FeatureCollection<Point> }) => {
      state.data = source.data
      sources.set(id, { setData: vi.fn(next => { state.data = next }) })
    }),
    getLayer: vi.fn().mockImplementation((id: string) => layers.has(id) ? {} : undefined),
    addLayer: vi.fn().mockImplementation((layer: { id: string }) => { layers.add(layer.id) }),
    setPaintProperty: vi.fn(),
    getStyle: vi.fn(() => ({ version: 8 as const, sources: {}, layers: [], ...(options.glyphs ? { glyphs: options.glyphs } : {}) })),
  }
  return { map, state, reset: () => { sources.clear(); layers.clear() } }
}

describe('located last-report marker', () => {
  it('builds one dated point and rejects invalid geometry', () => {
    const data = locatedReportFeatures(marker)
    expect(data.features).toHaveLength(1)
    expect(data.features[0]!.geometry.coordinates).toEqual([24.75, 59.45])
    expect(data.features[0]!.properties?.label).toBe(locatedReportLabel(marker))
    expect(locatedReportLabel(marker)).toMatch(/^KINDRAL KURVITS · last report .+/)
    expect(locatedReportFeatures(undefined).features).toEqual([])
    expect(locatedReportFeatures({ ...marker, latitude: NaN }).features).toEqual([])
    expect(locatedReportFeatures({ ...marker, longitude: 181 }).features).toEqual([])
    expect(locatedReportFeatures({ ...marker, reportedAt: NaN }).features).toEqual([])
  })

  it('installs one non-traffic source below captured paths, updates data and paint, clears and rehydrates idempotently', () => {
    const { map, state, reset } = fakeMap({ before: `${SOURCE_JOURNEY}-observed-halo` })
    installLocatedReportStyle(map, undefined, 'light')
    expect(map.addSource).not.toHaveBeenCalled()
    installLocatedReportStyle(map, marker, 'light')
    installLocatedReportStyle(map, { ...marker, latitude: 60 }, 'dark')
    expect(map.addSource).toHaveBeenCalledTimes(1)
    expect(map.addLayer).toHaveBeenCalledTimes(3)
    for (const [layer, before] of map.addLayer.mock.calls) {
      expect(layer.source).toBe(SOURCE_LOCATED_REPORT)
      expect(before).toBe(`${SOURCE_JOURNEY}-observed-halo`)
    }
    expect(map.setPaintProperty).toHaveBeenCalled()
    expect(state.data!.features[0]!.geometry.coordinates).toEqual([24.75, 60])
    installLocatedReportStyle(map, undefined, 'dark')
    expect(state.data!.features).toEqual([])
    reset()
    installLocatedReportStyle(map, undefined, 'dark')
    expect(map.addSource).toHaveBeenCalledTimes(1)
    installLocatedReportStyle(map, marker, 'dark')
    expect(map.addSource).toHaveBeenCalledTimes(2)
    expect(map.addLayer).toHaveBeenCalledTimes(6)
  })

  it('omits the label layer when the style has glyphs but no declared font and places below the selected trail', () => {
    const { map } = fakeMap({ glyphs: 'https://example.test/{fontstack}/{range}.pbf', before: LAYER_SELECTED_TRAIL })
    installLocatedReportStyle(map, marker, 'light')
    expect(map.addLayer.mock.calls.map(([layer]) => layer.type)).toEqual(['circle', 'circle'])
    expect(map.addLayer.mock.calls.every(([, before]) => before === LAYER_SELECTED_TRAIL)).toBe(true)
  })
})
