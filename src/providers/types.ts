import type { AppCenter } from '../domain/geo.js'
import type { Aircraft } from '../domain/traffic.js'

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
  browserAccess: 'direct-keyless' | 'server-required' | 'mixed'
  restGeography: 'radius' | 'none' | 'mixed'
  streamGeography: 'all-published-vessels' | 'geographic' | 'mixed'
  metadata: boolean
  discoveryNote?: string
  license: {
    name: string
    url: string
    attribution: string
    modificationNotice: string
  }
  coverage: {
    kind: 'regional' | 'global-best-effort' | 'unknown'
    label: string
    exactBoundaryKnown: boolean
    exclusions: readonly string[]
    evidenceUrl: string
    reviewedOn: string
  }
}
