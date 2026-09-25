import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FlightRouteIdentity } from '../../domain/flightRoute'
import {
  AdsbLolFlightRouteProvider,
  FlightRouteProviderError,
} from './adsbLolFlightRouteProvider'

const config = {
  endpointBaseUrl: 'https://vrs-standing-data.adsb.lol/routes',
  timeoutMs: 1_000,
  maximumBytes: 32 * 1_024,
  sourceName: 'ADSB.lol',
  sourceWebsiteUrl: 'https://www.adsb.lol/',
}

const identity: FlightRouteIdentity = {
  callsign: 'TST123',
  icao24: 'ABC123',
  registration: 'ES-ABC',
  latitude: 59.8,
  longitude: 24.9,
}

const routePayload = {
  callsign: 'TST123',
  number: '123',
  airline_code: 'TST',
  airport_codes: 'EETN-EFHK',
  _airport_codes_iata: 'TLL-HEL',
  _airports: [
    {
      name: 'Tallinn Airport',
      icao: 'EETN',
      iata: 'TLL',
      location: 'Tallinn',
      countryiso2: 'EE',
      lat: 59.4133,
      lon: 24.8328,
    },
    {
      name: 'Helsinki Airport',
      icao: 'EFHK',
      iata: 'HEL',
      location: 'Helsinki',
      countryiso2: 'FI',
      lat: 60.3172,
      lon: 24.9633,
    },
  ],
}

const jsonResponse = (
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  })

describe('AdsbLolFlightRouteProvider', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('loads one exact standing route and validates geographic plausibility', async () => {
    const lastModified = 'Sun, 20 Sep 2026 18:48:09 GMT'
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse(routePayload, 200, {
          'Last-Modified': lastModified,
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const provider = new AdsbLolFlightRouteProvider(config)

    await expect(
      provider.lookup(identity, new AbortController().signal),
    ).resolves.toEqual({
      kind: 'available',
      route: {
        flightIcao: 'TST123',
        confidence: 'plausible',
        departure: {
          name: 'Tallinn Airport',
          code: 'TLL',
        },
        arrival: {
          name: 'Helsinki Airport',
          code: 'HEL',
        },
        providerUpdatedAt: Date.parse(lastModified),
        source: {
          name: 'ADSB.lol',
          websiteUrl: 'https://www.adsb.lol/',
        },
      },
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [input, init] = fetchMock.mock.calls[0]!
    expect(String(input)).toBe(
      'https://vrs-standing-data.adsb.lol/routes/TS/TST123.json',
    )
    expect(init).toEqual(
      expect.objectContaining({
        method: 'GET',
        redirect: 'error',
        cache: 'no-store',
        credentials: 'omit',
        headers: {
          Accept: 'application/json',
        },
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('returns truthful unavailable states for absent, incomplete, and implausible routes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 404))
      .mockResolvedValueOnce(
        jsonResponse({
          ...routePayload,
          _airports: routePayload._airports.slice(0, 1),
        }),
      )
      .mockResolvedValueOnce(jsonResponse(routePayload))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new AdsbLolFlightRouteProvider(config)

    await expect(
      provider.lookup(identity, new AbortController().signal),
    ).resolves.toEqual({ kind: 'unavailable', reason: 'not-found' })
    await expect(
      provider.lookup(identity, new AbortController().signal),
    ).resolves.toEqual({ kind: 'unavailable', reason: 'incomplete' })
    await expect(
      provider.lookup(
        {
          ...identity,
          latitude: -33.9,
          longitude: 151.2,
        },
        new AbortController().signal,
      ),
    ).resolves.toEqual({ kind: 'unavailable', reason: 'implausible' })
  })

  it.each([
    [429, 'quota-exhausted'],
    [500, 'provider-error'],
  ] as const)('maps HTTP %i to %s', async (status, reason) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'ignored' }, status)),
    )
    const provider = new AdsbLolFlightRouteProvider(config)

    await expect(
      provider.lookup(identity, new AbortController().signal),
    ).rejects.toMatchObject<Partial<FlightRouteProviderError>>({ reason })
  })

  it('rejects malformed, mismatched, unsafe, and oversized route responses', async () => {
    const provider = new AdsbLolFlightRouteProvider({
      ...config,
      maximumBytes: 512,
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('<html>wrong</html>', {
          headers: { 'Content-Type': 'text/html' },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ...routePayload,
          callsign: 'OTH456',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ...routePayload,
          _airports: [
            {
              ...routePayload._airports[0],
              lat: 91,
            },
            routePayload._airports[1],
          ],
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(routePayload), {
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': '513',
          },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    for (let index = 0; index < 4; index += 1) {
      await expect(
        provider.lookup(identity, new AbortController().signal),
      ).rejects.toMatchObject({ reason: 'provider-error' })
    }
  })

  it('times out and propagates selection cancellation', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true },
          )
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const provider = new AdsbLolFlightRouteProvider({
      ...config,
      timeoutMs: 100,
    })

    const timedOut = provider.lookup(
      identity,
      new AbortController().signal,
    )
    const timeoutExpectation = expect(timedOut).rejects.toMatchObject({
      reason: 'provider-error',
    })
    await vi.advanceTimersByTimeAsync(100)
    await timeoutExpectation

    const controller = new AbortController()
    const canceled = provider.lookup(identity, controller.signal)
    controller.abort()
    await expect(canceled).rejects.toMatchObject({
      name: 'AbortError',
    })
  })
})
