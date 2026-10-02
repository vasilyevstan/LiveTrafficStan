import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEPLOYMENT_PROPAGATION_RETRY_DELAYS_MS,
  ORBITAL_SCHEMA2_NEGOTIATION_ACCEPT,
  PRIVATE_RELAY_MAX_ATTEMPTS,
  PRIVATE_RELAY_MAX_ADMISSION_WAIT_MS,
  PRIVATE_RELAY_MAX_RETRY_AFTER_SECONDS,
  PRIVATE_RELAY_SMOKE_TIMEOUT_MS,
  SAME_ORIGIN_SMOKE_FETCH_INIT,
  STARLINK_CATALOG_MEDIA_TYPE,
  classifyAircraftProxyStatus,
  deriveOrbitalStaticAssetPaths,
  fetchPrivateRelayWithRetry,
  hasOneYearImmutableCacheControl,
  isRetryableStaticAssetStatus,
  readOptionalJson,
  resolveTargetOrbitalSmokeContract,
  resolveTargetStarlinkSmokeContract,
  verifyTargetOrbitalCatalog,
  verifyTargetStarlinkCatalog,
  waitForExpectedWorkerRelease,
} from './smoke-policy.mjs'

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const smokeScript = readFileSync(
  join(repositoryRoot, 'scripts/smoke-production.mjs'),
  'utf8',
)
const smokePolicyScript = readFileSync(
  join(repositoryRoot, 'scripts/smoke-policy.mjs'),
  'utf8',
)

const releaseSha = 'c'.repeat(40)

const orbitalPayload = ({
  schemaVersion,
  sourceContractVersion = schemaVersion,
  digestCharacter,
  ...overrides
}) => ({
  schemaVersion,
  sourceContractVersion,
  retrievedAt: '2026-09-30T18:25:59.094Z',
  recordCount: 1,
  records: [{ noradCatalogId: '25544' }],
  sha256: digestCharacter.repeat(64),
  ...overrides,
})

const createTargetContractFixture = (mode) => {
  if (mode === 'disabled') return { target: undefined }

  const schemaVersion = mode === 'schema1-only' ? 1 : 2
  const validateSnapshot = vi.fn(async (value) => value)
  const target = {
    ORBITAL_BOOTSTRAP_PATH:
      schemaVersion === 1
        ? '/orbital-data/v1/visual-catalog.json'
        : '/orbital-data/curated-2026-09-30-v1/catalog.json',
    ORBITAL_CATALOG_SCHEMA_VERSION: schemaVersion,
    ORBITAL_MAX_SNAPSHOT_BYTES: 512 * 1_024,
    ORBITAL_SOURCE_CONTRACT_VERSION: schemaVersion,
    validateOrbitalCatalogSnapshot: validateSnapshot,
  }
  const fixture = { target, validateSnapshot }
  if (mode === 'dual-representation') {
    fixture.validateLegacySnapshot = vi.fn(async (value) => value)
    Object.assign(target, {
      ORBITAL_CATALOG_V2_ACCEPT:
        ORBITAL_SCHEMA2_NEGOTIATION_ACCEPT,
      validateLegacyOrbitalCatalogSnapshot:
        fixture.validateLegacySnapshot,
    })
  }
  return fixture
}

const createOrbitalRouteFixture = (mode) => {
  const requests = []
  const defaultPayload =
    mode === 'schema1-only' || mode === 'dual-representation'
      ? orbitalPayload({
          schemaVersion: 1,
          digestCharacter: '1',
        })
      : orbitalPayload({
          schemaVersion: 2,
          digestCharacter: '2',
        })
  const schema2Payload = orbitalPayload({
    schemaVersion: 2,
    digestCharacter: '2',
    sources: [{ group: 'visual', gpRecordCount: 1 }],
  })

  return {
    requests,
    fetchResponse: vi.fn(async (input, init = {}) => {
      const url = new URL(input)
      const headers = new Headers(init.headers)
      const method = init.method ?? 'GET'
      requests.push({
        accept: headers.get('accept'),
        ifNoneMatch: headers.get('if-none-match'),
        method,
        url: url.toString(),
      })

      if (mode === 'disabled') {
        return new Response('Not found', { status: 404 })
      }
      if (url.search) {
        return new Response('Unsupported query', { status: 400 })
      }
      if (method === 'POST') {
        return new Response('Method not allowed', { status: 405 })
      }

      const negotiated =
        mode === 'dual-representation' &&
        headers.get('accept') ===
          ORBITAL_SCHEMA2_NEGOTIATION_ACCEPT
      const payload = negotiated ? schema2Payload : defaultPayload
      const weakEtag = mode !== 'schema1-only'
      const etag = `${weakEtag ? 'W/' : ''}"${payload.sha256}"`
      const responseHeaders = {
        'Cache-Control': 'public, max-age=300, must-revalidate',
        'Content-Type': 'application/json; charset=utf-8',
        ETag: etag,
        'X-Content-Type-Options': 'nosniff',
        'X-LiveTrafficStan-Orbital-Schema': String(
          payload.schemaVersion,
        ),
        'X-LiveTrafficStan-Orbital-Sha256': payload.sha256,
        'X-LiveTrafficStan-Orbital-Source': 'kv',
        'X-LiveTrafficStan-Release': releaseSha,
      }
      if (mode === 'dual-representation') {
        responseHeaders.Vary = 'Accept'
      }
      if (headers.get('if-none-match') === etag) {
        return new Response(null, {
          status: 304,
          headers: responseHeaders,
        })
      }
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: responseHeaders,
      })
    }),
  }
}

describe('production smoke policy', () => {
  const workerProbe = (releaseSha, overrides = {}) =>
    new Response(null, {
      status: overrides.status ?? 400,
      headers: {
        'Cache-Control': overrides.cacheControl ?? 'no-store',
        ...(releaseSha
          ? { 'X-LiveTrafficStan-Release': releaseSha }
          : {}),
        ...(overrides.allowOrigin
          ? { 'Access-Control-Allow-Origin': '*' }
          : {}),
      },
    })

  it('bounds deployment propagation retries', () => {
    expect(DEPLOYMENT_PROPAGATION_RETRY_DELAYS_MS).toEqual([
      0,
      1_000,
      2_000,
      4_000,
      8_000,
      15_000,
      30_000,
    ])
    expect(
      DEPLOYMENT_PROPAGATION_RETRY_DELAYS_MS.reduce(
        (total, delayMs) => total + delayMs,
        0,
      ),
    ).toBe(60_000)
    expect(isRetryableStaticAssetStatus(404)).toBe(true)
    expect(isRetryableStaticAssetStatus(503)).toBe(true)
    expect(isRetryableStaticAssetStatus(403)).toBe(false)
    expect(smokeScript).toContain(
      "const remoteIndex = await remoteBytes('/', localIndex)",
    )
    expect(smokeScript).toContain(
      'if (sha256(bytes) === expectedHash)',
    )
  })

  it('waits on a local Worker response before the single provider request', () => {
    const releaseProbeIndex = smokeScript.indexOf(
      "const releaseProbePath = '/api/aircraft/v2/point/91/24.754/11'",
    )
    const providerRequestIndex = smokeScript.indexOf(
      "const validPath = '/api/aircraft/v2/point/59.437/24.754/11'",
    )

    expect(releaseProbeIndex).toBeGreaterThan(-1)
    expect(providerRequestIndex).toBeGreaterThan(releaseProbeIndex)
    expect(smokeScript).toContain(
      "response.headers.get('x-livetrafficstan-release') === expectedReleaseSha",
    )
    expect(smokeScript).toContain('await waitForWorkerRelease()')
  })

  it('recovers from a transient canonical stale Worker release', async () => {
    const expectedReleaseSha = 'b'.repeat(40)
    const responses = [
      workerProbe('a'.repeat(40)),
      workerProbe(expectedReleaseSha),
    ]
    const waits = []
    let fetches = 0

    await expect(
      waitForExpectedWorkerRelease({
        fetchProbe: async () => responses[fetches++],
        expectedReleaseSha,
        retryDelaysMs: [0, 1_000],
        wait: async (delayMs) => waits.push(delayMs),
      }),
    ).resolves.toBeUndefined()

    expect(fetches).toBe(2)
    expect(waits).toEqual([1_000])
  })

  it('fails after the bounded Worker propagation window', async () => {
    const staleRelease = workerProbe('a'.repeat(40))
    let fetches = 0

    await expect(
      waitForExpectedWorkerRelease({
        fetchProbe: async () => {
          fetches += 1
          return staleRelease.clone()
        },
        expectedReleaseSha: 'b'.repeat(40),
        retryDelaysMs: [0, 1, 2],
        wait: async () => undefined,
      }),
    ).rejects.toThrow(
      'Worker release SHA does not match the deployed source',
    )
    expect(fetches).toBe(3)
  })

  it('fails immediately on malformed or unsafe Worker probes', async () => {
    let fetches = 0
    await expect(
      waitForExpectedWorkerRelease({
        fetchProbe: async () => {
          fetches += 1
          return workerProbe(undefined)
        },
        expectedReleaseSha: 'b'.repeat(40),
        retryDelaysMs: [0, 1],
        wait: async () => undefined,
      }),
    ).rejects.toThrow('Worker release SHA header is missing or malformed')
    expect(fetches).toBe(1)

    await expect(
      waitForExpectedWorkerRelease({
        fetchProbe: async () =>
          workerProbe('a'.repeat(40), { status: 503 }),
        expectedReleaseSha: 'b'.repeat(40),
        retryDelaysMs: [0, 1],
        wait: async () => undefined,
      }),
    ).rejects.toThrow('Invalid aircraft coordinates were not rejected')
  })

  it('supports a browser-origin ADSB.lol delivery smoke', () => {
    expect(smokeScript).toContain(
      "aircraftDelivery = 'worker-proxy'",
    )
    expect(smokeScript).toContain(
      "aircraftDelivery === 'adsb-lol-direct'",
    )
    expect(smokeScript).toContain(
      "aircraftDelivery === 'oci-private-relay'",
    )
    expect(smokeScript).toContain(
      "new URL(\n      '/v2/point/59.437/24.754/11',\n      'https://api.adsb.lol',",
    )
    expect(smokeScript).toContain(
      "'Direct aircraft provider did not allow the deployed origin'",
    )
    expect(smokeScript).toContain("redirect: 'error'")
    expect(smokeScript).toContain("cache: 'no-store'")
    expect(smokeScript).toContain("credentials: 'omit'")
    expect(smokeScript).toContain(
      'body.byteLength <= MAX_AIRCRAFT_RESPONSE_BYTES',
    )
  })

  it('distinguishes provider throttling from proxy regressions', () => {
    expect(classifyAircraftProxyStatus(200)).toBe('available')
    expect(classifyAircraftProxyStatus(429)).toBe(
      'provider-throttled',
    )
    expect(classifyAircraftProxyStatus(403)).toBe('failure')
    expect(classifyAircraftProxyStatus(502)).toBe('failure')
  })

  it('bounds private relay admission retries', () => {
    expect(PRIVATE_RELAY_MAX_ATTEMPTS).toBe(12)
    expect(PRIVATE_RELAY_MAX_RETRY_AFTER_SECONDS).toBe(30)
    expect(PRIVATE_RELAY_MAX_ADMISSION_WAIT_MS).toBe(330_000)
    expect(PRIVATE_RELAY_SMOKE_TIMEOUT_MS).toBe(540_000)
    expect(SAME_ORIGIN_SMOKE_FETCH_INIT).toEqual({
      redirect: 'manual',
      cache: 'no-store',
      credentials: 'omit',
    })
  })

  it('recovers after bounded private relay admission guidance', async () => {
    const expectedReleaseSha = 'b'.repeat(40)
    const admissionHeaders = (retryAfter) => ({
      'Cache-Control': 'no-store',
      'Retry-After': retryAfter,
      'X-LiveTrafficStan-Release': expectedReleaseSha,
      'X-LiveTrafficStan-Relay-Status': 'admission',
    })
    const responses = [
      new Response(null, {
        status: 503,
        headers: admissionHeaders('20'),
      }),
      new Response(null, {
        status: 503,
        headers: admissionHeaders('3'),
      }),
      new Response('{"ac":[]}', { status: 200 }),
    ]
    const waits = []
    let fetches = 0

    const response = await fetchPrivateRelayWithRetry({
      fetchRelay: async () => responses[fetches++],
      expectedReleaseSha,
      wait: async (delayMs) => waits.push(delayMs),
    })

    expect(response.status).toBe(200)
    expect(fetches).toBe(3)
    expect(waits).toEqual([20_000, 3_000])
  })

  it('fails closed when private relay admission never clears', async () => {
    const expectedReleaseSha = 'b'.repeat(40)
    let fetches = 0
    const waits = []

    await expect(
      fetchPrivateRelayWithRetry({
        fetchRelay: async () => {
          fetches += 1
          return new Response(null, {
            status: 503,
            headers: {
              'Cache-Control': 'no-store',
              'Retry-After': '1',
              'X-LiveTrafficStan-Release': expectedReleaseSha,
              'X-LiveTrafficStan-Relay-Status': 'admission',
            },
          })
        },
        expectedReleaseSha,
        maxAttempts: 3,
        wait: async (delayMs) => waits.push(delayMs),
      }),
    ).rejects.toThrow(
      'Private aircraft relay remained unavailable after bounded retries',
    )
    expect(fetches).toBe(3)
    expect(waits).toEqual([1_000, 1_000])
  })

  it('rejects malformed private relay guidance immediately', async () => {
    const expectedReleaseSha = 'b'.repeat(40)
    await expect(
      fetchPrivateRelayWithRetry({
        fetchRelay: async () =>
          new Response(null, {
            status: 503,
            headers: {
              'Cache-Control': 'no-store',
              'Retry-After': 'later',
              'X-LiveTrafficStan-Release': expectedReleaseSha,
              'X-LiveTrafficStan-Relay-Status': 'admission',
            },
          }),
        expectedReleaseSha,
      }),
    ).rejects.toThrow(
      'Private aircraft relay returned 503 without numeric Retry-After',
    )
  })

  it('does not retry an unmarked provider 503', async () => {
    let fetches = 0
    const response = await fetchPrivateRelayWithRetry({
      fetchRelay: async () => {
        fetches += 1
        return new Response('provider unavailable', {
          status: 503,
          headers: { 'Retry-After': '20' },
        })
      },
      expectedReleaseSha: 'b'.repeat(40),
    })

    expect(response.status).toBe(503)
    expect(fetches).toBe(1)
  })

  it('stops private relay retries when the smoke deadline aborts', async () => {
    const controller = new AbortController()
    controller.abort(
      new Error('Private aircraft relay smoke exceeded its bounded deadline'),
    )
    let fetches = 0

    await expect(
      fetchPrivateRelayWithRetry({
        fetchRelay: async () => {
          fetches += 1
          return new Response(null, { status: 200 })
        },
        expectedReleaseSha: 'b'.repeat(40),
        signal: controller.signal,
      }),
    ).rejects.toThrow(
      'Private aircraft relay smoke exceeded its bounded deadline',
    )
    expect(fetches).toBe(0)
  })

  it('requires a non-contradictory one-year immutable cache policy', () => {
    expect(
      hasOneYearImmutableCacheControl(
        'public, max-age=31536000, immutable',
      ),
    ).toBe(true)
    expect(
      hasOneYearImmutableCacheControl(
        'public, max-age=0, immutable',
      ),
    ).toBe(false)
    expect(
      hasOneYearImmutableCacheControl(
        'public, max-age=31536000, no-cache, immutable',
      ),
    ).toBe(false)
    expect(
      hasOneYearImmutableCacheControl(
        'public, max-age=31536000, s-maxage=0, immutable',
      ),
    ).toBe(false)
  })

  it.each([
    [
      'v1 rollback',
      '/orbital-data/v1/visual-catalog.json',
      '/orbital-data/v1/NOTICE.txt',
    ],
    [
      'schema-v1 expiry bridge',
      '/orbital-data/v2/visual-catalog.json',
      '/orbital-data/v2/NOTICE.txt',
    ],
    [
      'schema-v2 current release',
      '/orbital-data/curated-2026-09-30-v1/catalog.json',
      '/orbital-data/curated-2026-09-30-v1/NOTICE.txt',
    ],
  ])(
    'derives target-specific orbital assets for %s',
    (_label, bootstrapPath, noticePath) => {
      expect(deriveOrbitalStaticAssetPaths(bootstrapPath)).toEqual({
        bootstrapPath,
        noticePath,
      })
    },
  )

  it.each([
    ['disabled', 1],
    ['schema1-only', 4],
    ['schema2-only', 4],
    ['dual-representation', 7],
  ])(
    'validates the %s rollback target without retries or provider requests',
    async (mode, expectedRequests) => {
      const contractFixture = createTargetContractFixture(mode)
      const routeFixture = createOrbitalRouteFixture(mode)
      const contract = contractFixture.target
        ? resolveTargetOrbitalSmokeContract(contractFixture.target)
        : undefined

      await expect(
        verifyTargetOrbitalCatalog({
          baseUrl: new URL('https://app.example/'),
          enabled: mode !== 'disabled',
          expectedReleaseSha: releaseSha,
          contract,
          fetchResponse: routeFixture.fetchResponse,
        }),
      ).resolves.toEqual({ mode })

      expect(routeFixture.requests).toHaveLength(expectedRequests)
      expect(
        routeFixture.requests.every(
          ({ url }) => new URL(url).origin === 'https://app.example',
        ),
      ).toBe(true)
      expect(
        routeFixture.requests.some(({ url }) =>
          url.includes('celestrak'),
        ),
      ).toBe(false)

      if (mode === 'disabled') return
      expect(contractFixture.validateSnapshot).toHaveBeenCalledTimes(1)
      if (mode === 'dual-representation') {
        expect(
          contractFixture.validateLegacySnapshot,
        ).toHaveBeenCalledTimes(1)
        expect(
          routeFixture.requests.filter(
            ({ accept }) =>
              accept === ORBITAL_SCHEMA2_NEGOTIATION_ACCEPT,
          ),
        ).toHaveLength(3)
      } else {
        expect(
          routeFixture.requests.every(({ accept }) => accept === null),
        ).toBe(true)
      }
    },
  )

  it('fails closed on a partial dual-representation target contract', () => {
    const fixture = createTargetContractFixture('schema2-only')
    fixture.target.ORBITAL_CATALOG_V2_ACCEPT =
      ORBITAL_SCHEMA2_NEGOTIATION_ACCEPT

    expect(() =>
      resolveTargetOrbitalSmokeContract(fixture.target),
    ).toThrow('dual-representation contract is incomplete')
  })

  it('feature-detects and validates the fixed Starlink route contract', async () => {
    const payload = {
      schemaVersion: 1,
      sourceContractVersion: 1,
      catalogId: 'celestrak-starlink-sample-v1',
      sources: {},
      populationCount: 1,
      extraSatcatCount: 0,
      sampleLimit: 150,
      sampleAlgorithm: 'inclination-raan-systematic-v1',
      recordCount: 1,
      records: [],
      publishedAt: '2026-10-01T19:45:03.000Z',
      digest: 'd'.repeat(64),
    }
    const validateSnapshot = vi.fn(async (value) => value)
    const contract = resolveTargetStarlinkSmokeContract({
      STARLINK_BOOTSTRAP_PATH:
        '/orbital-data/starlink-2026-10-02-v1/catalog.json',
      STARLINK_CATALOG_MEDIA_TYPE,
      STARLINK_CATALOG_SCHEMA_VERSION: 1,
      STARLINK_MAX_SNAPSHOT_BYTES: 256 * 1_024,
      STARLINK_SOURCE_CONTRACT_VERSION: 1,
      validateStarlinkCatalogSnapshot: validateSnapshot,
    })
    const requests = []
    const fetchResponse = vi.fn(async (input, init = {}) => {
      const url = new URL(input)
      const headers = new Headers(init.headers)
      const method = init.method ?? 'GET'
      requests.push({ url: url.toString(), method })
      if (url.search) {
        return new Response('Unsupported query', { status: 400 })
      }
      if (method !== 'GET') {
        return new Response('Method not allowed', { status: 405 })
      }
      const etag = `W/"${payload.digest}"`
      const responseHeaders = {
        'Cache-Control': 'no-store',
        'Content-Type': STARLINK_CATALOG_MEDIA_TYPE,
        ETag: etag,
        'X-Content-Type-Options': 'nosniff',
        'X-LiveTrafficStan-Release': releaseSha,
        'X-LiveTrafficStan-Starlink-Digest': payload.digest,
        'X-LiveTrafficStan-Starlink-Published-At':
          payload.publishedAt,
        'X-LiveTrafficStan-Starlink-Schema': '1',
        'X-LiveTrafficStan-Starlink-Source': 'kv',
        'X-LiveTrafficStan-Served-At':
          '2026-10-01T19:45:04.000Z',
      }
      if (headers.get('if-none-match') === etag) {
        return new Response(null, {
          status: 304,
          headers: responseHeaders,
        })
      }
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: responseHeaders,
      })
    })

    await expect(
      verifyTargetStarlinkCatalog({
        baseUrl: new URL('https://app.example/'),
        enabled: true,
        expectedReleaseSha: releaseSha,
        contract,
        fetchResponse,
      }),
    ).resolves.toEqual({ mode: 'enabled', source: 'kv' })
    expect(requests).toHaveLength(4)
    expect(
      requests.every(
        ({ url }) => new URL(url).origin === 'https://app.example',
      ),
    ).toBe(true)
    expect(
      requests.some(({ url }) => url.includes('celestrak')),
    ).toBe(false)
    expect(validateSnapshot).toHaveBeenCalledTimes(1)

    await expect(
      verifyTargetStarlinkCatalog({
        baseUrl: new URL('https://app.example/'),
        enabled: false,
        expectedReleaseSha: releaseSha,
        contract: undefined,
        fetchResponse: async () =>
          new Response('Not found', { status: 404 }),
      }),
    ).resolves.toEqual({ mode: 'disabled' })
    expect(() =>
      resolveTargetStarlinkSmokeContract({
        STARLINK_CATALOG_SCHEMA_VERSION: 1,
      }),
    ).toThrow('Starlink catalog contract is incomplete')
  })

  it.each(
    ['initial', 'conditional'].flatMap((phase) =>
      [
        'ETag',
        'X-LiveTrafficStan-Starlink-Digest',
        'X-LiveTrafficStan-Starlink-Published-At',
        'X-LiveTrafficStan-Starlink-Schema',
        'X-LiveTrafficStan-Starlink-Source',
        'X-LiveTrafficStan-Served-At',
      ].map((header) => [phase, header]),
    ),
  )(
    'rejects a missing %s Starlink %s header',
    async (phase, missingHeader) => {
      const payload = {
        schemaVersion: 1,
        sourceContractVersion: 1,
        catalogId: 'celestrak-starlink-sample-v1',
        sources: {},
        populationCount: 1,
        extraSatcatCount: 0,
        sampleLimit: 150,
        sampleAlgorithm: 'inclination-raan-systematic-v1',
        recordCount: 1,
        records: [],
        publishedAt: '2026-10-01T19:45:03.000Z',
        digest: 'd'.repeat(64),
      }
      const contract = resolveTargetStarlinkSmokeContract({
        STARLINK_BOOTSTRAP_PATH:
          '/orbital-data/starlink-2026-10-02-v1/catalog.json',
        STARLINK_CATALOG_MEDIA_TYPE,
        STARLINK_CATALOG_SCHEMA_VERSION: 1,
        STARLINK_MAX_SNAPSHOT_BYTES: 256 * 1_024,
        STARLINK_SOURCE_CONTRACT_VERSION: 1,
        validateStarlinkCatalogSnapshot: vi.fn(
          async (value) => value,
        ),
      })
      const etag = `W/"${payload.digest}"`
      const fetchResponse = vi.fn(async (input, init = {}) => {
        const url = new URL(input)
        const requestHeaders = new Headers(init.headers)
        if (url.search) {
          return new Response('Unsupported query', { status: 400 })
        }
        if ((init.method ?? 'GET') !== 'GET') {
          return new Response('Method not allowed', { status: 405 })
        }
        const conditional =
          requestHeaders.get('if-none-match') === etag
        const responseHeaders = new Headers({
          'Cache-Control': 'no-store',
          'Content-Type': STARLINK_CATALOG_MEDIA_TYPE,
          ETag: etag,
          'X-Content-Type-Options': 'nosniff',
          'X-LiveTrafficStan-Release': releaseSha,
          'X-LiveTrafficStan-Starlink-Digest': payload.digest,
          'X-LiveTrafficStan-Starlink-Published-At':
            payload.publishedAt,
          'X-LiveTrafficStan-Starlink-Schema': '1',
          'X-LiveTrafficStan-Starlink-Source': 'kv',
          'X-LiveTrafficStan-Served-At':
            '2026-10-01T19:45:04.000Z',
        })
        if (
          (phase === 'initial' && !conditional) ||
          (phase === 'conditional' && conditional)
        ) {
          responseHeaders.delete(missingHeader)
        }
        return conditional
          ? new Response(null, {
              status: 304,
              headers: responseHeaders,
            })
          : new Response(JSON.stringify(payload), {
              status: 200,
              headers: responseHeaders,
            })
      })

      await expect(
        verifyTargetStarlinkCatalog({
          baseUrl: new URL('https://app.example/'),
          enabled: true,
          expectedReleaseSha: releaseSha,
          contract,
          fetchResponse,
        }),
      ).rejects.toThrow()
    },
  )

  it('loads the orbital bootstrap source of truth from the target checkout', () => {
    const targetImportIndex = smokeScript.indexOf(
      "await import('../worker/orbitalCatalog.ts')",
    )
    expect(targetImportIndex).toBeGreaterThan(-1)
    expect(smokeScript).toContain(
      "orbitalCatalogEnabled === 'true'",
    )
    expect(smokeScript).toContain(
      'deriveOrbitalStaticAssetPaths(',
    )
    expect(smokeScript).toContain(
      'resolveTargetOrbitalSmokeContract(targetOrbitalContract)',
    )
    expect(smokeScript).toContain('verifyTargetOrbitalCatalog({')
    expect(smokeScript).not.toContain(
      'targetOrbitalContract.validateLegacyOrbitalCatalogSnapshot',
    )
    expect(smokeScript).not.toContain(
      'targetOrbitalContract.ORBITAL_CATALOG_V2_ACCEPT',
    )
    expect(smokePolicyScript).toContain(
      "visualSource?.gpRecordCount === schema1.payload.recordCount",
    )
    const kvFreshnessStart = smokePolicyScript.indexOf(
      "if (schema2.source === 'kv')",
    )
    const kvFreshnessCheck = smokePolicyScript.slice(
      kvFreshnessStart,
      smokePolicyScript.indexOf(
        '    await verifyConditional(',
        kvFreshnessStart,
      ),
    )
    expect(kvFreshnessCheck).toContain(
      'visualSource?.gpRecordCount === schema1.payload.recordCount',
    )
    expect(smokePolicyScript).toContain(
      'Date.parse(schema1.payload.retrievedAt) >=',
    )
    expect(smokePolicyScript).toContain(
      "new URL('/api/orbits/catalog', baseUrl)",
    )
    expect(smokePolicyScript).not.toContain('/api/orbits/catalog/v2')
    expect(smokeScript).toContain(
      'targetOrbitalSmokeContract.bootstrapPath',
    )
    expect(smokeScript).toContain(
      "starlinkCatalogEnabled === 'true'",
    )
    expect(smokeScript).toContain(
      "await import('../worker/starlinkCatalog.ts')",
    )
    expect(smokeScript).toContain(
      'resolveTargetStarlinkSmokeContract(targetStarlinkContract)',
    )
    expect(smokeScript).toContain(
      'verifyTargetStarlinkCatalog({',
    )
    expect(smokeScript).not.toContain(
      "const orbitalPath = '/orbital-data/",
    )
    expect(smokeScript).not.toContain(
      "const noticePath = '/orbital-data/",
    )
  })

  it('allows current smoke policy to inspect a target without new manifests', async () => {
    const manifest = await readOptionalJson(
      join(repositoryRoot, 'src/config/vesselPhotoManifest.json'),
    )
    const absentManifest = await readOptionalJson(
      join(repositoryRoot, 'src/config/does-not-exist.json'),
    )

    expect(manifest?.photos).toHaveLength(8)
    expect(absentManifest).toBeUndefined()
    expect(smokeScript).not.toContain('import vesselPhotoManifest')
  })
})
