import { describe, expect, it, vi } from 'vitest'
import type {
  FlightRouteIdentity,
  FlightRouteLookupResult,
} from '../domain/flightRoute'
import {
  FlightRouteProviderError,
  type FlightRouteProvider,
} from '../providers/flightRoute/aviationstackFlightRouteProvider'
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
  },
  second: {
    callsign: 'TST456',
    icao24: 'DEF456',
    registration: 'ES-DEF',
  },
}

const available = (
  flightIcao: string,
): FlightRouteLookupResult => ({
  kind: 'available',
  route: {
    flightIcao,
    flightStatus: 'active',
    departure: { name: 'Tallinn Airport', code: 'TLL' },
    arrival: { name: 'Helsinki Airport', code: 'HEL' },
    source: {
      name: 'aviationstack',
      websiteUrl: 'https://aviationstack.com/',
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
})
