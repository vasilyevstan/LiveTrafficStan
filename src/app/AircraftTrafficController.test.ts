import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Aircraft } from '../domain/traffic'
import { ProviderError } from '../providers/errors'
import type { AircraftDataProvider, TrafficQuery } from '../providers/types'
import { AircraftTrafficController } from './AircraftTrafficController'

const query = (
  latitude: number,
  longitude: number,
  radiusKm = 20,
): TrafficQuery => ({
  center: { latitude, longitude, label: 'Area' },
  radiusKm,
})

const runtime = {
  now: () => Date.now(),
  setTimeout: (callback: () => void, delayMs: number) =>
    globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle: unknown) =>
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
}

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(() => {
  vi.useRealTimers()
})

describe('AircraftTrafficController', () => {
  it('coalesces rapid query changes into the existing polling cadence', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const calls: TrafficQuery[] = []
    const provider: AircraftDataProvider = {
      fetchSnapshot: vi.fn(async (nextQuery) => {
        calls.push(nextQuery)
        return []
      }),
    }
    const controller = new AircraftTrafficController({
      provider,
      initialQuery: query(59.437, 24.754),
      refreshIntervalMs: 20_000,
      rateLimitBackoffMaxMs: 300_000,
      onResult: vi.fn(),
      runtime,
      onWarning: vi.fn(),
    })

    controller.start()
    await flush()
    expect(calls).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(5_000)
    controller.updateQuery(query(59.5, 24.8))
    await vi.advanceTimersByTimeAsync(5_000)
    controller.updateQuery(query(59.6, 24.9))
    await vi.advanceTimersByTimeAsync(9_999)
    expect(calls).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(calls).toHaveLength(2)
    expect(calls[1]).toEqual(query(59.6, 24.9))
    controller.stop()
  })

  it('ignores an obsolete response after a query revision changes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    let resolveFirst: ((entities: Aircraft[]) => void) | undefined
    const provider: AircraftDataProvider = {
      fetchSnapshot: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<Aircraft[]>((resolve) => {
              resolveFirst = resolve
            }),
        )
        .mockResolvedValueOnce([]),
    }
    const results: boolean[] = []
    const controller = new AircraftTrafficController({
      provider,
      initialQuery: query(59.437, 24.754),
      refreshIntervalMs: 20_000,
      rateLimitBackoffMaxMs: 300_000,
      onResult: (result) => results.push(Boolean(result.status.updating)),
      runtime,
      onWarning: vi.fn(),
    })

    controller.start()
    await flush()
    controller.updateQuery(query(60, 25))
    resolveFirst?.([])
    await flush()
    expect(results.at(-1)).toBe(true)

    await vi.advanceTimersByTimeAsync(20_000)
    expect(provider.fetchSnapshot).toHaveBeenCalledTimes(2)
    expect(results.at(-1)).toBe(false)
    controller.stop()
  })

  it('honors Retry-After and bounded rate-limit backoff', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const provider: AircraftDataProvider = {
      fetchSnapshot: vi
        .fn()
        .mockRejectedValueOnce(new ProviderError('rate limited', 429, 60_000))
        .mockResolvedValueOnce([]),
    }
    const controller = new AircraftTrafficController({
      provider,
      initialQuery: query(59.437, 24.754),
      refreshIntervalMs: 20_000,
      rateLimitBackoffMaxMs: 300_000,
      onResult: vi.fn(),
      runtime,
      onWarning: vi.fn(),
    })

    controller.start()
    await flush()
    expect(provider.fetchSnapshot).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(59_999)
    expect(provider.fetchSnapshot).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(provider.fetchSnapshot).toHaveBeenCalledTimes(2)
    controller.stop()
  })

  it('preserves cadence and the latest query across repeated pauses', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const calls: TrafficQuery[] = []
    const provider: AircraftDataProvider = {
      fetchSnapshot: vi.fn(async (nextQuery) => {
        calls.push(nextQuery)
        return []
      }),
    }
    const controller = new AircraftTrafficController({
      provider,
      initialQuery: query(59.437, 24.754),
      refreshIntervalMs: 20_000,
      rateLimitBackoffMaxMs: 300_000,
      onResult: vi.fn(),
      runtime,
      onWarning: vi.fn(),
    })

    controller.start()
    await flush()
    await vi.advanceTimersByTimeAsync(5_000)
    controller.setPaused(true)
    controller.updateQuery(query(60, 25))
    controller.setPaused(false)
    controller.setPaused(true)
    controller.setPaused(false)

    await vi.advanceTimersByTimeAsync(14_999)
    expect(calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(calls).toEqual([
      query(59.437, 24.754),
      query(60, 25),
    ])
    controller.stop()
  })

  it('does not reset Retry-After while paused', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const provider: AircraftDataProvider = {
      fetchSnapshot: vi
        .fn()
        .mockRejectedValueOnce(new ProviderError('rate limited', 429, 60_000))
        .mockResolvedValueOnce([]),
    }
    const controller = new AircraftTrafficController({
      provider,
      initialQuery: query(59.437, 24.754),
      refreshIntervalMs: 20_000,
      rateLimitBackoffMaxMs: 300_000,
      onResult: vi.fn(),
      runtime,
      onWarning: vi.fn(),
    })

    controller.start()
    await flush()
    await vi.advanceTimersByTimeAsync(10_000)
    controller.setPaused(true)
    await vi.advanceTimersByTimeAsync(20_000)
    controller.setPaused(false)
    await vi.advanceTimersByTimeAsync(29_999)
    expect(provider.fetchSnapshot).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(provider.fetchSnapshot).toHaveBeenCalledTimes(2)
    controller.stop()
  })
})
