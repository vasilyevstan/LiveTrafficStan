import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEPLOYMENT_PROPAGATION_RETRY_DELAYS_MS,
  classifyAircraftProxyStatus,
  isRetryableStaticAssetStatus,
} from './smoke-policy.mjs'

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const smokeScript = readFileSync(
  join(repositoryRoot, 'scripts/smoke-production.mjs'),
  'utf8',
)

describe('production smoke policy', () => {
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

  it('supports a browser-origin ADSB.lol delivery smoke', () => {
    expect(smokeScript).toContain(
      "aircraftDelivery = 'worker-proxy'",
    )
    expect(smokeScript).toContain(
      "aircraftDelivery === 'adsb-lol-direct'",
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
})
