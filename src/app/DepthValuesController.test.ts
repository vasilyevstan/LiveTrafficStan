import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BATHYMETRY_CONFIG } from '../config/appConfig'
import type { DepthCandidate } from '../domain/bathymetry'
import { fetchDepthValue } from '../providers/bathymetry/depthValues'
import { ProviderError } from '../providers/errors'
import { DepthValuesController } from './DepthValuesController'

const points = (start: number, count = 1): DepthCandidate[] =>
  Array.from({ length: count }, (_, offset) => ({
    id: `emodnet:${start + offset}:1`, latitude: 59.7, longitude: 24.5 + (start + offset) / 10_000,
  }))
const flush = () => vi.advanceTimersByTimeAsync(0)
const deferred = () => {
  const pending: {
    signal: AbortSignal
    resolve: (depth: number | null) => void
    reject: (error: Error) => void
  }[] = []
  let active = 0, maximum = 0
  const fetchValue = vi.fn<typeof fetchDepthValue>((_source, _point, signal) => {
    active += 1
    maximum = Math.max(maximum, active)
    return new Promise<number | null>((resolve, reject) => pending.push({ signal, resolve, reject }))
      .finally(() => { active -= 1 })
  })
  return { pending, fetchValue, maximum: () => maximum }
}

describe('depth value request ownership', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-10T00:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('caps a batch at twelve, deduplicates cells and has at most two physical requests', async () => {
    const work = deferred()
    const controller = new DepthValuesController(vi.fn(), work.fetchValue)
    controller.load('emodnet', points(0, 20))
    expect(work.pending).toHaveLength(2)
    for (let index = 0; index < 12; index += 1) {
      work.pending[index].resolve(80 + index)
      await flush()
    }
    expect(work.pending).toHaveLength(12)
    expect(work.maximum()).toBe(2)
    expect(controller.getState()).toMatchObject({ phase: 'ready', source: 'emodnet' })
    expect(controller.getState().samples).toHaveLength(12)
    controller.load('emodnet', [...points(20), ...points(20)])
    expect(work.pending).toHaveLength(13)
    controller.dispose()
    work.pending[12].resolve(1)
    await flush()
  })

  it('fences A-B-A and counts uncancelled old promises against the same concurrency cap', async () => {
    const work = deferred()
    const onChange = vi.fn()
    const controller = new DepthValuesController(onChange, work.fetchValue)
    controller.load('emodnet', points(0, 2))
    controller.load('emodnet', points(10, 2))
    controller.load('emodnet', points(0, 2))
    expect(work.pending).toHaveLength(2)
    expect(work.pending.every(job => job.signal.aborted)).toBe(true)
    work.pending[0].resolve(999)
    work.pending[1].resolve(999)
    await flush()
    expect(work.pending).toHaveLength(4)
    expect(controller.getState().samples).toEqual([])
    work.pending[2].resolve(80)
    work.pending[3].resolve(90)
    await flush()
    expect(controller.getState().samples.map(point => point.depthMeters)).toEqual([80, 90])
    expect(work.maximum()).toBe(2)
    controller.pause()
    controller.load('emodnet', points(0, 2))
    expect(work.pending).toHaveLength(4)
    expect(controller.getState().phase).toBe('ready')
    controller.dispose()
    const calls = onChange.mock.calls.length
    controller.load('emodnet', points(20))
    expect(onChange).toHaveBeenCalledTimes(calls)
  })

  it('caches only complete values and explicit no-data, not failed or obsolete work', async () => {
    const fetchValue = vi.fn<typeof fetchDepthValue>()
      .mockRejectedValueOnce(new Error('invalid body'))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(25)
    const controller = new DepthValuesController(vi.fn(), fetchValue)
    controller.load('emodnet', points(0, 3))
    await flush()
    expect(controller.getState()).toMatchObject({ phase: 'partial', samples: [{ depthMeters: 25 }] })
    fetchValue.mockResolvedValue(40)
    controller.pause()
    controller.load('emodnet', points(0, 3))
    await flush()
    expect(fetchValue).toHaveBeenCalledTimes(4)
    expect(controller.getState().phase).toBe('ready')
    expect(controller.getState().samples).toHaveLength(2)
    controller.pause()
    await vi.advanceTimersByTimeAsync(BATHYMETRY_CONFIG.valueCacheMs)
    controller.load('emodnet', points(0, 3))
    await flush()
    expect(fetchValue).toHaveBeenCalledTimes(7)
    controller.dispose()
  })

  it('bounds the fulfilled cache and keeps provider identities independent', async () => {
    const fetchValue = vi.fn<typeof fetchDepthValue>().mockResolvedValue(12)
    const controller = new DepthValuesController(vi.fn(), fetchValue)
    for (let index = 0; index <= BATHYMETRY_CONFIG.valueCacheEntries; index += 1) {
      controller.load('emodnet', points(index))
      await flush()
    }
    const count = fetchValue.mock.calls.length
    controller.load('emodnet', points(1))
    await flush()
    expect(fetchValue).toHaveBeenCalledTimes(count)
    controller.load('emodnet', points(0))
    await flush()
    expect(fetchValue).toHaveBeenCalledTimes(count + 1)
    controller.load('gebco', points(0))
    await flush()
    expect(fetchValue).toHaveBeenCalledTimes(count + 2)
    controller.dispose()
  })

  it('preserves Retry-After across pauses, permits valid cached values and does not poll', async () => {
    const fetchValue = vi.fn<typeof fetchDepthValue>().mockResolvedValue(12)
    const controller = new DepthValuesController(vi.fn(), fetchValue)
    controller.load('emodnet', points(0))
    await flush()
    fetchValue.mockRejectedValue(new ProviderError('limited', 429, 120_000))
    controller.load('emodnet', points(1, 3))
    await flush()
    expect(controller.getState().phase).toBe('unavailable')
    const requests = fetchValue.mock.calls.length
    controller.pause()
    controller.load('emodnet', points(1, 3))
    await flush()
    expect(fetchValue).toHaveBeenCalledTimes(requests)
    controller.load('emodnet', points(0))
    expect(controller.getState().phase).toBe('ready')
    await vi.advanceTimersByTimeAsync(120_000)
    expect(fetchValue).toHaveBeenCalledTimes(requests)
    fetchValue.mockResolvedValue(14)
    controller.load('emodnet', points(1, 3))
    await flush()
    expect(fetchValue).toHaveBeenCalledTimes(requests + 3)
    controller.dispose()
  })

  it('enforces a total deadline and ignores late success after timeout, pause or dispose', async () => {
    const work = deferred()
    const onChange = vi.fn()
    const controller = new DepthValuesController(onChange, work.fetchValue)
    controller.load('emodnet', points(0, 3))
    await vi.advanceTimersByTimeAsync(BATHYMETRY_CONFIG.requestTimeoutMs)
    expect(controller.getState()).toMatchObject({ phase: 'unavailable', samples: [], message: expect.stringContaining('timed out') })
    expect(work.pending.every(job => job.signal.aborted)).toBe(true)
    work.pending[0].resolve(999)
    work.pending[1].resolve(999)
    await flush()
    controller.pause()
    controller.load('emodnet', points(0))
    expect(work.pending).toHaveLength(3)
    controller.pause()
    work.pending[2].resolve(888)
    await flush()
    expect(controller.getState()).toMatchObject({ phase: 'paused', samples: [] })
    controller.load('emodnet', points(0))
    expect(work.pending).toHaveLength(4)
    controller.dispose()
    const changes = onChange.mock.calls.length
    work.pending[3].resolve(777)
    await flush()
    expect(onChange).toHaveBeenCalledTimes(changes)
  })
})
