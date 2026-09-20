import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AVIATIONSTACK_FLIGHTS_URL,
  handleFlightRoute,
  type FlightRouteFetch,
  type FlightRouteWorkerEnv,
} from './flightRoute.js'
import {
  FLIGHT_ROUTE_QUOTA_OBJECT_NAME,
  type FlightRouteQuotaNamespace,
} from './flightRouteQuota.js'

const accessKey = 'aviationstack-test-secret'

const identity = {
  callsign: 'TST123',
  icao24: 'ABC123',
  registration: 'ES-ABC',
}

const matchingFlight = {
  flight_status: 'active',
  departure: {
    airport: 'Tallinn Airport',
    iata: 'TLL',
    icao: 'EETN',
  },
  arrival: {
    airport: 'Helsinki Airport',
    iata: 'HEL',
    icao: 'EFHK',
  },
  flight: {
    number: '123',
    iata: 'TS123',
    icao: 'TST123',
    codeshared: null,
  },
  aircraft: {
    registration: 'ES-ABC',
    icao24: 'ABC123',
  },
  live: {
    updated: '2026-09-20T12:00:00Z',
  },
}

const providerResponse = (
  data: unknown[],
  pagination: Partial<Record<'limit' | 'offset' | 'count' | 'total', number>> = {},
) =>
  new Response(
    JSON.stringify({
      pagination: {
        limit: 100,
        offset: 0,
        count: data.length,
        total: data.length,
        ...pagination,
      },
      data,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    },
  )

const routeRequest = (
  body: unknown = identity,
  init: RequestInit = {},
) =>
  new Request('https://app.example/api/flight-route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...init,
  })

const quota = (
  response: Response = new Response(
    JSON.stringify({ allowed: true, remaining: 89 }),
    {
      headers: { 'Content-Type': 'application/json' },
    },
  ),
) => {
  const reserve = vi.fn(async () => response)
  const get = vi.fn(() => ({ fetch: reserve }))
  const idFromName = vi.fn(() => 'quota-id')
  const namespace: FlightRouteQuotaNamespace = { idFromName, get }
  return { namespace, idFromName, get, reserve }
}

const enabledEnv = (
  namespace: FlightRouteQuotaNamespace,
): FlightRouteWorkerEnv => ({
  AVIATIONSTACK_ENABLED: 'true',
  AVIATIONSTACK_ACCESS_KEY: accessKey,
  FLIGHT_ROUTE_QUOTA: namespace,
})

describe('flight route Worker', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('stays hidden and spends nothing while disabled', async () => {
    const quotaBinding = quota()
    const fetchImpl = vi.fn()

    const response = await handleFlightRoute(
      routeRequest(),
      {
        AVIATIONSTACK_ENABLED: 'false',
        AVIATIONSTACK_ACCESS_KEY: accessKey,
        FLIGHT_ROUTE_QUOTA: quotaBinding.namespace,
      },
      { fetchImpl },
    )

    expect(response.status).toBe(404)
    expect(quotaBinding.reserve).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('fails closed when enabled without the secret or quota binding', async () => {
    const fetchImpl = vi.fn()
    const withoutSecret = await handleFlightRoute(
      routeRequest(),
      {
        AVIATIONSTACK_ENABLED: 'true',
        FLIGHT_ROUTE_QUOTA: quota().namespace,
      },
      { fetchImpl },
    )
    const withoutQuota = await handleFlightRoute(
      routeRequest(),
      {
        AVIATIONSTACK_ENABLED: 'true',
        AVIATIONSTACK_ACCESS_KEY: accessKey,
      },
      { fetchImpl },
    )

    expect(withoutSecret.status).toBe(503)
    expect(withoutQuota.status).toBe(503)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it.each([
    [
      new Request('https://app.example/api/flight-route?callsign=TST123', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(identity),
      }),
      400,
    ],
    [
      new Request('https://app.example/api/flight-route', {
        method: 'GET',
      }),
      405,
    ],
    [
      new Request('https://app.example/api/flight-route', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(identity),
      }),
      415,
    ],
    [
      new Request('https://app.example/api/flight-route', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Encoding': 'gzip',
        },
        body: JSON.stringify(identity),
      }),
      415,
    ],
    [routeRequest({ ...identity, extra: true }), 400],
    [routeRequest({ ...identity, callsign: 'TSTABC' }), 400],
    [routeRequest({ ...identity, icao24: '~BC123' }), 400],
  ])('rejects invalid requests before quota reservation', async (
    request,
    expectedStatus,
  ) => {
    const quotaBinding = quota()
    const fetchImpl = vi.fn()

    const response = await handleFlightRoute(
      request,
      enabledEnv(quotaBinding.namespace),
      { fetchImpl },
    )

    expect(response.status).toBe(expectedStatus)
    expect(quotaBinding.reserve).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects oversized request bodies before quota reservation', async () => {
    const quotaBinding = quota()
    const response = await handleFlightRoute(
      routeRequest(),
      enabledEnv(quotaBinding.namespace),
      {
        fetchImpl: vi.fn(),
        maxRequestBytes: 8,
      },
    )

    expect(response.status).toBe(413)
    expect(quotaBinding.reserve).not.toHaveBeenCalled()
  })

  it('reserves the global quota and makes exactly one fixed upstream request', async () => {
    const quotaBinding = quota()
    const fetchImpl = vi.fn<FlightRouteFetch>(async () =>
      providerResponse([matchingFlight]),
    )

    const response = await handleFlightRoute(
      routeRequest({
        callsign: ' tst123 ',
        icao24: 'abc123',
        registration: ' es-abc ',
      }),
      enabledEnv(quotaBinding.namespace),
      { fetchImpl },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await response.json()).toEqual({
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
        providerUpdatedAt: 1_789_905_600_000,
      },
    })
    expect(quotaBinding.idFromName).toHaveBeenCalledWith(
      FLIGHT_ROUTE_QUOTA_OBJECT_NAME,
    )
    expect(quotaBinding.reserve).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [upstreamInput, upstreamInit] = fetchImpl.mock.calls[0]!
    const upstreamUrl = new URL(String(upstreamInput))
    expect(`${upstreamUrl.origin}${upstreamUrl.pathname}`).toBe(
      AVIATIONSTACK_FLIGHTS_URL,
    )
    expect(upstreamUrl.searchParams.get('access_key')).toBe(accessKey)
    expect(upstreamUrl.searchParams.get('flight_icao')).toBe('TST123')
    expect(upstreamUrl.searchParams.get('flight_status')).toBe('active')
    expect(upstreamUrl.searchParams.get('limit')).toBe('100')
    expect(upstreamUrl.searchParams.has('flight_date')).toBe(false)
    expect(upstreamInit).toMatchObject({
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
  })

  it('returns truthful unavailable states for strict matching', async () => {
    const cases = [
      {
        rows: [{ ...matchingFlight, flight_status: 'scheduled' }],
        expected: 'not-found',
      },
      {
        rows: [
          {
            ...matchingFlight,
            aircraft: { ...matchingFlight.aircraft, icao24: 'DEF456' },
          },
        ],
        expected: 'not-found',
      },
      {
        rows: [
          {
            ...matchingFlight,
            aircraft: {
              ...matchingFlight.aircraft,
              registration: 'ES-OTHER',
            },
          },
        ],
        expected: 'not-found',
      },
      {
        rows: [
          {
            ...matchingFlight,
            flight: {
              ...matchingFlight.flight,
              codeshared: { airline_name: 'Other' },
            },
          },
        ],
        expected: 'not-found',
      },
      {
        rows: [matchingFlight, matchingFlight],
        expected: 'ambiguous',
      },
    ]

    for (const { rows, expected } of cases) {
      const quotaBinding = quota()
      const response = await handleFlightRoute(
        routeRequest(),
        enabledEnv(quotaBinding.namespace),
        {
          fetchImpl: async () => providerResponse(rows),
        },
      )
      expect(await response.json()).toEqual({
        status: 'unavailable',
        reason: expected,
      })
    }
  })

  it('rejects incomplete pagination without requesting another page', async () => {
    const quotaBinding = quota()
    const fetchImpl = vi.fn<FlightRouteFetch>(async () =>
      providerResponse([matchingFlight], { total: 101 }),
    )

    const response = await handleFlightRoute(
      routeRequest(),
      enabledEnv(quotaBinding.namespace),
      { fetchImpl },
    )

    expect(await response.json()).toEqual({
      status: 'unavailable',
      reason: 'incomplete',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('returns local quota exhaustion without calling aviationstack', async () => {
    const quotaBinding = quota(
      new Response(
        JSON.stringify({
          allowed: false,
          retryAfterSeconds: 60,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '60',
          },
        },
      ),
    )
    const fetchImpl = vi.fn()

    const response = await handleFlightRoute(
      routeRequest(),
      enabledEnv(quotaBinding.namespace),
      { fetchImpl },
    )

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('60')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('sanitizes provider failures without refunding the reservation or leaking the key', async () => {
    const failures: FlightRouteFetch[] = [
      async () =>
        new Response(null, {
          status: 302,
          headers: { Location: `https://example.test/${accessKey}` },
        }),
      async () =>
        new Response('<html>wrong</html>', {
          headers: { 'Content-Type': 'text/html' },
        }),
      async () =>
        new Response(
          JSON.stringify({
            error: {
              message: `secret=${accessKey}`,
            },
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      async () =>
        new Response('123456789', {
          headers: { 'Content-Type': 'application/json' },
        }),
    ]

    for (const [index, fetchImpl] of failures.entries()) {
      const quotaBinding = quota()
      const response = await handleFlightRoute(
        routeRequest(),
        enabledEnv(quotaBinding.namespace),
        {
          fetchImpl,
          maxResponseBytes: index === failures.length - 1 ? 8 : undefined,
        },
      )
      const text = await response.text()
      expect(response.status).toBe(502)
      expect(text).not.toContain(accessKey)
      expect(response.headers.has('location')).toBe(false)
      expect(quotaBinding.reserve).toHaveBeenCalledTimes(1)
    }
  })

  it('times out and propagates client cancellation after reservation', async () => {
    vi.useFakeTimers()
    const fetchImpl: FlightRouteFetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(init.signal?.reason),
          { once: true },
        )
      })

    const timeoutQuota = quota()
    const timedOut = handleFlightRoute(
      routeRequest(),
      enabledEnv(timeoutQuota.namespace),
      { fetchImpl, timeoutMs: 100 },
    )
    const timeoutExpectation = expect(timedOut).resolves.toMatchObject({
      status: 504,
    })
    await vi.advanceTimersByTimeAsync(100)
    await timeoutExpectation
    expect(timeoutQuota.reserve).toHaveBeenCalledTimes(1)

    const cancelQuota = quota()
    const controller = new AbortController()
    const canceled = handleFlightRoute(
      routeRequest(identity, { signal: controller.signal }),
      enabledEnv(cancelQuota.namespace),
      { fetchImpl },
    )
    await vi.waitFor(() =>
      expect(cancelQuota.reserve).toHaveBeenCalledTimes(1),
    )
    controller.abort()
    expect((await canceled).status).toBe(499)
  })
})
