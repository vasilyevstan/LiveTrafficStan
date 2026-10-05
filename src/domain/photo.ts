export type PhotoUnavailableReason = 'invalid-identity' | 'not-found'

export type PhotoErrorReason =
  | 'timeout'
  | 'throttled'
  | 'forbidden'
  | 'invalid-response'
  | 'network'
  | 'provider-error'

export type PhotoLookupResult<Photo> =
  | { kind: 'available'; photo: Photo }
  | { kind: 'unavailable'; reason: PhotoUnavailableReason }

export type PhotoViewState<Photo> =
  | { phase: 'idle'; identityKey?: string }
  | { phase: 'loading'; identityKey: string }
  | { phase: 'available'; identityKey: string; photo: Photo }
  | {
      phase: 'unavailable'
      identityKey?: string
      reason: PhotoUnavailableReason
    }
  | {
      phase: 'error'
      identityKey: string
      reason: PhotoErrorReason
      retryAt?: number
    }
