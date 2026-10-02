import type {
  OrbitalChannel,
  ModeledOrbitalPosition,
  OrbitalCatalogSnapshot,
  OrbitalPrediction,
} from '../domain/orbital'
import type { OrbitalDiscoveryFilters } from '../domain/orbitalDiscovery'
import type { OrbitalViewport } from '../domain/orbitalViewport'

export interface OrbitalPropagationLimits {
  maximumElementAgeMs: number
  maximumFutureElementMs: number
  maximumAltitudeKm: number
  predictionHorizonMs: number
  predictionStepMs: number
  maximumDetailedResults: number
  trackDurationMs: number
  maximumTrackPoints: number
  predictionChunkSize: number
}

export type OrbitalWorkerRequest =
  | {
      type: 'load-catalog'
      catalogRevision: number
      snapshot: OrbitalCatalogSnapshot
      limits: OrbitalPropagationLimits
    }
  | {
      type: 'positions'
      catalogRevision: number
      requestId: number
      modeledFor: number
    }
  | {
      type: 'prediction'
      catalogRevision: number
      requestId: number
      modeledFor: number
      viewport: OrbitalViewport
      selectedId: string | null
      filters: OrbitalDiscoveryFilters
    }

export type OrbitalWorkerResponse =
  | {
      type: 'catalog-loaded'
      catalogRevision: number
      acceptedCount: number
    }
  | {
      type: 'positions'
      catalogRevision: number
      requestId: number
      positions: readonly ModeledOrbitalPosition[]
    }
  | {
      type: 'prediction-started'
      catalogRevision: number
      requestId: number
    }
  | {
      type: 'prediction'
      catalogRevision: number
      requestId: number
      prediction: OrbitalPrediction
    }
  | {
      type: 'error'
      catalogRevision: number
      operation: OrbitalWorkerRequest['type']
      requestId?: number
      message: string
    }

export type OrbitalWorkerControlRequest = {
  type: 'dispose-channel'
}

export interface OrbitalWorkerEnvelope<T> {
  channel: OrbitalChannel
  message: T
}

export type OrbitalPhysicalWorkerRequest = OrbitalWorkerEnvelope<
  OrbitalWorkerRequest | OrbitalWorkerControlRequest
>

export type OrbitalPhysicalWorkerResponse =
  OrbitalWorkerEnvelope<OrbitalWorkerResponse>

export const isOrbitalWorkerChannel = (
  value: unknown,
): value is OrbitalChannel =>
  value === 'curated' || value === 'starlink'

export interface OrbitalWorkerLike {
  postMessage(message: OrbitalWorkerRequest): void
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<OrbitalWorkerResponse>) => void,
  ): void
  removeEventListener(
    type: 'message',
    listener: (event: MessageEvent<OrbitalWorkerResponse>) => void,
  ): void
  addEventListener(
    type: 'error',
    listener: (event: ErrorEvent) => void,
  ): void
  removeEventListener(
    type: 'error',
    listener: (event: ErrorEvent) => void,
  ): void
  addEventListener(
    type: 'messageerror',
    listener: (event: MessageEvent<unknown>) => void,
  ): void
  removeEventListener(
    type: 'messageerror',
    listener: (event: MessageEvent<unknown>) => void,
  ): void
  terminate(): void
}

export interface OrbitalPhysicalWorkerLike {
  postMessage(message: OrbitalPhysicalWorkerRequest): void
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<OrbitalPhysicalWorkerResponse>) => void,
  ): void
  removeEventListener(
    type: 'message',
    listener: (event: MessageEvent<OrbitalPhysicalWorkerResponse>) => void,
  ): void
  addEventListener(
    type: 'error',
    listener: (event: ErrorEvent) => void,
  ): void
  removeEventListener(
    type: 'error',
    listener: (event: ErrorEvent) => void,
  ): void
  addEventListener(
    type: 'messageerror',
    listener: (event: MessageEvent<unknown>) => void,
  ): void
  removeEventListener(
    type: 'messageerror',
    listener: (event: MessageEvent<unknown>) => void,
  ): void
  terminate(): void
}
