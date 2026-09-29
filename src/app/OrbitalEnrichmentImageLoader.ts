import type { OrbitalEnrichmentImage } from '../domain/orbitalEnrichment'

export type OrbitalEnrichmentImageErrorReason =
  | 'invalid-response'
  | 'network'
  | 'timeout'

export class OrbitalEnrichmentImageError extends Error {
  readonly reason: OrbitalEnrichmentImageErrorReason

  constructor(reason: OrbitalEnrichmentImageErrorReason) {
    super(`Orbital enrichment image ${reason}`)
    this.name = 'OrbitalEnrichmentImageError'
    this.reason = reason
  }
}

export interface OrbitalEnrichmentImageLoaderRuntime {
  fetch: typeof fetch
  origin: string
  createObjectUrl: (blob: Blob) => string
  revokeObjectUrl: (url: string) => void
  setTimeout: typeof globalThis.setTimeout
  clearTimeout: typeof globalThis.clearTimeout
  digest: (bytes: Uint8Array) => Promise<string>
}

interface LoadingEntry {
  phase: 'loading'
  controller: AbortController
  promise: Promise<string>
  cancelled: boolean
}

interface AvailableEntry {
  phase: 'available'
  url: string
}

interface ErrorEntry {
  phase: 'error'
  error: OrbitalEnrichmentImageError
}

type ImageEntry = LoadingEntry | AvailableEntry | ErrorEntry

const abortError = () =>
  new DOMException('The operation was aborted', 'AbortError')

const sha256 = async (bytes: Uint8Array) => {
  if (!globalThis.crypto?.subtle) {
    throw new OrbitalEnrichmentImageError('invalid-response')
  }
  const digestInput = new Uint8Array(bytes.byteLength)
  digestInput.set(bytes)
  const digestBytes = await globalThis.crypto.subtle.digest(
    'SHA-256',
    digestInput,
  )
  return [...new Uint8Array(digestBytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

const browserRuntime = (): OrbitalEnrichmentImageLoaderRuntime => ({
  fetch: globalThis.fetch.bind(globalThis),
  origin: globalThis.location.origin,
  createObjectUrl: (blob) => URL.createObjectURL(blob),
  revokeObjectUrl: (url) => URL.revokeObjectURL(url),
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
  digest: sha256,
})

const imageKey = (image: OrbitalEnrichmentImage) =>
  `${image.asset.path}|${image.asset.sha256}`

const isAbortError = (error: unknown) =>
  (error instanceof DOMException || error instanceof Error) &&
  error.name === 'AbortError'

export class OrbitalEnrichmentImageLoader {
  private readonly timeoutMs: number
  private readonly runtime: OrbitalEnrichmentImageLoaderRuntime
  private readonly entries = new Map<string, ImageEntry>()

  constructor(
    timeoutMs: number,
    runtime: OrbitalEnrichmentImageLoaderRuntime = browserRuntime(),
  ) {
    this.timeoutMs = timeoutMs
    this.runtime = runtime
  }

  peek(image: OrbitalEnrichmentImage) {
    const entry = this.entries.get(imageKey(image))
    return entry?.phase === 'available' || entry?.phase === 'error'
      ? entry
      : undefined
  }

  load(image: OrbitalEnrichmentImage) {
    const key = imageKey(image)
    const existing = this.entries.get(key)
    if (existing?.phase === 'available') {
      return Promise.resolve(existing.url)
    }
    if (existing?.phase === 'error') {
      return Promise.reject(existing.error)
    }
    if (existing?.phase === 'loading') return existing.promise

    const controller = new AbortController()
    const entry = {
      phase: 'loading',
      controller,
      cancelled: false,
      promise: Promise.resolve(''),
    } satisfies LoadingEntry
    entry.promise = this.fetchImage(image, entry)
    this.entries.set(key, entry)
    return entry.promise
  }

  cancel(image: OrbitalEnrichmentImage) {
    const key = imageKey(image)
    const entry = this.entries.get(key)
    if (entry?.phase !== 'loading') return
    entry.cancelled = true
    this.entries.delete(key)
    entry.controller.abort()
  }

  invalidate(image: OrbitalEnrichmentImage) {
    const key = imageKey(image)
    const entry = this.entries.get(key)
    if (entry?.phase === 'loading') {
      entry.cancelled = true
      entry.controller.abort()
    } else if (entry?.phase === 'available') {
      this.runtime.revokeObjectUrl(entry.url)
    }
    this.entries.set(key, {
      phase: 'error',
      error: new OrbitalEnrichmentImageError('invalid-response'),
    })
  }

  dispose() {
    for (const entry of this.entries.values()) {
      if (entry.phase === 'loading') {
        entry.cancelled = true
        entry.controller.abort()
      } else if (entry.phase === 'available') {
        this.runtime.revokeObjectUrl(entry.url)
      }
    }
    this.entries.clear()
  }

  private async fetchImage(
    image: OrbitalEnrichmentImage,
    entry: LoadingEntry,
  ) {
    const key = imageKey(image)
    let timedOut = false
    const timeout = this.runtime.setTimeout(() => {
      timedOut = true
      entry.controller.abort()
    }, this.timeoutMs)

    try {
      const url = new URL(image.asset.path, this.runtime.origin)
      if (
        url.origin !== this.runtime.origin ||
        url.pathname !== image.asset.path ||
        url.search !== '' ||
        url.hash !== ''
      ) {
        throw new OrbitalEnrichmentImageError('invalid-response')
      }

      const response = await this.runtime.fetch(url, {
        cache: 'force-cache',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: entry.controller.signal,
      })
      if (
        response.status !== 200 ||
        response.redirected ||
        response.headers.get('Content-Type')?.split(';', 1)[0].trim() !==
          image.asset.mediaType
      ) {
        await response.body?.cancel()
        throw new OrbitalEnrichmentImageError('invalid-response')
      }

      const contentLengthHeader = response.headers.get('Content-Length')
      const contentLength = Number(contentLengthHeader)
      if (
        contentLengthHeader !== null &&
        Number.isFinite(contentLength) &&
        contentLength !== image.asset.bytes
      ) {
        await response.body?.cancel()
        throw new OrbitalEnrichmentImageError('invalid-response')
      }
      if (!response.body) {
        throw new OrbitalEnrichmentImageError('invalid-response')
      }

      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let receivedBytes = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        receivedBytes += value.byteLength
        if (receivedBytes > image.asset.bytes) {
          await reader.cancel()
          throw new OrbitalEnrichmentImageError('invalid-response')
        }
        chunks.push(value)
      }
      if (receivedBytes !== image.asset.bytes) {
        throw new OrbitalEnrichmentImageError('invalid-response')
      }

      const bytes = new Uint8Array(receivedBytes)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
      }
      if ((await this.runtime.digest(bytes)) !== image.asset.sha256) {
        throw new OrbitalEnrichmentImageError('invalid-response')
      }
      if (entry.cancelled || entry.controller.signal.aborted) {
        throw abortError()
      }

      const objectUrl = this.runtime.createObjectUrl(
        new Blob([bytes], { type: image.asset.mediaType }),
      )
      if (this.entries.get(key) !== entry) {
        this.runtime.revokeObjectUrl(objectUrl)
        throw abortError()
      }
      this.entries.set(key, { phase: 'available', url: objectUrl })
      return objectUrl
    } catch (error) {
      if (this.entries.get(key) !== entry) throw error
      if (entry.cancelled) {
        this.entries.delete(key)
        throw abortError()
      }
      const imageError =
        timedOut
          ? new OrbitalEnrichmentImageError('timeout')
          : error instanceof OrbitalEnrichmentImageError
            ? error
            : isAbortError(error)
              ? new OrbitalEnrichmentImageError('network')
              : new OrbitalEnrichmentImageError('network')
      this.entries.set(key, { phase: 'error', error: imageError })
      throw imageError
    } finally {
      this.runtime.clearTimeout(timeout)
    }
  }
}
