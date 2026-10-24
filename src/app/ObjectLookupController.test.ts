import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DISCOVERY_CONFIG } from '../config/discoveryConfig'
import type { DiscoveryResponse, LookupRequest } from '../domain/objectDiscovery'
import { ProviderError } from '../providers/errors'
import type { ObjectLookupProvider } from '../providers/discovery/objectLookupProvider'
import { ObjectLookupController, type ObjectLookupState } from './ObjectLookupController'

const result = (request: LookupRequest): DiscoveryResponse => ({
  objectClass: request.objectClass, retrievedAt: Date.now(), matches: [], truncated: false, rejectedRecords: 0,
})
const setup = (provider: ObjectLookupProvider) => {
  const states: ObjectLookupState[] = []
  return { states, controller: new ObjectLookupController({ provider, onState: (state) => states.push(state) }) }
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(Date.UTC(2026, 9, 14, 12)) })
afterEach(() => vi.useRealTimers())

describe('bounded explicit lookup controller', () => {
  it('has no startup, typing, polling, persistence or automatic retry operation', async () => {
    const lookup = vi.fn<ObjectLookupProvider['lookup']>(async (request) => result(request))
    const { controller, states } = setup({ lookup })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(lookup).not.toHaveBeenCalled()
    expect(states).toEqual([])
    await controller.lookup('ships', 'name', 'TEST')
    expect(states.at(-1)).toMatchObject({ phase: 'results', result: { matches: [] } })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(lookup).toHaveBeenCalledOnce()
  })
  it('rejects invalid submit without contacting a source', async () => {
    const lookup = vi.fn<ObjectLookupProvider['lookup']>()
    const { controller, states } = setup({ lookup })
    await controller.lookup('ships', 'imo', '1234567')
    expect(lookup).not.toHaveBeenCalled()
    expect(states.at(-1)).toMatchObject({ phase: 'error' })
  })
  it('returns only an accepted current response for one-shot navigation', async () => {
    const { controller, states } = setup({ lookup: async (request) => result(request) })
    const accepted = await controller.lookup('ships', 'position', '230123456')
    expect(accepted).toBeDefined()
    expect(states.at(-1)).toMatchObject({ phase: 'results', result: accepted })
    expect(await controller.lookup('ships', 'position', '230123457')).toBeUndefined()
    expect(await controller.lookup('ships', 'position', '001234567')).toBeUndefined()
  })
  it('can retain identity results while a reused independent controller performs a position operation', async () => {
    const lookup = vi.fn<ObjectLookupProvider['lookup']>(async (request) => result(request))
    const identity = setup({ lookup })
    const position = setup({ lookup })
    await identity.controller.lookup('ships', 'name', 'TEST')
    const identityResult = identity.states.at(-1)
    identity.controller.stop()
    await position.controller.lookup('ships', 'position', '230123456')
    expect(identity.states.at(-1)).toBe(identityResult)
    expect(position.states.at(-1)).toMatchObject({ phase: 'results', request: { by: 'position', query: '230123456' } })
    expect(lookup).toHaveBeenCalledTimes(2)
  })
  it('keeps per-source cooldown after stop/cancel and permits an independent source', async () => {
    const lookup = vi.fn<ObjectLookupProvider['lookup']>(async (request) => result(request))
    const { controller, states } = setup({ lookup })
    await controller.lookup('aircraft', 'hex', 'abc123')
    controller.stop()
    controller.cancel()
    await controller.lookup('aircraft', 'reg', 'N123TS')
    expect(lookup).toHaveBeenCalledOnce()
    expect(states.at(-1)).toMatchObject({ phase: 'error', retryAt: Date.now() + 20_000 })
    await controller.lookup('ships', 'name', 'TEST')
    expect(lookup).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(20_000)
    await controller.lookup('aircraft', 'reg', 'N123TS')
    expect(lookup).toHaveBeenCalledTimes(3)
  })
  it('fences A-B-A successes and errors even when a provider ignores abort', async () => {
    const pending: { request: LookupRequest; signal: AbortSignal; resolve: (response: DiscoveryResponse) => void; reject: (error: Error) => void }[] = []
    const provider: ObjectLookupProvider = {
      lookup: (request, signal) => new Promise((resolve, reject) => pending.push({ request, signal, resolve, reject })),
    }
    const { controller, states } = setup(provider)
    const first = controller.lookup('aircraft', 'hex', 'abc123')
    const second = controller.lookup('ships', 'name', 'TEST')
    await vi.advanceTimersByTimeAsync(20_000)
    const third = controller.lookup('aircraft', 'hex', 'abc123')
    pending[2].resolve(result(pending[2].request))
    expect(await third).toBeDefined()
    const accepted = states.at(-1)
    pending[0].resolve(result(pending[0].request))
    pending[1].reject(new Error('obsolete failure'))
    expect(await Promise.all([first, second])).toEqual([undefined, undefined])
    expect(pending[0].signal.aborted).toBe(true)
    expect(pending[1].signal.aborted).toBe(true)
    expect(states.at(-1)).toBe(accepted)
    expect(accepted).toMatchObject({ phase: 'results', request: { objectClass: 'aircraft', query: 'abc123' } })
  })
  it('times out ignored-abort work and withholds its late successful result', async () => {
    let resolve: ((value: DiscoveryResponse) => void) | undefined
    const { controller, states } = setup({ lookup: (request) => new Promise((done) => { resolve = () => done(result(request)) }) })
    const work = controller.lookup('ships', 'name', 'TEST')
    await vi.advanceTimersByTimeAsync(DISCOVERY_CONFIG.timeoutMs)
    expect(states.at(-1)).toMatchObject({ phase: 'error', message: expect.stringContaining('timed out') })
    resolve?.({ objectClass: 'ships', retrievedAt: Date.now(), matches: [], truncated: false, rejectedRecords: 0 })
    expect(await work).toBeUndefined()
    expect(states.at(-1)?.phase).toBe('error')
  })
  it.each([[429, undefined, 60_000], [429, 90_000, 90_000], [503, 45_000, 45_000]])(
    'preserves %i source backoff %s across cancellation without auto retry', async (status, retryAfterMs, delay) => {
      const lookup = vi.fn<ObjectLookupProvider['lookup']>(async () => { throw new ProviderError('limited', status, retryAfterMs) })
      const { controller, states } = setup({ lookup })
      const retryAt = Date.now() + delay
      await controller.lookup('ships', 'name', 'TEST')
      expect(states.at(-1)).toMatchObject({ phase: 'error', retryAt })
      controller.cancel()
      await vi.advanceTimersByTimeAsync(delay - 1)
      await controller.lookup('ships', 'name', 'OTHER')
      expect(lookup).toHaveBeenCalledOnce()
      await vi.advanceTimersByTimeAsync(1)
      expect(lookup).toHaveBeenCalledOnce()
      await controller.lookup('ships', 'name', 'OTHER')
      expect(lookup).toHaveBeenCalledTimes(2)
    },
  )
  it('stop fences pending work without publishing into an unmounted owner', async () => {
    let finish: (() => void) | undefined
    const { controller, states } = setup({ lookup: (request) => new Promise((resolve) => { finish = () => resolve(result(request)) }) })
    const work = controller.lookup('ships', 'name', 'TEST')
    controller.stop()
    const length = states.length
    finish?.()
    await work
    await vi.advanceTimersByTimeAsync(10_000)
    expect(states).toHaveLength(length)
  })
  it('honors an observed late source limit without letting it overwrite another source UI', async () => {
    let rejectFirst: ((error: Error) => void) | undefined
    const provider: ObjectLookupProvider = {
      lookup: (request) => request.objectClass === 'aircraft'
        ? new Promise((_resolve, reject) => { rejectFirst = reject })
        : Promise.resolve(result(request)),
    }
    const { controller, states } = setup(provider)
    const first = controller.lookup('aircraft', 'hex', 'abc123')
    await controller.lookup('ships', 'name', 'TEST')
    const current = states.at(-1)
    rejectFirst?.(new ProviderError('limited', 429, 90_000))
    await first
    expect(states.at(-1)).toBe(current)
    await vi.advanceTimersByTimeAsync(20_000)
    await controller.lookup('aircraft', 'hex', 'abc123')
    expect(states.at(-1)).toMatchObject({ phase: 'error', retryAt: Date.now() + 70_000 })
  })
})
