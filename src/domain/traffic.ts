export type TrafficKind = 'aircraft' | 'vessel'
export type TrafficFreshness = 'live' | 'stale'

export interface GeoPosition {
  latitude: number
  longitude: number
  observedAt: number
}

interface TrafficEntityBase {
  id: string
  kind: TrafficKind
  provider: string
  position: GeoPosition
  receivedAt: number
  headingDegrees?: number
  courseDegrees?: number
  speedKph?: number
  markerIcon: 'aircraft' | 'helicopter' | 'vessel'
  markerScale: number
}

export interface Aircraft extends TrafficEntityBase {
  kind: 'aircraft'
  hex: string
  callsign?: string
  registration?: string
  aircraftType?: string
  category?: string
  altitudeMeters?: number
  verticalSpeedMps?: number
  squawk?: string
}

export interface Vessel extends TrafficEntityBase {
  kind: 'vessel'
  mmsi: number
  name?: string
  vesselType?: string
  imo?: number
  callSign?: string
  lengthMeters?: number
  widthMeters?: number
  draughtMeters?: number
  destination?: string
  eta?: string
  navigationStatus?: string
}

export type TrafficEntity = Aircraft | Vessel

export type DisplayTrafficEntity<T extends TrafficEntity = TrafficEntity> = T & {
  freshness: TrafficFreshness
}

export type DisplayAircraft = DisplayTrafficEntity<Aircraft>
export type DisplayVessel = DisplayTrafficEntity<Vessel>

export interface TrailPoint extends GeoPosition {}

export type ProviderPhase = 'idle' | 'loading' | 'live' | 'error'

export interface ProviderStatus {
  phase: ProviderPhase
  paused: boolean
  updating?: boolean
  lastSuccessAt?: number
  lastDataAt?: number
  error?: string
}

export interface TrafficProviderResult<T extends TrafficEntity> {
  entities: T[]
  status: ProviderStatus
}
