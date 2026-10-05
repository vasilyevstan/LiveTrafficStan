import { describe, expect, it } from 'vitest'
import { TRAFFIC_MARKER_ICONS } from '../domain/traffic'
import {
  AIRCRAFT_ALTITUDE_BANDS,
  AIRCRAFT_ALTITUDE_MARKER_ICONS,
  RENDER_ONLY_MARKER_ICONS,
  TRAFFIC_STYLE_IMAGE_IDS,
  VESSEL_STYLE_IMAGE_IDS,
} from '../domain/trafficPresentation'
import {
  aircraftAltitudeColors,
  trafficIconTreatment,
  VESSEL_DECK_SHAPES,
  VESSEL_ICON_LENGTH_NORMALIZATION,
  VESSEL_ICON_SHAPES,
  type IconPolygons,
} from './icons'

const bounds = (polygons: IconPolygons) => {
  const points = polygons.flat()
  return {
    width: Math.max(...points.map(([x]) => x)) - Math.min(...points.map(([x]) => x)),
    height: Math.max(...points.map(([, y]) => y)) - Math.min(...points.map(([, y]) => y)),
  }
}

describe('traffic icons', () => {
  it('preserves blue vessel identity and theme-specific contrast', () => {
    const light = trafficIconTreatment('light')
    const dark = trafficIconTreatment('dark')
    expect(light.vesselFill).toBe('#2563eb')
    expect(dark.vesselFill).toBe('#60a5fa')
    expect(light.aircraftFill).not.toBe(dark.aircraftFill)
    expect(light.outerEdge).not.toBe(dark.outerEdge)
    expect(light.innerEdge).not.toBe(dark.innerEdge)
    expect(light.vesselDetail).not.toBe(light.vesselFill)
    expect(dark.vesselDetail).not.toBe(dark.vesselFill)
  })

  it('keeps render-only vessel shapes outside persisted marker IDs', () => {
    for (const icon of RENDER_ONLY_MARKER_ICONS) {
      expect(TRAFFIC_MARKER_ICONS).not.toContain(icon)
      expect(TRAFFIC_STYLE_IMAGE_IDS).toContain(icon)
    }
  })

  it('preserves all aircraft altitude silhouettes and colors', () => {
    expect(AIRCRAFT_ALTITUDE_MARKER_ICONS).toHaveLength(20)
    expect(new Set(AIRCRAFT_ALTITUDE_MARKER_ICONS).size).toBe(20)
    for (const band of AIRCRAFT_ALTITUDE_BANDS) {
      const light = aircraftAltitudeColors('light', band)
      const dark = aircraftAltitudeColors('dark', band)
      expect(light.fill).toMatch(/^#[0-9a-f]{6}$/i)
      expect(dark.fill).toMatch(/^#[0-9a-f]{6}$/i)
      expect(light.fill).not.toBe(dark.fill)
    }
    expect(TRAFFIC_STYLE_IMAGE_IDS).toEqual(expect.arrayContaining(AIRCRAFT_ALTITUDE_MARKER_ICONS))
  })

  it('keeps all nine hulls and deck motifs within the existing sprite', () => {
    expect(VESSEL_STYLE_IMAGE_IDS).toHaveLength(9)
    for (const id of VESSEL_STYLE_IMAGE_IDS) {
      for (const polygons of [VESSEL_ICON_SHAPES[id], VESSEL_DECK_SHAPES[id]]) {
        expect(polygons.length, id).toBeGreaterThan(0)
        for (const polygon of polygons) {
          expect(polygon.length, id).toBeGreaterThanOrEqual(3)
          for (const [x, y] of polygon) {
            expect(x, id).toBeGreaterThanOrEqual(0)
            expect(x, id).toBeLessThanOrEqual(64)
            expect(y, id).toBeGreaterThanOrEqual(0)
            expect(y, id).toBeLessThanOrEqual(64)
          }
        }
      }
    }
  })

  it('preserves reported-length sizing across every ship class', () => {
    for (const id of VESSEL_STYLE_IMAGE_IDS) {
      expect(bounds(VESSEL_ICON_SHAPES[id]).height * VESSEL_ICON_LENGTH_NORMALIZATION[id], id).toBeCloseTo(56)
    }
  })

  it('uses elongated motor-ship hulls with a forward bow, not broad tablets or split sterns', () => {
    for (const id of ['vessel', 'vessel-cargo', 'vessel-tanker', 'vessel-passenger', 'vessel-tug', 'vessel-pleasure'] as const) {
      const shape = VESSEL_ICON_SHAPES[id][0]
      const dimensions = bounds([shape])
      expect(dimensions.height / dimensions.width, id).toBeGreaterThan(1.3)
      expect(shape[0][0], id).toBe(32)
      expect(shape[0][1], id).toBe(Math.min(...shape.map(([, y]) => y)))
      const stern = shape.filter(([, y]) => y === Math.max(...shape.map(([, y]) => y)))
      expect(Math.min(...stern.map(([x]) => x)), id).toBeLessThan(32)
      expect(Math.max(...stern.map(([x]) => x)), id).toBeGreaterThan(32)
    }
  })

  it('distinguishes ships by nautical structures rather than forced outline distortion', () => {
    const motifs = VESSEL_STYLE_IMAGE_IDS.map((id) => JSON.stringify(VESSEL_DECK_SHAPES[id]))
    expect(new Set(motifs).size).toBe(VESSEL_STYLE_IMAGE_IDS.length)
    expect(VESSEL_DECK_SHAPES['vessel-cargo']).toHaveLength(5)
    expect(VESSEL_DECK_SHAPES['vessel-tanker']).toHaveLength(4)
    expect(VESSEL_ICON_SHAPES['vessel-fishing']).toHaveLength(3)
    expect(VESSEL_ICON_SHAPES['vessel-sailing']).toHaveLength(3)
    expect(VESSEL_ICON_SHAPES['vessel-highspeed']).toHaveLength(3)
  })
})
