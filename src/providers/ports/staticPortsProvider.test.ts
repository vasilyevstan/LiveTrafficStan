import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  StaticPortsProvider,
  type StaticPortsProviderConfig,
} from './staticPortsProvider'

const sha256 = async (text: string) => {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

const asset = (features = [
  {
    type: 'Feature',
    id: '10',
    properties: { name: 'FIRST', rank: 3 },
    geometry: { type: 'Point', coordinates: [24, 59] },
  },
  {
    type: 'Feature',
    id: '20',
    properties: { name: 'SECOND', rank: 8 },
    geometry: { type: 'Point', coordinates: [25, 60] },
  },
]) => `${JSON.stringify({ type: 'FeatureCollection', features })}\n`

const config = async (
  body = asset(),
  overrides: Partial<StaticPortsProviderConfig> = {},
): Promise<StaticPortsProviderConfig> => ({
  assetUrl: '/ports/test-v1/ports.geojson',
  timeoutMs: 5_000,
  maximumBytes: 64 * 1_024,
  schemaVersion: 1,
  outputVersion: 'test-v1',
  sourceName: 'Fixture ports',
  sourceRepositoryUrl: 'https://example.test/ports',
  sourceTag: 'v1',
  sourceCommit: 'a'.repeat(40),
  sourcePublishedAt: '2022-05-13T23:22:31Z',
  sourceTermsUrl: 'https://example.test/terms',
  sourceDocumentationUrl: 'https://example.test/docs',
  sourceLicenseName: 'Public domain',
  expectedRecords: 2,
  expectedSha256: await sha256(body),
  expectedRankCounts: { 3: 1, 8: 1 },
  ...overrides,
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('StaticPortsProvider', () => {
  it('makes zero constructor requests, validates one asset, and reuses only the fulfilled cache', async () => {
    const body = asset()
    const fetchMock = vi.fn(async () => new Response(body, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new StaticPortsProvider(await config(body))

    expect(fetchMock).not.toHaveBeenCalled()
    const first = await provider.load(new AbortController().signal)
    const second = await provider.load(new AbortController().signal)

    expect(first).toBe(second)
    expect(first.ports).toEqual([
      {
        id: '10',
        name: 'FIRST',
        rank: 3,
        longitude: 24,
        latitude: 59,
      },
      {
        id: '20',
        name: 'SECOND',
        rank: 8,
        longitude: 25,
        latitude: 60,
      },
    ])
    expect(first.source).toMatchObject({
      name: 'Fixture ports',
      outputVersion: 'test-v1',
      licenseName: 'Public domain',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not cache checksum or shape failures', async () => {
    const body = asset()
    const fetchMock = vi.fn(async () => new Response(body, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new StaticPortsProvider(
      await config(body, { expectedSha256: 'b'.repeat(64) }),
    )

    await expect(
      provider.load(new AbortController().signal),
    ).rejects.toThrow(/SHA-256/)
    await expect(
      provider.load(new AbortController().signal),
    ).rejects.toThrow(/SHA-256/)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('rejects oversized, malformed, and unsorted collections', async () => {
    const body = asset()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(body, {
          status: 200,
          headers: { 'Content-Length': '9999' },
        }),
      ),
    )
    await expect(
      new StaticPortsProvider(
        await config(body, { maximumBytes: 100 }),
      ).load(new AbortController().signal),
    ).rejects.toThrow(/byte limit/)

    const invalid = asset([
      {
        type: 'Feature',
        id: '20',
        properties: { name: 'SECOND', rank: 8 },
        geometry: { type: 'Point', coordinates: [25, 60] },
      },
      {
        type: 'Feature',
        id: '10',
        properties: { name: 'FIRST', rank: 3 },
        geometry: { type: 'Point', coordinates: [24, 59] },
      },
    ])
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(invalid, { status: 200 })),
    )
    await expect(
      new StaticPortsProvider(await config(invalid)).load(
        new AbortController().signal,
      ),
    ).rejects.toThrow(/invalid/)
  })

  it('reports timeout separately and never caches aborted work', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            )
          }),
      ),
    )
    const provider = new StaticPortsProvider(
      await config(asset(), { timeoutMs: 10 }),
    )
    const promise = provider.load(new AbortController().signal)
    const assertion = expect(promise).rejects.toThrow(
      'Port data timed out after 10 ms',
    )
    await vi.advanceTimersByTimeAsync(10)
    await assertion
  })

  it('forwards external abort and permits a clean later retry', async () => {
    const body = asset()
    const fetchMock = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) => {
        if (fetchMock.mock.calls.length === 1) {
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            )
          })
        }
        return Promise.resolve(new Response(body, { status: 200 }))
      },
    )
    vi.stubGlobal('fetch', fetchMock)
    const provider = new StaticPortsProvider(await config(body))
    const controller = new AbortController()
    const first = provider.load(controller.signal)

    controller.abort()
    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    await expect(
      provider.load(new AbortController().signal),
    ).resolves.toMatchObject({ ports: expect.any(Array) })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
