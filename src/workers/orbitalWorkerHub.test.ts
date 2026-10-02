import { describe, expect, it, vi } from 'vitest'
import {
  orbitalFeatureId,
  type ModeledOrbitalPosition,
  type OrbitalCatalogSnapshot,
  type OrbitalPrediction,
} from '../domain/orbital'
import {
  DEFAULT_ORBITAL_DISCOVERY_FILTERS,
} from '../domain/orbitalDiscovery'
import type { OrbitalViewport } from '../domain/orbitalViewport'
import { createOrbitalWorkerDispatcher } from './orbital.worker'
import type { PreparedOrbitalCatalog } from './orbitalPropagation'
import type {
  OrbitalPhysicalWorkerLike,
  OrbitalPhysicalWorkerRequest,
  OrbitalPhysicalWorkerResponse,
  OrbitalPropagationLimits,
  OrbitalWorkerLike,
  OrbitalWorkerRequest,
  OrbitalWorkerResponse,
} from './orbitalProtocol'
import { OrbitalWorkerHub } from './orbitalWorkerHub'

class FakePhysicalWorker implements OrbitalPhysicalWorkerLike {
  readonly messages: OrbitalPhysicalWorkerRequest[] = []
  terminated = false
  private readonly messageListeners = new Set<
    (event: MessageEvent<OrbitalPhysicalWorkerResponse>) => void
  >()
  private readonly errorListeners = new Set<
    (event: ErrorEvent) => void
  >()
  private readonly messageErrorListeners = new Set<
    (event: MessageEvent<unknown>) => void
  >()

  postMessage(message: OrbitalPhysicalWorkerRequest) {
    this.messages.push(message)
  }

  addEventListener(
    type: 'message',
    listener: (
      event: MessageEvent<OrbitalPhysicalWorkerResponse>,
    ) => void,
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
      | ((event: MessageEvent<OrbitalPhysicalWorkerResponse>) => void)
      | ((event: ErrorEvent) => void)
      | ((event: MessageEvent<unknown>) => void),
  ) {
    if (type === 'message') {
      this.messageListeners.add(
        listener as (
          event: MessageEvent<OrbitalPhysicalWorkerResponse>,
        ) => void,
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
    listener: (
      event: MessageEvent<OrbitalPhysicalWorkerResponse>,
    ) => void,
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
      | ((event: MessageEvent<OrbitalPhysicalWorkerResponse>) => void)
      | ((event: ErrorEvent) => void)
      | ((event: MessageEvent<unknown>) => void),
  ) {
    if (type === 'message') {
      this.messageListeners.delete(
        listener as (
          event: MessageEvent<OrbitalPhysicalWorkerResponse>,
        ) => void,
      )
    } else if (type === 'error') {
      this.errorListeners.delete(listener as (event: ErrorEvent) => void)
    } else {
      this.messageErrorListeners.delete(
        listener as (event: MessageEvent<unknown>) => void,
      )
    }
  }

  terminate() {
    this.terminated = true
  }

  emit(message: OrbitalPhysicalWorkerResponse) {
    const event = {
      data: message,
    } as MessageEvent<OrbitalPhysicalWorkerResponse>
    for (const listener of this.messageListeners) listener(event)
  }

  emitError() {
    const event = {
      message: 'physical worker failed',
      preventDefault: vi.fn(),
    } as unknown as ErrorEvent
    for (const listener of this.errorListeners) listener(event)
  }

  emitMessageError() {
    const event = { data: undefined } as MessageEvent<unknown>
    for (const listener of this.messageErrorListeners) listener(event)
  }
}

const position = (
  noradCatalogId: string,
): ModeledOrbitalPosition => ({
  id: orbitalFeatureId(noradCatalogId),
  noradCatalogId,
  name: `OBJECT ${noradCatalogId}`,
  internationalDesignator: '2026-001A',
  objectType: 'PAY',
  sourceGroups: ['starlink'],
  displayOrder: Number(noradCatalogId),
  elementEpoch: 1,
  snapshotRetrievedAt: 2,
  snapshotSha256: 'a'.repeat(64),
  modeledFor: 3,
  latitude: 10,
  longitude: 20,
  altitudeKm: 600,
  velocityKmPerSecond: 7.6,
})

const predictionRequest = (
  selectedId: string | null,
): Extract<OrbitalWorkerRequest, { type: 'prediction' }> => ({
  type: 'prediction',
  catalogRevision: 1,
  requestId: 1,
  modeledFor: 3,
  viewport: { kind: 'world' },
  selectedId,
  filters: DEFAULT_ORBITAL_DISCOVERY_FILTERS,
})

const messages = (worker: OrbitalWorkerLike) => {
  const received: OrbitalWorkerResponse[] = []
  worker.addEventListener('message', (event) => {
    received.push(event.data)
  })
  return received
}

describe('OrbitalWorkerHub', () => {
  it('shares one physical worker, isolates channels, and transforms Starlink IDs', () => {
    const physicalWorkers: FakePhysicalWorker[] = []
    const hub = new OrbitalWorkerHub(() => {
      const worker = new FakePhysicalWorker()
      physicalWorkers.push(worker)
      return worker
    })
    const curated = hub.createChannel('curated')
    const starlink = hub.createChannel('starlink')
    const curatedMessages = messages(curated)
    const starlinkMessages = messages(starlink)

    expect(physicalWorkers).toHaveLength(1)
    curated.postMessage(
      predictionRequest(orbitalFeatureId('25544', 'starlink')),
    )
    starlink.postMessage(
      predictionRequest(orbitalFeatureId('70001', 'starlink')),
    )
    expect(physicalWorkers[0].messages).toEqual([
      {
        channel: 'curated',
        message: expect.objectContaining({ selectedId: null }),
      },
      {
        channel: 'starlink',
        message: expect.objectContaining({
          selectedId: 'orbital:70001',
        }),
      },
    ])

    physicalWorkers[0].emit({
      channel: 'starlink',
      message: {
        type: 'positions',
        catalogRevision: 1,
        requestId: 1,
        positions: [position('70001')],
      },
    })
    physicalWorkers[0].emit({
      channel: 'starlink',
      message: {
        type: 'prediction',
        catalogRevision: 1,
        requestId: 1,
        prediction: {
          mode: 'world',
          results: [
            {
              id: 'orbital:70001',
              noradCatalogId: '70001',
              name: 'OBJECT 70001',
              objectType: 'PAY',
              currentlyInView: true,
            },
          ],
          totalResults: 1,
          inViewCount: 1,
          futureCrossingCount: 0,
          trackSegments: [],
        },
      },
    })
    physicalWorkers[0].emit({
      channel: 'curated',
      message: {
        type: 'positions',
        catalogRevision: 1,
        requestId: 1,
        positions: [{ ...position('25544'), sourceGroups: ['stations'] }],
      },
    })

    expect(starlinkMessages[0]).toMatchObject({
      type: 'positions',
      positions: [
        {
          id: 'orbital:starlink:70001',
          owner: 'starlink',
        },
      ],
    })
    expect(starlinkMessages[1]).toMatchObject({
      type: 'prediction',
      prediction: {
        results: [
          {
            id: 'orbital:starlink:70001',
            owner: 'starlink',
          },
        ],
      },
    })
    expect(curatedMessages).toHaveLength(1)
    expect(curatedMessages[0]).toMatchObject({
      type: 'positions',
      positions: [{ id: 'orbital:25544' }],
    })
    hub.dispose()
  })

  it('preserves the other channel and terminates only after the last channel', () => {
    const physical = new FakePhysicalWorker()
    const hub = new OrbitalWorkerHub(() => physical)
    const curated = hub.createChannel('curated')
    const starlink = hub.createChannel('starlink')

    curated.terminate()
    expect(physical.terminated).toBe(false)
    expect(physical.messages.at(-1)).toEqual({
      channel: 'curated',
      message: { type: 'dispose-channel' },
    })
    starlink.postMessage(predictionRequest(null))
    expect(physical.messages.at(-1)?.channel).toBe('starlink')

    starlink.terminate()
    expect(physical.messages.at(-1)).toEqual({
      channel: 'starlink',
      message: { type: 'dispose-channel' },
    })
    expect(physical.terminated).toBe(true)
  })

  it.each(['error', 'messageerror'] as const)(
    'fails both channels on physical %s and recreates cleanly',
    (failure) => {
      const physicalWorkers: FakePhysicalWorker[] = []
      const hub = new OrbitalWorkerHub(() => {
        const worker = new FakePhysicalWorker()
        physicalWorkers.push(worker)
        return worker
      })
      const curated = hub.createChannel('curated')
      const starlink = hub.createChannel('starlink')
      const curatedFailure = vi.fn()
      const starlinkFailure = vi.fn()
      if (failure === 'error') {
        curated.addEventListener('error', curatedFailure)
        starlink.addEventListener('error', starlinkFailure)
      } else {
        curated.addEventListener('messageerror', curatedFailure)
        starlink.addEventListener('messageerror', starlinkFailure)
      }

      if (failure === 'error') physicalWorkers[0].emitError()
      else physicalWorkers[0].emitMessageError()

      expect(curatedFailure).toHaveBeenCalledTimes(1)
      expect(starlinkFailure).toHaveBeenCalledTimes(1)
      expect(physicalWorkers[0].terminated).toBe(true)

      const replacement = hub.createChannel('curated')
      replacement.postMessage(predictionRequest(null))
      expect(physicalWorkers).toHaveLength(2)
      expect(physicalWorkers[1].messages[0]?.channel).toBe('curated')
      replacement.terminate()
      hub.dispose()
    },
  )
})

const snapshot: OrbitalCatalogSnapshot = {
  schemaVersion: 1,
  sourceContractVersion: 1,
  catalogId: 'test',
  sources: [],
  retrievedAt: '2026-10-01T19:45:00.000Z',
  publishedAt: '2026-10-01T19:45:00.000Z',
  recordCount: 0,
  records: [],
  sha256: 'a'.repeat(64),
}

const limits: OrbitalPropagationLimits = {
  maximumElementAgeMs: 1,
  maximumFutureElementMs: 1,
  maximumAltitudeKm: 1,
  predictionHorizonMs: 1,
  predictionStepMs: 1,
  maximumDetailedResults: 1,
  trackDurationMs: 1,
  maximumTrackPoints: 1,
  predictionChunkSize: 1,
}

const viewport: OrbitalViewport = { kind: 'world' }

const prediction = (modeledFor: number): OrbitalPrediction => ({
  mode: 'world',
  results: [],
  totalResults: modeledFor,
  inViewCount: 0,
  futureCrossingCount: 0,
  trackSegments: [],
})

const deferred = () => {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

describe('orbital physical worker channels', () => {
  it('coalesces predictions per channel without cancelling the other channel', async () => {
    const responses: OrbitalPhysicalWorkerResponse[] = []
    const gates = new Map([
      [1, deferred()],
      [2, deferred()],
      [10, deferred()],
    ])
    const prepared: PreparedOrbitalCatalog = {
      snapshot,
      objects: [],
      limits,
    }
    const predictView = vi.fn(
      async (
        _catalog: PreparedOrbitalCatalog,
        modeledFor: number,
        _viewport: OrbitalViewport,
        _selectedId: string | null,
        _filters: typeof DEFAULT_ORBITAL_DISCOVERY_FILTERS,
        options: {
          shouldCancel: () => boolean
          yieldControl: () => Promise<void>
        },
      ) => {
        await gates.get(modeledFor)?.promise
        return options.shouldCancel()
          ? undefined
          : prediction(modeledFor)
      },
    )
    const dispatcher = createOrbitalWorkerDispatcher(
      (message) => responses.push(message),
      {
        prepareCatalog: () => prepared,
        modelPositions: () => [],
        predictView,
        yieldControl: async () => undefined,
      },
    )

    for (const channel of ['curated', 'starlink'] as const) {
      dispatcher.handleMessage({
        channel,
        message: {
          type: 'load-catalog',
          catalogRevision: 1,
          snapshot,
          limits,
        },
      })
    }
    dispatcher.handleMessage({
      channel: 'curated',
      message: {
        ...predictionRequest(null),
        requestId: 1,
        modeledFor: 1,
        viewport,
      },
    })
    await Promise.resolve()
    dispatcher.handleMessage({
      channel: 'curated',
      message: {
        ...predictionRequest(null),
        requestId: 2,
        modeledFor: 2,
        viewport,
      },
    })
    dispatcher.handleMessage({
      channel: 'starlink',
      message: {
        ...predictionRequest(null),
        requestId: 10,
        modeledFor: 10,
        viewport,
      },
    })
    await Promise.resolve()

    gates.get(10)?.resolve()
    await vi.waitFor(() =>
      expect(
        responses.some(
          ({ channel, message }) =>
            channel === 'starlink' &&
            message.type === 'prediction' &&
            message.requestId === 10,
        ),
      ).toBe(true),
    )

    gates.get(1)?.resolve()
    await vi.waitFor(() =>
      expect(predictView).toHaveBeenCalledWith(
        prepared,
        2,
        viewport,
        null,
        DEFAULT_ORBITAL_DISCOVERY_FILTERS,
        expect.any(Object),
      ),
    )
    gates.get(2)?.resolve()
    await vi.waitFor(() =>
      expect(
        responses.some(
          ({ channel, message }) =>
            channel === 'curated' &&
            message.type === 'prediction' &&
            message.requestId === 2,
        ),
      ).toBe(true),
    )

    expect(
      responses.some(
        ({ channel, message }) =>
          channel === 'curated' &&
          message.type === 'prediction' &&
          message.requestId === 1,
      ),
    ).toBe(false)
    expect(
      responses.every(({ channel, message }) =>
        Boolean(channel && message.type),
      ),
    ).toBe(true)

    dispatcher.handleMessage({
      channel: 'starlink',
      message: { type: 'dispose-channel' },
    })
    dispatcher.handleMessage({
      channel: 'curated',
      message: {
        type: 'positions',
        catalogRevision: 1,
        requestId: 3,
        modeledFor: 3,
      },
    })
    expect(responses.at(-1)).toMatchObject({
      channel: 'curated',
      message: {
        type: 'positions',
        requestId: 3,
      },
    })
  })
})
