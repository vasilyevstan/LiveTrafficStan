import type { PhotoErrorReason, PhotoLookupResult } from '../domain/photo.js'
import { BoundedJsonError, readBoundedJson } from './boundedJson.js'

export interface PhotoProvider<Identity, Photo> {
  lookup(identity: Identity, signal: AbortSignal): Promise<PhotoLookupResult<Photo>>
}

export class PhotoProviderError extends Error {
  readonly reason: PhotoErrorReason
  readonly retryAfterMs?: number

  constructor(reason: PhotoErrorReason, retryAfterMs?: number) {
    super(reason)
    this.name = 'PhotoProviderError'
    this.reason = reason
    this.retryAfterMs = retryAfterMs
  }
}

export const readBoundedPhotoJson = async (
  response: Response,
  maximumBytes: number,
): Promise<unknown> => {
  try {
    return await readBoundedJson(response, maximumBytes)
  } catch (error) {
    if (error instanceof BoundedJsonError) throw new PhotoProviderError('invalid-response')
    throw error
  }
}
