import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OrbitalEnrichmentImage } from '../domain/orbitalEnrichment'
import {
  OrbitalEnrichmentImageError,
  OrbitalEnrichmentImageLoader,
  type OrbitalEnrichmentImageLoaderRuntime,
} from './OrbitalEnrichmentImageLoader'

const bytes = new Uint8Array([1, 2, 3])

const image: OrbitalEnrichmentImage = {
  kind: 'photograph',
  alt: 'Reviewed orbital object',
  identityEvidence: {
    sourceId: 'test',
    sourceTitle: 'Test source',
    sourcePageUrl: 'https://example.test/source',
    sourceRevisionUrl: 'https://example.test/revision',
    sourceRevisionSha256: 'a'.repeat(64),
    reviewNote: 'Exact identity reviewed.',
  },
  source: {
    canonicalOriginalUrl: 'https://example.test/original.jpg',
    reviewedUrl: 'https://example.test/reviewed.jpg',
    reviewedMediaType: 'image/jpeg',
    reviewedBytes: bytes.byteLength,
    reviewedWidth: 1,
    reviewedHeight: 1,
    reviewedSha256: 'b'.repeat(64),
    sourceRetrievedAt: '2026-09-29',
  },
  rights: {
    owner: 'Test owner',
    sourceName: 'Test source',
    usagePolicyName: 'Test policy',
    usagePolicyUrl: 'https://example.test/policy',
    creditLine: 'Test credit',
    publicDomain: true,
    restrictions: 'No endorsement.',
  },
  asset: {
    path: '/orbital-enrichment/test/image.jpg',
    mediaType: 'image/jpeg',
    bytes: bytes.byteLength,
    width: 1,
    height: 1,
    sha256: 'b'.repeat(64),
    modificationNotice: 'Unmodified.',
  },
}

const response = (
  body = bytes,
  headers: Record<string, string> = {},
) =>
  new Response(body, {
    status: 200,
    headers: {
      'Content-Length': String(body.byteLength),
      'Content-Type': image.asset.mediaType,
      ...headers,
    },
  })

const createRuntime = (
  fetchImplementation: typeof fetch,
  overrides: Partial<OrbitalEnrichmentImageLoaderRuntime> = {},
) => {
  const createObjectUrl = vi.fn(() => 'blob:https://app.test/reviewed')
  const revokeObjectUrl = vi.fn()
  const runtime: OrbitalEnrichmentImageLoaderRuntime = {
    fetch: fetchImplementation,
    origin: 'https://app.test',
    createObjectUrl,
    revokeObjectUrl,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    digest: vi.fn(async () => image.asset.sha256),
    ...overrides,
  }
  return { createObjectUrl, revokeObjectUrl, runtime }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('OrbitalEnrichmentImageLoader', () => {
  it('deduplicates a bounded same-origin load and caches only its validated object URL', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => response())
    const { createObjectUrl, revokeObjectUrl, runtime } = createRuntime(
      fetchMock,
    )
    const loader = new OrbitalEnrichmentImageLoader(5_000, runtime)

    const first = loader.load(image)
    const second = loader.load(image)

    await expect(first).resolves.toBe(
      'blob:https://app.test/reviewed',
    )
    await expect(second).resolves.toBe(
      'blob:https://app.test/reviewed',
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(image.asset.path, runtime.origin),
      expect.objectContaining({
        cache: 'force-cache',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
      }),
    )
    expect(createObjectUrl).toHaveBeenCalledTimes(1)
    await expect(loader.load(image)).resolves.toBe(
      'blob:https://app.test/reviewed',
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)

    loader.dispose()
    expect(revokeObjectUrl).toHaveBeenCalledWith(
      'blob:https://app.test/reviewed',
    )
  })

  it('retains a terminal failure without retrying an invalid response', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      response(bytes, { 'Content-Type': 'text/html' }),
    )
    const { createObjectUrl, runtime } = createRuntime(fetchMock)
    const loader = new OrbitalEnrichmentImageLoader(5_000, runtime)

    await expect(loader.load(image)).rejects.toMatchObject({
      reason: 'invalid-response',
    })
    await expect(loader.load(image)).rejects.toMatchObject({
      reason: 'invalid-response',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(createObjectUrl).not.toHaveBeenCalled()
  })

  it('aborts obsolete work without caching it and permits one later identity load', async () => {
    let attempt = 0
    const fetchMock = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise<Response>((resolve, reject) => {
          attempt += 1
          if (attempt === 2) {
            resolve(response())
            return
          }
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
    )
    const { runtime } = createRuntime(fetchMock)
    const loader = new OrbitalEnrichmentImageLoader(5_000, runtime)

    const obsolete = loader.load(image)
    loader.cancel(image)

    await expect(obsolete).rejects.toMatchObject({ name: 'AbortError' })
    await expect(loader.load(image)).resolves.toBe(
      'blob:https://app.test/reviewed',
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('turns a deadline abort into a terminal timeout state', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
    )
    const { runtime } = createRuntime(fetchMock)
    const loader = new OrbitalEnrichmentImageLoader(100, runtime)
    const pending = loader.load(image)
    const rejection = expect(pending).rejects.toEqual(
      new OrbitalEnrichmentImageError('timeout'),
    )

    await vi.advanceTimersByTimeAsync(100)

    await rejection
    await expect(loader.load(image)).rejects.toMatchObject({
      reason: 'timeout',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
