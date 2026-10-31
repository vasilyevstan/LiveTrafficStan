/*! Flag artwork: flag-icons, Copyright (c) 2013 Panayiotis Lipiridis.
 * MIT license: /licenses/vessel-flags-MIT.txt
 */
import flagAsset from '../config/vesselFlags.generated.json'
import { VESSEL_FLAG_ISO2 } from './vesselFlags'

export interface VesselFlagImage {
  width: number
  height: number
  data: Uint8Array
}

export type VesselFlagImages = ReadonlyMap<string, VesselFlagImage>

export const decodeVesselFlagImages = (
  asset: typeof flagAsset,
): VesselFlagImages => {
  const assetIso2 = Object.keys(asset.flags)
  if (
    assetIso2.length !== VESSEL_FLAG_ISO2.size ||
    assetIso2.some((iso2) => !VESSEL_FLAG_ISO2.has(iso2))
  ) {
    throw new Error('Country flag artwork does not match country allocations')
  }

  return new Map(
    Object.entries(asset.flags).map(([iso2, encoded]) => {
      const data = Uint8Array.from(atob(encoded), (value) =>
        value.charCodeAt(0),
      )
      if (data.length !== asset.width * asset.height * 4) {
        throw new Error(`Invalid vessel flag raster: ${iso2}`)
      }
      return [
        `vessel-flag-${iso2}`,
        { width: asset.width, height: asset.height, data },
      ] as const
    }),
  )
}

export const VESSEL_FLAG_IMAGES = decodeVesselFlagImages(flagAsset)
