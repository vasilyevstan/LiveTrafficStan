import { describe, expect, it } from 'vitest'
import type { DisplayAircraft } from '../domain/traffic'
import type {
  TrafficViewport,
  ViewportAssessment,
} from '../domain/viewport'
import {
  sampleTrafficZoomContext,
  trafficZoomContextEntities,
  trafficZoomContextViewport,
  type LastLocalTrafficView,
} from './trafficZoomContext'

const now = 1_000_000
const aircraft = (
  hex: string,
  longitude = 24.5,
  latitude = 59.5,
  observedAt = now,
): DisplayAircraft => ({
  id: `aircraft:${hex}`,
  kind: 'aircraft',
  provider: 'test',
  hex,
  position: { latitude, longitude, observedAt },
  receivedAt: now,
  markerIcon: 'aircraft',
  markerScale: 1,
  freshness: 'live',
})

const viewport: TrafficViewport = {
  center: { latitude: 59.5, longitude: 24.5, label: 'Local view' },
  enclosingRadiusKm: 62,
  polygon: [
    { latitude: 59, longitude: 24 },
    { latitude: 59, longitude: 25 },
    { latitude: 60, longitude: 25 },
    { latitude: 60, longitude: 24 },
  ],
}
const lastView: LastLocalTrafficView = {
  viewport,
  zoom: 9,
  viewRequestId: 7,
}
const tooWide: ViewportAssessment = {
  kind: 'ineligible',
  reason: 'too-wide',
  message: 'Zoom in to see live traffic',
}

describe('last local traffic context', () => {
  it('requires an earlier eligible view from the current navigation', () => {
    expect(
      trafficZoomContextViewport(lastView, tooWide, 8, 7, true),
    ).toBe(viewport)
    expect(
      trafficZoomContextViewport(null, tooWide, 8, 7, true),
    ).toBeNull()
    expect(
      trafficZoomContextViewport(lastView, tooWide, 8, 8, true),
    ).toBeNull()
  })

  it('never replaces eligible live traffic or an uncommitted view', () => {
    expect(
      trafficZoomContextViewport(
        lastView,
        { kind: 'eligible', viewport },
        8,
        7,
        true,
      ),
    ).toBeNull()
    expect(
      trafficZoomContextViewport(lastView, null, 8, 7, true),
    ).toBeNull()
  })

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY, 9, 10])(
    'does not turn missing zoom, a pan or a tilt at zoom %s into zoom-out context',
    (zoom) => {
      expect(
        trafficZoomContextViewport(lastView, tooWide, zoom, 7, true),
      ).toBeNull()
    },
  )

  it('allows a visual sample at a globe limb without authorizing a query footprint', () => {
    const invalid: ViewportAssessment = {
      kind: 'ineligible',
      reason: 'invalid',
      message: 'Zoom in or reduce tilt to see live traffic',
    }
    expect(
      trafficZoomContextViewport(lastView, invalid, 4, 7, true),
    ).toBe(viewport)
    expect(invalid).not.toHaveProperty('viewport')
  })

  it('hides context when the live-view presentation is disabled', () => {
    expect(
      trafficZoomContextViewport(lastView, tooWide, 8, 7, false),
    ).toBeNull()
  })

  it('uses only retained observations inside the last full-canvas footprint', () => {
    const inside = aircraft('abc123')
    const outside = aircraft('abc124', 25.5)
    const source = [inside, outside]
    const original = structuredClone(source)
    const result = trafficZoomContextEntities(source, viewport, now, {
      staleAfterMs: 45_000,
      expireAfterMs: 120_000,
    })
    expect(result.map(({ id }) => id)).toEqual([inside.id])
    expect(source).toEqual(original)
    expect(result[0]?.position).toEqual(inside.position)
    expect(trafficZoomContextEntities(source, null, now, {
      staleAfterMs: 45_000,
      expireAfterMs: 120_000,
    })).toEqual([])
  })

  it('retains observed freshness and caps age without extending provider expiry', () => {
    const source = [
      aircraft('abc123', 24.5, 59.5, now - 45_001),
      aircraft('abc124', 24.5, 59.5, now - 120_000),
      aircraft('abc125', 24.5, 59.5, now - 120_001),
    ]
    const result = trafficZoomContextEntities(source, viewport, now, {
      staleAfterMs: 45_000,
      expireAfterMs: 600_000,
    })
    expect(result.map(({ id, freshness }) => [id, freshness])).toEqual([
      [source[0].id, 'stale'],
      [source[1].id, 'stale'],
    ])
    expect(trafficZoomContextEntities(source, viewport, now, {
      staleAfterMs: 30_000,
      expireAfterMs: 45_000,
    })).toEqual([])
  })
})

const map = {
  getZoom: () => 7,
  getCenter: () => ({ lng: 0 }),
  getCanvas: () => ({ clientWidth: 1_400, clientHeight: 900 }),
  project: ([longitude, latitude]: [number, number]) => ({
    x: 20 + longitude * 10,
    y: 20 + latitude * 10,
  }),
}

describe('screen-space traffic representatives', () => {
  it('keeps stable actual entities from crowded groups, independently of input order', () => {
    const first = aircraft('000001', 0, 0)
    const adjacent = aircraft('000002', 1, 1)
    const distant = aircraft('000003', 8, 0)
    const entities = [distant, adjacent, first]
    const original = structuredClone(entities)

    expect(sampleTrafficZoomContext(map, entities)).toEqual([first, distant])
    expect(sampleTrafficZoomContext(map, [...entities].reverse())).toEqual([
      first, distant,
    ])
    expect(entities).toEqual(original)
    expect(sampleTrafficZoomContext(map, entities)[0]).toBe(first)
  })

  it('bounds each traffic kind to twelve representatives', () => {
    const entities = Array.from({ length: 16 }, (_, index) =>
      aircraft(index.toString(16).padStart(6, '0'), index * 8, 0),
    )
    expect(sampleTrafficZoomContext(map, entities)).toHaveLength(12)
  })

  it('reduces the same group further as its projected spacing shrinks', () => {
    const entities = [
      aircraft('000001', 0, 0),
      aircraft('000002', 8, 0),
      aircraft('000003', 16, 0),
    ]
    expect(sampleTrafficZoomContext(map, entities)).toHaveLength(3)
    expect(sampleTrafficZoomContext({
      ...map,
      getZoom: () => 5,
      project: ([longitude]: [number, number]) => ({
        x: 20 + longitude,
        y: 20,
      }),
    }, entities)).toEqual([entities[0]])
  })

  it('stops at the native fade boundary and ignores unrenderable positions', () => {
    const entities = [
      aircraft('000001', 0, 0),
      aircraft('000002', -5, 0),
      aircraft('000003', 150, 0),
      aircraft('000004', 0, 100),
    ]
    expect(sampleTrafficZoomContext(map, entities)).toEqual([entities[0]])
    expect(sampleTrafficZoomContext({ ...map, getZoom: () => 3 }, entities))
      .toEqual([])
    expect(sampleTrafficZoomContext({
      ...map,
      project: () => ({ x: Number.NaN, y: 20 }),
    }, entities)).toEqual([])
  })

  it('projects the nearest wrapped copy without changing observed longitude', () => {
    const entity = aircraft('abc123', -179, 10)
    const coordinates: [number, number][] = []
    const result = sampleTrafficZoomContext({
      ...map,
      getCenter: () => ({ lng: 181 }),
      project: (position) => {
        coordinates.push(position)
        return { x: 100, y: 100 }
      },
    }, [entity])
    expect(coordinates).toEqual([[181, 10]])
    expect(result).toEqual([entity])
    expect(result[0]?.position.longitude).toBe(-179)
  })
})
