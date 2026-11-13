import type { VesselFlagImages } from '../vesselFlagImages'

/** Flag rasters are 2x sprites, matching the flat layer's `addImage` ratio. */
export const MODEL_FLAG_PIXEL_RATIO = 2
/** Transparent texels around each cell keep linear filtering from bleeding. */
export const MODEL_FLAG_ATLAS_GUTTER = 1
const MAXIMUM_COLUMNS = 16

export interface ModelFlagAtlas {
  /** Image id to one-based atlas cell; 0 means no flag. */
  slots: ReadonlyMap<string, number>
  /** Premultiplied RGBA, matching the layer's `ONE, ONE_MINUS_SRC_ALPHA` blend. */
  pixels: Uint8Array
  width: number
  height: number
  columns: number
  flagWidth: number
  flagHeight: number
}

/** Packs the uniform-size country flag rasters into one RGBA texture atlas. */
export const buildModelFlagAtlas = (images: VesselFlagImages): ModelFlagAtlas | undefined => {
  const first = images.values().next().value
  if (!first || first.width <= 0 || first.height <= 0) return undefined
  const { width: flagWidth, height: flagHeight } = first
  const usable = [...images].filter(
    ([, image]) =>
      image.width === flagWidth &&
      image.height === flagHeight &&
      image.data.length === flagWidth * flagHeight * 4,
  )
  if (usable.length === 0) return undefined
  const columns = Math.min(MAXIMUM_COLUMNS, usable.length)
  const cellWidth = flagWidth + 2 * MODEL_FLAG_ATLAS_GUTTER
  const cellHeight = flagHeight + 2 * MODEL_FLAG_ATLAS_GUTTER
  const width = columns * cellWidth
  const height = Math.ceil(usable.length / columns) * cellHeight
  const pixels = new Uint8Array(width * height * 4)
  const slots = new Map<string, number>()
  const rowBytes = flagWidth * 4
  usable.forEach(([id, image], index) => {
    const x = (index % columns) * cellWidth + MODEL_FLAG_ATLAS_GUTTER
    const y = Math.floor(index / columns) * cellHeight + MODEL_FLAG_ATLAS_GUTTER
    for (let row = 0; row < flagHeight; row += 1) {
      const source = row * rowBytes
      const target = ((y + row) * width + x) * 4
      for (let byte = 0; byte < rowBytes; byte += 4) {
        const alpha = image.data[source + byte + 3]
        pixels[target + byte] = Math.round((image.data[source + byte] * alpha) / 255)
        pixels[target + byte + 1] = Math.round((image.data[source + byte + 1] * alpha) / 255)
        pixels[target + byte + 2] = Math.round((image.data[source + byte + 2] * alpha) / 255)
        pixels[target + byte + 3] = alpha
      }
    }
    slots.set(id, index + 1)
  })
  return { slots, pixels, width, height, columns, flagWidth, flagHeight }
}
