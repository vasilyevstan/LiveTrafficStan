import type { AppCenter } from '../config/appConfig'
import type { Aircraft } from '../domain/traffic'

export interface TrafficQuery {
  center: AppCenter
  radiusKm: number
}

export interface AircraftDataProvider {
  fetchSnapshot(query: TrafficQuery, signal: AbortSignal): Promise<Aircraft[]>
}

export interface MarineProviderCapabilities {
  id: string
  name: string
  browserAccess: 'direct-keyless' | 'server-required'
  restGeography: 'radius' | 'none'
  streamGeography: 'all-published-vessels' | 'geographic'
  metadata: boolean
  license: {
    name: string
    url: string
    attribution: string
    modificationNotice: string
  }
  coverage: {
    kind: 'regional' | 'unknown'
    label: string
    exactBoundaryKnown: boolean
    exclusions: readonly string[]
    evidenceUrl: string
    reviewedOn: string
  }
}
