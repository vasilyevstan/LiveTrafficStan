import vesselPhotoManifest from '../config/vesselPhotoManifest.json'
import type { Vessel } from './traffic'
import type { PhotoViewState } from './photo'
import { isValidImo } from './vesselPhotoIdentity'
export { isValidImo, isValidVesselPhotoNumber } from './vesselPhotoIdentity'

type ManifestPhoto = (typeof vesselPhotoManifest.photos)[number]

export type VesselReferencePhoto = ManifestPhoto & {
  identityKey: string
  manifestVersion: string
}

export type VesselReferencePhotoSelection =
  | { kind: 'available'; photo: VesselReferencePhoto }
  | { kind: 'invalid-imo' }
  | { kind: 'unmatched'; imo: string }

export interface VesselPhotoIdentity {
  entityId: string
  kind: 'IMO' | 'MMSI'
  number: string
}

export interface DynamicVesselPhoto {
  lookupKind: 'IMO' | 'MMSI'
  lookupNumber: string
  thumbnailUrl: string
  width: number
  height: number
  pageUrl: string
  artist: string
  license: string
  licenseUrl?: string
  description?: string
}

export type VesselPhotoViewState = PhotoViewState<DynamicVesselPhoto>

export const vesselPhotoIdentity = (
  vessel: Pick<Vessel, 'id' | 'mmsi' | 'imo'>,
): VesselPhotoIdentity | undefined => {
  const imo = canonicalImo(vessel.imo)
  if (imo) return { entityId: vessel.id, kind: 'IMO', number: imo }
  const mmsi = String(vessel.mmsi)
  return /^[2-7][0-9]{8}$/.test(mmsi)
    ? { entityId: vessel.id, kind: 'MMSI', number: mmsi }
    : undefined
}

export const vesselPhotoIdentityKey = (identity: VesselPhotoIdentity) =>
  `${identity.entityId}|${identity.kind}|${identity.number}`

export const dynamicVesselPhotoForSelection = (
  vessel: Pick<Vessel, 'id' | 'mmsi' | 'imo'>,
  state: VesselPhotoViewState | undefined,
) => {
  const identity = vesselPhotoIdentity(vessel)
  return identity && state?.phase === 'available' &&
    state.identityKey === vesselPhotoIdentityKey(identity) &&
    state.photo.lookupKind === identity.kind &&
    state.photo.lookupNumber === identity.number
    ? state.photo : undefined
}

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

export const vesselReferencePhotoSelection = (
  vessel: Pick<Vessel, 'id' | 'imo'>,
): VesselReferencePhotoSelection => {
  const imo = canonicalImo(vessel.imo)
  if (!imo) return { kind: 'invalid-imo' }

  const photo = photosByImo.get(imo)
  if (!photo) return { kind: 'unmatched', imo }

  return {
    kind: 'available',
    photo: {
      ...photo,
      identityKey: `${vessel.id}|${imo}|${vesselPhotoManifest.manifestVersion}`,
      manifestVersion: vesselPhotoManifest.manifestVersion,
    },
  }
}

export const vesselReferencePhotoForSelection = (
  vessel: Pick<Vessel, 'id' | 'imo'>,
): VesselReferencePhoto | undefined => {
  const selection = vesselReferencePhotoSelection(vessel)
  return selection.kind === 'available'
    ? selection.photo
    : undefined
}
