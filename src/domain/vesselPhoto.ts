import vesselPhotoManifest from '../config/vesselPhotoManifest.json'
import type { Vessel } from './traffic'

type ManifestPhoto = (typeof vesselPhotoManifest.photos)[number]

export type VesselReferencePhoto = ManifestPhoto & {
  identityKey: string
  manifestVersion: string
}

const IMO_WEIGHTS = [7, 6, 5, 4, 3, 2] as const

export const isValidImo = (value: string) =>
  /^[0-9]{7}$/.test(value) &&
  IMO_WEIGHTS.reduce(
    (total, weight, index) =>
      total + Number(value[index]) * weight,
    0,
  ) %
    10 ===
    Number(value[6])

const canonicalImo = (imo: number | undefined) => {
  if (!Number.isSafeInteger(imo)) return undefined
  const value = String(imo)
  return isValidImo(value) ? value : undefined
}

const photosByImo = new Map(
  vesselPhotoManifest.photos.map((photo) => {
    if (!isValidImo(photo.imo)) {
      throw new Error(`Vessel photo manifest contains invalid IMO ${photo.imo}`)
    }
    return [photo.imo, photo] as const
  }),
)

if (photosByImo.size !== vesselPhotoManifest.photos.length) {
  throw new Error('Vessel photo manifest contains duplicate IMO entries')
}

export const vesselReferencePhotoForSelection = (
  vessel: Pick<Vessel, 'id' | 'imo'>,
): VesselReferencePhoto | undefined => {
  const imo = canonicalImo(vessel.imo)
  if (!imo) return undefined

  const photo = photosByImo.get(imo)
  if (!photo) return undefined

  return {
    ...photo,
    identityKey: `${vessel.id}|${imo}|${vesselPhotoManifest.manifestVersion}`,
    manifestVersion: vesselPhotoManifest.manifestVersion,
  }
}
