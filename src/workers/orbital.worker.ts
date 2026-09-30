/// <reference lib="webworker" />

import {
  modelOrbitalPositions,
  predictOrbitalViewAsync,
  prepareOrbitalCatalog,
  type PreparedOrbitalCatalog,
} from './orbitalPropagation'
import type {
  OrbitalWorkerRequest,
  OrbitalWorkerResponse,
} from './orbitalProtocol'

const scope = self as unknown as DedicatedWorkerGlobalScope
let catalogRevision = 0
let catalog: PreparedOrbitalCatalog | undefined
let pendingPrediction:
  | Extract<OrbitalWorkerRequest, { type: 'prediction' }>
  | undefined
let predictionRunning = false
let predictionGeneration = 0

const post = (message: OrbitalWorkerResponse) => scope.postMessage(message)

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Orbital propagation failed'

const yieldControl = () =>
  new Promise<void>((resolve) => scope.setTimeout(resolve, 0))

const runPredictions = async () => {
  if (predictionRunning) return
  predictionRunning = true
  try {
    while (pendingPrediction && catalog) {
      const request = pendingPrediction
      const activeCatalog = catalog
      const activeRevision = catalogRevision
      const generation = predictionGeneration
      pendingPrediction = undefined
      try {
        post({
          type: 'prediction-started',
          catalogRevision: activeRevision,
          requestId: request.requestId,
        })
        const prediction = await predictOrbitalViewAsync(
          activeCatalog,
          request.modeledFor,
          request.viewport,
          request.selectedId,
          request.filters,
          {
            shouldCancel: () =>
              generation !== predictionGeneration ||
              activeRevision !== catalogRevision ||
              activeCatalog !== catalog,
            yieldControl,
          },
        )
        if (
          prediction &&
          generation === predictionGeneration &&
          activeRevision === catalogRevision &&
          activeCatalog === catalog
        ) {
          post({
            type: 'prediction',
            catalogRevision: activeRevision,
            requestId: request.requestId,
            prediction,
          })
        }
      } catch (error) {
        if (
          generation === predictionGeneration &&
          activeRevision === catalogRevision &&
          activeCatalog === catalog
        ) {
          post({
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
    predictionRunning = false
    if (pendingPrediction && catalog) void runPredictions()
  }
}

scope.onmessage = (event: MessageEvent<OrbitalWorkerRequest>) => {
  const message = event.data
  if (message.type === 'load-catalog') {
    try {
      catalogRevision = message.catalogRevision
      predictionGeneration += 1
      pendingPrediction = undefined
      catalog = prepareOrbitalCatalog(message.snapshot, message.limits)
      post({
        type: 'catalog-loaded',
        catalogRevision,
        acceptedCount: catalog.objects.length,
      })
    } catch (error) {
      post({
        type: 'error',
        catalogRevision: message.catalogRevision,
        operation: message.type,
        message: errorMessage(error),
      })
    }
    return
  }
  if (!catalog || message.catalogRevision !== catalogRevision) return

  if (message.type === 'prediction') {
    predictionGeneration += 1
    pendingPrediction = message
    void runPredictions()
    return
  }

  try {
    if (message.type === 'positions') {
      post({
        type: 'positions',
        catalogRevision,
        requestId: message.requestId,
        positions: modelOrbitalPositions(catalog, message.modeledFor),
      })
      return
    }
  } catch (error) {
    post({
      type: 'error',
      catalogRevision: message.catalogRevision,
      operation: message.type,
      ...('requestId' in message
        ? { requestId: message.requestId }
        : {}),
      message: errorMessage(error),
    })
  }
}
