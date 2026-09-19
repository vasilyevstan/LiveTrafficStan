import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AircraftMetadataIdentity } from '../../domain/aircraftMetadata'
import {
  AircraftMetadataProviderError,
  StaticAircraftMetadataProvider,
  type StaticAircraftMetadataProviderConfig,
} from './staticAircraftMetadataProvider'

const baseUrl = '/aircraft-metadata/test-v1'
const identity: AircraftMetadataIdentity = {
  hex: 'ABC123',
  registration: 'ES-ABC',
  aircraftType: 'A320',
}

const config = (
  overrides: Partial<StaticAircraftMetadataProviderConfig> = {},
): StaticAircraftMetadataProviderConfig => ({
  baseUrl,
  timeoutMs: 5_000,
  indexMaximumBytes: 64 * 1_024,
  shardMaximumBytes: 64 * 1_024,
  shardCacheEntries: 2,
  schemaVersion: 1,
  outputVersion: 'test-v1',
  sourceName: 'Fixture aircraft database',
  sourceRepositoryUrl: 'https://example.test/source',
  sourceCommit: 'a'.repeat(40),
  sourcePublishedAt: '2026-09-13T07:35:29Z',
  sourceDatabaseVersion: 1,
  sourceLicenseName: 'ODC-By 1.0',
  sourceLicenseUrl: 'https://example.test/license',
  sourceArchiveSha256: 'b'.repeat(64),
  staleAfterDays: 45,
  futureToleranceHours: 24,
  expectedCounts: {
    projectedTypeRecords: 1,
    shardCount: 1,
  },
  ...overrides,
})

const sha256 = async (bytes: Uint8Array) => {
  const digestBytes = new Uint8Array(bytes.byteLength)
  digestBytes.set(bytes)
  const digest = await crypto.subtle.digest('SHA-256', digestBytes.buffer)
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

const fixture = async (shardText: string, descriptorOverrides = {}) => {
  const shardBytes = new TextEncoder().encode(shardText)
  const shard = {
    path: 'shards/AB.tsv',
    records: shardText.trimEnd().split('\n').length,
    ambiguousRecords: shardText
      .trimEnd()
      .split('\n')
      .filter((line) => line.endsWith('\tA')).length,
    bytes: shardBytes.byteLength,
    gzipBytes: 1,
    sha256: await sha256(shardBytes),
    ...descriptorOverrides,
  }
  const index = {
    schemaVersion: 1,
    outputVersion: 'test-v1',
    source: {
      name: 'Fixture aircraft database',
      repositoryUrl: 'https://example.test/source',
      commit: 'a'.repeat(40),
      publishedAt: '2026-09-13T07:35:29Z',
      databaseVersion: 1,
      licenseName: 'ODC-By 1.0',
      licenseUrl: 'https://example.test/license',
      archiveSha256: 'b'.repeat(64),
    },
    policy: {
      staleAfterDays: 45,
      futureToleranceHours: 24,
      notice: 'Fixture',
    },
    counts: {
      projectedTypeRecords: 1,
      shardCount: 1,
    },
    types: {
      A320: ['AIRBUS A-320', 'L2J', 'M'],
    },
    shards: {
      AB: shard,
    },
  }
  return { index, shardText }
}

const responseFor = (body: string, contentType: string) =>
  new Response(body, {
    status: 200,
    headers: { 'Content-Type': contentType },
  })

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('StaticAircraftMetadataProvider', () => {
  it('loads one index and one shard, verifies registration, and reuses same-prefix caches', async () => {
    const data = await fixture(
      'C123\tES-ABC\tA320\nC124\tES-DEF\tA320\n',
    )
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const value = String(url)
      return value.endsWith('index.json')
        ? responseFor(JSON.stringify(data.index), 'application/json')
        : responseFor(data.shardText, 'text/tab-separated-values')
    })
    vi.stubGlobal('fetch', fetchMock)
    const provider = new StaticAircraftMetadataProvider(config())

    await expect(
      provider.lookup(identity, new AbortController().signal),
    ).resolves.toMatchObject({
      kind: 'available',
      metadata: {
        databaseRegistration: 'ES-ABC',
        typeCode: 'A320',
        modelDescription: 'AIRBUS A-320',
        configuration: 'L2J',
        wakeCategory: 'M',
        confidence: 'registration-verified',
      },
    })
    await expect(
      provider.lookup(
        {
          hex: 'ABC124',
          registration: 'ES-DEF',
          aircraftType: 'A320',
        },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ kind: 'available' })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      `${baseUrl}/index.json`,
      `${baseUrl}/shards/AB.tsv`,
    ])
  })

  it('labels an exact ICAO24 match without live registration', async () => {
    const data = await fixture('C123\tES-ABC\tA320\n')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) =>
        String(url).endsWith('index.json')
          ? responseFor(JSON.stringify(data.index), 'application/json')
          : responseFor(data.shardText, 'text/plain'),
      ),
    )
    const provider = new StaticAircraftMetadataProvider(config())

    await expect(
      provider.lookup(
        { hex: 'ABC123', aircraftType: 'A320' },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      kind: 'available',
      metadata: {
        databaseRegistration: 'ES-ABC',
        confidence: 'icao24-only',
      },
    })
  })

  it('returns a missing-prefix result without requesting a shard', async () => {
    const data = await fixture('C123\tES-ABC\tA320\n')
    const fetchMock = vi.fn(async () =>
      responseFor(JSON.stringify(data.index), 'application/json'),
    )
    vi.stubGlobal('fetch', fetchMock)
    const provider = new StaticAircraftMetadataProvider(config())

    await expect(
      provider.lookup(
        { hex: 'CD0001' },
        new AbortController().signal,
      ),
    ).resolves.toEqual({
      kind: 'unavailable',
      reason: 'not-found',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps ambiguity, registration conflicts, type conflicts, and misses distinct', async () => {
    const data = await fixture(
      'C123\tES-ABC\tA320\nC124\tES-DUP\tA320\tA\n',
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) =>
        String(url).endsWith('index.json')
          ? responseFor(JSON.stringify(data.index), 'application/json')
          : responseFor(data.shardText, 'text/plain'),
      ),
    )
    const provider = new StaticAircraftMetadataProvider(config())

    await expect(
      provider.lookup(
        { ...identity, registration: 'ES-WRONG' },
        new AbortController().signal,
      ),
    ).resolves.toEqual({
      kind: 'unavailable',
      reason: 'registration-conflict',
    })
    await expect(
      provider.lookup(
        { ...identity, aircraftType: 'H125' },
        new AbortController().signal,
      ),
    ).resolves.toEqual({
      kind: 'unavailable',
      reason: 'type-conflict',
    })
    await expect(
      provider.lookup(
        {
          hex: 'ABC124',
          registration: 'ES-DUP',
          aircraftType: 'A320',
        },
        new AbortController().signal,
      ),
    ).resolves.toEqual({
      kind: 'unavailable',
      reason: 'ambiguous',
    })
    await expect(
      provider.lookup(
        { hex: 'ABC999' },
        new AbortController().signal,
      ),
    ).resolves.toEqual({
      kind: 'unavailable',
      reason: 'not-found',
    })
  })

  it('does not cache a malformed or partial shard', async () => {
    const data = await fixture('C123\tES-ABC\tA320')
    const fetchMock = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith('index.json')
        ? responseFor(JSON.stringify(data.index), 'application/json')
        : responseFor(data.shardText, 'text/plain'),
    )
    vi.stubGlobal('fetch', fetchMock)
    const provider = new StaticAircraftMetadataProvider(config())

    await expect(
      provider.lookup(identity, new AbortController().signal),
    ).rejects.toThrow(/incomplete/)
    await expect(
      provider.lookup(identity, new AbortController().signal),
    ).rejects.toThrow(/incomplete/)

    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('evicts the least recently used fulfilled shard at the configured bound', async () => {
    const prefixes = ['AB', 'CD', 'EF']
    const shardTexts = Object.fromEntries(
      prefixes.map((prefix, index) => [
        prefix,
        `000${index}\tES-${prefix}\tA320\n`,
      ]),
    )
    const shards = Object.fromEntries(
      await Promise.all(
        prefixes.map(async (prefix) => {
          const bytes = new TextEncoder().encode(shardTexts[prefix])
          return [
            prefix,
            {
              path: `shards/${prefix}.tsv`,
              records: 1,
              ambiguousRecords: 0,
              bytes: bytes.byteLength,
              gzipBytes: 1,
              sha256: await sha256(bytes),
            },
          ]
        }),
      ),
    )
    const base = await fixture('C123\tES-ABC\tA320\n')
    const index = {
      ...base.index,
      counts: {
        projectedTypeRecords: 1,
        shardCount: 3,
      },
      shards,
    }
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const value = String(url)
      if (value.endsWith('index.json')) {
        return responseFor(JSON.stringify(index), 'application/json')
      }
      const prefix = value.match(/\/([A-F0-9]{2})\.tsv$/)?.[1]
      if (!prefix) throw new Error(`Unexpected URL ${value}`)
      return responseFor(shardTexts[prefix], 'text/plain')
    })
    vi.stubGlobal('fetch', fetchMock)
    const provider = new StaticAircraftMetadataProvider(
      config({
        shardCacheEntries: 2,
        expectedCounts: {
          projectedTypeRecords: 1,
          shardCount: 3,
        },
      }),
    )

    for (const hex of ['AB0000', 'CD0001', 'EF0002', 'AB0000']) {
      await expect(
        provider.lookup({ hex }, new AbortController().signal),
      ).resolves.toMatchObject({ kind: 'available' })
    }

    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('enforces streamed byte caps before parsing', async () => {
    const data = await fixture('C123\tES-ABC\tA320\n')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) =>
        String(url).endsWith('index.json')
          ? responseFor(JSON.stringify(data.index), 'application/json')
          : responseFor(data.shardText, 'text/plain'),
      ),
    )
    const provider = new StaticAircraftMetadataProvider(
      config({ shardMaximumBytes: 4 }),
    )

    await expect(
      provider.lookup(identity, new AbortController().signal),
    ).rejects.toThrow(/4-byte limit/)
  })

  it('uses one deadline across index and shard work', async () => {
    vi.useFakeTimers()
    const data = await fixture('C123\tES-ABC\tA320\n')
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (
          url: string | URL | Request,
          options?: RequestInit,
        ) => {
          if (String(url).endsWith('index.json')) {
            return responseFor(
              JSON.stringify(data.index),
              'application/json',
            )
          }
          return await new Promise<Response>((_resolve, reject) => {
            options?.signal?.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true },
            )
          })
        },
      ),
    )
    const provider = new StaticAircraftMetadataProvider(
      config({ timeoutMs: 100 }),
    )
    const lookup = provider.lookup(
      identity,
      new AbortController().signal,
    )
    const expectation = expect(lookup).rejects.toEqual(
      new AircraftMetadataProviderError(
        'Aircraft metadata lookup timed out',
      ),
    )

    await vi.advanceTimersByTimeAsync(100)
    await expectation
  })

  it('does not cache a rejected index promise', async () => {
    const data = await fixture('C123\tES-ABC\tA320\n')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseFor('{', 'application/json'))
      .mockResolvedValueOnce(
        responseFor(JSON.stringify(data.index), 'application/json'),
      )
      .mockResolvedValueOnce(responseFor(data.shardText, 'text/plain'))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new StaticAircraftMetadataProvider(config())

    await expect(
      provider.lookup(identity, new AbortController().signal),
    ).rejects.toThrow(/not valid JSON/)
    await expect(
      provider.lookup(identity, new AbortController().signal),
    ).resolves.toMatchObject({ kind: 'available' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
