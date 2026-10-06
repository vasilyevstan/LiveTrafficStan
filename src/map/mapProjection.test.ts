import type { ProjectionSpecification, StyleSpecification } from 'maplibre-gl'
import { describe, expect, it, vi } from 'vitest'
import { MAP_PROJECTION_CONFIG } from '../config/appConfig'
import { assessOrbitalViewport } from '../domain/orbitalViewport'
import { assessTrafficViewport } from '../domain/viewport'
import {
  applyMapProjection,
  mapProjectionForPreference,
  sampleMapViewport,
  withMapProjection,
} from './mapProjection'

const makeMap = () => ({
  getCanvas: () => ({ clientWidth: 800, clientHeight: 600 }),
  getCenter: () => ({ lat: 0, lng: 0 }),
  getPitch: () => 0,
  getProjection: vi.fn<() => ProjectionSpecification | undefined>(
    () => ({ type: 'globe' }),
  ),
  getBounds: () => ({
    getNorth: () => 0.3,
    getSouth: () => -0.3,
    getEast: () => 0.4,
    getWest: () => -0.4,
  }),
  project: vi.fn(([longitude, latitude]: [number, number]) => ({
    x: longitude * 1_000 + 400,
    y: 300 - latitude * 1_000,
  })),
  unproject: vi.fn(([x, y]: [number, number]) => ({
    lng: (x - 400) / 1_000,
    lat: (300 - y) / 1_000,
  })),
})

describe('map projection integration', () => {
  it('uses native interpolation and changes a projection only when needed', () => {
    let projection: ProjectionSpecification | undefined
    const map = {
      getProjection: () => projection,
      setProjection: vi.fn((next: ProjectionSpecification) => {
        projection = next
      }),
    }
    expect(applyMapProjection(map, 'flat')).toBe(false)
    expect(applyMapProjection(map, 'auto')).toBe(true)
    expect(map.setProjection).toHaveBeenLastCalledWith({ type: 'globe' })
    expect(applyMapProjection(map, 'auto')).toBe(false)
    expect(map.setProjection).toHaveBeenCalledTimes(1)
    expect(applyMapProjection(map, 'flat')).toBe(true)
    expect(map.setProjection).toHaveBeenLastCalledWith({ type: 'mercator' })
    projection = undefined
    expect(applyMapProjection(map, 'auto')).toBe(true)
    expect(mapProjectionForPreference('auto')).toEqual({ type: 'globe' })
  })

  it('sets projection before a style is installed without mutating sources or layers', () => {
    const style: StyleSpecification = {
      version: 8,
      projection: { type: 'mercator' },
      sources: {},
      layers: [],
    }
    const next = withMapProjection(style, 'auto')
    expect(next).toEqual({ ...style, projection: { type: 'globe' } })
    expect(style.projection).toEqual({ type: 'mercator' })
    expect(next.layers).toBe(style.layers)
    expect(next.sources).toBe(style.sources)
    expect(withMapProjection(next, 'flat').projection).toEqual({
      type: 'mercator',
    })
  })
})

describe('projection-aware full-canvas sampling', () => {
  it('retains all 32 full-canvas samples and uses a separate outward surface guard', () => {
    const map = makeMap()
    const sample = sampleMapViewport(map)
    expect(sample.surfaceIsContinuous).toBe(true)
    expect(sample.perimeter).toHaveLength(32)
    expect(sample.perimeter[0]).toEqual({ latitude: 0.3, longitude: -0.4 })
    expect(sample.perimeter[8]).toEqual({ latitude: 0.3, longitude: 0.4 })
    expect(sample.perimeter[16]).toEqual({ latitude: -0.3, longitude: 0.4 })
    expect(sample.perimeter[24]).toEqual({ latitude: -0.3, longitude: -0.4 })
    const margin = MAP_PROJECTION_CONFIG.surfaceMarginPx
    expect(map.unproject).toHaveBeenCalledWith([-margin, -margin])
    expect(map.unproject).toHaveBeenCalledWith([800 + margin, 600 + margin])
    expect(
      assessTrafficViewport(sample, {
        coordinatePrecision: 3,
        maximumRadiusKm: 100,
      }).kind,
    ).toBe('eligible')
    expect(assessOrbitalViewport(sample, 3).kind).toBe('local')
  })

  it('rejects finite limb snaps, including an off-surface sliver below round-trip tolerance', () => {
    const map = makeMap()
    const unproject = map.unproject.getMockImplementation()!
    const edge =
      800 - MAP_PROJECTION_CONFIG.surfaceRoundTripTolerancePx / 2
    map.unproject.mockImplementation(([x, y]) =>
      unproject([Math.min(x, edge), y]),
    )
    const sample = sampleMapViewport(map)
    expect(
      sample.perimeter.every(
        (coordinate) =>
          Number.isFinite(coordinate.latitude) &&
          Number.isFinite(coordinate.longitude),
      ),
    ).toBe(true)
    expect(sample.surfaceIsContinuous).toBe(false)
    expect(
      assessTrafficViewport(sample, {
        coordinatePrecision: 3,
        maximumRadiusKm: 100,
      }),
    ).toMatchObject({ kind: 'ineligible', reason: 'invalid' })
    expect(assessOrbitalViewport(sample, 3)).toMatchObject({
      kind: 'invalid',
      reason: 'invalid-geometry',
    })
  })

  it.each([-90, 90])('rejects the included pole at %s even with reversible perimeter samples', (pole) => {
    const map = makeMap()
    const bounds = map.getBounds()
    map.getBounds = () => ({
      ...bounds,
      getNorth: () => (pole > 0 ? pole : bounds.getNorth()),
      getSouth: () => (pole < 0 ? pole : bounds.getSouth()),
    })
    expect(sampleMapViewport(map).surfaceIsContinuous).toBe(false)
  })

  it('keeps legacy flat whole-world crossing geometry and skips globe-only probes', () => {
    const map = makeMap()
    map.getProjection.mockReturnValue({ type: 'mercator' })
    map.getBounds = () => ({
      getNorth: () => 85,
      getSouth: () => -85,
      getEast: () => 180,
      getWest: () => -180,
    })
    map.unproject.mockImplementation(([x, y]) => ({
      lng: (x / 800) * 360 - 180,
      lat: 85 - (y / 600) * 170,
    }))
    const sample = sampleMapViewport(map)
    expect(sample.surfaceIsContinuous).toBe(true)
    expect(map.project).not.toHaveBeenCalled()
    expect(assessOrbitalViewport(sample, 3)).toEqual({ kind: 'world' })
  })

  it('fails closed for invalid dimensions and non-finite inverse projection', () => {
    const map = makeMap()
    map.getCanvas = () => ({ clientWidth: 0, clientHeight: 600 })
    expect(sampleMapViewport(map).surfaceIsContinuous).toBe(false)
    map.getCanvas = () => ({ clientWidth: 800, clientHeight: 600 })
    map.project.mockReturnValue({ x: Number.NaN, y: Number.NaN })
    expect(sampleMapViewport(map).surfaceIsContinuous).toBe(false)
  })
})
