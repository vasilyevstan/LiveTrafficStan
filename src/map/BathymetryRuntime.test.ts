import { Map as MapLibreMap, addProtocol, removeProtocol, type LayerSpecification, type SourceSpecification } from 'maplibre-gl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrbitalViewport } from '../domain/orbitalViewport'
import { fetchDepthValue } from '../providers/bathymetry/depthValues'
import { BathymetryTileError } from '../providers/bathymetry/depthTiles'
import { BathymetryRuntime } from './BathymetryRuntime'
import { LAYER_DEPTH_LABELS, LAYER_DEPTH_SHADING, SOURCE_DEPTH_RASTER, SOURCE_DEPTH_VALUES } from './bathymetryStyle'

const fixture = vi.hoisted(() => {
  const layers: LayerSpecification[] = []
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn>; setTiles: ReturnType<typeof vi.fn> }>()
  const sourceSpecs = new Map<string, SourceSpecification>()
  const events = new Map<string, () => void>()
  const map = {
    getStyle: vi.fn(() => ({ version: 8, sources: Object.fromEntries(sourceSpecs), layers })),
    getSource: vi.fn((id: string) => sources.get(id)),
    getLayer: vi.fn((id: string) => layers.find(layer => layer.id === id)),
    addSource: vi.fn((id: string, source: SourceSpecification) => {
      sourceSpecs.set(id, source)
      sources.set(id, { setData: vi.fn(), setTiles: vi.fn() })
    }),
    addLayer: vi.fn((layer: LayerSpecification, before?: string) => {
      const index = before ? layers.findIndex(candidate => candidate.id === before) : -1
      if (index < 0) layers.push(layer)
      else layers.splice(index, 0, layer)
    }),
    setLayoutProperty: vi.fn(),
    setPaintProperty: vi.fn(),
    isSourceLoaded: vi.fn(() => true),
    getCanvas: () => ({ clientWidth: 1280, clientHeight: 900 }),
    getCenter: () => ({ lng: 24.75 }),
    project: ([longitude, latitude]: number[]) => ({
      x: (longitude - 24.5) * 1280 / 0.5, y: (59.9 - latitude) * 900 / 0.4,
    }),
    queryRenderedFeatures: vi.fn(() => [{ properties: { class: 'ocean' } }]),
    on: vi.fn((event: string, callback: () => void) => events.set(event, callback)),
    off: vi.fn((event: string) => events.delete(event)),
    setStyle: vi.fn(), flyTo: vi.fn(), jumpTo: vi.fn(), remove: vi.fn(),
  }
  return { map, layers, sources, sourceSpecs, events }
})
vi.mock('maplibre-gl', () => ({
  Map: vi.fn(function () { return fixture.map }),
  addProtocol: vi.fn(), removeProtocol: vi.fn(),
}))
vi.mock('../providers/bathymetry/depthValues', () => ({
  fetchDepthValue: vi.fn(async () => 84),
}))

const viewport: OrbitalViewport = {
  kind: 'local', center: { latitude: 59.7, longitude: 24.75 },
  polygon: [
    { latitude: 59.5, longitude: 24.5 }, { latitude: 59.5, longitude: 25 },
    { latitude: 59.9, longitude: 25 }, { latitude: 59.9, longitude: 24.5 },
  ],
}
const baseLayers = (): LayerSpecification[] => [
  { id: 'background', type: 'background' },
  { id: 'water', type: 'fill', source: 'basemap', 'source-layer': 'water' },
  { id: 'land', type: 'fill', source: 'basemap', 'source-layer': 'landcover' },
  { id: 'road', type: 'line', source: 'basemap', 'source-layer': 'transportation' },
  { id: 'labels', type: 'symbol', source: 'basemap', layout: { 'text-font': ['Noto Sans Regular'] } },
  { id: 'traffic-aircraft-symbols', type: 'symbol', source: 'traffic' },
  { id: 'captured-journey-past', type: 'line', source: 'captured-journey' },
]
const flush = () => vi.advanceTimersByTimeAsync(0)
let page: EventTarget & { hidden: boolean }

describe('isolated native depth integration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    fixture.layers.splice(0, fixture.layers.length, ...baseLayers())
    fixture.sources.clear()
    fixture.sourceSpecs.clear()
    fixture.events.clear()
    fixture.map.isSourceLoaded.mockReturnValue(true)
    fixture.map.queryRenderedFeatures.mockReturnValue([{ properties: { class: 'ocean' } }])
    page = Object.assign(new EventTarget(), { hidden: false })
    vi.stubGlobal('document', page)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('starts before style installation, retains one map, and rehydrates below operational layers', async () => {
    fixture.layers.splice(0)
    const map = new MapLibreMap({ container: 'map' })
    const changed = vi.fn()
    const runtime = new BathymetryRuntime(map, true, true, changed)
    expect(fixture.sourceSpecs.size).toBe(0)
    fixture.layers.push(...baseLayers())
    runtime.install('light')
    runtime.setViewport(viewport, 10)
    await flush()
    expect(fetchDepthValue).toHaveBeenCalledTimes(9)
    expect(changed.mock.lastCall?.[0].values.phase).toBe('ready')
    const data = fixture.sources.get(SOURCE_DEPTH_VALUES)?.setData.mock.lastCall?.[0]
    expect(data.features).toHaveLength(9)
    expect(data.features[0].properties.label).toBe('~84 m LAT')
    const ids = fixture.layers.map(layer => layer.id)
    expect(ids.indexOf(LAYER_DEPTH_SHADING)).toBe(ids.indexOf('water') + 1)
    expect(ids.indexOf(LAYER_DEPTH_LABELS)).toBeLessThan(ids.indexOf('labels'))
    expect(ids.indexOf(LAYER_DEPTH_LABELS)).toBeLessThan(ids.indexOf('traffic-aircraft-symbols'))
    runtime.install('dark')
    expect(fixture.layers).toHaveLength(new Set(ids).size)
    expect(fixture.map.setPaintProperty).toHaveBeenCalledWith(LAYER_DEPTH_SHADING, 'raster-opacity', 0.23)
    fixture.layers.splice(0, fixture.layers.length, ...baseLayers())
    fixture.sources.clear()
    fixture.sourceSpecs.clear()
    runtime.install('dark')
    fixture.events.get('idle')?.()
    await flush()
    expect(fixture.sourceSpecs.get(SOURCE_DEPTH_VALUES)).toEqual({ type: 'geojson', data })
    expect(fetchDepthValue).toHaveBeenCalledTimes(9)
    expect(MapLibreMap).toHaveBeenCalledOnce()
    expect(fixture.map.setStyle).not.toHaveBeenCalled()
    expect(fixture.map.flyTo).not.toHaveBeenCalled()
    expect(fixture.map.jumpTo).not.toHaveBeenCalled()
    runtime.dispose()
    expect(removeProtocol).toHaveBeenCalledWith('modeled-depths')
    expect(addProtocol).toHaveBeenCalledOnce()
    expect(fixture.map.remove).not.toHaveBeenCalled()
  })

  it('composes visibility, offline and preference pauses without reloading valid values', async () => {
    const changed = vi.fn()
    const runtime = new BathymetryRuntime(new MapLibreMap({ container: 'map' }), true, true, changed)
    runtime.install('light')
    runtime.setViewport(viewport, 10)
    await flush()
    const reads = vi.mocked(fetchDepthValue).mock.calls.length
    page.hidden = true
    page.dispatchEvent(new Event('visibilitychange'))
    expect(changed.mock.lastCall?.[0]).toMatchObject({ imagery: 'paused', values: { phase: 'paused', samples: [] } })
    runtime.setEnabled(true, true)
    expect(fetchDepthValue).toHaveBeenCalledTimes(reads)
    runtime.setEnabled(false, true)
    page.hidden = false
    page.dispatchEvent(new Event('visibilitychange'))
    expect(changed.mock.lastCall?.[0].imagery).toBe('paused')
    runtime.setEnabled(true, false)
    runtime.setViewport(viewport, 10)
    expect(fetchDepthValue).toHaveBeenCalledTimes(reads)
    runtime.setEnabled(true, true)
    await flush()
    expect(changed.mock.lastCall?.[0].values.phase).toBe('ready')
    expect(fetchDepthValue).toHaveBeenCalledTimes(reads)
    expect(fixture.sources.get(SOURCE_DEPTH_RASTER)?.setTiles).toHaveBeenCalled()
    runtime.moveStarted()
    expect(changed.mock.lastCall?.[0].values.samples).toEqual([])
    expect(fixture.map.setLayoutProperty).toHaveBeenCalledWith(LAYER_DEPTH_LABELS, 'visibility', 'none')
    runtime.setViewport(viewport, 10)
    expect(changed.mock.lastCall?.[0].values.phase).toBe('ready')
    runtime.dispose()
    const count = changed.mock.calls.length
    page.hidden = true
    page.dispatchEvent(new Event('visibilitychange'))
    expect(changed).toHaveBeenCalledTimes(count)
  })

  it('waits for ocean geometry and never requests inland/invalid/low-zoom sample values', async () => {
    const changed = vi.fn()
    const runtime = new BathymetryRuntime(new MapLibreMap({ container: 'map' }), true, true, changed)
    runtime.install('light')
    runtime.setViewport(viewport, 9)
    expect(changed.mock.lastCall?.[0].values).toMatchObject({ phase: 'zoom-in', source: 'emodnet' })
    fixture.map.isSourceLoaded.mockReturnValue(false)
    runtime.setViewport(viewport, 10)
    expect(changed.mock.lastCall?.[0].values.message).toContain('waiting for the vector map')
    expect(fetchDepthValue).not.toHaveBeenCalled()
    fixture.map.isSourceLoaded.mockReturnValue(true)
    fixture.map.queryRenderedFeatures.mockReturnValue([{ properties: { class: 'lake' } }])
    fixture.events.get('idle')?.()
    expect(changed.mock.lastCall?.[0].values.phase).toBe('empty')
    expect(fetchDepthValue).not.toHaveBeenCalled()
    runtime.setViewport({ kind: 'world' }, 10)
    expect(changed.mock.lastCall?.[0].values.phase).toBe('unavailable')
    expect(fetchDepthValue).not.toHaveBeenCalled()
    runtime.dispose()
  })

  it('consumes optional-source failures, preserves recovery details and leaves other errors untouched', () => {
    const changed = vi.fn()
    const runtime = new BathymetryRuntime(new MapLibreMap({ container: 'map' }), true, true, changed)
    expect(runtime.handleError({ sourceId: 'basemap', error: new Error('real basemap failure') })).toBe(false)
    expect(runtime.handleError({ error: new BathymetryTileError('Depth shading is rate limited. Retry later.') })).toBe(true)
    expect(changed.mock.lastCall?.[0].imageryMessage).toContain('rate limited')
    expect(runtime.handleError({ sourceId: SOURCE_DEPTH_RASTER, error: new Error('tile failed') })).toBe(true)
    expect(changed.mock.lastCall?.[0].imageryMessage).toContain('rate limited')
    expect(runtime.handleError({ sourceId: SOURCE_DEPTH_VALUES, error: new Error('labels failed') })).toBe(true)
    expect(changed.mock.lastCall?.[0].values.phase).toBe('unavailable')
    expect(fixture.map.setStyle).not.toHaveBeenCalled()
    runtime.dispose()
  })
})
