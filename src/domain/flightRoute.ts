import type { Aircraft } from './traffic'
import { isValidCoordinate } from './geo'

export interface FlightRouteIdentity {
  callsign: string
  icao24: string
  registration?: string
  latitude: number
  longitude: number
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
  confidence: 'plausible'
  departure: FlightRouteAirport
  arrival: FlightRouteAirport
  providerUpdatedAt?: number
  source: FlightRouteSource
}

export type FlightRouteUnavailableReason =
  | 'invalid-identity'
  | 'not-found'
  | 'implausible'
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
const ICAO_FLIGHT = /^([A-Z]{3})([A-Z0-9]{1,5})$/
const ROUTE_NUMBER =
  /^(?:\d{1,4}|\d{1,3}[A-Z]|\d{1,2}[A-Z]{2})$/

const normalizeOptional = (value: string | undefined) => {
  const normalized = value?.trim().toUpperCase()
  return normalized || undefined
}

export const normalizeFlightRouteCallsign = (
  value: string | undefined,
) => {
  const match = value?.trim().toUpperCase().match(ICAO_FLIGHT)
  if (!match) return undefined

  const [, airlineCode, rawNumber] = match
  if (!airlineCode || !rawNumber || !/^\d/.test(rawNumber)) {
    return undefined
  }

  let number = rawNumber
  while (number.startsWith('0') && number.length > 1) {
    number = number.slice(1)
  }
  if (/^[A-Z]+$/.test(number)) number = `0${number}`
  if (!ROUTE_NUMBER.test(number)) return undefined
  return `${airlineCode}${number}`
}

export const flightRouteIdentity = (
  aircraft: Pick<Aircraft, 'hex' | 'callsign' | 'registration'> & {
    position: Pick<Aircraft['position'], 'latitude' | 'longitude'>
  },
): FlightRouteIdentity | undefined => {
  const icao24 = aircraft.hex.trim().toUpperCase()
  const callsign = normalizeFlightRouteCallsign(aircraft.callsign)
  const { latitude, longitude } = aircraft.position
  if (
    !ICAO24.test(icao24) ||
    !callsign ||
    !isValidCoordinate(latitude, longitude)
  ) {
    return undefined
  }

  return {
    callsign,
    icao24,
    registration: normalizeOptional(aircraft.registration),
    latitude,
    longitude,
  }
}

export const flightRouteIdentityKey = (identity: FlightRouteIdentity) =>
  [
    identity.callsign,
    identity.icao24,
    identity.registration ?? '',
  ].join('|')
