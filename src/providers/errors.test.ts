import { describe, expect, it } from 'vitest'
import { parseRetryAfterMs, responseError } from './errors'

describe('provider errors', () => {
  it('parses delta-second and HTTP-date Retry-After values', () => {
    expect(parseRetryAfterMs('12', 1_000)).toBe(12_000)
    expect(
      parseRetryAfterMs('Thu, 01 Jan 1970 00:01:00 GMT', 10_000),
    ).toBe(50_000)
    expect(parseRetryAfterMs('invalid', 1_000)).toBeUndefined()
  })

  it('preserves response status and retry guidance', async () => {
    const error = await responseError(
      'Provider',
      new Response('slow down', {
        status: 429,
        headers: { 'Retry-After': '30' },
      }),
    )

    expect(error.status).toBe(429)
    expect(error.retryAfterMs).toBe(30_000)
    expect(error.message).toMatch(/slow down/)
  })
})
