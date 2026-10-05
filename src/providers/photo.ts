import type { PhotoErrorReason, PhotoLookupResult } from '../domain/photo.js'

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
  const contentType = response.headers.get('Content-Type') ?? ''
  const contentLength = Number(response.headers.get('Content-Length'))
  if (
    !contentType.toLowerCase().startsWith('application/json') ||
    (Number.isFinite(contentLength) && contentLength > maximumBytes) ||
    !response.body
  ) {
    void response.body?.cancel().catch(() => undefined)
    throw new PhotoProviderError('invalid-response')
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maximumBytes) {
        void reader.cancel().catch(() => undefined)
        throw new PhotoProviderError('invalid-response')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes))
  } catch {
    throw new PhotoProviderError('invalid-response')
  }
}
