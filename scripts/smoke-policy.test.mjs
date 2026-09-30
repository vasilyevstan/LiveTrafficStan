import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEPLOYMENT_PROPAGATION_RETRY_DELAYS_MS,
  PRIVATE_RELAY_MAX_ATTEMPTS,
  PRIVATE_RELAY_MAX_ADMISSION_WAIT_MS,
  PRIVATE_RELAY_MAX_RETRY_AFTER_SECONDS,
  PRIVATE_RELAY_SMOKE_TIMEOUT_MS,
  SAME_ORIGIN_SMOKE_FETCH_INIT,
  classifyAircraftProxyStatus,
  deriveOrbitalStaticAssetPaths,
  fetchPrivateRelayWithRetry,
  hasOneYearImmutableCacheControl,
  isRetryableStaticAssetStatus,
  readOptionalJson,
  waitForExpectedWorkerRelease,
} from './smoke-policy.mjs'

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const smokeScript = readFileSync(
  join(repositoryRoot, 'scripts/smoke-production.mjs'),
  'utf8',
)

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

  it('loads the orbital bootstrap source of truth from the target checkout', () => {
    const targetImportIndex = smokeScript.indexOf(
      "await import('../worker/orbitalCatalog.ts')",
    )
    expect(targetImportIndex).toBeGreaterThan(-1)
    expect(smokeScript).toContain(
      "orbitalCatalogEnabled === 'true'",
    )
    expect(smokeScript).toContain(
      'deriveOrbitalStaticAssetPaths(ORBITAL_BOOTSTRAP_PATH)',
    )
    expect(smokeScript).toContain(
      'targetOrbitalContract.validateOrbitalCatalogSnapshot',
    )
    expect(smokeScript).toContain(
      'targetOrbitalContract.ORBITAL_MAX_SNAPSHOT_BYTES',
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

    expect(manifest?.photos).toHaveLength(5)
    expect(absentManifest).toBeUndefined()
    expect(smokeScript).not.toContain('import vesselPhotoManifest')
  })
})
