import type { Aircraft } from './traffic'
import type {
  PhotoErrorReason,
  PhotoLookupResult,
  PhotoUnavailableReason,
  PhotoViewState,
} from './photo'

export interface AircraftPhotoIdentity {
  icao24: string
}

export interface AircraftPhotoSource {
  name: string
  websiteUrl: string
  termsUrl: string
}

export interface AircraftPhoto {
  icao24: string
  thumbnailUrl: string
  thumbnailWidth: number
  thumbnailHeight: number
  photoPageUrl: string
  photographer: string
  source: AircraftPhotoSource
}

export type AircraftPhotoUnavailableReason = PhotoUnavailableReason
export type AircraftPhotoErrorReason = PhotoErrorReason
export type AircraftPhotoLookupResult = PhotoLookupResult<AircraftPhoto>
export type AircraftPhotoViewState = PhotoViewState<AircraftPhoto>

const ICAO24 = /^[0-9A-F]{6}$/

export const aircraftPhotoIdentity = (
  aircraft: Pick<Aircraft, 'hex'>,
): AircraftPhotoIdentity | undefined => {
  const icao24 = aircraft.hex.trim().toUpperCase()
  return ICAO24.test(icao24) ? { icao24 } : undefined
}

export const aircraftPhotoIdentityKey = (
  identity: AircraftPhotoIdentity,
) => identity.icao24
