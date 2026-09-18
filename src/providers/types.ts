import type { AppCenter } from '../config/appConfig'
import type { Aircraft } from '../domain/traffic'

export interface TrafficQuery {
  center: AppCenter
  radiusKm: number
}

export interface AircraftDataProvider {
  fetchSnapshot(query: TrafficQuery, signal: AbortSignal): Promise<Aircraft[]>
}
