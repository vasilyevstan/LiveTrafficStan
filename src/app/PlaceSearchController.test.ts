import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppConfig } from '../config/appConfig'
import { ProviderError } from '../providers/errors'
import type {
  PlaceSearchProvider,
  PlaceSearchResult,
} from '../providers/geocoding/photonProvider'
import {
  PlaceSearchController,
  type PlaceSearchState,
} from './PlaceSearchController'

const config: AppConfig['geocoder'] = {
  endpointBaseUrl: 'https://photon.example/api',
  resultLimit: 5,
  maximumQueryLength: 100,
  requestCooldownMs: 1_000,
  timeoutMs: 8_000,
  rateLimitFallbackMs: 60_000,
  cacheMaxEntries: 2,
  cacheTtlMs: 15 * 60_000,
}

const tallinn: PlaceSearchResult = {
  id: 'photon:R:1',
  label: 'Tallinn, Estonia',
  center: {
    latitude: 59.437,
    longitude: 24.754,
    label: 'Tallinn, Estonia',
  },
}

const runtime = {
  now: () => Date.now(),
  setTimeout: (callback: () => void, delayMs: number) =>
    setTimeout(callback, delayMs),
  clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

const createController = (
  provider: PlaceSearchProvider,
  states: PlaceSearchState[],
) =>
  new PlaceSearchController({
    provider,
    config,
    runtime,
    onState: (state) => states.push(state),
  })

describe('PlaceSearchController', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('publishes ordered results and caches repeated queries', async () => {
    const provider = {
      search: vi.fn(async () => [tallinn]),
    }
    const states: PlaceSearchState[] = []
    const controller = createController(provider, states)

    await controller.search('  Tallinn  ')
    await controller.search('tallinn')

    expect(provider.search).toHaveBeenCalledOnce()
    expect(states.at(-1)).toEqual({
      phase: 'results',
      query: 'Tallinn',
      results: [tallinn],
    })
  })

  it('caches an empty result without converting it into an error', async () => {
    const provider = {
      search: vi.fn(async () => []),
    }
    const states: PlaceSearchState[] = []
    const controller = createController(provider, states)

    await controller.search('Nowhere')
    await controller.search('nowhere')

    expect(provider.search).toHaveBeenCalledOnce()
    expect(states.at(-1)).toEqual({ phase: 'empty', query: 'Nowhere' })
  })

  it('rejects rapid repeat submissions without queuing a request', async () => {
    const provider = {
      search: vi.fn(async () => [tallinn]),
    }
    const states: PlaceSearchState[] = []
    const controller = createController(provider, states)

    await controller.search('Tallinn')
    await controller.search('Helsinki')

    expect(provider.search).toHaveBeenCalledOnce()
    expect(states.at(-1)).toMatchObject({
      phase: 'error',
      retryAt: 1_001_000,
    })

    vi.advanceTimersByTime(1_000)
    await controller.search('Helsinki')
    expect(provider.search).toHaveBeenCalledTimes(2)
  })

  it('aborts and ignores an obsolete request', async () => {
    let resolveFirst: ((value: readonly PlaceSearchResult[]) => void) | undefined
    const provider: PlaceSearchProvider = {
      search: vi.fn(
        (_query, signal) =>
          new Promise<readonly PlaceSearchResult[]>((resolve, reject) => {
            resolveFirst = resolve
            signal.addEventListener('abort', () => reject(signal.reason), {
              once: true,
            })
          }),
      ),
    }
    const states: PlaceSearchState[] = []
    const controller = createController(provider, states)

    const pending = controller.search('Tallinn')
    controller.cancel()
    resolveFirst?.([tallinn])
    await pending

    expect(states.at(-1)).toEqual({ phase: 'idle' })
  })

  it('does not republish idle state for repeated cancellation', () => {
    const states: PlaceSearchState[] = []
    const controller = createController(
      { search: vi.fn(async () => []) },
      states,
    )

    controller.cancel()
    controller.cancel()

    expect(states).toEqual([])
  })

  it('uses the fallback rate-limit deadline and enforces it after cancellation', async () => {
    const provider = {
      search: vi.fn(async () => {
        throw new ProviderError('limited', 429)
      }),
    }
    const states: PlaceSearchState[] = []
    const controller = createController(provider, states)

    await controller.search('Tallinn')
    expect(states.at(-1)).toMatchObject({
      phase: 'error',
      retryAt: 1_060_000,
    })

    controller.cancel()
    vi.advanceTimersByTime(10_000)
    await controller.search('Helsinki')
    expect(provider.search).toHaveBeenCalledOnce()
    expect(states.at(-1)).toMatchObject({ retryAt: 1_060_000 })
  })

  it('times out stalled provider work without retrying', async () => {
    const provider: PlaceSearchProvider = {
      search: vi.fn(
        (_query, signal) =>
          new Promise<readonly PlaceSearchResult[]>((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), {
              once: true,
            })
          }),
      ),
    }
    const states: PlaceSearchState[] = []
    const controller = createController(provider, states)

    const pending = controller.search('Tallinn')
    await vi.advanceTimersByTimeAsync(8_000)
    await pending

    expect(states.at(-1)).toEqual({
      phase: 'error',
      message:
        'Place search timed out. Coordinates and the current map still work.',
    })
    expect(provider.search).toHaveBeenCalledOnce()
  })

  it('keeps the timeout state when obsolete provider work resolves late', async () => {
    const provider: PlaceSearchProvider = {
      search: vi.fn(
        () =>
          new Promise<readonly PlaceSearchResult[]>((resolve) => {
            setTimeout(() => resolve([tallinn]), 9_000)
          }),
      ),
    }
    const states: PlaceSearchState[] = []
    const controller = createController(provider, states)

    const pending = controller.search('Tallinn')
    await vi.advanceTimersByTimeAsync(8_000)
    expect(states.at(-1)?.phase).toBe('error')

    await vi.advanceTimersByTimeAsync(1_000)
    await pending
    expect(states.at(-1)?.phase).toBe('error')
  })

  it('expires and evicts bounded cache entries', async () => {
    const provider = {
      search: vi.fn(async (query: string) => [
        { ...tallinn, id: query, label: query },
      ]),
    }
    const states: PlaceSearchState[] = []
    const controller = createController(provider, states)

    await controller.search('One')
    vi.advanceTimersByTime(1_000)
    await controller.search('Two')
    vi.advanceTimersByTime(1_000)
    await controller.search('Three')
    vi.advanceTimersByTime(1_000)
    await controller.search('One')
    expect(provider.search).toHaveBeenCalledTimes(4)

    vi.advanceTimersByTime(config.cacheTtlMs)
    await controller.search('Three')
    expect(provider.search).toHaveBeenCalledTimes(5)
  })
})
