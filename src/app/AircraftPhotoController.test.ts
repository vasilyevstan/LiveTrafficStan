import { describe, expect, it, vi } from 'vitest'
import type {
  AircraftPhotoIdentity,
  AircraftPhotoLookupResult,
} from '../domain/aircraftPhoto'
import {
  AircraftPhotoProviderError,
  type AircraftPhotoProvider,
} from '../providers/aircraftPhoto/planespottersPhotoProvider'
import { AircraftPhotoController } from './AircraftPhotoController'

const config = {
  cacheMaxEntries: 32,
  cacheTtlMs: 60 * 60_000,
  rateLimitFallbackMs: 60_000,
}

const identities: Record<string, AircraftPhotoIdentity> = {
  first: { icao24: 'ABC123' },
  second: { icao24: 'DEF456' },
}

const available = (
  icao24: string,
): Extract<AircraftPhotoLookupResult, { kind: 'available' }> => ({
  kind: 'available',
  photo: {
    icao24,
    thumbnailUrl: `https://cdn.planespotters.net/${icao24}.jpg`,
    thumbnailWidth: 200,
    thumbnailHeight: 133,
    photoPageUrl: `https://www.planespotters.net/photo/${icao24}/test`,
    photographer: `Photographer ${icao24}`,
    source: {
      name: 'Planespotters.net',
      websiteUrl: 'https://www.planespotters.net/',
      termsUrl: 'https://www.planespotters.net/photo/api',
    },
  },
})

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

describe('AircraftPhotoController', () => {
  it('does not request on selection and starts only one explicit lookup', async () => {
    const provider: AircraftPhotoProvider = {
      lookup: vi.fn(async (identity) => available(identity.icao24)),
    }
    const controller = new AircraftPhotoController(provider, config)
    const phases: string[] = []
    controller.subscribe((state) => phases.push(state.phase))

    controller.select(identities.first)
    controller.select({ ...identities.first })
    expect(provider.lookup).not.toHaveBeenCalled()

    controller.request(identities.first)
    controller.request(identities.first)
    await Promise.resolve()

    expect(provider.lookup).toHaveBeenCalledTimes(1)
    expect(phases).toEqual(['idle', 'idle', 'loading', 'available'])
  })

  it('aborts and revision-guards selection A to B to A races', async () => {
    const requests = [
      deferred<AircraftPhotoLookupResult>(),
      deferred<AircraftPhotoLookupResult>(),
    ]
    const signals: AbortSignal[] = []
    const provider: AircraftPhotoProvider = {
      lookup: vi.fn((_identity, signal) => {
        signals.push(signal)
        return requests[signals.length - 1]!.promise
      }),
    }
    const controller = new AircraftPhotoController(provider, config)
    const states: unknown[] = []
    controller.subscribe((state) => states.push(state))

    controller.select(identities.first)
    controller.request(identities.first)
    controller.select(identities.second)
    expect(signals[0]?.aborted).toBe(true)
    controller.select(identities.first)
    controller.request(identities.first)

    requests[0].resolve(available('ABC123'))
    await Promise.resolve()
    expect(states.at(-1)).toMatchObject({
      phase: 'loading',
      identityKey: 'ABC123',
    })

    requests[1].resolve(available('ABC123'))
    await Promise.resolve()
    expect(states.at(-1)).toMatchObject({
      phase: 'available',
      identityKey: 'ABC123',
      photo: { icao24: 'ABC123' },
    })
  })

  it('aborts selection-cleared work and ignores its late result', async () => {
    const request = deferred<AircraftPhotoLookupResult>()
    let signal: AbortSignal | undefined
    const provider: AircraftPhotoProvider = {
      lookup: vi.fn((_identity, requestSignal) => {
        signal = requestSignal
        return request.promise
      }),
    }
    const controller = new AircraftPhotoController(provider, config)
    const states: unknown[] = []
    controller.subscribe((state) => states.push(state))

    controller.select(identities.first)
    controller.request(identities.first)
    controller.select(undefined)
    expect(signal?.aborted).toBe(true)

    request.resolve(available('ABC123'))
    await Promise.resolve()
    expect(states.at(-1)).toEqual({ phase: 'idle' })
  })

  it('reuses available and not-found JSON only from bounded tab memory', async () => {
    const provider: AircraftPhotoProvider = {
      lookup: vi
        .fn<AircraftPhotoProvider['lookup']>()
        .mockResolvedValueOnce(available('ABC123'))
        .mockResolvedValueOnce({
          kind: 'unavailable',
          reason: 'not-found',
        }),
    }
    const controller = new AircraftPhotoController(provider, config)
    const states: unknown[] = []
    controller.subscribe((state) => states.push(state))

    controller.select(identities.first)
    controller.request(identities.first)
    await Promise.resolve()
    controller.select(identities.second)
    controller.request(identities.second)
    await Promise.resolve()

    controller.select(identities.first)
    expect(states.at(-1)).toMatchObject({
      phase: 'available',
      identityKey: 'ABC123',
    })
    controller.select(identities.second)
    expect(states.at(-1)).toEqual({
      phase: 'unavailable',
      identityKey: 'DEF456',
      reason: 'not-found',
    })
    expect(provider.lookup).toHaveBeenCalledTimes(2)
  })

  it('shares bounded tab-memory results between hover and details controllers', async () => {
    const provider: AircraftPhotoProvider = {
      lookup: vi.fn(async () => available('ABC123')),
    }
    const hoverController = new AircraftPhotoController(provider, config)
    const detailsController = new AircraftPhotoController(provider, config)
    const detailsStates: unknown[] = []
    hoverController.subscribe(() => undefined)
    detailsController.subscribe((state) => detailsStates.push(state))

    hoverController.select(identities.first)
    hoverController.requestIfMissing(identities.first)
    await Promise.resolve()

    detailsController.select(identities.first)
    expect(detailsStates.at(-1)).toMatchObject({
      phase: 'available',
      identityKey: 'ABC123',
    })
    expect(provider.lookup).toHaveBeenCalledTimes(1)
  })

  it('rechecks shared cache before an already-selected details request', async () => {
    const provider: AircraftPhotoProvider = {
      lookup: vi.fn(async () => available('ABC123')),
    }
    const hoverController = new AircraftPhotoController(provider, config)
    const detailsController = new AircraftPhotoController(provider, config)
    const detailsStates: unknown[] = []
    hoverController.subscribe(() => undefined)
    detailsController.subscribe((state) => detailsStates.push(state))
    detailsController.select(identities.first)

    hoverController.requestIfMissing(identities.first)
    await Promise.resolve()
    detailsController.request(identities.first)

    expect(detailsStates.at(-1)).toMatchObject({
      phase: 'available',
      identityKey: 'ABC123',
    })
    expect(provider.lookup).toHaveBeenCalledTimes(1)
  })

  it('expires entries at one hour and evicts least-recently-used beyond 32', async () => {
    let now = 1_000
    const provider: AircraftPhotoProvider = {
      lookup: vi.fn(async (identity) => available(identity.icao24)),
    }
    const controller = new AircraftPhotoController(
      provider,
      config,
      { now: () => now },
    )
    const states: unknown[] = []
    controller.subscribe((state) => states.push(state))
    const sessionIdentities = Array.from(
      { length: 33 },
      (_, index): AircraftPhotoIdentity => ({
        icao24: (0xabc000 + index).toString(16).toUpperCase(),
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
      identityKey: 'ABC000',
    })

    controller.select(sessionIdentities[32])
    controller.request(sessionIdentities[32])
    await Promise.resolve()
    controller.select(undefined)
    controller.select(sessionIdentities[1])
    expect(states.at(-1)).toEqual({
      phase: 'idle',
      identityKey: 'ABC001',
    })

    controller.select(undefined)
    now += 60 * 60_000
    controller.select(sessionIdentities[0])
    expect(states.at(-1)).toEqual({
      phase: 'idle',
      identityKey: 'ABC000',
    })
  })

  it('respects Retry-After without scheduling or sending another request', async () => {
    let now = 10_000
    const provider: AircraftPhotoProvider = {
      lookup: vi
        .fn<AircraftPhotoProvider['lookup']>()
        .mockRejectedValueOnce(
          new AircraftPhotoProviderError('throttled', 30_000),
        )
        .mockResolvedValue(available('ABC123')),
    }
    const controller = new AircraftPhotoController(
      provider,
      config,
      { now: () => now },
    )
    const states: unknown[] = []
    controller.subscribe((state) => states.push(state))
    controller.select(identities.first)

    controller.request(identities.first)
    await Promise.resolve()
    expect(states.at(-1)).toEqual({
      phase: 'error',
      identityKey: 'ABC123',
      reason: 'throttled',
      retryAt: 40_000,
    })

    controller.request(identities.first)
    expect(provider.lookup).toHaveBeenCalledTimes(1)
    now = 40_000
    controller.request(identities.first)
    await Promise.resolve()
    expect(provider.lookup).toHaveBeenCalledTimes(2)
    expect(states.at(-1)).toMatchObject({ phase: 'available' })
  })

  it('does not cache errors', async () => {
    const provider: AircraftPhotoProvider = {
      lookup: vi
        .fn<AircraftPhotoProvider['lookup']>()
        .mockRejectedValueOnce(
          new AircraftPhotoProviderError('network'),
        )
        .mockResolvedValueOnce(available('ABC123')),
    }
    const controller = new AircraftPhotoController(provider, config)
    const states: unknown[] = []
    controller.subscribe((state) => states.push(state))
    controller.select(identities.first)

    controller.request(identities.first)
    await Promise.resolve()
    expect(states.at(-1)).toMatchObject({
      phase: 'error',
      reason: 'network',
    })

    controller.select(undefined)
    controller.select(identities.first)
    expect(states.at(-1)).toEqual({
      phase: 'idle',
      identityKey: 'ABC123',
    })
    controller.request(identities.first)
    await Promise.resolve()
    expect(provider.lookup).toHaveBeenCalledTimes(2)
    expect(states.at(-1)).toMatchObject({ phase: 'available' })
  })

  it('does not automatically retry the same identity within the cache window', async () => {
    let now = 1_000
    const provider: AircraftPhotoProvider = {
      lookup: vi
        .fn<AircraftPhotoProvider['lookup']>()
        .mockRejectedValueOnce(
          new AircraftPhotoProviderError('network'),
        )
        .mockResolvedValueOnce(available('ABC123')),
    }
    const controller = new AircraftPhotoController(
      provider,
      config,
      { now: () => now },
    )
    controller.subscribe(() => undefined)

    controller.requestIfMissing(identities.first)
    await Promise.resolve()
    controller.select(undefined)
    controller.requestIfMissing(identities.first)
    await Promise.resolve()
    expect(provider.lookup).toHaveBeenCalledTimes(1)

    now += config.cacheTtlMs
    controller.select(undefined)
    controller.requestIfMissing(identities.first)
    await Promise.resolve()
    expect(provider.lookup).toHaveBeenCalledTimes(2)
  })

  it('allows a later automatic lookup after an obsolete request is aborted', () => {
    const provider: AircraftPhotoProvider = {
      lookup: vi.fn(
        () => new Promise<AircraftPhotoLookupResult>(() => undefined),
      ),
    }
    const controller = new AircraftPhotoController(provider, config)
    controller.subscribe(() => undefined)

    controller.requestIfMissing(identities.first)
    controller.select(undefined)
    controller.requestIfMissing(identities.first)

    expect(provider.lookup).toHaveBeenCalledTimes(2)
  })

  it('aborts active work on disposal', () => {
    let signal: AbortSignal | undefined
    const provider: AircraftPhotoProvider = {
      lookup: vi.fn((_identity, requestSignal) => {
        signal = requestSignal
        return new Promise<AircraftPhotoLookupResult>(() => undefined)
      }),
    }
    const controller = new AircraftPhotoController(provider, config)
    controller.subscribe(() => undefined)
    controller.select(identities.first)
    controller.request(identities.first)
    controller.dispose()

    expect(signal?.aborted).toBe(true)
  })
})
