import { describe, expect, it } from 'vitest'
import type { OrbitalObjectType } from '../domain/orbital'
import {
  ORBITAL_ICON_SHAPES,
  ORBITAL_STYLE_IMAGE_IDS,
  orbitalStyleImageId,
  STARLINK_ICON_SHAPES,
  STARLINK_STYLE_IMAGE_ID,
  starlinkIconTreatment,
} from './orbitalIcons'
import type { IconPolygons } from './icons'

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

describe('orbital icons', () => {
  it('maps only exact SATCAT types to bounded style images', () => {
    const types: OrbitalObjectType[] = ['PAY', 'R/B', 'DEB', 'UNK']
    expect(types.map(orbitalStyleImageId)).toEqual(
      ORBITAL_STYLE_IMAGE_IDS,
    )
  })

  it('keeps payload, rocket body, debris, and unknown silhouettes distinct at map scale', () => {
    const types: OrbitalObjectType[] = ['PAY', 'R/B', 'DEB', 'UNK']
    const signatures = types.map((objectType) => [
      objectType,
      rasterizedSignature(ORBITAL_ICON_SHAPES[objectType]),
    ] as const)

    expect(new Set(signatures.map(([, signature]) => signature)).size).toBe(
      types.length,
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
        ).toBeGreaterThanOrEqual(16)
      }
    }
  })

  it('uses a distinct flat-panel silhouette and image ID for Starlink', () => {
    const starlinkSignature = rasterizedSignature(
      STARLINK_ICON_SHAPES,
    )
    const payloadSignature = rasterizedSignature(
      ORBITAL_ICON_SHAPES.PAY,
    )
    const panel = STARLINK_ICON_SHAPES[0]
    const panelWidth =
      Math.max(...panel.map(([x]) => x)) -
      Math.min(...panel.map(([x]) => x))
    const panelHeight =
      Math.max(...panel.map(([, y]) => y)) -
      Math.min(...panel.map(([, y]) => y))

    expect(STARLINK_STYLE_IMAGE_ID).not.toBe('orbital-payload')
    expect(ORBITAL_STYLE_IMAGE_IDS).not.toContain(
      STARLINK_STYLE_IMAGE_ID,
    )
    expect(panelWidth).toBeGreaterThan(panelHeight * 3)
    expect(starlinkSignature).not.toBe(payloadSignature)
    expect([...starlinkSignature].filter((pixel) => pixel === '1').length)
      .toBeGreaterThan(20)
  })

  it('uses theme-specific Starlink icon colors', () => {
    const light = starlinkIconTreatment('light')
    const dark = starlinkIconTreatment('dark')

    expect(light.fill).not.toBe(dark.fill)
    expect(light.detail).not.toBe(dark.detail)
    expect(light.innerEdge).not.toBe(dark.innerEdge)
  })
})
