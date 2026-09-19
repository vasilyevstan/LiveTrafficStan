import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AWC_METAR_URL,
  AWC_USER_AGENT,
  handleMetarProxy,
  type MetarProxyFetch,
} from './metarProxy.js'

const proxyRequest = (
  path = '/api/weather/metar?ids=EETN%2CEFHK',
  init?: RequestInit,
) => new Request(`https://app.example${path}`, init)

describe('METAR proxy', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('forwards only canonical IDs to the fixed JSON upstream', async () => {
    const body = '[{"icaoId":"EETN"}]'
    const fetchImpl = vi.fn<MetarProxyFetch>(async () =>
      new Response(body, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'max-age=60',
        },
      }),
    )
    const response = await handleMetarProxy(
      proxyRequest(undefined, {
        headers: {
          Authorization: '******',
          Cookie: 'private=true',
          'X-Forwarded-For': '192.0.2.1',
        },
      }),
      { fetchImpl },
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe(body)
    expect(response.headers.get('cache-control')).toBe('public, max-age=60')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    const upstream = new URL(AWC_METAR_URL)
    upstream.search = new URLSearchParams({
      ids: 'EETN,EFHK',
      format: 'json',
    }).toString()
    expect(fetchImpl).toHaveBeenCalledWith(
      upstream,
      expect.objectContaining({
        method: 'GET',
        redirect: 'manual',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'User-Agent': AWC_USER_AGENT,
        },
      }),
    )
  })

  it.each([
    ['/api/weather/metar', 400],
    ['/api/weather/metar?ids=', 400],
    ['/api/weather/metar?ids=EFHK%2CEETN', 400],
    ['/api/weather/metar?ids=EETN%2CEETN', 400],
    ['/api/weather/metar?ids=K1AB', 400],
    ['/api/weather/metar?ids=eetn', 400],
    ['/api/weather/metar?ids=EETN&format=json', 400],
    ['/api/weather/metar?ids=EETN&ids=EFHK', 400],
    ['/api/weather/metar?ids=EETN,EFHK', 400],
    ['/api/weather/metar/extra?ids=EETN', 404],
  ])('rejects invalid path or query %s with %i', async (
    path,
    expectedStatus,
  ) => {
    const fetchImpl = vi.fn()
    const response = await handleMetarProxy(proxyRequest(path), {
      fetchImpl,
    })
    expect(response.status).toBe(expectedStatus)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it.each(['POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'])(
    'rejects the %s method',
    async (method) => {
      const fetchImpl = vi.fn()
      const response = await handleMetarProxy(
        proxyRequest(undefined, { method }),
        { fetchImpl },
      )
      expect(response.status).toBe(405)
      expect(response.headers.get('allow')).toBe('GET')
      expect(fetchImpl).not.toHaveBeenCalled()
    },
  )

  it('supports 204 empty responses and preserves rate guidance', async () => {
    const empty = await handleMetarProxy(proxyRequest(), {
      fetchImpl: async () => new Response(null, { status: 204 }),
    })
    expect(empty.status).toBe(204)
    expect(empty.headers.get('cache-control')).toBe('public, max-age=60')

    const limited = await handleMetarProxy(proxyRequest(), {
      fetchImpl: async () =>
        new Response('slow down', {
          status: 429,
          headers: {
            'Content-Type': 'text/html',
            'Retry-After': '30',
          },
        }),
    })
    expect(limited.status).toBe(429)
    expect(await limited.text()).toBe('slow down')
    expect(limited.headers.get('content-type')).toBe(
      'text/plain; charset=utf-8',
    )
    expect(limited.headers.get('retry-after')).toBe('30')
    expect(limited.headers.get('cache-control')).toBe('no-store')
  })

  it('rejects redirects, unsafe successful content, and oversized bodies', async () => {
    const redirect = await handleMetarProxy(proxyRequest(), {
      fetchImpl: async () =>
        new Response(null, {
          status: 302,
          headers: { Location: 'https://example.com' },
        }),
    })
    expect(redirect.status).toBe(502)
    expect(redirect.headers.has('location')).toBe(false)

    const html = await handleMetarProxy(proxyRequest(), {
      fetchImpl: async () =>
        new Response('<html>wrong</html>', {
          headers: { 'Content-Type': 'text/html' },
        }),
    })
    expect(html.status).toBe(502)
    expect(await html.text()).toContain('unsafe content type')

    const oversized = await handleMetarProxy(proxyRequest(), {
      fetchImpl: async () =>
        new Response('123456789', {
          headers: { 'Content-Type': 'application/json' },
        }),
      maxResponseBytes: 8,
    })
    expect(oversized.status).toBe(502)
    expect(await oversized.text()).toContain('too large')
  })

  it('times out and propagates client cancellation', async () => {
    vi.useFakeTimers()
    const fetchImpl: MetarProxyFetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(init.signal?.reason),
          { once: true },
        )
      })
    const pending = handleMetarProxy(proxyRequest(), {
      fetchImpl,
      timeoutMs: 100,
    })
    const timeoutExpectation = expect(pending).resolves.toMatchObject({
      status: 504,
    })
    await vi.advanceTimersByTimeAsync(100)
    await timeoutExpectation

    const controller = new AbortController()
    const canceled = handleMetarProxy(
      proxyRequest(undefined, { signal: controller.signal }),
      { fetchImpl },
    )
    controller.abort()
    expect((await canceled).status).toBe(499)
  })

  it('does not log station IDs or response bodies', async () => {
    const spies = ['log', 'info', 'warn', 'error'].map((name) =>
      vi
        .spyOn(console, name as 'log')
        .mockImplementation(() => undefined),
    )
    await handleMetarProxy(proxyRequest(), {
      fetchImpl: async () =>
        new Response('[]', {
          headers: { 'Content-Type': 'application/json' },
        }),
    })
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })
})
