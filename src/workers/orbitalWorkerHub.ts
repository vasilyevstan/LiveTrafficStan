import {
  orbitalFeatureId,
  parseOrbitalFeatureId,
  type ModeledOrbitalPosition,
  type OrbitalChannel,
  type OrbitalCrossing,
  type OrbitalPrediction,
} from '../domain/orbital'
import type {
  OrbitalPhysicalWorkerLike,
  OrbitalPhysicalWorkerResponse,
  OrbitalWorkerLike,
  OrbitalWorkerRequest,
  OrbitalWorkerResponse,
} from './orbitalProtocol'
import { isOrbitalWorkerChannel } from './orbitalProtocol'

type MessageListener = (
  event: MessageEvent<OrbitalWorkerResponse>,
) => void
type ErrorListener = (event: ErrorEvent) => void
type MessageErrorListener = (event: MessageEvent<unknown>) => void

const publicPosition = (
  channel: OrbitalChannel,
  position: ModeledOrbitalPosition,
): ModeledOrbitalPosition =>
  channel === 'starlink'
    ? {
        ...position,
        id: orbitalFeatureId(position.noradCatalogId, channel),
        owner: channel,
      }
    : position

const publicCrossing = (
  channel: OrbitalChannel,
  crossing: OrbitalCrossing,
): OrbitalCrossing =>
  channel === 'starlink'
    ? {
        ...crossing,
        id: orbitalFeatureId(crossing.noradCatalogId, channel),
        owner: channel,
      }
    : crossing

const publicPrediction = (
  channel: OrbitalChannel,
  prediction: OrbitalPrediction,
): OrbitalPrediction =>
  channel === 'starlink'
    ? {
        ...prediction,
        results: prediction.results.map((crossing) =>
          publicCrossing(channel, crossing),
        ),
      }
    : prediction

const publicResponse = (
  channel: OrbitalChannel,
  response: OrbitalWorkerResponse,
): OrbitalWorkerResponse => {
  if (response.type === 'positions') {
    return {
      ...response,
      positions: response.positions.map((position) =>
        publicPosition(channel, position),
      ),
    }
  }
  if (response.type === 'prediction') {
    return {
      ...response,
      prediction: publicPrediction(channel, response.prediction),
    }
  }
  return response
}

const physicalRequest = (
  channel: OrbitalChannel,
  request: OrbitalWorkerRequest,
): OrbitalWorkerRequest => {
  if (request.type !== 'prediction') return request
  const selected = parseOrbitalFeatureId(request.selectedId)
  return {
    ...request,
    selectedId:
      selected?.owner === channel ? selected.canonicalId : null,
  }
}

const isPhysicalResponse = (
  value: unknown,
): value is OrbitalPhysicalWorkerResponse => {
  if (typeof value !== 'object' || value === null) return false
  const envelope = value as {
    channel?: unknown
    message?: unknown
  }
  const messageType = (envelope.message as { type?: unknown } | undefined)
    ?.type
  return (
    isOrbitalWorkerChannel(envelope.channel) &&
    typeof envelope.message === 'object' &&
    envelope.message !== null &&
    (messageType === 'catalog-loaded' ||
      messageType === 'positions' ||
      messageType === 'prediction-started' ||
      messageType === 'prediction' ||
      messageType === 'error')
  )
}

class OrbitalWorkerChannelAdapter implements OrbitalWorkerLike {
  readonly channel: OrbitalChannel
  private readonly hub: OrbitalWorkerHub
  private readonly messageListeners = new Set<MessageListener>()
  private readonly errorListeners = new Set<ErrorListener>()
  private readonly messageErrorListeners =
    new Set<MessageErrorListener>()
  private active = true

  constructor(hub: OrbitalWorkerHub, channel: OrbitalChannel) {
    this.hub = hub
    this.channel = channel
  }

  postMessage(message: OrbitalWorkerRequest) {
    if (!this.active) {
      throw new Error(`Orbital ${this.channel} worker channel is disposed`)
    }
    this.hub.postFromChannel(this, message)
  }

  addEventListener(type: 'message', listener: MessageListener): void
  addEventListener(type: 'error', listener: ErrorListener): void
  addEventListener(
    type: 'messageerror',
    listener: MessageErrorListener,
  ): void
  addEventListener(
    type: 'message' | 'error' | 'messageerror',
    listener: MessageListener | ErrorListener | MessageErrorListener,
  ) {
    if (type === 'message') {
      this.messageListeners.add(listener as MessageListener)
    } else if (type === 'error') {
      this.errorListeners.add(listener as ErrorListener)
    } else {
      this.messageErrorListeners.add(listener as MessageErrorListener)
    }
  }

  removeEventListener(type: 'message', listener: MessageListener): void
  removeEventListener(type: 'error', listener: ErrorListener): void
  removeEventListener(
    type: 'messageerror',
    listener: MessageErrorListener,
  ): void
  removeEventListener(
    type: 'message' | 'error' | 'messageerror',
    listener: MessageListener | ErrorListener | MessageErrorListener,
  ) {
    if (type === 'message') {
      this.messageListeners.delete(listener as MessageListener)
    } else if (type === 'error') {
      this.errorListeners.delete(listener as ErrorListener)
    } else {
      this.messageErrorListeners.delete(listener as MessageErrorListener)
    }
  }

  terminate() {
    if (!this.active) return
    this.hub.releaseChannel(this)
  }

  emitMessage(message: OrbitalWorkerResponse) {
    if (!this.active) return
    const event = { data: message } as MessageEvent<OrbitalWorkerResponse>
    for (const listener of this.messageListeners) listener(event)
  }

  emitError(event: ErrorEvent) {
    for (const listener of this.errorListeners) listener(event)
  }

  emitMessageError(event: MessageEvent<unknown>) {
    for (const listener of this.messageErrorListeners) listener(event)
  }

  invalidate() {
    this.active = false
  }
}

export type OrbitalPhysicalWorkerFactory =
  () => OrbitalPhysicalWorkerLike

export const createOrbitalPhysicalWorker =
  (): OrbitalPhysicalWorkerLike =>
    new Worker(new URL('./orbital.worker.ts', import.meta.url), {
      type: 'module',
      name: 'livetrafficstan-orbital-propagation',
    })

export class OrbitalWorkerHub {
  private readonly workerFactory: OrbitalPhysicalWorkerFactory
  private readonly channels = new Map<
    OrbitalChannel,
    OrbitalWorkerChannelAdapter
  >()
  private worker?: OrbitalPhysicalWorkerLike
  private disposed = false

  constructor(
    workerFactory: OrbitalPhysicalWorkerFactory =
      createOrbitalPhysicalWorker,
  ) {
    this.workerFactory = workerFactory
  }

  createChannel(channel: OrbitalChannel): OrbitalWorkerLike {
    if (this.disposed) {
      throw new Error('Orbital worker hub is disposed')
    }
    if (this.channels.has(channel)) {
      throw new Error(`Orbital ${channel} worker channel is already active`)
    }
    this.ensureWorker()
    const adapter = new OrbitalWorkerChannelAdapter(this, channel)
    this.channels.set(channel, adapter)
    return adapter
  }

  postFromChannel(
    adapter: OrbitalWorkerChannelAdapter,
    message: OrbitalWorkerRequest,
  ) {
    if (
      this.channels.get(adapter.channel) !== adapter ||
      !this.worker
    ) {
      throw new Error(
        `Orbital ${adapter.channel} worker channel is not active`,
      )
    }
    this.worker.postMessage({
      channel: adapter.channel,
      message: physicalRequest(adapter.channel, message),
    })
  }

  releaseChannel(adapter: OrbitalWorkerChannelAdapter) {
    if (this.channels.get(adapter.channel) !== adapter) {
      adapter.invalidate()
      return
    }
    this.channels.delete(adapter.channel)
    adapter.invalidate()
    if (this.worker) {
      try {
        this.worker.postMessage({
          channel: adapter.channel,
          message: { type: 'dispose-channel' },
        })
      } catch {
        this.failPhysicalMessageError({
          data: undefined,
        } as MessageEvent<unknown>)
        return
      }
    }
    if (this.channels.size === 0) this.terminatePhysicalWorker()
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    for (const adapter of this.channels.values()) {
      adapter.invalidate()
    }
    this.channels.clear()
    this.terminatePhysicalWorker()
  }

  private ensureWorker() {
    if (this.worker) return
    const worker = this.workerFactory()
    worker.addEventListener('message', this.handlePhysicalMessage)
    worker.addEventListener('error', this.handlePhysicalError)
    worker.addEventListener(
      'messageerror',
      this.handlePhysicalMessageError,
    )
    this.worker = worker
  }

  private terminatePhysicalWorker() {
    const worker = this.worker
    if (!worker) return
    worker.removeEventListener('message', this.handlePhysicalMessage)
    worker.removeEventListener('error', this.handlePhysicalError)
    worker.removeEventListener(
      'messageerror',
      this.handlePhysicalMessageError,
    )
    this.worker = undefined
    worker.terminate()
  }

  private readonly handlePhysicalMessage = (
    event: MessageEvent<OrbitalPhysicalWorkerResponse>,
  ) => {
    if (!isPhysicalResponse(event.data)) {
      this.failPhysicalMessageError(
        event as unknown as MessageEvent<unknown>,
      )
      return
    }
    const adapter = this.channels.get(event.data.channel)
    adapter?.emitMessage(
      publicResponse(event.data.channel, event.data.message),
    )
  }

  private readonly handlePhysicalError = (event: ErrorEvent) => {
    event.preventDefault()
    const adapters = this.invalidatePhysicalWorker()
    for (const adapter of adapters) adapter.emitError(event)
  }

  private readonly handlePhysicalMessageError = (
    event: MessageEvent<unknown>,
  ) => {
    this.failPhysicalMessageError(event)
  }

  private failPhysicalMessageError(event: MessageEvent<unknown>) {
    const adapters = this.invalidatePhysicalWorker()
    for (const adapter of adapters) adapter.emitMessageError(event)
  }

  private invalidatePhysicalWorker() {
    const adapters = [...this.channels.values()]
    this.channels.clear()
    for (const adapter of adapters) adapter.invalidate()
    this.terminatePhysicalWorker()
    return adapters
  }
}
