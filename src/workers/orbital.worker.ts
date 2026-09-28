/// <reference lib="webworker" />

import {
  modelOrbitalPositions,
  predictOrbitalView,
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

const post = (message: OrbitalWorkerResponse) => scope.postMessage(message)

scope.onmessage = (event: MessageEvent<OrbitalWorkerRequest>) => {
  const message = event.data
  try {
    if (message.type === 'load-catalog') {
      catalogRevision = message.catalogRevision
      catalog = prepareOrbitalCatalog(message.snapshot, message.limits)
      post({
        type: 'catalog-loaded',
        catalogRevision,
        acceptedCount: catalog.objects.length,
      })
      return
    }
    if (!catalog || message.catalogRevision !== catalogRevision) return

    if (message.type === 'positions') {
      post({
        type: 'positions',
        catalogRevision,
        requestId: message.requestId,
        positions: modelOrbitalPositions(catalog, message.modeledFor),
      })
      return
    }

    post({
      type: 'prediction',
      catalogRevision,
      requestId: message.requestId,
      prediction: predictOrbitalView(
        catalog,
        message.modeledFor,
        message.viewport,
        message.selectedId,
      ),
    })
  } catch (error) {
    post({
      type: 'error',
      catalogRevision: message.catalogRevision,
      operation: message.type,
      ...('requestId' in message
        ? { requestId: message.requestId }
        : {}),
      message:
        error instanceof Error
          ? error.message
          : 'Orbital propagation failed',
    })
  }
}
