import { describe, expect, it, vi } from 'vitest'
import { ProviderError } from '../errors'
import { PhotonPlaceSearchProvider } from './photonProvider'

const feature = (
  id: number,
  longitude = 24.7536,
  latitude = 59.437,
) => ({
  type: 'Feature',
  geometry: {
    type: 'Point',
    coordinates: [longitude, latitude],
  },
  properties: {
    name: 'Tallinn',
    city: 'Tallinn',
    state: 'Harju',
    country: 'Estonia',
    osm_type: 'R',
    osm_id: id,
  },
})

const response = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), init)

describe('PhotonPlaceSearchProvider', () => {
  it('builds a bounded credential-free request and maps ordered results', async () => {
    const fetchImpl = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        response({
          type: 'FeatureCollection',
          features: [feature(1), feature(2, 24.8, 59.5)],
        }),
    )
    const provider = new PhotonPlaceSearchProvider({
      endpointBaseUrl: 'https://photon.example/api',
      resultLimit: 5,
      coordinatePrecision: 3,
      fetchImpl,
    })

    await expect(
      provider.search('Tallinn Airport', new AbortController().signal),
    ).resolves.toEqual([
      {
        id: 'photon:R:1',
        label: 'Tallinn, Harju, Estonia',
        center: {
          latitude: 59.437,
          longitude: 24.754,
          label: 'Tallinn, Harju, Estonia',
        },
      },
      {
        id: 'photon:R:2',
        label: 'Tallinn, Harju, Estonia',
        center: {
          latitude: 59.5,
          longitude: 24.8,
          label: 'Tallinn, Harju, Estonia',
        },
      },
    ])

    const [url, init] = fetchImpl.mock.calls[0]!
    expect(String(url)).toBe(
      'https://photon.example/api?q=Tallinn+Airport&limit=5',
    )
    expect(init).toMatchObject({
      method: 'GET',
      credentials: 'omit',
      redirect: 'follow',
      headers: { Accept: 'application/json' },
    })
  })

  it('supports a root-relative compatible endpoint with an explicit origin', async () => {
    const fetchImpl = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        response({ type: 'FeatureCollection', features: [] }),
    )
    const provider = new PhotonPlaceSearchProvider({
      endpointBaseUrl: '/api/geocoder',
      resultLimit: 5,
      coordinatePrecision: 3,
      fetchImpl,
      origin: 'https://app.example',
    })

    await provider.search('Tallinn', new AbortController().signal)

    expect(String(fetchImpl.mock.calls[0]![0])).toBe(
      'https://app.example/api/geocoder?q=Tallinn&limit=5',
    )
  })

  it('deduplicates OSM identities and skips malformed features', async () => {
    const provider = new PhotonPlaceSearchProvider({
      endpointBaseUrl: 'https://photon.example/api',
      resultLimit: 5,
      coordinatePrecision: 3,
      fetchImpl: async () =>
        response({
          type: 'FeatureCollection',
          features: [
            feature(1),
            feature(1),
            { type: 'Feature', geometry: { type: 'Point', coordinates: [] } },
          ],
        }),
    })

    await expect(
      provider.search('Tallinn', new AbortController().signal),
    ).resolves.toHaveLength(1)
  })

  it.each([
    { payload: {}, message: /invalid search response/ },
    {
      payload: { type: 'FeatureCollection', features: [{}] },
      message: /no valid search results/,
    },
  ])('rejects malformed provider payloads', async ({ payload, message }) => {
    const provider = new PhotonPlaceSearchProvider({
      endpointBaseUrl: 'https://photon.example/api',
      resultLimit: 5,
      coordinatePrecision: 3,
      fetchImpl: async () => response(payload),
    })

    await expect(
      provider.search('Tallinn', new AbortController().signal),
    ).rejects.toThrow(message)
  })

  it('preserves rate-limit status and Retry-After', async () => {
    const provider = new PhotonPlaceSearchProvider({
      endpointBaseUrl: 'https://photon.example/api',
      resultLimit: 5,
      coordinatePrecision: 3,
      fetchImpl: async () =>
        new Response('slow down', {
          status: 429,
          headers: { 'Retry-After': '12' },
        }),
    })

    const error = await provider
      .search('Tallinn', new AbortController().signal)
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ProviderError)
    expect(error).toMatchObject({ status: 429, retryAfterMs: 12_000 })
  })

  it('rejects invalid JSON and oversized successful responses', async () => {
    const invalidJson = new PhotonPlaceSearchProvider({
      endpointBaseUrl: 'https://photon.example/api',
      resultLimit: 5,
      coordinatePrecision: 3,
      fetchImpl: async () => new Response('{'),
    })
    await expect(
      invalidJson.search('Tallinn', new AbortController().signal),
    ).rejects.toThrow(/invalid JSON/)

    const oversized = new PhotonPlaceSearchProvider({
      endpointBaseUrl: 'https://photon.example/api',
      resultLimit: 5,
      coordinatePrecision: 3,
      fetchImpl: async () => new Response('x'.repeat(256_001)),
    })
    await expect(
      oversized.search('Tallinn', new AbortController().signal),
    ).rejects.toThrow(/oversized/)
  })
})
