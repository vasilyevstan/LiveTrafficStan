import type { FeatureCollection, LineString, Point } from 'geojson'
import { describe, expect, it, vi } from 'vitest'
import { LOCAL_MAP_TOOLS_CONFIG } from '../config/appConfig'
import { localRulerFeatures, installLocalRulerStyle, SOURCE_LOCAL_RULER } from './localRulerStyle'
import { SOURCE_JOURNEY } from './journeyStyle'

const points = [{ latitude: 59, longitude: 179.7 }, { latitude: 59, longitude: -179.7 }] as const

describe('bounded persistent ruler map geometry', () => {
  it('keeps one first-point marker, then a short seam-split line and exact two endpoints', () => {
    expect(localRulerFeatures([]).features).toEqual([])
    expect(localRulerFeatures([points[0]]).features).toHaveLength(1)
    const data = localRulerFeatures(points)
    const endpoints = data.features.filter(feature => feature.geometry.type === 'Point')
    expect(endpoints.map(feature => feature.geometry.coordinates)).toEqual(points.map(point => [point.longitude, point.latitude]))
    const segments = data.features.filter(feature => feature.geometry.type === 'LineString')
    expect(segments).toHaveLength(2)
    const coordinates = segments.flatMap(feature => feature.geometry.type === 'LineString' ? feature.geometry.coordinates : [])
    expect(coordinates.length + endpoints.length).toBeLessThanOrEqual(LOCAL_MAP_TOOLS_CONFIG.rulerMaximumGeometryPoints)
    expect(coordinates.every(point => point.every(Number.isFinite))).toBe(true)
    expect(coordinates.every(point => Math.abs(point[0]!) >= 179.7)).toBe(true)
    expect(data.features.every(feature => Object.keys(feature.properties ?? {}).length === 0)).toBe(true)
  })

  it('refuses invalid points and invalid pairs without showing partial endpoint success', () => {
    expect(localRulerFeatures([{ latitude: NaN, longitude: 0 }]).features).toEqual([])
    expect(localRulerFeatures([points[0], { latitude: 0, longitude: 0 }]).features).toEqual([])
    expect(localRulerFeatures([{ latitude: 85.051, longitude: -5 }, { latitude: 85.051, longitude: 5 }]).features).toEqual([])
    expect(localRulerFeatures([points[0], points[0]]).features.filter(feature => feature.geometry.type === 'Point')).toHaveLength(2)
  })

  it('installs one glyph-free source below captured paths, updates paint/data, clears and rehydrates idempotently', () => {
    const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>()
    const layers = new Set([`${SOURCE_JOURNEY}-observed-halo`])
    let data: FeatureCollection<LineString | Point> | undefined
    const map = {
      getSource: vi.fn().mockImplementation((id: string) => sources.get(id)),
      addSource: vi.fn().mockImplementation((id: string, source: { data: FeatureCollection<LineString | Point> }) => {
        data = source.data
        sources.set(id, { setData: vi.fn(next => { data = next }) })
      }),
      getLayer: vi.fn().mockImplementation((id: string) => layers.has(id) ? {} : undefined),
      addLayer: vi.fn().mockImplementation((layer: { id: string }) => { layers.add(layer.id) }),
      setPaintProperty: vi.fn(),
    }
    installLocalRulerStyle(map, [], 'light')
    expect(map.addSource).not.toHaveBeenCalled()
    installLocalRulerStyle(map, points, 'light')
    installLocalRulerStyle(map, points, 'dark')
    expect(map.addSource).toHaveBeenCalledTimes(1)
    expect(map.addLayer).toHaveBeenCalledTimes(3)
    for (const [layer, before] of map.addLayer.mock.calls) {
      expect(before).toBe(`${SOURCE_JOURNEY}-observed-halo`)
      expect(layer.type).not.toBe('symbol')
      expect(layer.source).toBe(SOURCE_LOCAL_RULER)
    }
    expect(map.setPaintProperty).toHaveBeenCalled()
    expect(data!.features).toHaveLength(4)
    installLocalRulerStyle(map, [], 'dark')
    expect(data!.features).toEqual([])
    sources.clear()
    layers.clear()
    installLocalRulerStyle(map, points, 'dark')
    expect(map.addSource).toHaveBeenCalledTimes(2)
    expect(map.addLayer).toHaveBeenCalledTimes(6)
  })
})
