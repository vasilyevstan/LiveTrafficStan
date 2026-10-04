/*! Flag artwork: flag-icons, Copyright (c) 2013 Panayiotis Lipiridis.
 * MIT license: /licenses/vessel-flags-MIT.txt
 */
import flagAsset from '../config/vesselFlags.generated.json'

export const VESSEL_FLAG_IMAGES = new Map(
  Object.entries(flagAsset.flags).map(([iso2, encoded]) => {
    const data = Uint8Array.from(atob(encoded), (value) =>
      value.charCodeAt(0),
    )
    if (data.length !== flagAsset.width * flagAsset.height * 4) {
      throw new Error(`Invalid vessel flag raster: ${iso2}`)
    }
    return [
      `vessel-flag-${iso2}`,
      { width: flagAsset.width, height: flagAsset.height, data },
    ] as const
  }),
)

export const vesselFlagImageId = (iso2: string | undefined) => {
  if (iso2 === undefined) return undefined
  const id: `vessel-flag-${string}` = `vessel-flag-${iso2}`
  return VESSEL_FLAG_IMAGES.has(id) ? id : undefined
}
