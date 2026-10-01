/// <reference lib="webworker" />

import type { OrbitalChannel } from '../domain/orbital'
import {
  modelOrbitalPositions,
  predictOrbitalViewAsync,
  prepareOrbitalCatalog,
  type PreparedOrbitalCatalog,
} from './orbitalPropagation'
import {
  isOrbitalWorkerChannel,
  type OrbitalPhysicalWorkerRequest,
  type OrbitalPhysicalWorkerResponse,
  type OrbitalWorkerRequest,
} from './orbitalProtocol'

interface OrbitalWorkerChannelState {
  catalogRevision: number
  catalog?: PreparedOrbitalCatalog
  pendingPrediction?: Extract<
    OrbitalWorkerRequest,
    { type: 'prediction' }
  >
  predictionRunning: boolean
  generation: number
}

interface OrbitalWorkerOperations {
  prepareCatalog: typeof prepareOrbitalCatalog
  modelPositions: typeof modelOrbitalPositions
  predictView: typeof predictOrbitalViewAsync
  yieldControl: () => Promise<void>
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Orbital propagation failed'

const defaultYieldControl = () =>
  new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0))

const defaultOperations: OrbitalWorkerOperations = {
  prepareCatalog: prepareOrbitalCatalog,
  modelPositions: modelOrbitalPositions,
  predictView: predictOrbitalViewAsync,
  yieldControl: defaultYieldControl,
}

const createChannelState = (): OrbitalWorkerChannelState => ({
  catalogRevision: 0,
  predictionRunning: false,
  generation: 0,
})

export const createOrbitalWorkerDispatcher = (
  post: (message: OrbitalPhysicalWorkerResponse) => void,
  operationOverrides: Partial<OrbitalWorkerOperations> = {},
) => {
  const operations = {
    ...defaultOperations,
    ...operationOverrides,
  }
  const channels = new Map<
    OrbitalChannel,
    OrbitalWorkerChannelState
  >()

  const channelState = (channel: OrbitalChannel) => {
    const existing = channels.get(channel)
    if (existing) return existing
    const state = createChannelState()
    channels.set(channel, state)
    return state
  }

  const send = (
    channel: OrbitalChannel,
    message: OrbitalPhysicalWorkerResponse['message'],
  ) => post({ channel, message })

  const runPredictions = async (
    channel: OrbitalChannel,
    state: OrbitalWorkerChannelState,
  ) => {
    if (state.predictionRunning) return
    state.predictionRunning = true
    try {
      while (
        channels.get(channel) === state &&
        state.pendingPrediction &&
        state.catalog
      ) {
        const request = state.pendingPrediction
        const activeCatalog = state.catalog
        const activeRevision = state.catalogRevision
        const generation = state.generation
        state.pendingPrediction = undefined
        try {
          send(channel, {
            type: 'prediction-started',
            catalogRevision: activeRevision,
            requestId: request.requestId,
          })
          const prediction = await operations.predictView(
            activeCatalog,
            request.modeledFor,
            request.viewport,
            request.selectedId,
            request.filters,
            {
              shouldCancel: () =>
                channels.get(channel) !== state ||
                generation !== state.generation ||
                activeRevision !== state.catalogRevision ||
                activeCatalog !== state.catalog,
              yieldControl: operations.yieldControl,
            },
          )
          if (
            prediction &&
            channels.get(channel) === state &&
            generation === state.generation &&
            activeRevision === state.catalogRevision &&
            activeCatalog === state.catalog
          ) {
            send(channel, {
              type: 'prediction',
              catalogRevision: activeRevision,
              requestId: request.requestId,
              prediction,
            })
          }
        } catch (error) {
          if (
            channels.get(channel) === state &&
            generation === state.generation &&
            activeRevision === state.catalogRevision &&
            activeCatalog === state.catalog
          ) {
            send(channel, {
              type: 'error',
              catalogRevision: activeRevision,
              operation: 'prediction',
              requestId: request.requestId,
              message: errorMessage(error),
            })
          }
        }
      }
    } finally {
      state.predictionRunning = false
      if (
        channels.get(channel) === state &&
        state.pendingPrediction &&
        state.catalog
      ) {
        void runPredictions(channel, state)
      }
    }
  }

  const handleMessage = ({
    channel,
    message,
  }: OrbitalPhysicalWorkerRequest) => {
    if (message.type === 'dispose-channel') {
      const state = channels.get(channel)
      if (!state) return
      state.generation += 1
      state.pendingPrediction = undefined
      state.catalog = undefined
      channels.delete(channel)
      return
    }

    const state = channelState(channel)
    if (message.type === 'load-catalog') {
      state.catalogRevision = message.catalogRevision
      state.generation += 1
      state.pendingPrediction = undefined
      state.catalog = undefined
      try {
        state.catalog = operations.prepareCatalog(
          message.snapshot,
          message.limits,
        )
        send(channel, {
          type: 'catalog-loaded',
          catalogRevision: state.catalogRevision,
          acceptedCount: state.catalog.objects.length,
        })
      } catch (error) {
        send(channel, {
          type: 'error',
          catalogRevision: message.catalogRevision,
          operation: message.type,
          message: errorMessage(error),
        })
      }
      return
    }
    if (
      !state.catalog ||
      message.catalogRevision !== state.catalogRevision
    ) {
      return
    }

    if (message.type === 'prediction') {
      state.generation += 1
      state.pendingPrediction = message
      void runPredictions(channel, state)
      return
    }

    try {
      send(channel, {
        type: 'positions',
        catalogRevision: state.catalogRevision,
        requestId: message.requestId,
        positions: operations.modelPositions(
          state.catalog,
          message.modeledFor,
        ),
      })
    } catch (error) {
      send(channel, {
        type: 'error',
        catalogRevision: message.catalogRevision,
        operation: message.type,
        requestId: message.requestId,
        message: errorMessage(error),
      })
    }
  }

  return { handleMessage }
}

const isPhysicalRequest = (
  value: unknown,
): value is OrbitalPhysicalWorkerRequest => {
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
    (messageType === 'load-catalog' ||
      messageType === 'positions' ||
      messageType === 'prediction' ||
      messageType === 'dispose-channel')
  )
}

if (typeof self !== 'undefined') {
  const scope = self as unknown as DedicatedWorkerGlobalScope
  const dispatcher = createOrbitalWorkerDispatcher((message) =>
    scope.postMessage(message),
  )
  scope.onmessage = (event: MessageEvent<unknown>) => {
    if (!isPhysicalRequest(event.data)) {
      throw new Error('Invalid orbital worker channel envelope')
    }
    dispatcher.handleMessage(event.data)
  }
}
