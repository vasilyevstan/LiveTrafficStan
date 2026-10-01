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

const VESSEL_SOURCE_SIZE = 64
const MINIMUM_VESSEL_SIZE_CSS = 26
const MAX_PAIRWISE_INTERSECTION_OVER_UNION = 0.78
const MIN_PAIRWISE_SYMMETRIC_DIFFERENCE = 0.22
const MIN_IDENTITY_FEATURE_THICKNESS_CSS = 3
const LONGITUDINAL_BAND_COUNT = 6

type SilhouetteRaster = readonly (readonly boolean[])[]

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

const shapeBounds = (polygons: IconPolygons) => {
  const points = polygons.flat()
  return {
    minimumX: Math.min(...points.map(([x]) => x)),
    maximumX: Math.max(...points.map(([x]) => x)),
    minimumY: Math.min(...points.map(([, y]) => y)),
    maximumY: Math.max(...points.map(([, y]) => y)),
  }
}

const rasterizeSilhouette = (
  polygons: IconPolygons,
  equalHeight: boolean,
): SilhouetteRaster => {
  const bounds = shapeBounds(polygons)
  const height = bounds.maximumY - bounds.minimumY
  const centerX = (bounds.minimumX + bounds.maximumX) / 2

  return Array.from(
    { length: MINIMUM_VESSEL_SIZE_CSS },
    (_, row) =>
      Array.from(
        { length: MINIMUM_VESSEL_SIZE_CSS },
        (_, column) => {
          const x = equalHeight
            ? centerX +
              ((column + 0.5 - MINIMUM_VESSEL_SIZE_CSS / 2) /
                MINIMUM_VESSEL_SIZE_CSS) *
                height
            : ((column + 0.5) / MINIMUM_VESSEL_SIZE_CSS) *
              VESSEL_SOURCE_SIZE
          const y = equalHeight
            ? bounds.minimumY +
              ((row + 0.5) / MINIMUM_VESSEL_SIZE_CSS) * height
            : ((row + 0.5) / MINIMUM_VESSEL_SIZE_CSS) *
              VESSEL_SOURCE_SIZE
          return polygons.some((polygon) =>
            pointInPolygon(x, y, polygon),
          )
        },
      ),
  )
}

const compareRasters = (
  left: SilhouetteRaster,
  right: SilhouetteRaster,
) => {
  let intersection = 0
  let union = 0
  let symmetricDifference = 0

  for (let row = 0; row < left.length; row += 1) {
    for (let column = 0; column < left[row]!.length; column += 1) {
      const leftFilled = left[row]![column]!
      const rightFilled = right[row]![column]!
      if (leftFilled && rightFilled) intersection += 1
      if (leftFilled || rightFilled) union += 1
      if (leftFilled !== rightFilled) symmetricDifference += 1
    }
  }

  return {
    intersectionOverUnion: intersection / union,
    normalizedSymmetricDifference: symmetricDifference / union,
  }
}

const longitudinalWidthBands = (raster: SilhouetteRaster) => {
  const widths = Array.from(
    { length: LONGITUDINAL_BAND_COUNT },
    () => [] as number[],
  )

  for (let row = 0; row < raster.length; row += 1) {
    const filledColumns = raster[row]!
      .map((filled, column) => (filled ? column : -1))
      .filter((column) => column >= 0)
    const width =
      filledColumns.length === 0
        ? 0
        : filledColumns.at(-1)! - filledColumns[0]! + 1
    const band = Math.min(
      LONGITUDINAL_BAND_COUNT - 1,
      Math.floor(
        (row * LONGITUDINAL_BAND_COUNT) / raster.length,
      ),
    )
    widths[band]!.push(width)
  }

  return widths.map(
    (bandWidths) =>
      bandWidths.reduce((total, width) => total + width, 0) /
      bandWidths.length,
  )
}

interface PixelRun {
  start: number
  end: number
  length: number
}

const pixelRuns = (
  values: readonly boolean[],
  target: boolean,
): PixelRun[] => {
  const runs: PixelRun[] = []
  let start: number | undefined

  for (let index = 0; index <= values.length; index += 1) {
    if (values[index] === target && start === undefined) {
      start = index
    } else if (values[index] !== target && start !== undefined) {
      runs.push({
        start,
        end: index - 1,
        length: index - start,
      })
      start = undefined
    }
  }
  return runs
}

const maximumVerticalRun = (
  raster: SilhouetteRaster,
  firstColumn: number,
  lastColumn: number,
) =>
  Math.max(
    ...Array.from(
      { length: lastColumn - firstColumn + 1 },
      (_, offset) => {
        const column = firstColumn + offset
        return Math.max(
          0,
          ...pixelRuns(
            raster.map((row) => row[column]!),
            true,
          ).map(({ length }) => length),
        )
      },
    ),
  )

const separatedMassThickness = (
  raster: SilhouetteRaster,
  firstRow = 0,
  lastRow = raster.length - 1,
) => {
  let maximumThickness = 0
  for (let row = firstRow; row <= lastRow; row += 1) {
    const runs = pixelRuns(raster[row]!, true).sort(
      (left, right) => right.length - left.length,
    )
    if (runs.length >= 2) {
      maximumThickness = Math.max(
        maximumThickness,
        Math.min(runs[0]!.length, runs[1]!.length),
      )
    }
  }
  return maximumThickness
}

const centerGapThickness = (raster: SilhouetteRaster) => {
  const centerLeft = MINIMUM_VESSEL_SIZE_CSS / 2 - 1
  const centerRight = MINIMUM_VESSEL_SIZE_CSS / 2
  let currentWidths: number[] = []
  let maximumThickness = 0

  const finishRun = () => {
    if (currentWidths.length > 0) {
      maximumThickness = Math.max(
        maximumThickness,
        Math.min(currentWidths.length, ...currentWidths),
      )
      currentWidths = []
    }
  }

  for (const row of raster) {
    const centeredGap = pixelRuns(row, false).find(
      ({ start, end }) =>
        start > 0 &&
        end < row.length - 1 &&
        start <= centerLeft &&
        end >= centerRight,
    )
    if (centeredGap) currentWidths.push(centeredGap.length)
    else finishRun()
  }
  finishRun()
  return maximumThickness
}

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
    expect(light.vesselFill).toBe('#2563eb')
    expect(dark.vesselFill).toBe('#60a5fa')
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

  it('keeps vessel silhouette geometry bounded and drawable', () => {
    for (const imageId of VESSEL_STYLE_IMAGE_IDS) {
      const polygons = VESSEL_ICON_SHAPES[imageId]
      expect(polygons.length, imageId).toBeGreaterThan(0)
      for (const polygon of polygons) {
        expect(polygon.length, imageId).toBeGreaterThanOrEqual(3)
        for (const [x, y] of polygon) {
          expect(x, `${imageId} x coordinate`).toBeGreaterThanOrEqual(0)
          expect(x, `${imageId} x coordinate`).toBeLessThanOrEqual(
            VESSEL_SOURCE_SIZE,
          )
          expect(y, `${imageId} y coordinate`).toBeGreaterThanOrEqual(0)
          expect(y, `${imageId} y coordinate`).toBeLessThanOrEqual(
            VESSEL_SOURCE_SIZE,
          )
        }
      }
    }
  })

  it('separates equal-height silhouettes by overlap at the DPR1 minimum size', () => {
    const rasters = VESSEL_STYLE_IMAGE_IDS.map(
      (imageId) =>
        [
          imageId,
          rasterizeSilhouette(
            VESSEL_ICON_SHAPES[imageId],
            true,
          ),
        ] as const,
    )

    for (let left = 0; left < rasters.length; left += 1) {
      for (let right = left + 1; right < rasters.length; right += 1) {
        const first = rasters[left]!
        const second = rasters[right]!
        const metrics = compareRasters(first[1], second[1])
        expect(
          metrics.intersectionOverUnion,
          `${first[0]} and ${second[0]} overlap too closely`,
        ).toBeLessThanOrEqual(
          MAX_PAIRWISE_INTERSECTION_OVER_UNION,
        )
        expect(
          metrics.normalizedSymmetricDifference,
          `${first[0]} and ${second[0]} lack distinct outer mass`,
        ).toBeGreaterThanOrEqual(
          MIN_PAIRWISE_SYMMETRIC_DIFFERENCE,
        )
      }
    }
  })

  it('separates broad hull classes across longitudinal width bands', () => {
    const broadClasses = [
      'vessel',
      'vessel-cargo',
      'vessel-tanker',
      'vessel-passenger',
    ] as const
    const profiles = broadClasses.map(
      (imageId) =>
        [
          imageId,
          longitudinalWidthBands(
            rasterizeSilhouette(
              VESSEL_ICON_SHAPES[imageId],
              true,
            ),
          ),
        ] as const,
    )

    for (let left = 0; left < profiles.length; left += 1) {
      for (let right = left + 1; right < profiles.length; right += 1) {
        const first = profiles[left]!
        const second = profiles[right]!
        const materiallyDifferentBands = first[1].filter(
          (width, band) =>
            Math.abs(width - second[1][band]!) >=
            MIN_IDENTITY_FEATURE_THICKNESS_CSS,
        ).length
        expect(
          materiallyDifferentBands,
          `${first[0]} and ${second[0]} need three different width bands`,
        ).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('keeps identity-bearing features at least three DPR1 pixels thick', () => {
    const raster = (imageId: (typeof VESSEL_STYLE_IMAGE_IDS)[number]) =>
      rasterizeSilhouette(VESSEL_ICON_SHAPES[imageId], false)
    const fishing = raster('vessel-fishing')
    const sailing = raster('vessel-sailing')
    const highSpeed = raster('vessel-highspeed')
    const outerQuarter = Math.floor(MINIMUM_VESSEL_SIZE_CSS / 4)

    const thicknesses = [
      [
        'fishing port working arm',
        maximumVerticalRun(fishing, 0, outerQuarter),
      ],
      [
        'fishing starboard working arm',
        maximumVerticalRun(
          fishing,
          MINIMUM_VESSEL_SIZE_CSS - outerQuarter - 1,
          MINIMUM_VESSEL_SIZE_CSS - 1,
        ),
      ],
      [
        'sailing asymmetric sail masses',
        separatedMassThickness(sailing, 0, 17),
      ],
      ['tug stern notch', centerGapThickness(raster('vessel-tug'))],
      [
        'pleasure-craft stern notch',
        centerGapThickness(raster('vessel-pleasure')),
      ],
      [
        'high-speed catamaran channel',
        centerGapThickness(highSpeed),
      ],
      [
        'high-speed twin hulls',
        separatedMassThickness(highSpeed),
      ],
    ] as const

    for (const [feature, thickness] of thicknesses) {
      expect(thickness, feature).toBeGreaterThanOrEqual(
        MIN_IDENTITY_FEATURE_THICKNESS_CSS,
      )
    }
  })
})
