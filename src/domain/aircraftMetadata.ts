import type { Aircraft } from './traffic'

export interface AircraftMetadataIdentity {
  hex: string
  registration?: string
  aircraftType?: string
}

export type AircraftMetadataMatchConfidence =
  | 'registration-verified'
  | 'icao24-only'

export interface AircraftMetadataSource {
  name: string
  repositoryUrl: string
  publishedAt: string
  outputVersion: string
  licenseName: string
  licenseUrl: string
}

export interface AircraftMetadataRecord {
  databaseRegistration: string
  typeCode: string
  modelDescription: string
  configuration?: string
  wakeCategory?: string
  confidence: AircraftMetadataMatchConfidence
  source: AircraftMetadataSource
  staleAfterDays: number
  futureToleranceHours: number
}

export type AircraftMetadataUnavailableReason =
  | 'not-found'
  | 'ambiguous'
  | 'registration-conflict'
  | 'type-conflict'
  | 'invalid-identity'
  | 'stale'
  | 'future'

export type AircraftMetadataLookupResult =
  | {
      kind: 'available'
      metadata: AircraftMetadataRecord
    }
  | {
      kind: 'unavailable'
      reason: Exclude<
        AircraftMetadataUnavailableReason,
        'stale' | 'future'
      >
    }

export type AircraftMetadataControllerState =
  | { phase: 'idle' }
  | { phase: 'loading'; identityKey: string }
  | {
      phase: 'ready'
      identityKey: string
      metadata: AircraftMetadataRecord
    }
  | {
      phase: 'unavailable'
      identityKey: string
      reason: Exclude<
        AircraftMetadataUnavailableReason,
        'stale' | 'future'
      >
      metadata?: undefined
    }
  | {
      phase: 'error'
      identityKey: string
      message: string
    }

export type AircraftMetadataViewState =
  | Exclude<AircraftMetadataControllerState, { phase: 'ready' }>
  | {
      phase: 'available'
      identityKey: string
      metadata: AircraftMetadataRecord
    }
  | {
      phase: 'unavailable'
      identityKey: string
      reason: AircraftMetadataUnavailableReason
      metadata?: AircraftMetadataRecord
    }

const normalizeOptionalIdentityValue = (value: string | undefined) => {
  const normalized = value?.trim().toUpperCase()
  return normalized || undefined
}

export const aircraftMetadataIdentity = (
  aircraft: Pick<Aircraft, 'hex' | 'registration' | 'aircraftType'>,
): AircraftMetadataIdentity => ({
  hex: aircraft.hex.trim().toUpperCase(),
  registration: normalizeOptionalIdentityValue(aircraft.registration),
  aircraftType: normalizeOptionalIdentityValue(aircraft.aircraftType),
})

export const aircraftMetadataIdentityKey = (
  identity: AircraftMetadataIdentity,
) =>
  [
    identity.hex,
    identity.registration ?? '',
    identity.aircraftType ?? '',
  ].join('|')

export const evaluateAircraftMetadataState = (
  state: AircraftMetadataControllerState,
  now: number,
): AircraftMetadataViewState => {
  if (state.phase !== 'ready') return state

  const publishedAt = Date.parse(state.metadata.source.publishedAt)
  const staleAfterMs =
    state.metadata.staleAfterDays * 24 * 60 * 60 * 1_000
  const futureToleranceMs =
    state.metadata.futureToleranceHours * 60 * 60 * 1_000
  if (!Number.isFinite(publishedAt) || publishedAt > now + futureToleranceMs) {
    return {
      phase: 'unavailable',
      identityKey: state.identityKey,
      reason: 'future',
      metadata: state.metadata,
    }
  }
  if (now > publishedAt + staleAfterMs) {
    return {
      phase: 'unavailable',
      identityKey: state.identityKey,
      reason: 'stale',
      metadata: state.metadata,
    }
  }

  return {
    phase: 'available',
    identityKey: state.identityKey,
    metadata: state.metadata,
  }
}
