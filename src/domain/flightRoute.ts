import type { Aircraft } from './traffic'

export interface FlightRouteIdentity {
  callsign: string
  icao24: string
  registration?: string
}

export interface FlightRouteAirport {
  name: string
  code?: string
}

export interface FlightRouteSource {
  name: string
  websiteUrl: string
}

export interface FlightRouteRecord {
  flightIcao: string
  flightIata?: string
  flightStatus: 'active'
  departure: FlightRouteAirport
  arrival: FlightRouteAirport
  providerUpdatedAt?: number
  source: FlightRouteSource
}

export type FlightRouteUnavailableReason =
  | 'invalid-identity'
  | 'not-found'
  | 'ambiguous'
  | 'incomplete'

export type FlightRouteErrorReason =
  | 'quota-exhausted'
  | 'provider-error'
  | 'configuration'

export type FlightRouteLookupResult =
  | { kind: 'available'; route: FlightRouteRecord }
  | {
      kind: 'unavailable'
      reason: Exclude<FlightRouteUnavailableReason, 'invalid-identity'>
    }

export type FlightRouteViewState =
  | { phase: 'idle'; identityKey?: string }
  | { phase: 'loading'; identityKey: string }
  | {
      phase: 'available'
      identityKey: string
      route: FlightRouteRecord
    }
  | {
      phase: 'unavailable'
      identityKey?: string
      reason: FlightRouteUnavailableReason
    }
  | {
      phase: 'error'
      identityKey: string
      reason: FlightRouteErrorReason
    }

const ICAO24 = /^[0-9A-F]{6}$/
const ICAO_FLIGHT = /^[A-Z]{3}[A-Z0-9]{1,5}$/

const normalizeOptional = (value: string | undefined) => {
  const normalized = value?.trim().toUpperCase()
  return normalized || undefined
}

export const flightRouteIdentity = (
  aircraft: Pick<Aircraft, 'hex' | 'callsign' | 'registration'>,
): FlightRouteIdentity | undefined => {
  const icao24 = aircraft.hex.trim().toUpperCase()
  const callsign = aircraft.callsign?.trim().toUpperCase()
  if (
    !ICAO24.test(icao24) ||
    !callsign ||
    !ICAO_FLIGHT.test(callsign) ||
    !/\d/.test(callsign.slice(3))
  ) {
    return undefined
  }

  return {
    callsign,
    icao24,
    registration: normalizeOptional(aircraft.registration),
  }
}

export const flightRouteIdentityKey = (identity: FlightRouteIdentity) =>
  [
    identity.callsign,
    identity.icao24,
    identity.registration ?? '',
  ].join('|')
