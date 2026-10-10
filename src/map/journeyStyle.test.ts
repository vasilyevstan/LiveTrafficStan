import type { FeatureCollection, LineString, Point } from 'geojson'
import { describe, expect, it, vi } from 'vitest'
import type { JourneySnapshot } from '../domain/journey'
import { installJourneyStyle, journeyFeatures, SOURCE_JOURNEY, splitJourneyLine } from './journeyStyle'

const snapshot: JourneySnapshot = {
  revision: 1, identity: 'test', kind: 'aircraft', title: 'Test', capturedAt: 1,
  position: { latitude: 0, longitude: 179, observedAt: 1 },
  segments: [{ phase: 'remaining', certainty: 'estimated', source: 'Test', points: [
    { latitude: 0, longitude: 179 }, { latitude: 2, longitude: -179 },
  ] }],
  endpoints: [{ latitude: 0, longitude: 179, role: 'captured', label: 'Captured position' }],
  sources: [], limitations: [],
}

describe('captured journey map layers', () => {
  it('splits dateline crossings and preserves seam-equivalent points without NaN or world-spanning edges', () => {
    expect(splitJourneyLine(snapshot.segments[0]!.points)).toEqual([
      [[179, 0], [180, 1]], [[-180, 1], [-179, 2]],
    ])
    expect(splitJourneyLine([{ latitude: 1, longitude: 180 }, { latitude: 2, longitude: -180 }])).toEqual([
      [[180, 1], [180, 2]],
    ])
    const features = journeyFeatures(snapshot)
    expect(features.features).toHaveLength(3)
    expect(features.features[0]!.properties).toEqual({ phase: 'remaining', certainty: 'estimated' })
    expect(features.features[2]!.properties).toEqual({ label: 'Captured position', role: 'captured' })
    expect(journeyFeatures(undefined).features).toEqual([])
  })

  it('reuses a single source, rehydrates after style replacement and clears geometry on hide', () => {
    const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>()
    const layers = new Set<string>()
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
      getStyle: vi.fn().mockReturnValue({ version: 8, sources: {}, layers: [] }),
    }
    installJourneyStyle(map, undefined, 'light')
    expect(map.addSource).not.toHaveBeenCalled()
    installJourneyStyle(map, snapshot, 'light')
    installJourneyStyle(map, snapshot, 'dark')
    expect(map.addSource).toHaveBeenCalledTimes(1)
    expect(map.setPaintProperty).toHaveBeenCalled()
    expect(data!.features).toHaveLength(3)
    installJourneyStyle(map, undefined, 'dark')
    expect(data!.features).toHaveLength(0)
    sources.clear()
    layers.clear()
    installJourneyStyle(map, snapshot, 'dark')
    expect(map.addSource).toHaveBeenCalledTimes(2)
    expect(sources.has(SOURCE_JOURNEY)).toBe(true)
    expect(data!.features).toHaveLength(3)
  })
})
