import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  decodeGtfsVehicleFeed,
  GtfsDecodeError,
} from './gtfsRealtime.js'
import {
  handleLirrProxy,
  LIRR_EDGE_CACHE_SECONDS,
  LIRR_PROXY_PATH,
  MTA_LIRR_FEED_URL,
  type LirrFeedCache,
  type LirrProxyBody,
  type LirrProxyFetch,
} from './lirrProxy.js'
import { TRAIN_CONFIG } from '../src/config/trainConfig.js'

const varint = (value: number) => {
  const bytes: number[] = []
  let remaining = value
  while (remaining >= 128) {
    bytes.push((remaining % 128) | 0x80)
    remaining = Math.floor(remaining / 128)
  }
  bytes.push(remaining)
  return bytes
}
const key = (field: number, wireType: number) => varint(field * 8 + wireType)
const intField = (field: number, value: number) => [...key(field, 0), ...varint(value)]
const bytesField = (field: number, bytes: number[]) => [
  ...key(field, 2), ...varint(bytes.length), ...bytes,
]
const textField = (field: number, value: string) =>
  bytesField(field, [...new TextEncoder().encode(value)])
const floatField = (field: number, value: number) => {
  const view = new DataView(new ArrayBuffer(4))
  view.setFloat32(0, value, true)
  return [...key(field, 5), ...new Uint8Array(view.buffer)]
}

interface VehicleSpec {
  entityId?: string
  latitude?: number
  longitude?: number
  bearing?: number
  speed?: number
  timestamp?: number
  vehicleId?: string
  label?: string
  tripId?: string
  deleted?: boolean
}

const entity = (spec: VehicleSpec) => {
  const position = [
    ...(spec.latitude === undefined ? [] : floatField(1, spec.latitude)),
    ...(spec.longitude === undefined ? [] : floatField(2, spec.longitude)),
    ...(spec.bearing === undefined ? [] : floatField(3, spec.bearing)),
    ...(spec.speed === undefined ? [] : floatField(5, spec.speed)),
  ]
  const vehicle = [
    ...(spec.tripId ? bytesField(1, textField(1, spec.tripId)) : []),
    ...bytesField(2, position),
    ...(spec.timestamp === undefined ? [] : intField(5, spec.timestamp)),
    ...bytesField(8, [
      ...(spec.vehicleId ? textField(1, spec.vehicleId) : []),
      ...(spec.label ? textField(2, spec.label) : []),
    ]),
  ]
  return bytesField(2, [
    ...textField(1, spec.entityId ?? 'entity-1'),
    ...(spec.deleted ? intField(2, 1) : []),
    ...bytesField(4, vehicle),
  ])
}

const observedSeconds = 1_794_662_000
const feed = (...entities: number[][]) => new Uint8Array([
  ...bytesField(1, [...textField(1, '2.0'), ...intField(3, observedSeconds + 30)]),
  ...entities.flat(),
])

const validVehicle: VehicleSpec = {
  entityId: 'GO203_26_6412_V',
  vehicleId: '7756_6412',
  label: '7756',
  tripId: 'GO203_26_6412',
  latitude: 40.829036,
  longitude: -73.687401,
  timestamp: observedSeconds,
}

const limits = { maximumEntities: 10, maximumVehicles: 5, maximumStringBytes: 64 }

describe('GTFS-Realtime vehicle decoder', () => {
  it('decodes vehicle identity, observed position, and optional motion', () => {
    const decoded = decodeGtfsVehicleFeed(
      feed(entity({ ...validVehicle, bearing: 92.5, speed: 21.5 })),
      limits,
    )
    expect(decoded.feedTimestamp).toBe(observedSeconds + 30)
    expect(decoded.vehicles).toHaveLength(1)
    expect(decoded.vehicles[0]).toMatchObject({
      entityId: 'GO203_26_6412_V',
      vehicleId: '7756_6412',
      label: '7756',
      tripId: 'GO203_26_6412',
      bearing: 92.5,
      speedMetersPerSecond: 21.5,
      timestamp: observedSeconds,
    })
    expect(decoded.vehicles[0]!.latitude).toBeCloseTo(40.829036, 4)
  })

  it('omits deleted, unplaced, null-island, untimed, and out-of-range vehicles', () => {
    const decoded = decodeGtfsVehicleFeed(feed(
      entity({ ...validVehicle, entityId: 'deleted', deleted: true }),
      entity({ ...validVehicle, entityId: 'no-lat', latitude: undefined }),
      entity({ ...validVehicle, entityId: 'null-island', latitude: 0, longitude: 0 }),
      entity({ ...validVehicle, entityId: 'no-time', timestamp: undefined }),
      entity({ ...validVehicle, entityId: 'bad-lat', latitude: 91 }),
      entity({ ...validVehicle, entityId: 'ok', bearing: 400, speed: -1 }),
    ), limits)
    expect(decoded.vehicles.map((vehicle) => vehicle.entityId)).toEqual(['ok'])
    expect(decoded.vehicles[0]).not.toHaveProperty('bearing')
    expect(decoded.vehicles[0]).not.toHaveProperty('speedMetersPerSecond')
  })

  it('rejects truncated payloads and entity floods', () => {
    const bytes = feed(entity(validVehicle))
    expect(() => decodeGtfsVehicleFeed(bytes.subarray(0, bytes.length - 3), limits))
      .toThrow(GtfsDecodeError)
    const flood = feed(...Array.from({ length: 11 }, () => entity(validVehicle)))
    expect(() => decodeGtfsVehicleFeed(flood, limits)).toThrow(GtfsDecodeError)
  })
})

const proxyRequest = (path = LIRR_PROXY_PATH, init?: RequestInit) =>
  new Request(`https://app.example${path}`, init)

const protobufResponse = (bytes: Uint8Array<ArrayBuffer>, init?: ResponseInit) =>
  new Response(bytes, {
    ...init,
    headers: { 'Content-Type': 'application/octet-stream', ...init?.headers },
  })

describe('LIRR proxy', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('matches the browser train endpoint', () => {
    expect(TRAIN_CONFIG.lirr.endpoint).toBe(LIRR_PROXY_PATH)
  })

  it('fetches the fixed feed without browser headers and returns bounded JSON', async () => {
    const fetchImpl = vi.fn<LirrProxyFetch>(async () =>
      protobufResponse(feed(entity({ ...validVehicle, bearing: 12.34 }))))
    const response = await handleLirrProxy(
      proxyRequest(LIRR_PROXY_PATH, {
        headers: { Cookie: 'private=true', 'X-Forwarded-For': '192.0.2.1' },
      }),
      { fetchImpl, now: () => Date.UTC(2026, 10, 14, 12) },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(fetchImpl).toHaveBeenCalledWith(MTA_LIRR_FEED_URL, expect.objectContaining({
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
      headers: { Accept: 'application/x-protobuf, application/octet-stream' },
    }))
    const body = await response.json() as LirrProxyBody
    expect(body).toEqual({
      retrievedAt: '2026-11-14T12:00:00.000Z',
      vehicles: [{
        id: '7756_6412',
        label: '7756',
        tripId: 'GO203_26_6412',
        latitude: 40.82904,
        longitude: -73.6874,
        bearing: 12.3,
        observedAt: new Date(observedSeconds * 1_000).toISOString(),
      }],
    })
  })

  it('rejects methods and query parameters before contacting the upstream', async () => {
    const fetchImpl = vi.fn<LirrProxyFetch>()
    expect((await handleLirrProxy(proxyRequest(LIRR_PROXY_PATH, { method: 'POST' }), { fetchImpl })).status).toBe(405)
    expect((await handleLirrProxy(proxyRequest(`${LIRR_PROXY_PATH}?x=1`), { fetchImpl })).status).toBe(400)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('passes rate limiting through with Retry-After and hides other upstream failures', async () => {
    const limited = await handleLirrProxy(proxyRequest(), {
      fetchImpl: async () => new Response('slow down', {
        status: 429, headers: { 'Retry-After': '30' },
      }),
    })
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('30')

    const failed = await handleLirrProxy(proxyRequest(), {
      fetchImpl: async () => new Response('internal detail', { status: 500 }),
    })
    expect(failed.status).toBe(502)
    expect(await failed.text()).toBe('LIRR upstream unavailable')
  })

  it('rejects redirects, unsafe types, oversized bodies, and invalid feeds', async () => {
    const redirect = await handleLirrProxy(proxyRequest(), {
      fetchImpl: async () => new Response(null, {
        status: 302, headers: { Location: 'https://example.com' },
      }),
    })
    expect(redirect.status).toBe(502)

    const html = await handleLirrProxy(proxyRequest(), {
      fetchImpl: async () => new Response('<html>', {
        headers: { 'Content-Type': 'text/html' },
      }),
    })
    expect(html.status).toBe(502)

    const large = await handleLirrProxy(proxyRequest(), {
      fetchImpl: async () => protobufResponse(feed(entity(validVehicle))),
      maxResponseBytes: 8,
    })
    expect(await large.text()).toBe('LIRR upstream response was too large')

    const invalid = await handleLirrProxy(proxyRequest(), {
      fetchImpl: async () => protobufResponse(new Uint8Array([0x12, 0x7f])),
    })
    expect(await invalid.text()).toBe('LIRR upstream returned an invalid feed')
  })

  it('serves the bounded per-edge cache without another upstream fetch', async () => {
    const stored = new Map<string, Response>()
    const cache: LirrFeedCache = {
      match: async (request) => stored.get(request.url)?.clone(),
      put: async (request, response) => { stored.set(request.url, response) },
    }
    const fetchImpl = vi.fn<LirrProxyFetch>(async () =>
      protobufResponse(feed(entity(validVehicle))))
    const first = await handleLirrProxy(proxyRequest(), { fetchImpl, cache })
    const second = await handleLirrProxy(proxyRequest(), { fetchImpl, cache })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(await second.text()).toBe(await first.text())
    expect(second.headers.get('cache-control')).toBe('no-store')
    expect(stored.get(`https://app.example${LIRR_PROXY_PATH}`)?.headers.get('cache-control'))
      .toBe(`public, max-age=${LIRR_EDGE_CACHE_SECONDS}`)
  })

  it('falls back to the upstream when the cache fails', async () => {
    const cache: LirrFeedCache = {
      match: async () => { throw new Error('cache down') },
      put: async () => { throw new Error('cache down') },
    }
    const response = await handleLirrProxy(proxyRequest(), {
      cache,
      fetchImpl: async () => protobufResponse(feed(entity(validVehicle))),
    })
    expect(response.status).toBe(200)
  })

  it('times out a stalled upstream', async () => {
    vi.useFakeTimers()
    const pending = handleLirrProxy(proxyRequest(), {
      timeoutMs: 1_000,
      fetchImpl: (_input, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      }),
    })
    await vi.advanceTimersByTimeAsync(1_000)
    const response = await pending
    expect(response.status).toBe(504)
  })
})
