import { describe, expect, it, vi } from 'vitest'
import {
  createAircraftRelayHandler,
  createMemoryAdmissionStateStore,
  MAXIMUM_RESPONSE_BYTES,
  parsePointPath,
  parseRetryAfterMs,
} from './relay.mjs'

const AUTH_TOKEN = 'a'.repeat(32)
const RELEASE_SHA = 'b'.repeat(40)
const authorizedRequest = (
  path = '/v2/point/59.437/24.7536/11',
  init = {},
) =>
  new Request(`http://relay.internal${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
      ...init.headers,
    },
  })

const createHandler = async (options = {}) =>
  createAircraftRelayHandler({
    authToken: AUTH_TOKEN,
    releaseSha: RELEASE_SHA,
    stateStore: createMemoryAdmissionStateStore(),
    ...options,
  })

describe('OCI aircraft relay', () => {
  it('serves provider-free health with the exact release SHA', async () => {
    const fetchImpl = vi.fn()
    const handler = await createHandler({ fetchImpl })

    const response = await handler(
      new Request('http://relay.internal/healthz'),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'ok',
      releaseSha: RELEASE_SHA,
    })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated requests before upstream work', async () => {
    const fetchImpl = vi.fn()
    const handler = await createHandler({ fetchImpl })

    const response = await handler(
      new Request('http://relay.internal/v2/point/59.437/24.7536/11'),
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('forwards only a canonical point request with fixed headers', async () => {
    const body = '{"now":1800000000000,"ac":[]}'
    const fetchImpl = vi.fn(async () =>
      new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const handler = await createHandler({ fetchImpl })

    const response = await handler(
      authorizedRequest(undefined, {
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
          Cookie: 'private=true',
          'X-Forwarded-For': '192.0.2.1',
        },
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe(body)
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.adsb.lol/v2/point/59.437/24.7536/11',
      expect.objectContaining({
        method: 'GET',
        redirect: 'manual',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'User-Agent':
            'LiveTrafficStan (+https://github.com/vasilyevstan/LiveTrafficStan)',
        },
      }),
    )
  })

  it.each([
    ['/v2/point/91/24/11', undefined],
    ['/v2/point/59/181/11', undefined],
    ['/v2/point/+59/24/11', undefined],
    ['/v2/point/059/24/11', undefined],
    ['/v2/point/1e2/24/11', undefined],
    ['/v2/point/59/24/0', undefined],
    ['/v2/point/59/24/55', undefined],
    ['/v2/point/59/24/11.5', undefined],
    ['/v2/point/59/%2F/11', undefined],
    ['/v2/point/59/24/11', {
      latitude: '59',
      longitude: '24',
      radiusNm: '11',
    }],
  ])('parses canonical path %s', (path, expected) => {
    expect(parsePointPath(path)).toEqual(expected)
  })

  it('rejects methods, queries, and unrelated paths', async () => {
    const fetchImpl = vi.fn()
    const handler = await createHandler({ fetchImpl })

    expect(
      (await handler(authorizedRequest(undefined, { method: 'POST' })))
        .status,
    ).toBe(405)
    expect(
      (await handler(authorizedRequest('/v2/point/59/24/11?x=1'))).status,
    ).toBe(400)
    expect((await handler(authorizedRequest('/v2/all'))).status).toBe(404)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('allows only one in-flight request and one start per 20 seconds', async () => {
    let nowMs = 1_000
    let finishFirst
    const firstUpstream = new Promise((resolve) => {
      finishFirst = resolve
    })
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(() => firstUpstream)
      .mockResolvedValue(new Response('{}'))
    const handler = await createHandler({
      fetchImpl,
      now: () => nowMs,
    })

    const first = handler(authorizedRequest())
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1))

    const concurrent = await handler(authorizedRequest())
    expect(concurrent.status).toBe(503)
    expect(concurrent.headers.get('retry-after')).toBe('20')
    finishFirst(new Response('{}'))
    expect((await first).status).toBe(200)

    nowMs = 20_999
    expect((await handler(authorizedRequest())).status).toBe(503)
    nowMs = 21_000
    expect((await handler(authorizedRequest())).status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('persists provider Retry-After across handler restarts', async () => {
    let nowMs = 10_000
    const stateStore = createMemoryAdmissionStateStore()
    const firstHandler = await createHandler({
      stateStore,
      now: () => nowMs,
      fetchImpl: async () =>
        new Response('slow down', {
          status: 429,
          headers: { 'Retry-After': '120' },
        }),
    })

    const upstream = await firstHandler(authorizedRequest())
    expect(upstream.status).toBe(429)
    expect(stateStore.snapshot()).toEqual({
      nextAllowedAtMs: 130_000,
      failureCount: 1,
    })

    nowMs = 40_000
    const restartedHandler = await createHandler({
      stateStore,
      now: () => nowMs,
      fetchImpl: vi.fn(),
    })
    const denied = await restartedHandler(authorizedRequest())
    expect(denied.status).toBe(503)
    expect(denied.headers.get('retry-after')).toBe('90')
  })

  it('uses bounded exponential backoff when Retry-After is absent', async () => {
    let nowMs = 0
    const stateStore = createMemoryAdmissionStateStore()
    const handler = await createHandler({
      stateStore,
      now: () => nowMs,
      fetchImpl: async () => new Response('slow down', { status: 429 }),
    })

    await handler(authorizedRequest())
    expect(stateStore.snapshot()).toEqual({
      nextAllowedAtMs: 20_000,
      failureCount: 1,
    })

    nowMs = 20_000
    await handler(authorizedRequest())
    expect(stateStore.snapshot()).toEqual({
      nextAllowedAtMs: 60_000,
      failureCount: 2,
    })
  })

  it('parses delta-seconds and HTTP-date Retry-After values', () => {
    expect(parseRetryAfterMs('30', 10_000)).toBe(30_000)
    expect(
      parseRetryAfterMs('Thu, 01 Jan 1970 00:01:00 GMT', 10_000),
    ).toBe(50_000)
    expect(parseRetryAfterMs('later', 10_000)).toBeUndefined()
  })

  it('rejects redirects and oversized responses', async () => {
    const redirectHandler = await createHandler({
      fetchImpl: async () =>
        new Response(null, {
          status: 302,
          headers: { Location: 'https://example.com' },
        }),
    })
    const redirect = await redirectHandler(authorizedRequest())
    expect(redirect.status).toBe(502)
    expect(redirect.headers.has('location')).toBe(false)

    const oversizedHandler = await createHandler({
      fetchImpl: async () =>
        new Response(new Uint8Array(MAXIMUM_RESPONSE_BYTES + 1)),
    })
    expect((await oversizedHandler(authorizedRequest())).status).toBe(502)
  })

  it('fails closed when admission state cannot be persisted', async () => {
    const fetchImpl = vi.fn()
    const stateStore = {
      async load() {
        return { nextAllowedAtMs: 0, failureCount: 0 }
      },
      async save() {
        throw new Error('disk unavailable')
      },
    }
    const handler = await createHandler({ stateStore, fetchImpl })

    const response = await handler(authorizedRequest())

    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('60')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
