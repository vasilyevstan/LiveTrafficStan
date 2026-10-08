import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import worker, { type WorkerEnv } from './index.js'
import { ADSB_LOL_USER_AGENT } from './aircraftProxy.js'
import {
  ORBITAL_BOOTSTRAP_PATH,
  ORBITAL_CATALOG_V2_ACCEPT,
} from './orbitalCatalog.js'
import {
  STARLINK_CATALOG_KEY,
  STARLINK_CATALOG_MEDIA_TYPE,
  STARLINK_CATALOG_PATH,
  createStarlinkCatalogSnapshot,
  serializeStarlinkCatalogSnapshot,
} from './starlinkCatalog.js'

const releaseSha = '0123456789abcdef0123456789abcdef01234567'

describe('Cloudflare worker routing', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('routes airport boards independently and marks disabled and enabled responses with the exact release', async () => {
    const assets = vi.fn()
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)
    const request = new Request('https://app.example/api/airports/board?icao=EETN')
    const disabled = await worker.fetch(request, { ASSETS: { fetch: assets }, RELEASE_SHA: releaseSha })
    expect(disabled.status).toBe(404)
    expect(disabled.headers.get('x-livetrafficstan-release')).toBe(releaseSha)
    const coordinate = vi.fn().mockResolvedValue(Response.json({ schemaVersion: 1 }))
    const enabled = await worker.fetch(request, {
      ASSETS: { fetch: assets }, RELEASE_SHA: releaseSha,
      AIRPORT_BOARDS_ENABLED: 'true', AERODATABOX_RAPIDAPI_KEY: 'private-test-key-not-a-credential',
      AIRPORT_BOARD_COORDINATOR: { idFromName: () => 'board', get: () => ({ fetch: coordinate }) },
    })
    expect(enabled.status).toBe(200)
    expect(enabled.headers.get('x-livetrafficstan-release')).toBe(releaseSha)
    expect(coordinate).toHaveBeenCalledTimes(1)
    expect(upstream).not.toHaveBeenCalled()
    expect(assets).not.toHaveBeenCalled()
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
      new Request('https://app.example/api/orbits/catalog', {
        headers: { Accept: ORBITAL_CATALOG_V2_ACCEPT },
      }),
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
    expect(response.headers.get('x-livetrafficstan-orbital-schema')).toBe(
      '2',
    )
  })

  it('routes the Starlink catalog with the release header and fixed media type', async () => {
    const snapshot = await createStarlinkCatalogSnapshot(
      {
        gpValue: [
          {
            OBJECT_NAME: 'STARLINK TEST',
            OBJECT_ID: '2026-001A',
            OBJECT_TYPE: 'PAY',
            EPOCH: '2026-10-01T18:45:00.123456',
            MEAN_MOTION: 15.2,
            ECCENTRICITY: 0.001,
            INCLINATION: 53,
            RA_OF_ASC_NODE: 120,
            ARG_OF_PERICENTER: 30,
            MEAN_ANOMALY: 40,
            EPHEMERIS_TYPE: 0,
            CLASSIFICATION_TYPE: 'U',
            NORAD_CAT_ID: 90_001,
            ELEMENT_SET_NO: 999,
            REV_AT_EPOCH: 123,
            BSTAR: 0.0001,
            MEAN_MOTION_DOT: 0.00001,
            MEAN_MOTION_DDOT: 0,
          },
        ],
        satcatValue: [
          {
            NORAD_CAT_ID: 90_001,
            OBJECT_NAME: 'STARLINK TEST',
            OBJECT_ID: '2026-001A',
            OBJECT_TYPE: 'PAY',
          },
        ],
        gpRetrievedAt: '2026-10-01T19:45:01.000Z',
        satcatRetrievedAt: '2026-10-01T19:45:02.000Z',
        gpDecodedBytes: 1_000,
        satcatDecodedBytes: 900,
        gpSha256: 'a'.repeat(64),
        satcatSha256: 'b'.repeat(64),
      },
      '2026-10-01T19:45:03.000Z',
    )
    const response = await worker.fetch(
      new Request(
        `https://app.example${STARLINK_CATALOG_PATH}`,
      ),
      {
        ASSETS: {
          fetch: vi.fn(async () =>
            new Response(null, { status: 404 }),
          ),
        },
        ORBITAL_CATALOG: {
          get: vi.fn(async (key) =>
            key === STARLINK_CATALOG_KEY
              ? serializeStarlinkCatalogSnapshot(snapshot)
              : null,
          ),
          put: vi.fn(),
        },
        ORBITAL_CATALOG_ENABLED: 'true',
        STARLINK_CATALOG_ENABLED: 'true',
        RELEASE_SHA: releaseSha,
      },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe(
      STARLINK_CATALOG_MEDIA_TYPE,
    )
    expect(response.headers.get('x-livetrafficstan-release')).toBe(
      releaseSha,
    )
    expect(
      response.headers.get('x-livetrafficstan-starlink-source'),
    ).toBe('kv')
  })

  it('disables platform retries for scheduled catalog refreshes', async () => {
    const noRetry = vi.fn()
    const coordinatorFetch = vi.fn(
      async (_request: Request) =>
        new Response(
          JSON.stringify({
            kind: 'not-due',
            nextAllowedAtMs: Date.now() + 60_000,
          }),
          {
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
            },
          },
        ),
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

  it.each([
    ['disabled', { kind: 'disabled' }],
    [
      'not due',
      { kind: 'not-due', nextAllowedAtMs: Date.now() + 60_000 },
    ],
    ['published', { kind: 'published' }],
    [
      'Starlink published',
      {
        kind: 'published',
        starlink: { kind: 'published' },
      },
    ],
    [
      'Starlink not due',
      {
        kind: 'published',
        starlink: {
          kind: 'not-due',
          nextAllowedAtMs: Date.now() + 60_000,
        },
      },
    ],
    [
      'Starlink disabled',
      {
        kind: 'published',
        starlink: { kind: 'disabled' },
      },
    ],
  ])(
    'accepts the scheduled %s operational outcome',
    async (_label, outcome) => {
      const noRetry = vi.fn()
      const coordinatorFetch = vi.fn(
        async () =>
          new Response(JSON.stringify(outcome), {
            headers: { 'Content-Type': 'application/json' },
          }),
      )

      await expect(
        worker.scheduled(
          { noRetry },
          {
            ASSETS: { fetch: vi.fn() },
            ORBITAL_CATALOG_ENABLED: 'true',
            ORBITAL_CATALOG_COORDINATOR: {
              idFromName: vi.fn(() => 'coordinator-id'),
              get: vi.fn(() => ({ fetch: coordinatorFetch })),
            },
          },
        ),
      ).resolves.toBeUndefined()
      expect(noRetry).toHaveBeenCalledTimes(1)
      expect(coordinatorFetch).toHaveBeenCalledTimes(1)
    },
  )

  it.each([
    [
      'rate limited',
      { kind: 'rate-limited', nextAllowedAtMs: 1 },
      'rate limited',
    ],
    [
      'deferred',
      { kind: 'deferred', status: 503, nextAllowedAtMs: 1 },
      'deferred',
    ],
    ['blocked', { kind: 'blocked', status: 403 }, 'blocked'],
    [
      'catalog publication failed',
      { kind: 'failed', reason: 'publication failed' },
      'refresh failed',
    ],
    [
      'Starlink failed',
      {
        kind: 'published',
        starlink: { kind: 'failed', reason: 'provider failed' },
      },
      'Starlink failure',
    ],
    [
      'Starlink skipped',
      {
        kind: 'published',
        starlink: { kind: 'skipped', reason: 'storage failed' },
      },
      'skipped Starlink',
    ],
  ])(
    'surfaces the scheduled %s operational outcome',
    async (_label, outcome, message) => {
      const noRetry = vi.fn()
      const coordinatorFetch = vi.fn(
        async () =>
          new Response(JSON.stringify(outcome), {
            headers: { 'Content-Type': 'application/json' },
          }),
      )

      await expect(
        worker.scheduled(
          { noRetry },
          {
            ASSETS: { fetch: vi.fn() },
            ORBITAL_CATALOG_ENABLED: 'true',
            ORBITAL_CATALOG_COORDINATOR: {
              idFromName: vi.fn(() => 'coordinator-id'),
              get: vi.fn(() => ({ fetch: coordinatorFetch })),
            },
          },
        ),
      ).rejects.toThrow(message)
      expect(noRetry).toHaveBeenCalledTimes(1)
      expect(coordinatorFetch).toHaveBeenCalledTimes(1)
    },
  )

  it('rejects and cancels an oversized scheduled outcome', async () => {
    const noRetry = vi.fn()
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(20 * 1_024))
      },
      cancel,
    })
    const coordinatorFetch = vi.fn(
      async () =>
        new Response(body, {
          headers: { 'Content-Type': 'application/json' },
        }),
    )

    await expect(
      worker.scheduled(
        { noRetry },
        {
          ASSETS: { fetch: vi.fn() },
          ORBITAL_CATALOG_ENABLED: 'true',
          ORBITAL_CATALOG_COORDINATOR: {
            idFromName: vi.fn(() => 'coordinator-id'),
            get: vi.fn(() => ({ fetch: coordinatorFetch })),
          },
        },
      ),
    ).rejects.toThrow('outcome was invalid')
    expect(noRetry).toHaveBeenCalledTimes(1)
    expect(coordinatorFetch).toHaveBeenCalledTimes(1)
    expect(cancel).toHaveBeenCalledTimes(1)
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
