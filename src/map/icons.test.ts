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
  VESSEL_ICON_SHAPES,
  type IconPolygons,
} from './icons'

const pointInPolygon = (
  x: number,
  y: number,
  polygon: readonly (readonly [number, number])[],
) => {
  let inside = false
  for (
    let current = 0, previous = polygon.length - 1;
    current < polygon.length;
    previous = current++
  ) {
    const [currentX, currentY] = polygon[current]!
    const [previousX, previousY] = polygon[previous]!
    const crosses =
      currentY > y !== previousY > y &&
      x <
        ((previousX - currentX) * (y - currentY)) /
          (previousY - currentY) +
          currentX
    if (crosses) inside = !inside
  }
  return inside
}

const rasterizedSignature = (polygons: IconPolygons) =>
  Array.from({ length: 16 * 16 }, (_, index) => {
    const x = (index % 16) * 4 + 2
    const y = Math.floor(index / 16) * 4 + 2
    return polygons.some((polygon) => pointInPolygon(x, y, polygon))
      ? '1'
      : '0'
  }).join('')

describe('trafficIconTreatment', () => {
  it('preserves traffic-kind color identity with theme-specific edges', () => {
    const light = trafficIconTreatment('light')
    const dark = trafficIconTreatment('dark')

    expect(light.aircraftFill).not.toBe(dark.aircraftFill)
    expect(light.vesselFill).not.toBe(dark.vesselFill)
    expect(light.outerEdge).not.toBe(dark.outerEdge)
    expect(light.innerEdge).not.toBe(dark.innerEdge)

    expect(light.aircraftFill).toMatch(/^#(?:[0-9a-f]{6})$/i)
    expect(dark.aircraftFill).toMatch(/^#(?:[0-9a-f]{6})$/i)
    expect(light.vesselFill).toMatch(/^#(?:[0-9a-f]{6})$/i)
    expect(dark.vesselFill).toMatch(/^#(?:[0-9a-f]{6})$/i)
  })

  it('keeps render-only vessel shapes outside persisted marker IDs', () => {
    for (const icon of RENDER_ONLY_MARKER_ICONS) {
      expect(TRAFFIC_MARKER_ICONS).not.toContain(icon)
      expect(TRAFFIC_STYLE_IMAGE_IDS).toContain(icon)
    }
  })

  it('keeps bounded altitude colors on aircraft silhouettes', () => {
    expect(AIRCRAFT_ALTITUDE_MARKER_ICONS).toHaveLength(20)
    for (const band of AIRCRAFT_ALTITUDE_BANDS) {
      const light = aircraftAltitudeColors('light', band)
      const dark = aircraftAltitudeColors('dark', band)
      expect(light.fill).toMatch(/^#(?:[0-9a-f]{6})$/i)
      expect(dark.fill).toMatch(/^#(?:[0-9a-f]{6})$/i)
      expect(light.fill).not.toBe(dark.fill)
    }
    expect(new Set(AIRCRAFT_ALTITUDE_MARKER_ICONS).size).toBe(20)
    expect(TRAFFIC_STYLE_IMAGE_IDS).toEqual(
      expect.arrayContaining(AIRCRAFT_ALTITUDE_MARKER_ICONS),
    )
  })

  it('keeps every vessel category visibly distinct after map-scale rasterization', () => {
    const signatures = VESSEL_STYLE_IMAGE_IDS.map((imageId) => [
      imageId,
      rasterizedSignature(VESSEL_ICON_SHAPES[imageId]),
    ] as const)

    expect(new Set(signatures.map(([, signature]) => signature)).size).toBe(
      VESSEL_STYLE_IMAGE_IDS.length,
    )
    for (let left = 0; left < signatures.length; left += 1) {
      for (let right = left + 1; right < signatures.length; right += 1) {
        const first = signatures[left]!
        const second = signatures[right]!
        const differentPixels = [...first[1]].filter(
          (pixel, index) => pixel !== second[1][index],
        ).length
        expect(
          differentPixels,
          `${first[0]} and ${second[0]} collapse at map scale`,
        ).toBeGreaterThanOrEqual(8)
      }
    }
  })
})
