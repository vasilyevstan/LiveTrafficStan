import { describe, expect, it, vi } from 'vitest'
import type { TrainPosition, TrainSourceDataset, TrainSourceId } from '../domain/trains'
import { trainId } from '../domain/trains'
import { ProviderError } from '../providers/errors'
import type { TrainProvider } from '../providers/rail/trainProviders'
import {
  TrainController,
  type TrainControllerRuntime,
  type TrainSourceStatuses,
} from './TrainController'

class FakeClock implements TrainControllerRuntime {
  time = 0
  private nextHandle = 1
  private timers = new Map<number, { at: number; callback: () => void }>()

  now = () => this.time

  setTimeout = (callback: () => void, delayMs: number) => {
    const handle = this.nextHandle++
    this.timers.set(handle, { at: this.time + delayMs, callback })
    return handle
  }

  clearTimeout = (handle: unknown) => {
    this.timers.delete(handle as number)
  }

  async advance(ms: number) {
    const target = this.time + ms
    for (;;) {
      await flush()
      const due = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((first, second) => first[1].at - second[1].at)[0]
      if (!due) break
      this.timers.delete(due[0])
      this.time = Math.max(this.time, due[1].at)
      due[1].callback()
    }
    this.time = target
    await flush()
  }
}

const flush = async () => {
  for (let index = 0; index < 5; index += 1) await Promise.resolve()
}

interface Deferred {
  resolve: (dataset: TrainSourceDataset) => void
  reject: (error: unknown) => void
  signal: AbortSignal
}

const manualProvider = (sourceId: TrainSourceId) => {
  const calls: Deferred[] = []
  const provider: TrainProvider = {
    sourceId,
    load: (signal) => new Promise((resolve, reject) => {
      calls.push({ resolve, reject, signal })
    }),
  }
  return { provider, calls }
}

const position = (
  sourceId: TrainSourceId,
  identity: string,
  overrides: Partial<TrainPosition> = {},
): TrainPosition => ({
  id: trainId(sourceId, identity),
  sourceId,
  name: `Train ${identity}`,
  category: 'commuter',
  longitude: 24.9,
  latitude: 60.2,
  observedAt: 0,
  ...overrides,
})

const harness = () => {
  const clock = new FakeClock()
  const sources = {
    fintraffic: manualProvider('fintraffic'),
    entur: manualProvider('entur'),
    mbta: manualProvider('mbta'),
    lirr: manualProvider('lirr'),
  }
  let latest: TrainSourceStatuses | undefined
  const onWarning = vi.fn()
  const controller = new TrainController({
    providers: {
      fintraffic: sources.fintraffic.provider,
      entur: sources.entur.provider,
      mbta: sources.mbta.provider,
      lirr: sources.lirr.provider,
    },
    pollIntervalMs: 15_000,
    rateLimitBackoffMaxMs: 300_000,
    course: { minimumDistanceKm: 0.03, maximumIntervalMs: 180_000 },
    onChange: (statuses) => {
      latest = statuses
    },
    runtime: clock,
    onWarning,
  })
  return { clock, sources, controller, onWarning, statuses: () => latest! }
}

const active = (...sourceIds: TrainSourceId[]) => new Set(sourceIds)

describe('TrainController', () => {
  it('polls only intersecting sources at the configured cadence', async () => {
    const { clock, sources, controller, statuses } = harness()
    controller.start(false, active('fintraffic'))
    await clock.advance(0)
    expect(sources.fintraffic.calls).toHaveLength(1)
    expect(sources.entur.calls).toHaveLength(0)
    expect(statuses().fintraffic.phase).toBe('loading')

    sources.fintraffic.calls[0]!.resolve({
      sourceId: 'fintraffic',
      retrievedAt: 1_000,
      trains: [position('fintraffic', '5')],
    })
    await clock.advance(1_000)
    expect(statuses().fintraffic).toMatchObject({ phase: 'live', lastSuccessAt: 1_000, active: true })
    expect(statuses().entur).toMatchObject({ phase: 'idle', active: false, paused: true })

    await clock.advance(13_999)
    expect(sources.fintraffic.calls).toHaveLength(1)
    await clock.advance(1)
    expect(sources.fintraffic.calls).toHaveLength(2)
  })

  it('keeps cadence and Retry-After across pauses without extra requests', async () => {
    const { clock, sources, controller, statuses } = harness()
    controller.start(false, active('mbta'))
    await clock.advance(0)
    sources.mbta.calls[0]!.reject(new ProviderError('Rate limited', 429, 60_000))
    await clock.advance(0)
    expect(statuses().mbta).toMatchObject({ phase: 'error', nextRetryAt: 60_000 })

    controller.setPaused(true)
    await clock.advance(10_000)
    controller.setPaused(false)
    await clock.advance(49_999)
    expect(sources.mbta.calls).toHaveLength(1)
    await clock.advance(1)
    expect(sources.mbta.calls).toHaveLength(2)
  })

  it('aborts paused work and fences its late result', async () => {
    const { clock, sources, controller, statuses } = harness()
    controller.start(false, active('entur'))
    await clock.advance(0)
    const first = sources.entur.calls[0]!
    controller.setPaused(true)
    expect(first.signal.aborted).toBe(true)
    first.resolve({ sourceId: 'entur', retrievedAt: 1, trains: [position('entur', 'late')] })
    await clock.advance(0)
    expect(statuses().entur).toMatchObject({ phase: 'idle', paused: true, trains: [] })

    controller.setPaused(false)
    await clock.advance(14_999)
    expect(sources.entur.calls).toHaveLength(1)
    await clock.advance(1)
    expect(sources.entur.calls).toHaveLength(2)
  })

  it('isolates one source failure from another and retains last good data', async () => {
    const { clock, sources, controller, statuses, onWarning } = harness()
    controller.start(false, active('fintraffic', 'lirr'))
    await clock.advance(0)
    sources.fintraffic.calls[0]!.resolve({
      sourceId: 'fintraffic',
      retrievedAt: 100,
      trains: [position('fintraffic', '5')],
    })
    sources.lirr.calls[0]!.reject(new ProviderError('LIRR upstream unavailable', 502))
    await clock.advance(0)
    expect(statuses().fintraffic.phase).toBe('live')
    expect(statuses().lirr).toMatchObject({ phase: 'error', error: 'LIRR upstream unavailable' })
    expect(onWarning).toHaveBeenCalledWith('lirr: LIRR upstream unavailable')

    await clock.advance(15_000)
    sources.fintraffic.calls[1]!.reject(new Error('offline'))
    await clock.advance(0)
    expect(statuses().fintraffic).toMatchObject({
      phase: 'error',
      lastSuccessAt: 100,
      trains: [expect.objectContaining({ id: 'train:fintraffic:5' })],
    })
  })

  it('keeps newer observations and derives course from observed movement only', async () => {
    const { clock, sources, controller, statuses } = harness()
    controller.start(false, active('lirr'))
    await clock.advance(0)
    sources.lirr.calls[0]!.resolve({
      sourceId: 'lirr',
      retrievedAt: 1,
      trains: [
        position('lirr', 'a', { latitude: 40.8, longitude: -73.7, observedAt: 60_000 }),
        position('lirr', 'b', { latitude: 40.8, longitude: -73.7, observedAt: 60_000 }),
      ],
    })
    await clock.advance(15_000)
    sources.lirr.calls[1]!.resolve({
      sourceId: 'lirr',
      retrievedAt: 2,
      trains: [
        position('lirr', 'a', { latitude: 40.81, longitude: -73.7, observedAt: 90_000 }),
        position('lirr', 'b', { latitude: 40.7, longitude: -73.7, observedAt: 30_000 }),
      ],
    })
    await clock.advance(0)
    const [a, b] = statuses().lirr.trains
    expect(a).toMatchObject({ observedAt: 90_000, courseOrigin: 'derived' })
    expect(a!.courseDegrees).toBeCloseTo(0, 5)
    expect(b).toMatchObject({ observedAt: 60_000, latitude: 40.8 })
    expect(b).not.toHaveProperty('courseDegrees')
  })

  it('stops polling a source that leaves the view and ignores late work after stop', async () => {
    const { clock, sources, controller, statuses } = harness()
    controller.start(false, active('mbta'))
    await clock.advance(0)
    controller.setActiveSources(active('lirr'))
    expect(sources.mbta.calls[0]!.signal.aborted).toBe(true)
    expect(statuses().mbta).toMatchObject({ active: false, paused: true })
    await clock.advance(0)
    expect(sources.lirr.calls).toHaveLength(1)

    controller.stop()
    expect(sources.lirr.calls[0]!.signal.aborted).toBe(true)
    await clock.advance(60_000)
    expect(sources.mbta.calls).toHaveLength(1)
    expect(sources.lirr.calls).toHaveLength(1)
  })

  it('starts paused without requests', async () => {
    const { clock, sources, controller, statuses } = harness()
    controller.start(true, active('fintraffic', 'entur', 'mbta', 'lirr'))
    await clock.advance(60_000)
    expect(Object.values(sources).every(({ calls }) => calls.length === 0)).toBe(true)
    expect(statuses().fintraffic).toMatchObject({ active: true, paused: true, phase: 'idle' })
  })
})
