import { describe, expect, it, vi } from 'vitest'
import type {
  FlightRouteIdentity,
  FlightRouteLookupResult,
} from '../domain/flightRoute'
import {
  FlightRouteProviderError,
  type FlightRouteProvider,
} from '../providers/flightRoute/adsbLolFlightRouteProvider'
import { FlightRouteController } from './FlightRouteController'

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

const identities: Record<string, FlightRouteIdentity> = {
  first: {
    callsign: 'TST123',
    icao24: 'ABC123',
    registration: 'ES-ABC',
    latitude: 59.437,
    longitude: 24.7536,
  },
  second: {
    callsign: 'TST456',
    icao24: 'DEF456',
    registration: 'ES-DEF',
    latitude: 59.437,
    longitude: 24.7536,
  },
}

const available = (
  flightIcao: string,
): Extract<FlightRouteLookupResult, { kind: 'available' }> => ({
  kind: 'available',
  route: {
    flightIcao,
    confidence: 'plausible',
    departure: { name: 'Tallinn Airport', code: 'TLL' },
    arrival: { name: 'Helsinki Airport', code: 'HEL' },
    source: {
      name: 'ADSB.lol',
      websiteUrl: 'https://www.adsb.lol/',
    },
  },
})

describe('FlightRouteController', () => {
  it('does not spend a request on selection or unchanged live refreshes', () => {
    const provider: FlightRouteProvider = {
      lookup: vi.fn(),
    }
    const controller = new FlightRouteController(provider)
    controller.subscribe(() => undefined)

    controller.select(identities.first)
    controller.select({ ...identities.first })

    expect(provider.lookup).not.toHaveBeenCalled()
  })

  it('uses the latest position for an unchanged selected identity', () => {
    const provider: FlightRouteProvider = {
      lookup: vi.fn(
        () => new Promise<FlightRouteLookupResult>(() => undefined),
      ),
    }
    const controller = new FlightRouteController(provider)
    const movedIdentity = {
      ...identities.first,
      latitude: 60.1699,
      longitude: 24.9384,
    }
    controller.subscribe(() => undefined)
    controller.select(identities.first)

    controller.request(movedIdentity)

    expect(provider.lookup).toHaveBeenCalledWith(
      movedIdentity,
      expect.any(AbortSignal),
    )
  })

  it('runs one request only after the explicit action', async () => {
    const provider: FlightRouteProvider = {
      lookup: vi.fn(async () => available('TST123')),
    }
    const controller = new FlightRouteController(provider)
    const states: string[] = []
    controller.subscribe((state) => states.push(state.phase))
    controller.select(identities.first)

    controller.request(identities.first)
    controller.request(identities.first)
    await Promise.resolve()

    expect(provider.lookup).toHaveBeenCalledTimes(1)
    expect(states).toEqual(['idle', 'idle', 'loading', 'available'])

    controller.select({ ...identities.first })
    expect(states.at(-1)).toBe('available')
    expect(provider.lookup).toHaveBeenCalledTimes(1)
  })

  it('aborts and clears obsolete work when selected identity changes', async () => {
    const requests = [
      deferred<FlightRouteLookupResult>(),
      deferred<FlightRouteLookupResult>(),
    ]
    const signals: AbortSignal[] = []
    const provider: FlightRouteProvider = {
      lookup: vi.fn((_identity, signal) => {
        signals.push(signal)
        return requests[signals.length - 1]!.promise
      }),
    }
    const controller = new FlightRouteController(provider)
    const states: string[] = []
    controller.subscribe((state) => states.push(state.phase))

    controller.select(identities.first)
    controller.request(identities.first)
    controller.select(identities.second)
    expect(signals[0]?.aborted).toBe(true)
    expect(states.at(-1)).toBe('idle')

    controller.request(identities.second)
    requests[0].resolve(available('OBSOLETE'))
    await Promise.resolve()
    expect(states).not.toContain('available')

    requests[1].resolve(available('TST456'))
    await Promise.resolve()
    expect(states.at(-1)).toBe('available')
  })

  it('preserves typed quota failures without exposing provider text', async () => {
    const provider: FlightRouteProvider = {
      lookup: vi.fn(async () => {
        throw new FlightRouteProviderError('quota-exhausted')
      }),
    }
    const controller = new FlightRouteController(provider)
    const states: unknown[] = []
    controller.subscribe((state) => states.push(state))
    controller.select(identities.first)

    controller.request(identities.first)
    await Promise.resolve()

    expect(states.at(-1)).toEqual({
      phase: 'error',
      identityKey: 'TST123|ABC123|ES-ABC',
      reason: 'quota-exhausted',
    })
  })

  it('binds an action to its current identity before passive selection sync', async () => {
    const provider: FlightRouteProvider = {
      lookup: vi.fn(async (requestedIdentity) =>
        available(requestedIdentity.callsign),
      ),
    }
    const controller = new FlightRouteController(provider)
    controller.subscribe(() => undefined)
    controller.select(identities.first)

    controller.request(identities.second)
    await Promise.resolve()

    expect(provider.lookup).toHaveBeenCalledWith(
      identities.second,
      expect.any(AbortSignal),
    )
  })

  it('reuses a successful exact-identity route when the flight is revisited', async () => {
    const provider: FlightRouteProvider = {
      lookup: vi.fn(async (identity) => available(identity.callsign)),
    }
    const controller = new FlightRouteController(provider)
    const states: unknown[] = []
    controller.subscribe((state) => states.push(state))

    controller.select(identities.first)
    controller.request(identities.first)
    await Promise.resolve()
    controller.select(identities.second)
    controller.select(identities.first)

    expect(provider.lookup).toHaveBeenCalledTimes(1)
    expect(states.at(-1)).toEqual({
      phase: 'available',
      identityKey: 'TST123|ABC123|ES-ABC',
      route: available('TST123').route,
    })

    controller.request(identities.first)
    await Promise.resolve()
    expect(provider.lookup).toHaveBeenCalledTimes(2)
  })

  it('does not reuse unavailable results or a route for a different exact identity', async () => {
    const provider: FlightRouteProvider = {
      lookup: vi
        .fn<FlightRouteProvider['lookup']>()
        .mockResolvedValueOnce({
          kind: 'unavailable',
          reason: 'not-found',
        })
        .mockResolvedValue(available('TST123')),
    }
    const controller = new FlightRouteController(provider)
    const states: unknown[] = []
    controller.subscribe((state) => states.push(state))

    controller.select(identities.first)
    controller.request(identities.first)
    await Promise.resolve()
    controller.select(undefined)
    controller.select(identities.first)
    expect(states.at(-1)).toEqual({
      phase: 'idle',
      identityKey: 'TST123|ABC123|ES-ABC',
    })

    controller.request(identities.first)
    await Promise.resolve()
    controller.select(undefined)
    controller.select({
      ...identities.first,
      registration: 'ES-OTHER',
    })

    expect(provider.lookup).toHaveBeenCalledTimes(2)
    expect(states.at(-1)).toEqual({
      phase: 'idle',
      identityKey: 'TST123|ABC123|ES-OTHER',
    })
  })

  it('expires cached routes after six hours', async () => {
    let now = 1_000
    const provider: FlightRouteProvider = {
      lookup: vi.fn(async () => available('TST123')),
    }
    const controller = new FlightRouteController(provider, {
      now: () => now,
    })
    const states: unknown[] = []
    controller.subscribe((state) => states.push(state))

    controller.select(identities.first)
    controller.request(identities.first)
    await Promise.resolve()
    controller.select(undefined)
    now += 6 * 60 * 60_000
    controller.select(identities.first)

    expect(states.at(-1)).toEqual({
      phase: 'idle',
      identityKey: 'TST123|ABC123|ES-ABC',
    })
    expect(provider.lookup).toHaveBeenCalledTimes(1)
  })

  it('keeps 32 successful routes with least-recently-used eviction', async () => {
    const provider: FlightRouteProvider = {
      lookup: vi.fn(async (identity) => available(identity.callsign)),
    }
    const controller = new FlightRouteController(provider)
    const states: unknown[] = []
    controller.subscribe((state) => states.push(state))
    const sessionIdentities = Array.from(
      { length: 33 },
      (_, index): FlightRouteIdentity => ({
        callsign: `TST${String(index + 100).padStart(3, '0')}`,
        icao24: (0xabc000 + index).toString(16).toUpperCase(),
        latitude: 59.437,
        longitude: 24.7536,
      }),
    )

    for (const identity of sessionIdentities.slice(0, 32)) {
      controller.select(identity)
      controller.request(identity)
      await Promise.resolve()
    }

    controller.select(undefined)
    controller.select(sessionIdentities[0])
    expect(states.at(-1)).toMatchObject({
      phase: 'available',
      identityKey: 'TST100|ABC000|',
    })

    controller.select(sessionIdentities[32])
    controller.request(sessionIdentities[32])
    await Promise.resolve()
    controller.select(undefined)
    controller.select(sessionIdentities[1])
    expect(states.at(-1)).toEqual({
      phase: 'idle',
      identityKey: 'TST101|ABC001|',
    })

    controller.select(undefined)
    controller.select(sessionIdentities[0])
    expect(states.at(-1)).toMatchObject({
      phase: 'available',
      identityKey: 'TST100|ABC000|',
    })
    expect(provider.lookup).toHaveBeenCalledTimes(33)
  })
})
