import { describe, expect, it, vi } from 'vitest'
import snapshotFixture from '../../../public/orbital-data/v1/visual-catalog.json'
import type { OrbitalCatalogSnapshot } from '../../domain/orbital'
import {
  OrbitalCatalogProvider,
  type OrbitalCatalogProviderConfig,
  type OrbitalCatalogRuntime,
} from './orbitalCatalogProvider'

const snapshot = snapshotFixture as OrbitalCatalogSnapshot

const config: OrbitalCatalogProviderConfig = {
  endpointPath: '/api/orbits/catalog',
  schemaVersion: snapshot.schemaVersion,
  sourceContractVersion: snapshot.sourceContractVersion,
  group: snapshot.group,
  gpSourceUrl: snapshot.gpSourceUrl,
  satcatSourceUrl: snapshot.satcatSourceUrl,
  maximumBytes: 256 * 1_024,
  maximumRecords: 256,
  timeoutMs: 5_000,
}

const headers = () => ({
  'Content-Type': 'application/json; charset=utf-8',
  ETag: `"${snapshot.sha256}"`,
  'X-LiveTrafficStan-Orbital-Source': 'bootstrap',
  'X-LiveTrafficStan-Orbital-Retrieved-At': snapshot.retrievedAt,
  'X-LiveTrafficStan-Orbital-Schema': String(snapshot.schemaVersion),
  'X-LiveTrafficStan-Orbital-Sha256': snapshot.sha256,
  'X-LiveTrafficStan-Served-At': '2026-09-28T18:46:00.000Z',
})

const runtime = (
  fetchImplementation: typeof fetch,
): OrbitalCatalogRuntime => {
  let wall = Date.parse('2026-09-28T18:45:59.900Z')
  return {
    wallNow: () => {
      wall += 100
      return wall
    },
    performanceNow: () => 500,
    setTimeout: () => 1,
    clearTimeout: () => undefined,
    fetch: fetchImplementation,
  }
}

describe('OrbitalCatalogProvider', () => {
  it('validates the canonical snapshot and conditionally revalidates it', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(`${JSON.stringify(snapshot)}\n`, {
          status: 200,
          headers: headers(),
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 304,
          headers: headers(),
        }),
      )
    const provider = new OrbitalCatalogProvider(
      config,
      runtime(fetchMock),
    )

    const first = await provider.load(new AbortController().signal)
    const second = await provider.load(new AbortController().signal)

    expect(first.snapshot).toEqual(snapshot)
    expect(second.snapshot).toBe(first.snapshot)
    expect(first.source).toBe('bootstrap')
    expect(first.clock.serverTimeMs).toBe(
      Date.parse('2026-09-28T18:46:00.000Z'),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/orbits/catalog',
      expect.objectContaining({
        method: 'GET',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
      }),
    )
    const secondHeaders = new Headers(
      fetchMock.mock.calls[1][1]?.headers,
    )
    expect(secondHeaders.get('If-None-Match')).toBe(
      `"${snapshot.sha256}"`,
    )
  })

  it('rejects unknown schema fields before caching a response', async () => {
    const invalid = { ...snapshot, unexpected: true }
    const provider = new OrbitalCatalogProvider(
      config,
      runtime(
        vi.fn<typeof fetch>().mockResolvedValue(
          new Response(JSON.stringify(invalid), {
            status: 200,
            headers: headers(),
          }),
        ),
      ),
    )

    await expect(
      provider.load(new AbortController().signal),
    ).rejects.toThrow(/schema is invalid/)
  })

  it('rejects invalid headers, partial responses, and oversized bodies', async () => {
    const invalidHeaderProvider = new OrbitalCatalogProvider(
      config,
      runtime(
        vi.fn<typeof fetch>().mockResolvedValue(
          new Response(JSON.stringify(snapshot), {
            status: 200,
            headers: {
              ...headers(),
              ETag: '"wrong"',
            },
          }),
        ),
      ),
    )
    await expect(
      invalidHeaderProvider.load(new AbortController().signal),
    ).rejects.toThrow(/headers are invalid/)

    const partialProvider = new OrbitalCatalogProvider(
      config,
      runtime(
        vi.fn<typeof fetch>().mockResolvedValue(
          new Response('{}', {
            status: 206,
            headers: headers(),
          }),
        ),
      ),
    )
    await expect(
      partialProvider.load(new AbortController().signal),
    ).rejects.toMatchObject({ status: 206 })

    const oversizedProvider = new OrbitalCatalogProvider(
      { ...config, maximumBytes: 16 },
      runtime(
        vi.fn<typeof fetch>().mockResolvedValue(
          new Response(JSON.stringify(snapshot), {
            status: 200,
            headers: {
              ...headers(),
              'Content-Length': '999',
            },
          }),
        ),
      ),
    )
    await expect(
      oversizedProvider.load(new AbortController().signal),
    ).rejects.toThrow(/response limit/)
  })

  it('does not cache malformed data for a later 304 response', async () => {
    const malformed = {
      ...snapshot,
      records: snapshot.records.map((record, index) =>
        index === 0 ? { ...record, name: '' } : record,
      ),
    }
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(malformed), {
          status: 200,
          headers: headers(),
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 304,
          headers: headers(),
        }),
      )
    const provider = new OrbitalCatalogProvider(
      config,
      runtime(fetchMock),
    )

    await expect(
      provider.load(new AbortController().signal),
    ).rejects.toThrow(/invalid record/)
    await expect(
      provider.load(new AbortController().signal),
    ).rejects.toThrow(/revalidation response is invalid/)
  })

  it('rejects non-success status before requiring success metadata', async () => {
    const provider = new OrbitalCatalogProvider(
      config,
      runtime(
        vi.fn<typeof fetch>().mockResolvedValue(
          new Response('disabled', {
            status: 404,
            headers: { 'Content-Type': 'text/plain' },
          }),
        ),
      ),
    )

    await expect(
      provider.load(new AbortController().signal),
    ).rejects.toMatchObject({
      status: 404,
      message: 'Orbital catalog is not enabled on this deployment',
    })
  })

  it('requires the exact cached ETag on a 304 response', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(snapshot), {
          status: 200,
          headers: headers(),
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 304,
          headers: { ...headers(), ETag: '"different"' },
        }),
      )
    const provider = new OrbitalCatalogProvider(
      config,
      runtime(fetchMock),
    )

    await provider.load(new AbortController().signal)
    await expect(
      provider.load(new AbortController().signal),
    ).rejects.toThrow(/revalidation response is invalid/)
  })

  it('does not cache a response aborted during digest validation', async () => {
    let releaseDigest: () => void = () => undefined
    const digestGate = new Promise<void>((resolve) => {
      releaseDigest = resolve
    })
    const originalDigest = crypto.subtle.digest.bind(crypto.subtle)
    const digestSpy = vi
      .spyOn(crypto.subtle, 'digest')
      .mockImplementation(async (algorithm, data) => {
        await digestGate
        return originalDigest(algorithm, data)
      })
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(snapshot), {
          status: 200,
          headers: headers(),
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 304,
          headers: headers(),
        }),
      )
    const provider = new OrbitalCatalogProvider(
      config,
      runtime(fetchMock),
    )
    const controller = new AbortController()

    try {
      const pending = provider.load(controller.signal)
      await vi.waitFor(() => expect(digestSpy).toHaveBeenCalled())
      controller.abort()
      releaseDigest()
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
      await expect(
        provider.load(new AbortController().signal),
      ).rejects.toThrow(/revalidation response is invalid/)
    } finally {
      digestSpy.mockRestore()
      releaseDigest()
    }
  })
})
