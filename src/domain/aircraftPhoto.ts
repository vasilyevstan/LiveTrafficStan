import type { Aircraft } from './traffic'

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

export type AircraftPhotoUnavailableReason =
  | 'invalid-identity'
  | 'not-found'

export type AircraftPhotoErrorReason =
  | 'timeout'
  | 'throttled'
  | 'forbidden'
  | 'invalid-response'
  | 'network'
  | 'provider-error'

export type AircraftPhotoLookupResult =
  | { kind: 'available'; photo: AircraftPhoto }
  | { kind: 'unavailable'; reason: AircraftPhotoUnavailableReason }

export type AircraftPhotoViewState =
  | { phase: 'idle'; identityKey?: string }
  | { phase: 'loading'; identityKey: string }
  | {
      phase: 'available'
      identityKey: string
      photo: AircraftPhoto
    }
  | {
      phase: 'unavailable'
      identityKey?: string
      reason: AircraftPhotoUnavailableReason
    }
  | {
      phase: 'error'
      identityKey: string
      reason: AircraftPhotoErrorReason
      retryAt?: number
    }

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
