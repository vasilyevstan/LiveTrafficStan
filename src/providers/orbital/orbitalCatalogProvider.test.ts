import { describe, expect, it, vi } from 'vitest'
import snapshotFixture from '../../../public/orbital-data/curated-2026-09-30-v1/catalog.json'
import {
  orbitalSnapshotDigestInput,
  type OrbitalCatalogSnapshot,
  type OrbitalSourceGroup,
} from '../../domain/orbital'
import {
  OrbitalCatalogProvider,
  type OrbitalCatalogProviderConfig,
  type OrbitalCatalogRuntime,
} from './orbitalCatalogProvider'

const snapshot = snapshotFixture as OrbitalCatalogSnapshot

const config: OrbitalCatalogProviderConfig = {
  endpointPath: '/api/orbits/catalog',
  acceptMediaType:
    'application/vnd.livetrafficstan.orbital-catalog+json;version=2',
  schemaVersion: snapshot.schemaVersion,
  sourceContractVersion: snapshot.sourceContractVersion,
  catalogId: snapshot.catalogId,
  sources: snapshot.sources.map(
    ({ group, gpSourceUrl, satcatSourceUrl }) => ({
      group: group as Exclude<OrbitalSourceGroup, 'starlink'>,
      gpSourceUrl,
      satcatSourceUrl,
    }),
  ),
  maximumBytes: 512 * 1_024,
  maximumRecords: 512,
  timeoutMs: 5_000,
}

const headers = (
  value: OrbitalCatalogSnapshot = snapshot,
) => ({
  'Content-Type': 'application/json; charset=utf-8',
  ETag: `W/"${value.sha256}"`,
  Vary: 'Accept',
  'X-LiveTrafficStan-Orbital-Source': 'bootstrap',
  'X-LiveTrafficStan-Orbital-Retrieved-At': value.retrievedAt,
  'X-LiveTrafficStan-Orbital-Schema': String(value.schemaVersion),
  'X-LiveTrafficStan-Orbital-Sha256': value.sha256,
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

const digest = async (value: string) => {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

const hardCapSnapshot = async (): Promise<OrbitalCatalogSnapshot> => {
  const maximumId = Math.max(
    ...snapshot.records.map(({ noradCatalogId }) =>
      Number(noradCatalogId),
    ),
  )
  const added = Array.from(
    { length: 512 - snapshot.records.length },
    (_, index) => {
      const source =
        snapshot.records[index % snapshot.records.length]
      const noradCatalogId = String(maximumId + index + 1)
      const sourceIndex = snapshot.sources.findIndex(
        ({ group }) => group === source.sourceGroups[0],
      )
      return {
        ...source,
        noradCatalogId,
        name: `HARD CAP OBJECT ${noradCatalogId}`,
        displayOrder:
          sourceIndex * 1_000_000_000 +
          Number(noradCatalogId),
      }
    },
  )
  const records = [...snapshot.records, ...added]
  const sources = snapshot.sources.map((source) => {
    const count = records.filter((record) =>
      record.sourceGroups.includes(source.group),
    ).length
    return {
      ...source,
      gpRecordCount: count,
      satcatRecordCount: Math.max(source.satcatRecordCount, count),
    }
  })
  const withoutDigest: Omit<OrbitalCatalogSnapshot, 'sha256'> = {
    ...snapshot,
    sources,
    recordCount: records.length,
    records,
  }
  return {
    ...withoutDigest,
    sha256: await digest(
      JSON.stringify(orbitalSnapshotDigestInput(withoutDigest)),
    ),
  }
}

const emptyDesignatorSnapshot =
  async (): Promise<OrbitalCatalogSnapshot> => {
    const records = snapshot.records.map((record, index) =>
      index === 0
        ? { ...record, internationalDesignator: '' }
        : record,
    )
    const withoutDigest: Omit<OrbitalCatalogSnapshot, 'sha256'> = {
      ...snapshot,
      records,
    }
    return {
      ...withoutDigest,
      sha256: await digest(
        JSON.stringify(orbitalSnapshotDigestInput(withoutDigest)),
      ),
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
    const firstHeaders = new Headers(
      fetchMock.mock.calls[0][1]?.headers,
    )
    expect(firstHeaders.get('Accept')).toBe(config.acceptMediaType)
    expect(secondHeaders.get('Accept')).toBe(config.acceptMediaType)
    expect(secondHeaders.get('If-None-Match')).toBe(
      `W/"${snapshot.sha256}"`,
    )
  })

  it('streams and validates the complete 512-record hard-cap snapshot', async () => {
    const hardCap = await hardCapSnapshot()
    const bytes = new TextEncoder().encode(JSON.stringify(hardCap))
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += 16_384) {
          controller.enqueue(bytes.slice(offset, offset + 16_384))
        }
        controller.close()
      },
    })
    const responseHeaders = {
      ...headers(),
      ETag: `W/"${hardCap.sha256}"`,
      'X-LiveTrafficStan-Orbital-Retrieved-At': hardCap.retrievedAt,
      'X-LiveTrafficStan-Orbital-Sha256': hardCap.sha256,
    }
    const provider = new OrbitalCatalogProvider(
      config,
      runtime(
        vi.fn<typeof fetch>().mockResolvedValue(
          new Response(body, {
            status: 200,
            headers: responseHeaders,
          }),
        ),
      ),
    )

    const result = await provider.load(new AbortController().signal)

    expect(result.snapshot.recordCount).toBe(512)
    expect(result.snapshot.records.at(-1)?.name).toMatch(
      /^HARD CAP OBJECT /,
    )
    expect(bytes.byteLength).toBeLessThanOrEqual(config.maximumBytes)
  })

  it('retains an empty designator as explicitly unavailable data', async () => {
    const value = await emptyDesignatorSnapshot()
    const provider = new OrbitalCatalogProvider(
      config,
      runtime(
        vi.fn<typeof fetch>().mockResolvedValue(
          new Response(JSON.stringify(value), {
            status: 200,
            headers: headers(value),
          }),
        ),
      ),
    )

    const result = await provider.load(new AbortController().signal)

    expect(result.snapshot.records[0]?.internationalDesignator).toBe('')
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

  it('does not admit Starlink membership into the curated contract', async () => {
    const invalid = {
      ...snapshot,
      records: snapshot.records.map((record, index) =>
        index === 0
          ? { ...record, sourceGroups: ['starlink'] }
          : record,
      ),
    }
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
    ).rejects.toThrow(/invalid record/)
  })

  it('rejects invalid headers, partial responses, and oversized bodies', async () => {
    const withoutVary = { ...headers() }
    Reflect.deleteProperty(withoutVary, 'Vary')
    const missingVaryProvider = new OrbitalCatalogProvider(
      config,
      runtime(
        vi.fn<typeof fetch>().mockResolvedValue(
          new Response(JSON.stringify(snapshot), {
            status: 200,
            headers: withoutVary,
          }),
        ),
      ),
    )
    await expect(
      missingVaryProvider.load(new AbortController().signal),
    ).rejects.toThrow(/content negotiation is invalid/)

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
