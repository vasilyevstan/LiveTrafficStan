import { describe, expect, it, vi } from 'vitest'
import type { AircraftPhotoIdentity } from '../../domain/aircraftPhoto'
import {
  AircraftPhotoProviderError,
  PlanespottersPhotoProvider,
  type PlanespottersPhotoProviderConfig,
} from './planespottersPhotoProvider'

const config: PlanespottersPhotoProviderConfig = {
  endpointBaseUrl: 'https://api.planespotters.net/pub/photos/hex',
  timeoutMs: 100,
  maximumBytes: 32 * 1_024,
  thumbnailOrigin: 'https://cdn.planespotters.net',
  photoPageOrigin: 'https://www.planespotters.net',
  sourceName: 'Planespotters.net',
  sourceWebsiteUrl: 'https://www.planespotters.net/',
  sourceTermsUrl: 'https://www.planespotters.net/photo/api',
}

const identity: AircraftPhotoIdentity = { icao24: 'ABC123' }

const photoResponse = (overrides: Record<string, unknown> = {}) => ({
  photos: [
    {
      id: '000001',
      thumbnail: {
        src: 'https://cdn.planespotters.net/example/photo_t.jpg',
        size: { width: 200, height: 133 },
      },
      thumbnail_large: {
        src: 'https://cdn.planespotters.net/example/photo_280.jpg',
        size: { width: 420, height: 280 },
      },
      link: 'https://www.planespotters.net/photo/000001/example',
      photographer: 'Test Photographer',
      ...overrides,
    },
  ],
})

const jsonResponse = (
  value: unknown,
  init: ResponseInit = {},
) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })

describe('PlanespottersPhotoProvider', () => {
  it('uses only the exact hex endpoint and preserves returned URLs', async () => {
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse(photoResponse()),
    )
    const provider = new PlanespottersPhotoProvider(config, fetchImpl)

    await expect(
      provider.lookup(identity, new AbortController().signal),
    ).resolves.toEqual({
      kind: 'available',
      photo: {
        icao24: 'ABC123',
        thumbnailUrl:
          'https://cdn.planespotters.net/example/photo_t.jpg',
        thumbnailWidth: 200,
        thumbnailHeight: 133,
        photoPageUrl:
          'https://www.planespotters.net/photo/000001/example',
        photographer: 'Test Photographer',
        source: {
          name: 'Planespotters.net',
          websiteUrl: 'https://www.planespotters.net/',
          termsUrl: 'https://www.planespotters.net/photo/api',
        },
      },
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(String(url)).toBe(
      'https://api.planespotters.net/pub/photos/hex/ABC123',
    )
    expect(init).toMatchObject({
      method: 'GET',
      redirect: 'error',
      cache: 'no-store',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
    })
  })

  it('returns not-found for an empty photo array and never substitutes', async () => {
    const provider = new PlanespottersPhotoProvider(
      config,
      async () => jsonResponse({ photos: [] }),
    )

    await expect(
      provider.lookup(identity, new AbortController().signal),
    ).resolves.toEqual({
      kind: 'unavailable',
      reason: 'not-found',
    })
  })

  it('rejects invalid ICAO24 without a request', async () => {
    const fetchImpl = vi.fn()
    const provider = new PlanespottersPhotoProvider(config, fetchImpl)

    await expect(
      provider.lookup(
        { icao24: 'NOT-HEX' },
        new AbortController().signal,
      ),
    ).resolves.toEqual({
      kind: 'unavailable',
      reason: 'invalid-identity',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: 'thumbnail origin',
      response: photoResponse({
        thumbnail: {
          src: 'https://images.example.test/photo.jpg',
          size: { width: 200, height: 133 },
        },
      }),
    },
    {
      name: 'photo-page origin',
      response: photoResponse({
        link: 'https://example.test/photo/000001/example',
      }),
    },
    {
      name: 'photo-page path',
      response: photoResponse({
        link: 'https://www.planespotters.net/hex/ABC123',
      }),
    },
  ])('rejects an unapproved $name', async ({ response }) => {
    const provider = new PlanespottersPhotoProvider(
      config,
      async () => jsonResponse(response),
    )

    await expect(
      provider.lookup(identity, new AbortController().signal),
    ).rejects.toMatchObject({
      name: 'AircraftPhotoProviderError',
      reason: 'invalid-response',
    })
  })

  it('preserves throttling and Retry-After without automatic retry', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('', {
        status: 429,
        headers: { 'Retry-After': '30' },
      }),
    )
    const provider = new PlanespottersPhotoProvider(config, fetchImpl)

    await expect(
      provider.lookup(identity, new AbortController().signal),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AircraftPhotoProviderError>>({
        reason: 'throttled',
        retryAfterMs: 30_000,
      }),
    )
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it.each([
    [403, 'forbidden'],
    [500, 'provider-error'],
  ] as const)('maps HTTP %s to %s', async (status, reason) => {
    const fetchImpl = vi.fn(async () => new Response('', { status }))
    const provider = new PlanespottersPhotoProvider(config, fetchImpl)

    await expect(
      provider.lookup(identity, new AbortController().signal),
    ).rejects.toMatchObject({ reason })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it.each([
    new Response('not json', {
      headers: { 'Content-Type': 'text/plain' },
    }),
    jsonResponse({ photos: [{ photographer: 'Missing URLs' }] }),
    jsonResponse({ error: 'provider failure' }),
  ])('keeps invalid and provider responses local', async (response) => {
    const provider = new PlanespottersPhotoProvider(
      config,
      async () => response.clone(),
    )

    await expect(
      provider.lookup(identity, new AbortController().signal),
    ).rejects.toBeInstanceOf(AircraftPhotoProviderError)
  })

  it('distinguishes timeout, network failure, and caller abort', async () => {
    const timeoutProvider = new PlanespottersPhotoProvider(
      { ...config, timeoutMs: 1 },
      async (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          )
        }),
    )
    await expect(
      timeoutProvider.lookup(identity, new AbortController().signal),
    ).rejects.toMatchObject({ reason: 'timeout' })

    const networkProvider = new PlanespottersPhotoProvider(
      config,
      async () => {
        throw new TypeError('Failed to fetch')
      },
    )
    await expect(
      networkProvider.lookup(identity, new AbortController().signal),
    ).rejects.toMatchObject({ reason: 'network' })

    const controller = new AbortController()
    controller.abort()
    await expect(
      networkProvider.lookup(identity, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
