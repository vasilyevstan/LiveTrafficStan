import { describe, expect, it } from 'vitest'
import {
  STATIC_ASSET_RETRY_DELAYS_MS,
  classifyAircraftProxyStatus,
  isRetryableStaticAssetStatus,
} from './smoke-policy.mjs'

describe('production smoke policy', () => {
  it('bounds static-asset propagation retries', () => {
    expect(STATIC_ASSET_RETRY_DELAYS_MS).toEqual([
      0,
      1_000,
      2_000,
      4_000,
      8_000,
    ])
    expect(isRetryableStaticAssetStatus(404)).toBe(true)
    expect(isRetryableStaticAssetStatus(503)).toBe(true)
    expect(isRetryableStaticAssetStatus(403)).toBe(false)
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
