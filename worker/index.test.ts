import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import worker, { type WorkerEnv } from './index.js'
import { ADSB_LOL_USER_AGENT } from './aircraftProxy.js'
import { ORBITAL_BOOTSTRAP_PATH } from './orbitalCatalog.js'

const releaseSha = '0123456789abcdef0123456789abcdef01234567'

describe('Cloudflare worker routing', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('routes API requests through the proxy and marks the release', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('{"now":1800000000000,"ac":[]}', {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    const assetsFetch = vi.fn(async () => new Response('asset'))
    const env: WorkerEnv = {
      ASSETS: { fetch: assetsFetch },
      RELEASE_SHA: releaseSha,
    }

    const response = await worker.fetch(
      new Request(
        'https://app.example/api/aircraft/v2/point/59.437/24.7536/11',
      ),
      env,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-livetrafficstan-release')).toBe(releaseSha)
    expect(assetsFetch).not.toHaveBeenCalled()
  })

  it('routes the protected aircraft mode only through the private relay binding', async () => {
    const directFetch = vi.fn()
    vi.stubGlobal('fetch', directFetch)
    const relayFetch = vi.fn(
      async (
        _input: string | URL | Request,
        _init?: RequestInit,
      ) =>
        new Response('{"now":1800000000000,"ac":[]}', {
          headers: { 'Content-Type': 'application/json' },
        }),
    )
    const authToken = 'r'.repeat(32)

    const response = await worker.fetch(
      new Request(
        'https://app.example/api/aircraft/v2/point/59.437/24.7536/11',
        {
          headers: {
            Authorization: 'Bearer browser-token',
            Cookie: 'private=true',
            'X-Forwarded-For': '192.0.2.1',
          },
        },
      ),
      {
        ASSETS: { fetch: vi.fn() },
        AIRCRAFT_DELIVERY: 'oci-private-relay',
        AIRCRAFT_RELAY: { fetch: relayFetch },
        AIRCRAFT_RELAY_AUTH_TOKEN: authToken,
        RELEASE_SHA: releaseSha,
      },
    )

    expect(response.status).toBe(200)
    expect(directFetch).not.toHaveBeenCalled()
    expect(relayFetch).toHaveBeenCalledTimes(1)
    const [input, init] = relayFetch.mock.calls[0] ?? []
    expect(String(input)).toBe(
      'http://livetrafficstan-aircraft-relay/v2/point/59.437/24.7536/11',
    )
    expect(init).toMatchObject({
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
    })
    expect(new Headers(init?.headers).get('accept')).toBe('application/json')
    expect(new Headers(init?.headers).get('user-agent')).toBe(
      ADSB_LOL_USER_AGENT,
    )
    expect(new Headers(init?.headers).get('authorization')).toBe(
      `Bearer ${authToken}`,
    )
    expect(new Headers(init?.headers).has('cookie')).toBe(false)
    expect(new Headers(init?.headers).has('x-forwarded-for')).toBe(false)
  })

  it('fails closed when protected relay configuration is incomplete', async () => {
    const directFetch = vi.fn()
    vi.stubGlobal('fetch', directFetch)
    const relayFetch = vi.fn()

    const response = await worker.fetch(
      new Request(
        'https://app.example/api/aircraft/v2/point/59.437/24.7536/11',
      ),
      {
        ASSETS: { fetch: vi.fn() },
        AIRCRAFT_DELIVERY: 'oci-private-relay',
        AIRCRAFT_RELAY: { fetch: relayFetch },
        RELEASE_SHA: releaseSha,
      },
    )

    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('20')
    expect(
      response.headers.has('x-livetrafficstan-relay-status'),
    ).toBe(false)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-livetrafficstan-release')).toBe(releaseSha)
    expect(await response.text()).toBe('Aircraft relay unavailable')
    expect(relayFetch).not.toHaveBeenCalled()
    expect(directFetch).not.toHaveBeenCalled()
  })

  it('preserves private relay admission guidance', async () => {
    const response = await worker.fetch(
      new Request(
        'https://app.example/api/aircraft/v2/point/59.437/24.7536/11',
      ),
      {
        ASSETS: { fetch: vi.fn() },
        AIRCRAFT_DELIVERY: 'oci-private-relay',
        AIRCRAFT_RELAY: {
          fetch: vi.fn(async () =>
            new Response('Relay admission delayed', {
              status: 503,
              headers: {
                'Content-Type': 'text/plain',
                'Retry-After': '17',
                'X-LiveTrafficStan-Relay-Status': 'admission',
              },
            }),
          ),
        },
        AIRCRAFT_RELAY_AUTH_TOKEN: 'r'.repeat(32),
        RELEASE_SHA: releaseSha,
      },
    )

    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('17')
    expect(response.headers.get('x-livetrafficstan-release')).toBe(
      releaseSha,
    )
    expect(
      response.headers.get('x-livetrafficstan-relay-status'),
    ).toBe('admission')
    expect(await response.text()).toBe('Relay admission delayed')
  })

  it('rejects unsupported private relay paths before consulting the binding', async () => {
    const relayFetch = vi.fn()

    const response = await worker.fetch(
      new Request('https://app.example/api/aircraft/v2/all'),
      {
        ASSETS: { fetch: vi.fn() },
        AIRCRAFT_DELIVERY: 'oci-private-relay',
        AIRCRAFT_RELAY: { fetch: relayFetch },
        AIRCRAFT_RELAY_AUTH_TOKEN: 'r'.repeat(32),
      },
    )

    expect(response.status).toBe(404)
    expect(relayFetch).not.toHaveBeenCalled()
  })

  it('routes METAR requests through the weather proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('[]', {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    const assetsFetch = vi.fn()
    const response = await worker.fetch(
      new Request(
        'https://app.example/api/weather/metar?ids=EETN',
      ),
      {
        ASSETS: { fetch: assetsFetch },
        RELEASE_SHA: releaseSha,
      },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-livetrafficstan-release')).toBe(
      releaseSha,
    )
    expect(assetsFetch).not.toHaveBeenCalled()
  })

  it('routes the orbital catalog before the generic aircraft API path', async () => {
    const bootstrap = await readFile(
      `public${ORBITAL_BOOTSTRAP_PATH}`,
      'utf8',
    )
    const assetsFetch = vi.fn(async (request: Request) => {
      expect(new URL(request.url).pathname).toBe(ORBITAL_BOOTSTRAP_PATH)
      return new Response(bootstrap, {
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const response = await worker.fetch(
      new Request('https://app.example/api/orbits/catalog'),
      {
        ASSETS: { fetch: assetsFetch },
        ORBITAL_CATALOG_ENABLED: 'true',
        RELEASE_SHA: releaseSha,
      },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-livetrafficstan-release')).toBe(
      releaseSha,
    )
    expect(response.headers.get('x-livetrafficstan-orbital-source')).toBe(
      'bootstrap',
    )
  })

  it('disables platform retries for scheduled catalog refreshes', async () => {
    const noRetry = vi.fn()
    const coordinatorFetch = vi.fn(
      async (_request: Request) => new Response('{}'),
    )

    await worker.scheduled(
      { noRetry },
      {
        ASSETS: { fetch: vi.fn() },
        ORBITAL_CATALOG_ENABLED: 'true',
        ORBITAL_CATALOG_COORDINATOR: {
          idFromName: vi.fn(() => 'coordinator-id'),
          get: vi.fn(() => ({ fetch: coordinatorFetch })),
        },
      },
    )

    expect(noRetry).toHaveBeenCalledTimes(1)
    expect(coordinatorFetch).toHaveBeenCalledTimes(1)
    const request = coordinatorFetch.mock.calls[0]?.[0]
    expect(request?.method).toBe('POST')
    expect(new URL(request?.url ?? '').pathname).toBe('/refresh')
  })

  it('rejects the API root without consulting Static Assets', async () => {
    const assetsFetch = vi.fn()

    const response = await worker.fetch(
      new Request('https://app.example/api'),
      { ASSETS: { fetch: assetsFetch } },
    )

    expect(response.status).toBe(404)
    expect(assetsFetch).not.toHaveBeenCalled()
  })

  it('does not expose an invalid release value', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')))
    const response = await worker.fetch(
      new Request(
        'https://app.example/api/aircraft/v2/point/59.437/24.7536/11',
      ),
      {
        ASSETS: { fetch: vi.fn() },
        RELEASE_SHA: 'development',
      },
    )

    expect(response.headers.has('x-livetrafficstan-release')).toBe(false)
  })

  it('serves non-API requests through the static asset binding', async () => {
    const assetsFetch = vi.fn(async () => new Response('not found', {
      status: 404,
    }))
    const request = new Request('https://app.example/assets/missing.js')

    const response = await worker.fetch(request, {
      ASSETS: { fetch: assetsFetch },
    })

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('not found')
    expect(assetsFetch).toHaveBeenCalledWith(request)
  })
})
