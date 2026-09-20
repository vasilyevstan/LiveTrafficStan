import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FlightRouteIdentity } from '../../domain/flightRoute'
import {
  AviationstackFlightRouteProvider,
  FlightRouteProviderError,
} from './aviationstackFlightRouteProvider'

const config = {
  endpointUrl: '/api/flight-route',
  timeoutMs: 1_000,
  maximumBytes: 2_048,
  sourceName: 'aviationstack',
  sourceWebsiteUrl: 'https://aviationstack.com/',
}

const identity: FlightRouteIdentity = {
  callsign: 'TST123',
  icao24: 'ABC123',
  registration: 'ES-ABC',
}

const jsonResponse = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const routePayload = {
  status: 'route',
  route: {
    flightIcao: 'TST123',
    flightIata: 'TS123',
    flightStatus: 'active',
    departure: {
      name: 'Tallinn Airport',
      code: 'TLL',
    },
    arrival: {
      name: 'Helsinki Airport',
      code: 'HEL',
    },
    providerUpdatedAt: 1_800_000_000_000,
  },
}

describe('AviationstackFlightRouteProvider', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('uses one explicit same-origin JSON request and validates the route', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(routePayload))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new AviationstackFlightRouteProvider(config)

    await expect(
      provider.lookup(identity, new AbortController().signal),
    ).resolves.toEqual({
      kind: 'available',
      route: {
        ...routePayload.route,
        source: {
          name: 'aviationstack',
          websiteUrl: 'https://aviationstack.com/',
        },
      },
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/flight-route',
      expect.objectContaining({
        method: 'POST',
        redirect: 'manual',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(identity),
      }),
    )
  })

  it.each(['not-found', 'ambiguous', 'incomplete'] as const)(
    'preserves the %s unavailable reason',
    async (reason) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          jsonResponse({ status: 'unavailable', reason }),
        ),
      )
      const provider = new AviationstackFlightRouteProvider(config)

      await expect(
        provider.lookup(identity, new AbortController().signal),
      ).resolves.toEqual({ kind: 'unavailable', reason })
    },
  )

  it.each([
    [429, 'quota-exhausted'],
    [404, 'configuration'],
    [503, 'configuration'],
    [502, 'provider-error'],
  ] as const)('maps HTTP %i to %s', async (status, reason) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'ignored' }, status)),
    )
    const provider = new AviationstackFlightRouteProvider(config)

    await expect(
      provider.lookup(identity, new AbortController().signal),
    ).rejects.toMatchObject<Partial<FlightRouteProviderError>>({ reason })
  })

  it('rejects malformed, unsafe, and oversized route responses', async () => {
    const provider = new AviationstackFlightRouteProvider({
      ...config,
      maximumBytes: 16,
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('<html>wrong</html>', {
          headers: { 'Content-Type': 'text/html' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('{"status":"route"}', {
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ...routePayload,
          route: {
            ...routePayload.route,
            flightStatus: 'scheduled',
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ...routePayload,
          route: {
            ...routePayload.route,
            flightIcao: 'OTH456',
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
    const provider = new AviationstackFlightRouteProvider({
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
