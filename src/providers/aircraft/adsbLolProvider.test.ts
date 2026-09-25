import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AIRCRAFT_PROXY_TIMEOUT_MS,
  MAX_AIRCRAFT_RESPONSE_BYTES,
} from '../../../worker/aircraftProxy'
import {
  ADSB_LOL_REQUEST_TIMEOUT_MS,
  AdsbLolAircraftProvider,
  MAX_ADSB_LOL_RESPONSE_BYTES,
  aircraftQueryRadiusNauticalMiles,
  normalizeAdsbLolResponse,
} from './adsbLolProvider'

const query = {
  center: {
    latitude: 59.437,
    longitude: 24.7536,
    label: 'Tallinn',
  },
  radiusKm: 20,
}

describe('normalizeAdsbLolResponse', () => {
  it('normalizes reliable aircraft fields and metric units', () => {
    const receivedAt = 1_800_000_000_000
    const result = normalizeAdsbLolResponse(
      {
        now: receivedAt,
        ac: [
          {
            hex: 'abc123',
            lat: 59.45,
            lon: 24.8,
            seen_pos: 2,
            flight: ' TST123 ',
            r: 'ES-ABC',
            t: 'A320',
            category: 'A3',
            alt_baro: 10_000,
            gs: 100,
            track: 91,
            true_heading: 94,
            baro_rate: 600,
            squawk: '7000',
          },
        ],
      },
      query,
      receivedAt,
    )

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'aircraft:abc123',
      hex: 'ABC123',
      callsign: 'TST123',
      registration: 'ES-ABC',
      aircraftType: 'A320',
      category: 'Large aircraft',
      altitudeMeters: 3_048,
      courseDegrees: 91,
      headingDegrees: 94,
      verticalSpeedMps: 3.048,
      markerIcon: 'aircraft',
      markerScale: 1.08,
    })

    expect(result[0]?.speedKph).toBeCloseTo(185.2)
    expect(result[0]?.position.observedAt).toBe(receivedAt - 2_000)
  })

  it('uses a ground altitude and ignores entries outside the requested radius', () => {
    const result = normalizeAdsbLolResponse(
      {
        now: 1_800_000_000_000,
        ac: [
          {
            hex: 'ground1',
            lat: 59.44,
            lon: 24.75,
            alt_baro: 'ground',
            messages: 1,
            seen: 0,
          },
          {
            hex: 'faraway',
            lat: 60.2,
            lon: 25.5,
          },
          {
            hex: 'missing-position',
          },
        ],
      },
      query,
      1_800_000_000_000,
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.altitudeMeters).toBe(0)
  })

  it('maps only reported emitter categories to the bounded icon vocabulary', () => {
    const aircraft = normalizeAdsbLolResponse(
      {
        now: 1_800_000_000_000,
        ac: [
          { hex: 'a10001', lat: 59.44, lon: 24.75, category: 'A1' },
          { hex: 'a20002', lat: 59.44, lon: 24.75, category: 'A2' },
          { hex: 'a30003', lat: 59.44, lon: 24.75, category: 'A3' },
          { hex: 'a40004', lat: 59.44, lon: 24.75, category: 'A4' },
          { hex: 'a50005', lat: 59.44, lon: 24.75, category: 'A5' },
          { hex: 'a60006', lat: 59.44, lon: 24.75, category: 'A6' },
          { hex: 'a70007', lat: 59.44, lon: 24.75, category: 'A7' },
          {
            hex: 'unknown',
            lat: 59.44,
            lon: 24.75,
            category: 'A8',
            t: 'H125',
            gs: 500,
          },
          {
            hex: 'missing',
            lat: 59.44,
            lon: 24.75,
            t: 'HELICOPTER',
            gs: 0,
          },
        ],
      },
      query,
      1_800_000_000_000,
    )

    expect(
      aircraft.map(({ category, markerIcon, markerScale }) => ({
        category,
        markerIcon,
        markerScale,
      })),
    ).toEqual([
      {
        category: 'Light aircraft',
        markerIcon: 'aircraft-light',
        markerScale: 0.78,
      },
      {
        category: 'Small aircraft',
        markerIcon: 'aircraft-light',
        markerScale: 0.9,
      },
      {
        category: 'Large aircraft',
        markerIcon: 'aircraft',
        markerScale: 1.08,
      },
      {
        category: 'Large aircraft',
        markerIcon: 'aircraft',
        markerScale: 1.08,
      },
      {
        category: 'Heavy aircraft',
        markerIcon: 'aircraft-heavy',
        markerScale: 1.22,
      },
      {
        category: 'High-performance aircraft',
        markerIcon: 'aircraft',
        markerScale: 1,
      },
      {
        category: 'Rotorcraft',
        markerIcon: 'helicopter',
        markerScale: 0.92,
      },
      {
        category: undefined,
        markerIcon: 'aircraft',
        markerScale: 0.94,
      },
      {
        category: undefined,
        markerIcon: 'aircraft',
        markerScale: 0.94,
      },
    ])
  })

  it('rejects a malformed top-level response', () => {
    expect(() =>
      normalizeAdsbLolResponse({ aircraft: [] }, query, Date.now()),
    ).toThrow(/malformed aircraft response/)
  })
})

describe('aircraftQueryRadiusNauticalMiles', () => {
  it('rounds an eligible 100 km viewport outward to 54 nautical miles', () => {
    expect(aircraftQueryRadiusNauticalMiles(100)).toBe(54)
    expect(54 * 1.852).toBeCloseTo(100.008)
  })
})

describe('AdsbLolAircraftProvider', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('retains the Worker response limit and allows its timeout to complete', () => {
    expect(MAX_ADSB_LOL_RESPONSE_BYTES).toBe(MAX_AIRCRAFT_RESPONSE_BYTES)
    expect(ADSB_LOL_REQUEST_TIMEOUT_MS).toBeGreaterThan(
      AIRCRAFT_PROXY_TIMEOUT_MS,
    )
  })

  it('requests the exact bounded point endpoint without cache or credentials', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          now: 1_800_000_000_000,
          ac: [],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const signal = new AbortController().signal
    const provider = new AdsbLolAircraftProvider(
      'https://aircraft.example.test',
    )

    await expect(provider.fetchSnapshot(query, signal)).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://aircraft.example.test/v2/point/59.437/24.7536/11',
      {
        signal: expect.any(AbortSignal),
        method: 'GET',
        redirect: 'error',
        cache: 'no-store',
        credentials: 'omit',
        headers: {
          Accept: 'application/json',
        },
      },
    )
  })

  it('forwards caller cancellation to the provider request', async () => {
    const fetchMock = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true },
          )
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    const provider = new AdsbLolAircraftProvider('/api/aircraft')
    const request = provider.fetchSnapshot(query, controller.signal)

    controller.abort()

    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
  })

  it('rejects oversized provider responses before parsing them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('123456789', { status: 200 })),
    )
    const provider = new AdsbLolAircraftProvider('/api/aircraft', {
      maximumBytes: 8,
    })

    await expect(
      provider.fetchSnapshot(query, new AbortController().signal),
    ).rejects.toThrow('ADSB.lol response exceeded the 8-byte limit')
  })

  it('times out a provider request that does not complete', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              'abort',
              () => reject(init.signal?.reason),
              { once: true },
            )
          }),
      ),
    )
    const provider = new AdsbLolAircraftProvider('/api/aircraft', {
      timeoutMs: 100,
    })
    const request = expect(
      provider.fetchSnapshot(query, new AbortController().signal),
    ).rejects.toThrow('ADSB.lol request timed out')

    await vi.advanceTimersByTimeAsync(100)
    await request
  })

  it('reports invalid JSON without publishing an empty success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{', { status: 200 })),
    )
    const provider = new AdsbLolAircraftProvider('/api/aircraft')

    await expect(
      provider.fetchSnapshot(query, new AbortController().signal),
    ).rejects.toThrow('ADSB.lol returned invalid JSON')
  })

  it('preserves upstream status, body, and Retry-After guidance', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('slow down', {
          status: 429,
          headers: {
            'Retry-After': '30',
          },
        }),
      ),
    )
    const provider = new AdsbLolAircraftProvider('/api/aircraft')

    await expect(
      provider.fetchSnapshot(query, new AbortController().signal),
    ).rejects.toMatchObject({
      status: 429,
      retryAfterMs: 30_000,
      message: 'ADSB.lol returned HTTP 429: slow down',
    })
  })
})
