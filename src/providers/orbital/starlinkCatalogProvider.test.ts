import { describe, expect, it, vi } from 'vitest'
import { createAppConfig } from '../../config/appConfig'
import type { StarlinkOrbitalCatalogSnapshot } from '../../domain/orbital'
import type { OrbitalCatalogRuntime } from './orbitalCatalogProvider'
import {
  StarlinkCatalogProvider,
  starlinkCatalogDigestInput,
  type StarlinkCatalogRecordPayload,
  type StarlinkCatalogSnapshotPayload,
} from './starlinkCatalogProvider'

const config = createAppConfig({}).starlink

const record = (id: number): StarlinkCatalogRecordPayload => ({
  noradCatalogId: String(id),
  name: `STARLINK ${id}`,
  internationalDesignator: `2026-${String(id % 1_000).padStart(3, '0')}A`,
  objectType: 'PAY',
  epoch: '2026-10-01T18:45:00.123456Z',
  meanMotion: 15.2,
  eccentricity: 0.001,
  inclination: 53,
  rightAscensionOfAscendingNode: id % 360,
  argumentOfPericenter: 30,
  meanAnomaly: 40,
  ephemerisType: 0,
  classificationType: 'U',
  elementSetNumber: 999,
  revolutionAtEpoch: 123,
  bstar: 0.0001,
  meanMotionDot: 0.00001,
  meanMotionDdot: 0,
  displayOrder: id,
})

const digest = async (value: string) => {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

const signed = async (
  value: Omit<StarlinkCatalogSnapshotPayload, 'digest'>,
): Promise<StarlinkCatalogSnapshotPayload> => ({
  ...value,
  digest: await digest(
    JSON.stringify(starlinkCatalogDigestInput(value)),
  ),
})

const payload = async (
  overrides: Partial<
    Omit<StarlinkCatalogSnapshotPayload, 'digest'>
  > = {},
) => {
  const records = Array.from(
    { length: config.sampleLimit },
    (_, index) => record(70_001 + index),
  )
  return signed({
    schemaVersion: config.schemaVersion,
    sourceContractVersion: config.sourceContractVersion,
    catalogId: config.catalogId,
    sources: {
      gp: {
        url: config.gpSourceUrl,
        retrievedAt: '2026-10-01T19:45:01.000Z',
        recordCount: 11_127,
        decodedBytes: 4_700_510,
        sha256: 'a'.repeat(64),
      },
      satcat: {
        url: config.satcatSourceUrl,
        retrievedAt: '2026-10-01T19:45:02.000Z',
        recordCount: 11_129,
        decodedBytes: 3_684_991,
        sha256: 'b'.repeat(64),
      },
    },
    populationCount: 11_127,
    extraSatcatCount: 2,
    sampleLimit: config.sampleLimit,
    sampleAlgorithm: config.sampleAlgorithm,
    recordCount: records.length,
    records,
    publishedAt: '2026-10-01T19:45:03.000Z',
    ...overrides,
  })
}

const headers = (value: StarlinkCatalogSnapshotPayload) => ({
  'Content-Type': config.acceptMediaType,
  ETag: `W/"${value.digest}"`,
  'X-LiveTrafficStan-Starlink-Digest': value.digest,
  'X-LiveTrafficStan-Starlink-Published-At': value.publishedAt,
  'X-LiveTrafficStan-Starlink-Schema': String(value.schemaVersion),
  'X-LiveTrafficStan-Starlink-Source': 'bootstrap',
  'X-LiveTrafficStan-Served-At': '2026-10-01T19:45:04.000Z',
})

const runtime = (
  fetchImplementation: typeof fetch,
): OrbitalCatalogRuntime => {
  let wall = Date.parse('2026-10-01T19:45:03.900Z')
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

describe('StarlinkCatalogProvider', () => {
  it('strictly maps source metadata and conditionally revalidates one literal same-origin request', async () => {
    const value = await payload()
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(`${JSON.stringify(value)}\n`, {
          status: 200,
          headers: headers(value),
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 304,
          headers: headers(value),
        }),
      )
    const provider = new StarlinkCatalogProvider(
      config,
      runtime(fetchMock),
    )

    const first = await provider.load(new AbortController().signal)
    const second = await provider.load(new AbortController().signal)
    const snapshot = first.snapshot as StarlinkOrbitalCatalogSnapshot

    expect(second.snapshot).toBe(first.snapshot)
    expect(first.source).toBe('bootstrap')
    expect(snapshot).toMatchObject({
      owner: 'starlink',
      catalogId: 'celestrak-starlink-sample-v1',
      retrievedAt: '2026-10-01T19:45:02.000Z',
      recordCount: 150,
      sha256: value.digest,
      starlink: {
        populationCount: 11_127,
        extraSatcatCount: 2,
        sampleLimit: 150,
        sampleAlgorithm: 'inclination-raan-systematic-v1',
        sources: {
          gp: {
            retrievedAt: '2026-10-01T19:45:01.000Z',
            recordCount: 11_127,
            decodedBytes: 4_700_510,
          },
          satcat: {
            retrievedAt: '2026-10-01T19:45:02.000Z',
            recordCount: 11_129,
            decodedBytes: 3_684_991,
          },
        },
      },
    })
    expect(snapshot.records[0]?.sourceGroups).toEqual(['starlink'])
    expect(snapshot.sources).toEqual([
      {
        group: 'starlink',
        gpSourceUrl: config.gpSourceUrl,
        satcatSourceUrl: config.satcatSourceUrl,
        gpRecordCount: 11_127,
        satcatRecordCount: 11_129,
      },
    ])
    expect(
      new TextEncoder().encode(JSON.stringify(value)).byteLength,
    ).toBeLessThanOrEqual(config.maximumBytes)

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/orbits/starlink',
      expect.objectContaining({
        method: 'GET',
        cache: 'no-cache',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
      }),
    )
    const firstInit = fetchMock.mock.calls[0]?.[1]
    expect(firstInit).not.toHaveProperty('referrer')
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('?')
    const firstHeaders = new Headers(firstInit?.headers)
    const secondHeaders = new Headers(
      fetchMock.mock.calls[1]?.[1]?.headers,
    )
    expect(firstHeaders.get('Accept')).toBe(config.acceptMediaType)
    expect(secondHeaders.get('If-None-Match')).toBe(
      `W/"${value.digest}"`,
    )
  })

  it('rejects unknown fields, malformed records, source count conflicts, and digest changes', async () => {
    const valid = await payload()
    const unknown = { ...valid, unexpected: true }
    const malformedRecord = await signed({
      ...valid,
      records: valid.records.map((candidate, index) =>
        index === 0
          ? ({
              ...candidate,
              unexpected: true,
            } as unknown as StarlinkCatalogRecordPayload)
          : candidate,
      ),
    })
    const conflictingCounts = await signed({
      ...valid,
      sources: {
        ...valid.sources,
        gp: { ...valid.sources.gp, recordCount: 11_126 },
      },
    })
    const invalidDigest = {
      ...valid,
      digest: 'f'.repeat(64),
    }
    const invertedSourceClocks = await signed({
      ...valid,
      sources: {
        ...valid.sources,
        gp: {
          ...valid.sources.gp,
          retrievedAt: '2026-10-01T19:45:03.000Z',
        },
      },
      publishedAt: '2026-10-01T19:45:04.000Z',
    })

    for (const [candidate, message] of [
      [unknown, /schema is invalid/],
      [malformedRecord, /invalid record/],
      [conflictingCounts, /source counts are invalid/],
      [invalidDigest, /digest is invalid/],
      [invertedSourceClocks, /schema is invalid/],
    ] as const) {
      const provider = new StarlinkCatalogProvider(
        config,
        runtime(
          vi.fn<typeof fetch>().mockResolvedValue(
            new Response(JSON.stringify(candidate), {
              status: 200,
              headers: headers(candidate),
            }),
          ),
        ),
      )
      await expect(
        provider.load(new AbortController().signal),
      ).rejects.toThrow(message)
    }
  })

  it('enforces exact media type and the streamed 256 KiB response cap', async () => {
    const value = await payload()
    const invalidMediaProvider = new StarlinkCatalogProvider(
      config,
      runtime(
        vi.fn<typeof fetch>().mockResolvedValue(
          new Response(JSON.stringify(value), {
            status: 200,
            headers: {
              ...headers(value),
              'Content-Type': 'application/json',
            },
          }),
        ),
      ),
    )
    await expect(
      invalidMediaProvider.load(new AbortController().signal),
    ).rejects.toThrow(/invalid content type/)

    const oversizedProvider = new StarlinkCatalogProvider(
      config,
      runtime(
        vi.fn<typeof fetch>().mockResolvedValue(
          new Response(JSON.stringify(value), {
            status: 200,
            headers: {
              ...headers(value),
              'Content-Length': String(config.maximumBytes + 1),
            },
          }),
        ),
      ),
    )
    await expect(
      oversizedProvider.load(new AbortController().signal),
    ).rejects.toThrow(/response limit/)
  })

  it('does not cache a malformed response for a later 304', async () => {
    const value = await payload()
    const malformed = {
      ...value,
      records: value.records.map((candidate, index) =>
        index === 0 ? { ...candidate, displayOrder: 1 } : candidate,
      ),
    }
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(malformed), {
          status: 200,
          headers: headers(value),
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 304,
          headers: headers(value),
        }),
      )
    const provider = new StarlinkCatalogProvider(
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

  it('preserves disabled and Retry-After provider lifecycle signals', async () => {
    const disabledProvider = new StarlinkCatalogProvider(
      config,
      runtime(
        vi.fn<typeof fetch>().mockResolvedValue(
          new Response('disabled', { status: 404 }),
        ),
      ),
    )
    await expect(
      disabledProvider.load(new AbortController().signal),
    ).rejects.toMatchObject({
      status: 404,
      message: 'Starlink catalog is not enabled on this deployment',
    })

    const limitedProvider = new StarlinkCatalogProvider(
      config,
      runtime(
        vi.fn<typeof fetch>().mockResolvedValue(
          new Response('limited', {
            status: 429,
            headers: { 'Retry-After': '120' },
          }),
        ),
      ),
    )
    await expect(
      limitedProvider.load(new AbortController().signal),
    ).rejects.toMatchObject({
      status: 429,
      retryAfterMs: 120_000,
    })
  })
})
