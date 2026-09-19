import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ADSB_LOL_ORIGIN,
  ADSB_LOL_USER_AGENT,
  handleAircraftProxy,
  type AircraftProxyFetch,
} from './aircraftProxy.js'

const proxyRequest = (
  path = '/api/aircraft/v2/point/59.437/24.7536/11',
  init?: RequestInit,
) => new Request(`https://app.example${path}`, init)

describe('aircraft proxy', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('forwards only the canonical point request to the fixed upstream', async () => {
    const body = '{"now":1800000000000,"ac":[]}'
    const fetchImpl = vi.fn<AircraftProxyFetch>(async () =>
      new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const response = await handleAircraftProxy(
      proxyRequest(undefined, {
        headers: {
          Authorization: 'Bearer private',
          Cookie: 'private=true',
          'X-Forwarded-For': '192.0.2.1',
        },
      }),
      { fetchImpl },
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe(body)
    expect(response.headers.get('content-type')).toBe('application/json')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(fetchImpl).toHaveBeenCalledWith(
      `${ADSB_LOL_ORIGIN}/v2/point/59.437/24.7536/11`,
      expect.objectContaining({
        method: 'GET',
        redirect: 'manual',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'User-Agent': ADSB_LOL_USER_AGENT,
        },
      }),
    )
  })

  it.each([
    ['/api/aircraft/v2/point/91/24/11', 400],
    ['/api/aircraft/v2/point/-91/24/11', 400],
    ['/api/aircraft/v2/point/59/181/11', 400],
    ['/api/aircraft/v2/point/59/-181/11', 400],
    ['/api/aircraft/v2/point/+59/24/11', 400],
    ['/api/aircraft/v2/point/059/24/11', 400],
    ['/api/aircraft/v2/point/1e2/24/11', 400],
    ['/api/aircraft/v2/point/0x10/24/11', 400],
    ['/api/aircraft/v2/point/NaN/24/11', 400],
    ['/api/aircraft/v2/point/59/%2F/11', 400],
    ['/api/aircraft/v2/point/59/%/11', 400],
    ['/api/aircraft/v2/point/59/24/0', 400],
    ['/api/aircraft/v2/point/59/24/55', 400],
    ['/api/aircraft/v2/point/59/24/11.5', 400],
    ['/api/aircraft/v2/point/59/24/-1', 400],
    ['/api/aircraft/v2/point/59/24/11?', 400],
    ['/api/aircraft/v2/point/59/24/11?url=https://example.com', 400],
    ['/api/aircraft/v2/point/59/24', 404],
    ['/api/aircraft/v2/point/59/24/11/extra', 404],
    ['/api/aircraft/v2/all', 404],
    ['/api/aircraft/https://example.com', 404],
    ['/api/aircraft/v2/point/59/%2e%2e/11', 404],
  ])('rejects invalid path %s with %i', async (path, expectedStatus) => {
    const fetchImpl = vi.fn<AircraftProxyFetch>()
    const response = await handleAircraftProxy(proxyRequest(path), { fetchImpl })

    expect(response.status).toBe(expectedStatus)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it.each(['POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'])(
    'rejects the %s method',
    async (method) => {
      const fetchImpl = vi.fn<AircraftProxyFetch>()
      const response = await handleAircraftProxy(
        proxyRequest(undefined, { method }),
        { fetchImpl },
      )

      expect(response.status).toBe(405)
      expect(response.headers.get('allow')).toBe('GET')
      expect(fetchImpl).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['30', 'slow down'],
    ['Thu, 01 Jan 1970 00:01:00 GMT', 'try later'],
  ])('preserves upstream status, body, and Retry-After %s', async (
    retryAfter,
    body,
  ) => {
    const response = await handleAircraftProxy(proxyRequest(), {
      fetchImpl: async () =>
        new Response(body, {
          status: 429,
          headers: {
            'Content-Type': 'text/plain',
            'Retry-After': retryAfter,
          },
        }),
    })

    expect(response.status).toBe(429)
    expect(await response.text()).toBe(body)
    expect(response.headers.get('retry-after')).toBe(retryAfter)
    expect(response.headers.get('content-type')).toBe('text/plain')
  })

  it('rejects an upstream redirect without forwarding its location', async () => {
    const response = await handleAircraftProxy(proxyRequest(), {
      fetchImpl: async () =>
        new Response(null, {
          status: 302,
          headers: { Location: 'https://example.com' },
        }),
    })

    expect(response.status).toBe(502)
    expect(response.headers.has('location')).toBe(false)
  })

  it('reports upstream network failures explicitly', async () => {
    const response = await handleAircraftProxy(proxyRequest(), {
      fetchImpl: async () => {
        throw new TypeError('network down')
      },
    })

    expect(response.status).toBe(502)
    expect(await response.text()).toBe('Aircraft upstream unavailable')
  })

  it('times out before upstream headers arrive', async () => {
    vi.useFakeTimers()
    const fetchImpl: AircraftProxyFetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal
        signal?.addEventListener(
          'abort',
          () => reject(signal.reason),
          { once: true },
        )
      })

    const pendingResponse = handleAircraftProxy(proxyRequest(), {
      fetchImpl,
      timeoutMs: 100,
    })
    await vi.advanceTimersByTimeAsync(100)

    const response = await pendingResponse
    expect(response.status).toBe(504)
    expect(await response.text()).toBe('Aircraft upstream timed out')
  })

  it('keeps the timeout active while reading the response body', async () => {
    vi.useFakeTimers()
    const fetchImpl: AircraftProxyFetch = async (_input, init) => {
      const signal = init?.signal
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('partial'))
            signal?.addEventListener(
              'abort',
              () => controller.error(signal.reason),
              { once: true },
            )
          },
        }),
      )
    }

    const pendingResponse = handleAircraftProxy(proxyRequest(), {
      fetchImpl,
      timeoutMs: 100,
    })
    await vi.advanceTimersByTimeAsync(100)

    const response = await pendingResponse
    expect(response.status).toBe(504)
  })

  it('rejects a response that exceeds the counted body limit', async () => {
    const response = await handleAircraftProxy(proxyRequest(), {
      fetchImpl: async () => new Response('123456789'),
      maxResponseBytes: 8,
    })

    expect(response.status).toBe(502)
    expect(await response.text()).toBe(
      'Aircraft upstream response was too large',
    )
  })

  it('propagates client cancellation to the upstream request', async () => {
    const controller = new AbortController()
    const fetchImpl: AircraftProxyFetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal
        signal?.addEventListener(
          'abort',
          () => reject(signal.reason),
          { once: true },
        )
      })

    const pendingResponse = handleAircraftProxy(
      proxyRequest(undefined, { signal: controller.signal }),
      { fetchImpl },
    )
    controller.abort()

    expect((await pendingResponse).status).toBe(499)
  })

  it('does not start upstream work for an already canceled request', async () => {
    const fetchImpl = vi.fn()
    const controller = new AbortController()
    controller.abort()

    const response = await handleAircraftProxy(
      proxyRequest(undefined, { signal: controller.signal }),
      { fetchImpl },
    )

    expect(response.status).toBe(499)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('does not log request paths or coordinates', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await handleAircraftProxy(proxyRequest(), {
      fetchImpl: async () => new Response('{}'),
    })

    expect(log).not.toHaveBeenCalled()
    expect(info).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })
})
