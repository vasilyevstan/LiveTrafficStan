import { DISCOVERY_CONFIG } from '../config/discoveryConfig.js'

export type DiscoveryClass = 'aircraft' | 'ships'
export type AircraftLookupMethod = 'hex' | 'reg' | 'callsign'
export type ShipLookupMethod = 'name' | 'mmsi' | 'position'
export const SHIP_POSITION_SOURCE = 'open-waters-track'
export type LookupRequest =
  | { objectClass: 'aircraft'; by: AircraftLookupMethod; query: string }
  | { objectClass: 'ships'; by: ShipLookupMethod; query: string }

export interface DiscoveryMatch {
  objectClass: DiscoveryClass
  key: string
  name?: string
  identifiers: {
    icao24?: string
    registration?: string
    callsign?: string
    mmsi?: string
    imo?: string
  }
  source: {
    name: 'ADSB.lol' | 'Open Waters AIS' | 'Digitraffic'
    code: string
    credit: string
  }
  metadataReportedAt: number | null
  location: {
    latitude: number
    longitude: number
    reportedAt: number
  } | null
}

export interface DiscoveryResponse {
  objectClass: DiscoveryClass
  retrievedAt: number
  matches: readonly DiscoveryMatch[]
  truncated: boolean
  rejectedRecords: number
}

export interface CachedMarineDiscovery {
  loaded: boolean
  result: DiscoveryResponse
}

export const qualifiedLastReport = (match: DiscoveryMatch, result: DiscoveryResponse, now: number) => {
  const location = match.location
  const ship = match.objectClass === 'ships'
  if (!location || match.objectClass !== result.objectClass ||
    ship && (match.source.name !== 'Open Waters AIS' || match.source.code !== SHIP_POSITION_SOURCE ||
      match.metadataReportedAt !== null) ||
    result.retrievedAt > now + DISCOVERY_CONFIG.futureToleranceMs ||
    now - result.retrievedAt > (ship ? DISCOVERY_CONFIG.maximumShipSnapshotAgeMs : DISCOVERY_CONFIG.maximumAircraftSnapshotAgeMs) ||
    location.reportedAt > now + DISCOVERY_CONFIG.futureToleranceMs ||
    now - location.reportedAt > (ship ? DISCOVERY_CONFIG.shipPositionWindowMs : DISCOVERY_CONFIG.maximumAircraftPositionAgeMs)) return null
  return location
}
