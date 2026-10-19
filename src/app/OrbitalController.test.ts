import { afterEach, describe, expect, it, vi } from 'vitest'
import snapshotFixture from '../../public/orbital-data/curated-2026-09-30-v1/catalog.json'
import { createAppConfig } from '../config/appConfig'
import type {
  ModeledOrbitalPosition,
  OrbitalCatalogSnapshot,
  OrbitalControllerState,
} from '../domain/orbital'
import {
  DEFAULT_ORBITAL_DISCOVERY_FILTERS,
  orbitalFiltersSignature,
} from '../domain/orbitalDiscovery'
import { orbitalViewportSignature } from '../domain/orbitalViewport'
import type {
  OrbitalWorkerLike,
  OrbitalWorkerRequest,
  OrbitalWorkerResponse,
} from '../workers/orbitalProtocol'
import { ProviderError } from '../providers/errors'
import { OrbitalController, type OrbitalControllerConfig } from './OrbitalController'

const snapshot = snapshotFixture as OrbitalCatalogSnapshot
const config = createAppConfig({}).orbital

const runtime = {
  wallNow: () => Date.now(),
  performanceNow: () => Date.now(),
  setTimeout: (callback: () => void, delayMs: number) =>
    globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle: unknown) =>
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
}

class FakeWorker implements OrbitalWorkerLike {
  readonly messages: OrbitalWorkerRequest[] = []
  terminated = false
  private listeners = new Set<
    (event: MessageEvent<OrbitalWorkerResponse>) => void
  >()
  private errorListeners = new Set<(event: ErrorEvent) => void>()
  private messageErrorListeners = new Set<
    (event: MessageEvent<unknown>) => void
  >()

  postMessage(message: OrbitalWorkerRequest) {
    this.messages.push(message)
  }

  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<OrbitalWorkerResponse>) => void,
  ): void
  addEventListener(
    type: 'error',
    listener: (event: ErrorEvent) => void,
  ): void
  addEventListener(
    type: 'messageerror',
    listener: (event: MessageEvent<unknown>) => void,
  ): void
  addEventListener(
    type: 'message' | 'error' | 'messageerror',
    listener:
      | ((event: MessageEvent<OrbitalWorkerResponse>) => void)
      | ((event: ErrorEvent) => void)
      | ((event: MessageEvent<unknown>) => void),
  ) {
    if (type === 'message') {
      this.listeners.add(
        listener as (event: MessageEvent<OrbitalWorkerResponse>) => void,
      )
    } else if (type === 'error') {
      this.errorListeners.add(listener as (event: ErrorEvent) => void)
    } else {
      this.messageErrorListeners.add(
        listener as (event: MessageEvent<unknown>) => void,
      )
    }
  }

  removeEventListener(
    type: 'message',
    listener: (event: MessageEvent<OrbitalWorkerResponse>) => void,
  ): void
  removeEventListener(
    type: 'error',
    listener: (event: ErrorEvent) => void,
  ): void
  removeEventListener(
    type: 'messageerror',
    listener: (event: MessageEvent<unknown>) => void,
  ): void
  removeEventListener(
    type: 'message' | 'error' | 'messageerror',
    listener:
      | ((event: MessageEvent<OrbitalWorkerResponse>) => void)
      | ((event: ErrorEvent) => void)
      | ((event: MessageEvent<unknown>) => void),
  ) {
    if (type === 'message') {
      this.listeners.delete(
        listener as (event: MessageEvent<OrbitalWorkerResponse>) => void,
      )
    } else if (type === 'error') {
      this.errorListeners.delete(
        listener as (event: ErrorEvent) => void,
      )
    } else {
      this.messageErrorListeners.delete(
        listener as (event: MessageEvent<unknown>) => void,
      )
    }
  }

  terminate() {
    this.terminated = true
  }

  emit(message: OrbitalWorkerResponse) {
    for (const listener of this.listeners) {
      listener({ data: message } as MessageEvent<OrbitalWorkerResponse>)
    }
  }

  emitError(message = 'worker failed') {
    const event = {
      message,
      preventDefault: vi.fn(),
    } as unknown as ErrorEvent
    for (const listener of this.errorListeners) listener(event)
  }
}

const loadResult = () => {
  const now = Date.now()
  return {
    snapshot,
    source: 'bootstrap' as const,
    clock: {
      serverTimeMs: now,
      requestMidpointWallTimeMs: now,
      responseWallTimeMs: now,
      responsePerformanceTimeMs: now,
    },
  }
}

const position = (modeledFor: number): ModeledOrbitalPosition => ({
  id: 'orbital:694',
  noradCatalogId: '694',
  name: 'ATLAS CENTAUR 2',
  internationalDesignator: '1963-047A',
  objectType: 'PAY',
  sourceGroups: ['visual'],
  displayOrder: 694,
  elementEpoch: modeledFor,
  snapshotRetrievedAt: Date.parse(snapshot.retrievedAt),
  snapshotSha256: snapshot.sha256,
  modeledFor,
  latitude: 10,
  longitude: 20,
  altitudeKm: 600,
  velocityKmPerSecond: 7.6,
})

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

const acceptCatalog = (worker: FakeWorker) => {
  const load = worker.messages.find(message => message.type === 'load-catalog')
  if (load?.type !== 'load-catalog') throw Error('Expected catalog load')
  worker.emit({ type: 'catalog-loaded', catalogRevision: load.catalogRevision, acceptedCount: 1 })
  const request = worker.messages.find(message => message.type === 'positions')
  if (request?.type !== 'positions') throw Error('Expected positions request')
  return request
}

afterEach(() => {
  vi.useRealTimers()
})

describe('OrbitalController', () => {
  const captureFixture = async (
    options: { config?: OrbitalControllerConfig; wallSkew?: () => number } = {},
  ) => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse(snapshot.retrievedAt) + 1_000)
    const provider = { load: vi.fn(async () => loadResult()) }
    const states: OrbitalControllerState[] = []
    const workers: FakeWorker[] = []
    const controller = new OrbitalController({
      provider,
      config: options.config ?? config,
      runtime: { ...runtime, wallNow: () => Date.now() + (options.wallSkew?.() ?? 0) },
      onState: state => states.push(state),
      workerFactory: () => {
        const worker = new FakeWorker()
        workers.push(worker)
        return worker
      },
      onWarning: vi.fn(),
    })
    controller.start()
    controller.setEnabled(true)
    await flush()
    const request = acceptCatalog(workers[0])
    workers[0].emit({
      type: 'positions', catalogRevision: request.catalogRevision,
      requestId: request.requestId, positions: [position(request.modeledFor)],
    })
    return { controller, provider, states, workers, request }
  }

  it('copies the accepted exact identity before keyed pause, stops work and fences old worker output', async () => {
    const { controller, provider, states, workers, request } = await captureFixture()
    const captured = controller.acceptedPositionForCapture('orbital:694')
    expect(captured?.position).toEqual(position(request.modeledFor))
    expect(captured?.position).not.toBe(states.at(-1)?.positions[0])
    expect(captured?.position.sourceGroups).not.toBe(states.at(-1)?.positions[0].sourceGroups)
    expect(captured?.snapshot).toBe(states.at(-1)?.snapshot)
    expect(controller.acceptedPositionForCapture('orbital:starlink:694')).toBeUndefined()
    const messageCount = workers[0].messages.length
    controller.setCapturePause(41)
    expect(states.at(-1)).toMatchObject({ phase: 'paused-capture', capturePauseRevision: 41 })
    expect(workers[0].terminated).toBe(true)
    expect(controller.acceptedPositionForCapture('orbital:694')).toBeUndefined()
    controller.retry()
    controller.setSelectedId('orbital:694')
    controller.setViewport({ kind: 'world' })
    workers[0].emit({
      type: 'positions', catalogRevision: request.catalogRevision, requestId: request.requestId,
      positions: [{ ...position(request.modeledFor), latitude: 75 }],
    })
    await vi.advanceTimersByTimeAsync(config.positionIntervalMs * 3)
    expect(provider.load).toHaveBeenCalledTimes(1)
    expect(workers).toHaveLength(1)
    expect(workers[0].messages).toHaveLength(messageCount)
    expect(states.at(-1)?.positions[0]?.latitude).toBe(10)
    expect(vi.getTimerCount()).toBe(1)
    controller.setCapturePause(42)
    expect(states.at(-1)?.capturePauseRevision).toBe(42)
    controller.setCapturePause(undefined)
    expect(states.at(-1)?.capturePauseRevision).toBeUndefined()
    expect(provider.load).toHaveBeenCalledTimes(1)
    expect(workers).toHaveLength(2)
    controller.stop()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('models only the selected pose at the existing cadence, pauses/resumes cleanly and restarts ordinary predictions on Return', async () => {
    const { controller, provider, states, workers } = await captureFixture()
    const ordinary = states.at(-1)?.positions
    controller.setCapturePause(21, 'orbital:694')
    expect(workers[0].terminated).toBe(true)
    const ride = workers[1]
    const first = acceptCatalog(ride)
    expect(first.selectedId).toBe('orbital:694')
    const response: OrbitalWorkerResponse = {
      type: 'positions', catalogRevision: first.catalogRevision, requestId: first.requestId,
      positions: [{ ...position(first.modeledFor), latitude: 11 }],
    }
    ride.emit(response)
    expect(states.at(-1)).toMatchObject({
      phase: 'paused-capture', capturePauseRevision: 21, viewPosition: { latitude: 11 },
    })
    expect(states.at(-1)?.positions).toBe(ordinary)
    controller.retry()
    controller.setViewport({ kind: 'world' })
    controller.setSelectedId('orbital:695')
    await vi.advanceTimersByTimeAsync(config.positionIntervalMs - 1)
    expect(ride.messages.filter(message => message.type === 'positions')).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(ride.messages.filter(message => message.type === 'positions')).toHaveLength(2)
    expect(ride.messages.filter(message => message.type === 'prediction')).toEqual([])
    expect(provider.load).toHaveBeenCalledTimes(1)

    controller.setCapturePause(21)
    expect(ride.terminated).toBe(true)
    expect(states.at(-1)?.viewPosition).toBeUndefined()
    await vi.advanceTimersByTimeAsync(config.positionIntervalMs * 3)
    expect(workers).toHaveLength(2)
    expect(provider.load).toHaveBeenCalledTimes(1)

    controller.setCapturePause(21, 'orbital:694')
    const resumed = workers[2]
    const fresh = acceptCatalog(resumed)
    expect(fresh.modeledFor).toBeGreaterThan(first.modeledFor)
    resumed.emit(response)
    expect(states.at(-1)?.viewPosition).toBeUndefined()
    resumed.emit({
      type: 'positions', catalogRevision: fresh.catalogRevision, requestId: fresh.requestId,
      positions: [position(fresh.modeledFor)],
    })
    expect(states.at(-1)?.viewPosition?.modeledFor).toBe(fresh.modeledFor)

    controller.setCapturePause(undefined)
    expect(resumed.terminated).toBe(true)
    const returned = workers[3]
    expect(acceptCatalog(returned)).not.toHaveProperty('selectedId')
    expect(returned.messages.filter(message => message.type === 'prediction')).toHaveLength(1)
    expect(states.at(-1)?.viewPosition).toBeUndefined()
    expect(states.at(-1)?.capturePauseRevision).toBeUndefined()
    expect(provider.load).toHaveBeenCalledTimes(1)
    controller.stop()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['empty', 'identity', 'digest', 'retrieval', 'time', 'multiple'] as const)(
    'fails explicitly rather than accepting a mismatched selected-only response: %s',
    async mismatch => {
      const { controller, workers, states, provider } = await captureFixture()
      controller.setCapturePause(22, 'orbital:694')
      const worker = workers[1]
      const request = acceptCatalog(worker)
      const selected = position(request.modeledFor)
      let positions = [selected]
      if (mismatch === 'empty') positions = []
      else if (mismatch === 'identity') selected.id = 'orbital:695'
      else if (mismatch === 'digest') selected.snapshotSha256 = 'b'.repeat(64)
      else if (mismatch === 'retrieval') selected.snapshotRetrievedAt += 1
      else if (mismatch === 'time') selected.modeledFor += 1
      else positions = [selected, { ...selected }]
      worker.emit({
        type: 'positions', catalogRevision: request.catalogRevision, requestId: request.requestId, positions,
      })
      expect(states.at(-1)?.phase).toBe('unavailable')
      expect(states.at(-1)?.message).toContain('could not be modeled')
      expect(states.at(-1)?.message).not.toContain('Returned')
      expect(states.at(-1)?.viewPosition).toBeUndefined()
      expect(worker.terminated).toBe(true)
      expect(provider.load).toHaveBeenCalledTimes(1)
      controller.stop()
    },
  )

  it('stops selected work while hidden, clears stale readiness and resumes only with a fresh selected result', async () => {
    const { controller, states, workers, provider } = await captureFixture()
    controller.setCapturePause(23, 'orbital:694')
    const request = acceptCatalog(workers[1])
    workers[1].emit({
      type: 'positions', catalogRevision: request.catalogRevision, requestId: request.requestId,
      positions: [position(request.modeledFor)],
    })
    expect(states.at(-1)?.viewPosition).toBeDefined()
    controller.setPageVisible(false)
    expect(workers[1].terminated).toBe(true)
    expect(states.at(-1)?.viewPosition).toBeUndefined()
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(30_000)
    controller.setPageVisible(true)
    expect(states.at(-1)?.viewPosition).toBeUndefined()
    const resumed = acceptCatalog(workers[2])
    expect(resumed.selectedId).toBe('orbital:694')
    expect(resumed.modeledFor).toBe(request.modeledFor + 30_000)
    expect(workers[2].messages.some(message => message.type === 'prediction')).toBe(false)
    expect(provider.load).toHaveBeenCalledTimes(1)
    controller.stop()
  })

  it.each([
    ['curated', false, config], ['curated', true, config],
    ['starlink', false, createAppConfig({}).starlink], ['starlink', true, createAppConfig({}).starlink],
  ] as const)(
    'retains the %s original revalidation deadline across capture (moving: %s)',
    async (_owner, moving, channelConfig) => {
      const { controller, provider } = await captureFixture({ config: channelConfig })
      const startedAt = Date.now()
      controller.setCapturePause(1, moving ? 'orbital:694' : undefined)
      vi.setSystemTime(startedAt + channelConfig.revalidationIntervalMs - 1_000)
      controller.setCapturePause(undefined)
      await vi.advanceTimersByTimeAsync(999)
      expect(provider.load).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(provider.load).toHaveBeenCalledTimes(2)
      controller.stop()
    },
  )

  it.each([false, true])('observes captured clock jumps on the existing interval without fetching (moving: %s)', async moving => {
    let skew = 0
    const { controller, provider, states, workers } = await captureFixture({ wallSkew: () => skew })
    controller.setCapturePause(7, moving ? 'orbital:694' : undefined)
    skew = config.maximumWallClockJumpMs + 1
    await vi.advanceTimersByTimeAsync(config.positionIntervalMs)
    expect(states.at(-1)).toMatchObject({ phase: 'clock-invalid', capturePauseRevision: 7 })
    expect(provider.load).toHaveBeenCalledTimes(1)
    expect(workers).toHaveLength(moving ? 2 : 1)
    expect(workers.every(worker => worker.terminated)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    controller.stop()
  })

  it.each(['history', 'hidden', 'disabled'] as const)(
    'does not acquire or recreate a worker when capture releases into %s',
    async pause => {
      const { controller, provider, states, workers } = await captureFixture()
      controller.setCapturePause(17)
      if (pause === 'history') controller.setHistoryActive(true)
      else if (pause === 'hidden') controller.setPageVisible(false)
      else controller.setEnabled(false)
      controller.setCapturePause(undefined)
      expect(states.at(-1)?.phase).toBe(
        pause === 'history' ? 'paused-history' : pause === 'hidden' ? 'paused-hidden' : 'disabled',
      )
      expect(provider.load).toHaveBeenCalledTimes(1)
      expect(workers).toHaveLength(1)
      expect(workers[0].terminated).toBe(true)
      expect(vi.getTimerCount()).toBe(0)
      controller.stop()
    },
  )

  it('fences a catalog refresh that ignores cancellation after an accepted capture', async () => {
    const { controller, provider, states, workers } = await captureFixture()
    let completeRefresh: ((value: ReturnType<typeof loadResult>) => void) | undefined
    provider.load.mockReturnValueOnce(new Promise(resolve => { completeRefresh = resolve }))
    controller.retry()
    expect(provider.load).toHaveBeenCalledTimes(2)
    expect(controller.acceptedPositionForCapture('orbital:694')).toBeDefined()
    controller.setCapturePause(23)
    if (!completeRefresh) throw Error('The deferred refresh did not start')
    completeRefresh({ ...loadResult(), snapshot: { ...snapshot, sha256: 'b'.repeat(64) } })
    await flush()
    expect(states.at(-1)).toMatchObject({
      phase: 'paused-capture', capturePauseRevision: 23,
      snapshot: { sha256: snapshot.sha256 },
    })
    expect(workers).toHaveLength(1)
    expect(workers[0].terminated).toBe(true)
    controller.stop()
  })

  it.each([false, true])('retains a safe offline view, then fails closed on hard expiry (moving: %s)', async moving => {
    const { controller, provider, states, workers } = await captureFixture({
      config: { ...config, staleAfterMs: 2_000, expireAfterMs: 3_000 },
    })
    controller.setCapturePause(9, moving ? 'orbital:694' : undefined)
    if (moving) {
      const request = acceptCatalog(workers[1])
      workers[1].emit({
        type: 'positions', catalogRevision: request.catalogRevision, requestId: request.requestId,
        positions: [position(request.modeledFor)],
      })
    }
    controller.setOnline(false)
    expect(states.at(-1)).toMatchObject({ phase: 'paused-capture', capturePauseRevision: 9 })
    if (moving) expect(states.at(-1)?.viewPosition).toBeDefined()
    await vi.advanceTimersByTimeAsync(2_001)
    expect(states.at(-1)).toMatchObject({ phase: 'offline', capturePauseRevision: 9, positions: [] })
    expect(provider.load).toHaveBeenCalledTimes(1)
    expect(workers.every(worker => worker.terminated)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    controller.stop()
  })

  it('retains the capture acknowledgement while hidden and validates before resuming a visible scene', async () => {
    let skew = 0
    const { controller, states, provider } = await captureFixture({ wallSkew: () => skew })
    controller.setCapturePause(11)
    controller.setPageVisible(false)
    expect(states.at(-1)).toMatchObject({ phase: 'paused-hidden', capturePauseRevision: 11 })
    expect(vi.getTimerCount()).toBe(0)
    skew = config.maximumWallClockJumpMs + 1
    controller.setPageVisible(true)
    expect(states.at(-1)).toMatchObject({ phase: 'clock-invalid', capturePauseRevision: 11 })
    expect(provider.load).toHaveBeenCalledTimes(1)
    controller.stop()
  })

  it('fetches only after enable and does not refetch for view, selection, or hide/show', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-09-28T18:46:00.000Z'))
    const provider = { load: vi.fn(async () => loadResult()) }
    const workers: FakeWorker[] = []
    const states: OrbitalControllerState[] = []
    const controller = new OrbitalController({
      provider,
      workerFactory: () => {
        const worker = new FakeWorker()
        workers.push(worker)
        return worker
      },
      config,
      runtime,
      onState: (state) => states.push(state),
      onWarning: vi.fn(),
    })

    controller.start()
    expect(provider.load).not.toHaveBeenCalled()
    controller.setEnabled(true)
    await flush()
    expect(provider.load).toHaveBeenCalledTimes(1)
    expect(workers).toHaveLength(1)

    const loadMessage = workers[0].messages[0]
    expect(loadMessage.type).toBe('load-catalog')
    if (loadMessage.type !== 'load-catalog') return
    workers[0].emit({
      type: 'catalog-loaded',
      catalogRevision: loadMessage.catalogRevision,
      acceptedCount: snapshot.recordCount,
    })
    const positionRequest = workers[0].messages.find(
      (message) => message.type === 'positions',
    )
    expect(positionRequest?.type).toBe('positions')
    if (positionRequest?.type !== 'positions') return
    workers[0].emit({
      type: 'positions',
      catalogRevision: positionRequest.catalogRevision,
      requestId: positionRequest.requestId,
      positions: [position(positionRequest.modeledFor)],
    })
    expect(states.at(-1)?.phase).toBe('ready')

    controller.setViewport({ kind: 'world' })
    controller.setSelectedId('orbital:694')
    controller.setFilters({
      objectType: 'PAY',
      sourceGroup: 'visual',
    })
    expect(provider.load).toHaveBeenCalledTimes(1)
    const predictions = workers[0].messages.filter(
      (message) => message.type === 'prediction',
    )
    expect(predictions).toHaveLength(4)
    const firstPrediction = predictions[0]
    if (firstPrediction.type !== 'prediction') return
    workers[0].emit({
      type: 'prediction',
      catalogRevision: firstPrediction.catalogRevision,
      requestId: firstPrediction.requestId,
      prediction: {
        mode: 'invalid',
        results: [],
        totalResults: 0,
        inViewCount: 0,
        futureCrossingCount: 0,
        trackSegments: [],
      },
    })
    expect(
      workers[0].messages.filter(
        (message) => message.type === 'prediction',
      ),
    ).toHaveLength(4)

    controller.setEnabled(false)
    expect(workers[0].terminated).toBe(true)
    controller.setEnabled(true)
    await flush()
    expect(provider.load).toHaveBeenCalledTimes(1)
    expect(workers).toHaveLength(2)
    controller.stop()
  })

  it('pauses independently for hidden pages and history playback', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-09-28T18:46:00.000Z'))
    const provider = { load: vi.fn(async () => loadResult()) }
    const workers: FakeWorker[] = []
    const states: OrbitalControllerState[] = []
    const controller = new OrbitalController({
      provider,
      workerFactory: () => {
        const worker = new FakeWorker()
        workers.push(worker)
        return worker
      },
      config,
      runtime,
      onState: (state) => states.push(state),
      onWarning: vi.fn(),
    })

    controller.start()
    controller.setEnabled(true)
    await flush()
    controller.setPageVisible(false)
    expect(states.at(-1)?.phase).toBe('paused-hidden')
    expect(workers[0].terminated).toBe(true)

    controller.setPageVisible(true)
    expect(workers).toHaveLength(2)
    controller.setHistoryActive(true)
    expect(states.at(-1)?.phase).toBe('paused-history')
    expect(workers[1].terminated).toBe(true)
    controller.stop()
  })

  it('suppresses propagation when the host clock proves device skew', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-09-28T18:46:00.000Z'))
    const invalidClock = loadResult()
    invalidClock.clock.serverTimeMs += config.maximumClockSkewMs + 1
    const states: OrbitalControllerState[] = []
    const workerFactory = vi.fn(() => new FakeWorker())
    const controller = new OrbitalController({
      provider: { load: vi.fn(async () => invalidClock) },
      workerFactory,
      config,
      runtime,
      onState: (state) => states.push(state),
      onWarning: vi.fn(),
    })

    controller.start()
    controller.setEnabled(true)
    await flush()

    expect(states.at(-1)).toMatchObject({
      phase: 'clock-invalid',
      positions: [],
    })
    expect(workerFactory).not.toHaveBeenCalled()
    controller.stop()
  })

  it('revalidates on the configured cadence without resetting it on view changes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-09-28T18:46:00.000Z'))
    const provider = { load: vi.fn(async () => loadResult()) }
    const controller = new OrbitalController({
      provider,
      workerFactory: () => new FakeWorker(),
      config,
      runtime,
      onState: vi.fn(),
      onWarning: vi.fn(),
    })

    controller.start()
    controller.setEnabled(true)
    await flush()
    controller.setViewport({ kind: 'world' })
    await vi.advanceTimersByTimeAsync(
      config.revalidationIntervalMs - 1,
    )
    expect(provider.load).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(provider.load).toHaveBeenCalledTimes(2)
    controller.stop()
  })

  it('keeps the refreshing phase while retained positions continue updating', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-09-28T18:46:00.000Z'))
    let resolveRefresh:
      | ((value: ReturnType<typeof loadResult>) => void)
      | undefined
    const refresh = new Promise<ReturnType<typeof loadResult>>((resolve) => {
      resolveRefresh = resolve
    })
    const provider = {
      load: vi
        .fn()
        .mockResolvedValueOnce(loadResult())
        .mockReturnValueOnce(refresh),
    }
    const worker = new FakeWorker()
    const states: OrbitalControllerState[] = []
    const controller = new OrbitalController({
      provider,
      workerFactory: () => worker,
      config: {
        ...config,
        revalidationIntervalMs: 1_000,
        positionIntervalMs: 1_000,
      },
      runtime,
      onState: (state) => states.push(state),
      onWarning: vi.fn(),
    })

    controller.start()
    controller.setEnabled(true)
    await flush()
    const loadMessage = worker.messages[0]
    expect(loadMessage.type).toBe('load-catalog')
    if (loadMessage.type !== 'load-catalog') return
    worker.emit({
      type: 'catalog-loaded',
      catalogRevision: loadMessage.catalogRevision,
      acceptedCount: snapshot.recordCount,
    })
    const firstPositionRequest = worker.messages.find(
      (message) => message.type === 'positions',
    )
    expect(firstPositionRequest?.type).toBe('positions')
    if (firstPositionRequest?.type !== 'positions') return
    worker.emit({
      type: 'positions',
      catalogRevision: firstPositionRequest.catalogRevision,
      requestId: firstPositionRequest.requestId,
      positions: [position(firstPositionRequest.modeledFor)],
    })

    await vi.advanceTimersByTimeAsync(1_000)
    expect(provider.load).toHaveBeenCalledTimes(2)
    expect(states.at(-1)?.phase).toBe('refreshing')

    const positionRequests = worker.messages.filter(
      (message): message is Extract<
        OrbitalWorkerRequest,
        { type: 'positions' }
      > => message.type === 'positions',
    )
    const refreshPositionRequest = positionRequests.at(-1)
    expect(refreshPositionRequest).toBeDefined()
    if (!refreshPositionRequest) return
    worker.emit({
      type: 'positions',
      catalogRevision: refreshPositionRequest.catalogRevision,
      requestId: refreshPositionRequest.requestId,
      positions: [position(refreshPositionRequest.modeledFor)],
    })
    expect(states.at(-1)?.phase).toBe('refreshing')

    resolveRefresh?.(loadResult())
    await flush()
    expect(states.at(-1)?.phase).toBe('ready')
    controller.stop()
  })

  it.each([false, true])('never starts propagation from an already expired catalog (source blocked: %s)', async (refreshBlocked) => {
    vi.useFakeTimers()
    const retrievedAt = Date.parse(snapshot.retrievedAt)
    vi.setSystemTime(retrievedAt + config.expireAfterMs + 1)
    const expired = { ...loadResult(), refreshBlocked }
    expired.clock.serverTimeMs = Date.now()
    expired.clock.requestMidpointWallTimeMs = Date.now()
    expired.clock.responseWallTimeMs = Date.now()
    expired.clock.responsePerformanceTimeMs = Date.now()
    const workerFactory = vi.fn(() => new FakeWorker())
    const states: OrbitalControllerState[] = []
    const controller = new OrbitalController({
      provider: { load: vi.fn(async () => expired) },
      workerFactory,
      config,
      runtime,
      onState: (state) => states.push(state),
      onWarning: vi.fn(),
    })

    controller.start()
    controller.setEnabled(true)
    await flush()

    expect(workerFactory).not.toHaveBeenCalled()
    expect(states.at(-1)).toMatchObject({
      phase: 'unavailable',
      positions: [],
      message: refreshBlocked
        ? 'Source updates are paused; cached orbital data expired.'
        : 'The orbital catalog is too old to model safely.',
    })
    controller.stop()
  })

  it.each([false, true])('expires active modeled output at the hard-age boundary (source blocked: %s)', async (refreshBlocked) => {
    vi.useFakeTimers()
    const now = Date.parse('2026-09-28T18:46:00.000Z')
    vi.setSystemTime(now)
    const currentSnapshot = {
      ...snapshot,
      retrievedAt: new Date(now).toISOString(),
    }
    const initial = { ...loadResult(), refreshBlocked }
    initial.snapshot = currentSnapshot
    const pendingRefresh = new Promise<ReturnType<typeof loadResult>>(
      () => undefined,
    )
    const provider = {
      load: vi
        .fn()
        .mockResolvedValueOnce(initial)
        .mockReturnValueOnce(pendingRefresh),
    }
    const worker = new FakeWorker()
    const states: OrbitalControllerState[] = []
    const controller = new OrbitalController({
      provider,
      workerFactory: () => worker,
      config: { ...config, expireAfterMs: 2_000 },
      runtime,
      onState: (state) => states.push(state),
      onWarning: vi.fn(),
    })

    controller.start()
    controller.setEnabled(true)
    await flush()
    const loadMessage = worker.messages[0]
    if (loadMessage.type !== 'load-catalog') return
    worker.emit({
      type: 'catalog-loaded',
      catalogRevision: loadMessage.catalogRevision,
      acceptedCount: currentSnapshot.recordCount,
    })
    const positionRequest = worker.messages.find(
      (message) => message.type === 'positions',
    )
    if (positionRequest?.type !== 'positions') return
    worker.emit({
      type: 'positions',
      catalogRevision: positionRequest.catalogRevision,
      requestId: positionRequest.requestId,
      positions: [position(positionRequest.modeledFor)],
    })

    await vi.advanceTimersByTimeAsync(2_001)

    expect(worker.terminated).toBe(true)
    expect(states.at(-1)).toMatchObject({
      phase: 'unavailable',
      positions: [],
      message: refreshBlocked
        ? 'Source updates are paused; cached orbital data expired.'
        : 'The orbital catalog is too old to model safely.',
    })
    expect(provider.load).toHaveBeenCalledTimes(2)
    controller.stop()
  })

  it('preserves offline truth when a pending position result is empty', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-09-28T18:46:00.000Z'))
    const worker = new FakeWorker()
    const states: OrbitalControllerState[] = []
    const controller = new OrbitalController({
      provider: { load: vi.fn(async () => loadResult()) },
      workerFactory: () => worker,
      config,
      runtime,
      onState: (state) => states.push(state),
      onWarning: vi.fn(),
    })

    controller.start()
    controller.setEnabled(true)
    await flush()
    const loadMessage = worker.messages[0]
    if (loadMessage.type !== 'load-catalog') return
    worker.emit({
      type: 'catalog-loaded',
      catalogRevision: loadMessage.catalogRevision,
      acceptedCount: snapshot.recordCount,
    })
    const positionRequest = worker.messages.find(
      (message) => message.type === 'positions',
    )
    if (positionRequest?.type !== 'positions') return
    controller.setOnline(false)
    worker.emit({
      type: 'positions',
      catalogRevision: positionRequest.catalogRevision,
      requestId: positionRequest.requestId,
      positions: [],
    })

    expect(states.at(-1)?.phase).toBe('offline')
    controller.stop()
  })

  it('clears prior-generation output before loading a changed catalog', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-09-28T18:46:00.000Z'))
    const changed = loadResult()
    changed.snapshot = { ...snapshot, sha256: 'b'.repeat(64) }
    const provider = {
      load: vi
        .fn()
        .mockResolvedValueOnce(loadResult())
        .mockResolvedValueOnce(changed),
    }
    const worker = new FakeWorker()
    const states: OrbitalControllerState[] = []
    const controller = new OrbitalController({
      provider,
      workerFactory: () => worker,
      config,
      runtime,
      onState: (state) => states.push(state),
      onWarning: vi.fn(),
    })

    controller.start()
    controller.setEnabled(true)
    await flush()
    const loadMessage = worker.messages[0]
    if (loadMessage.type !== 'load-catalog') return
    worker.emit({
      type: 'catalog-loaded',
      catalogRevision: loadMessage.catalogRevision,
      acceptedCount: snapshot.recordCount,
    })
    const positionRequest = worker.messages.find(
      (message) => message.type === 'positions',
    )
    if (positionRequest?.type !== 'positions') return
    worker.emit({
      type: 'positions',
      catalogRevision: positionRequest.catalogRevision,
      requestId: positionRequest.requestId,
      positions: [position(positionRequest.modeledFor)],
    })
    controller.retry()
    await flush()

    expect(states.at(-1)).toMatchObject({
      phase: 'refreshing',
      positions: [],
      snapshot: { sha256: 'b'.repeat(64) },
    })
    controller.stop()
  })

  it('defers retries until provider guidance and reports worker failures', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-09-28T18:46:00.000Z'))
    const provider = {
      load: vi
        .fn()
        .mockRejectedValueOnce(
          new ProviderError('Rate limited', 429, 5_000),
        )
        .mockResolvedValueOnce(loadResult()),
    }
    const worker = new FakeWorker()
    const states: OrbitalControllerState[] = []
    const controller = new OrbitalController({
      provider,
      workerFactory: () => worker,
      config,
      runtime,
      onState: (state) => states.push(state),
      onWarning: vi.fn(),
    })

    controller.start()
    controller.setEnabled(true)
    await flush()
    controller.retry()
    await flush()
    expect(provider.load).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(5_000)
    controller.retry()
    await flush()
    expect(provider.load).toHaveBeenCalledTimes(2)

    worker.emitError()
    expect(states.at(-1)).toMatchObject({
      phase: 'unavailable',
      positions: [],
      message: 'Orbital propagation worker failed.',
    })
    controller.stop()
  })

  it('coalesces obsolete predictions and ignores their failures', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-09-28T18:46:00.000Z'))
    const worker = new FakeWorker()
    const states: OrbitalControllerState[] = []
    const controller = new OrbitalController({
      provider: { load: vi.fn(async () => loadResult()) },
      workerFactory: () => worker,
      config,
      runtime,
      onState: (state) => states.push(state),
      onWarning: vi.fn(),
    })

    controller.start()
    controller.setEnabled(true)
    await flush()
    const loadMessage = worker.messages[0]
    if (loadMessage.type !== 'load-catalog') return
    worker.emit({
      type: 'catalog-loaded',
      catalogRevision: loadMessage.catalogRevision,
      acceptedCount: snapshot.recordCount,
    })
    const firstPrediction = worker.messages.find(
      (message) => message.type === 'prediction',
    )
    if (firstPrediction?.type !== 'prediction') return

    controller.setViewport({
      kind: 'local',
      center: { latitude: 1, longitude: 1 },
      polygon: [
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 2 },
        { latitude: 2, longitude: 2 },
        { latitude: 2, longitude: 0 },
      ],
    })
    controller.setViewport({
      kind: 'local',
      center: { latitude: 3, longitude: 3 },
      polygon: [
        { latitude: 2, longitude: 2 },
        { latitude: 2, longitude: 4 },
        { latitude: 4, longitude: 4 },
        { latitude: 4, longitude: 2 },
      ],
    })
    const queuedPredictions = worker.messages.filter(
      (message) => message.type === 'prediction',
    )
    expect(queuedPredictions).toHaveLength(3)
    expect(queuedPredictions[2]).toMatchObject({
      viewport: {
        kind: 'local',
        center: { latitude: 3, longitude: 3 },
      },
    })

    worker.emit({
      type: 'error',
      operation: 'prediction',
      catalogRevision: firstPrediction.catalogRevision,
      requestId: firstPrediction.requestId,
      message: 'obsolete prediction failed',
    })

    const predictions = worker.messages.filter(
      (message) => message.type === 'prediction',
    )
    expect(predictions).toHaveLength(3)
    expect(states.at(-1)?.phase).not.toBe('unavailable')
    const latestPrediction = predictions[2]
    if (latestPrediction?.type !== 'prediction') return
    worker.emit({
      type: 'prediction',
      catalogRevision: latestPrediction.catalogRevision,
      requestId: latestPrediction.requestId,
      prediction: {
        mode: 'local',
        results: [],
        totalResults: 0,
        inViewCount: 0,
        futureCrossingCount: 0,
        trackSegments: [],
      },
    })
    expect(states.at(-1)?.prediction).toMatchObject({
      filtersSignature: orbitalFiltersSignature(
        DEFAULT_ORBITAL_DISCOVERY_FILTERS,
      ),
      viewportSignature: orbitalViewportSignature(
        latestPrediction.viewport,
      ),
    })
    controller.stop()
  })
})
