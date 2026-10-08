import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AIRPORT_BOARD_CONFIG as config } from '../config/airportBoardConfig'
import type { AirportBoardSnapshot } from '../domain/airportBoard'
import { AIRPORT_BOARD_TEST_NOW as now, airportBoardFixture } from '../providers/airportBoards/airportBoardFixtures'
import type { AirportBoardProvider } from '../providers/airportBoards/airportBoardProvider'
import { ProviderError } from '../providers/errors'
import { AirportBoardController } from './AirportBoardController'

const create = () => {
  const lookup = vi.fn<AirportBoardProvider['lookup']>().mockImplementation(async icao => airportBoardFixture(Date.now(), icao))
  const provider = { lookup, retryAt: 0 }
  return { lookup, provider, controller: new AirportBoardController(provider) }
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now) })
afterEach(() => vi.useRealTimers())

describe('explicit airport-board lifecycle', () => {
  it('does not fetch on selection, ticking, pause or resume; loading is explicit', async () => {
    const { controller, lookup } = create()
    controller.select('EETN', true)
    controller.expire()
    controller.select('EETN', false)
    controller.select('EETN', true)
    expect(lookup).not.toHaveBeenCalled()
    await controller.request()
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(controller.getState()).toMatchObject({ phase: 'ready', airportIcao: 'EETN' })
    await controller.request()
    expect(lookup).toHaveBeenCalledTimes(1)
  })

  it('fences A to B to A even when a canceled provider ignores abort', async () => {
    const pending: { icao: string; signal: AbortSignal; resolve: (value: AirportBoardSnapshot) => void }[] = []
    const provider: AirportBoardProvider = {
      retryAt: 0,
      lookup: (icao, signal) => new Promise(resolve => { pending.push({ icao, signal, resolve }) }),
    }
    const controller = new AirportBoardController(provider)
    controller.select('EETN', true)
    const oldA = controller.request()
    controller.select('EFHK', true)
    const b = controller.request()
    controller.select('EETN', true)
    const newA = controller.request()
    expect(pending[0]?.signal.aborted).toBe(true)
    expect(pending[1]?.signal.aborted).toBe(true)
    pending[0]!.resolve(airportBoardFixture())
    pending[1]!.resolve(airportBoardFixture(now, 'EFHK'))
    await Promise.all([oldA, b])
    expect(controller.getState()).toMatchObject({ phase: 'loading', airportIcao: 'EETN' })
    pending[2]!.resolve(airportBoardFixture(now + 1))
    await newA
    expect(controller.getState()).toMatchObject({ phase: 'ready', snapshot: { retrievedAt: now + 1 } })
  })

  it.each(['hidden', 'offline', 'history'])('cancels for %s and does not revive or automatically resume work', async () => {
    let reject!: (error: Error) => void
    const { provider, controller } = create()
    provider.lookup.mockImplementationOnce((_icao, signal) => new Promise((_resolve, fail) => {
      reject = fail
      signal.addEventListener('abort', () => fail(new Error('aborted')), { once: true })
    }))
    controller.select('EETN', true)
    const result = controller.request()
    controller.select('EETN', false)
    reject(new Error('late provider failure'))
    await result
    expect(controller.getState()).toMatchObject({ phase: 'idle' })
    controller.select('EETN', true)
    expect(provider.lookup).toHaveBeenCalledTimes(1)
  })

  it('coalesces button repeats while loading', async () => {
    let resolve!: (value: AirportBoardSnapshot) => void
    const { controller, lookup } = create()
    lookup.mockReturnValueOnce(new Promise(done => { resolve = done }))
    controller.select('EETN', true)
    const first = controller.request()
    await controller.request()
    expect(lookup).toHaveBeenCalledTimes(1)
    resolve(airportBoardFixture())
    await first
  })

  it('drops board records on pause without resetting shared provider retry state', async () => {
    const { controller, provider } = create()
    controller.select('EETN', true)
    await controller.request()
    provider.retryAt = now + 60_000
    controller.select('EETN', false)
    expect(controller.getState()).toEqual({ phase: 'idle', airportIcao: 'EETN' })
    expect(provider.retryAt).toBe(now + 60_000)
    controller.select('EETN', true)
    expect(controller.getState()).toEqual({ phase: 'idle', airportIcao: 'EETN' })
  })

  it('keeps a failed refresh distinct from the previously retrieved board and expires its data', async () => {
    const { controller, lookup, provider } = create()
    controller.select('EETN', true)
    await controller.request()
    await vi.advanceTimersByTimeAsync(config.cacheTtlMs)
    provider.retryAt = Date.now() + 60_000
    lookup.mockRejectedValueOnce(new ProviderError('Quota exhausted', 429, 60_000))
    await controller.request()
    expect(controller.getState()).toMatchObject({ phase: 'error', message: 'Quota exhausted', snapshot: { retrievedAt: now } })
    await vi.advanceTimersByTimeAsync(config.maximumDisplayAgeMs)
    controller.expire()
    expect(controller.getState()).toMatchObject({ phase: 'error', snapshot: undefined, retryAt: now + config.cacheTtlMs + 60_000 })
  })

  it('clears expired data without a refresh, and close aborts with no late publication', async () => {
    const { controller, lookup } = create()
    const listener = vi.fn()
    const unsubscribe = controller.subscribe(listener)
    controller.select('EETN', true)
    await controller.request()
    await vi.advanceTimersByTimeAsync(config.maximumDisplayAgeMs)
    controller.expire()
    expect(controller.getState()).toMatchObject({ phase: 'expired' })
    expect(lookup).toHaveBeenCalledTimes(1)
    unsubscribe()
    controller.dispose()
    const calls = listener.mock.calls.length
    await controller.request()
    expect(listener).toHaveBeenCalledTimes(calls)
    expect(lookup).toHaveBeenCalledTimes(1)
  })
})
