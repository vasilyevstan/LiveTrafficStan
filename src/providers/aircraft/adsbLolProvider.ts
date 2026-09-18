import { distanceKm, isValidCoordinate } from '../../domain/geo'
import type { Aircraft } from '../../domain/traffic'
import { ProviderError, responseError } from '../errors'
import {
  finiteNumber,
  isRecord,
  nonEmptyString,
  normalizedDirection,
} from '../guards'
import type { AircraftDataProvider, TrafficQuery } from '../types'

const KNOTS_TO_KPH = 1.852
const FEET_TO_METERS = 0.3048
const FEET_PER_MINUTE_TO_METERS_PER_SECOND = 0.00508

const aircraftCategory = (category: string | undefined) => {
  switch (category) {
    case 'A1':
      return { label: 'Light aircraft', scale: 0.78, icon: 'aircraft' as const }
    case 'A2':
      return { label: 'Small aircraft', scale: 0.9, icon: 'aircraft' as const }
    case 'A3':
    case 'A4':
      return { label: 'Large aircraft', scale: 1.08, icon: 'aircraft' as const }
    case 'A5':
      return { label: 'Heavy aircraft', scale: 1.22, icon: 'aircraft' as const }
    case 'A6':
      return {
        label: 'High-performance aircraft',
        scale: 1,
        icon: 'aircraft' as const,
      }
    case 'A7':
      return { label: 'Rotorcraft', scale: 0.92, icon: 'helicopter' as const }
    default:
      return { label: undefined, scale: 0.94, icon: 'aircraft' as const }
  }
}

const altitudeMeters = (value: unknown) => {
  if (value === 'ground') return 0
  const feet = finiteNumber(value)
  return feet === undefined ? undefined : feet * FEET_TO_METERS
}

const positiveNumber = (value: unknown) => {
  const number = finiteNumber(value)
  return number !== undefined && number >= 0 ? number : undefined
}

export const normalizeAdsbLolResponse = (
  payload: unknown,
  query: TrafficQuery,
  receivedAt: number,
): Aircraft[] => {
  if (!isRecord(payload) || !Array.isArray(payload.ac)) {
    throw new ProviderError('ADSB.lol returned a malformed aircraft response')
  }

  const responseTime = finiteNumber(payload.now) ?? receivedAt
  const aircraft: Aircraft[] = []

  for (const candidate of payload.ac) {
    if (!isRecord(candidate)) continue

    const hex = nonEmptyString(candidate.hex)
    const latitude = finiteNumber(candidate.lat)
    const longitude = finiteNumber(candidate.lon)
    if (
      !hex ||
      latitude === undefined ||
      longitude === undefined ||
      !isValidCoordinate(latitude, longitude)
    ) {
      continue
    }

    const position = { latitude, longitude }
    if (distanceKm(query.center, position) > query.radiusKm) continue

    const seenSeconds =
      positiveNumber(candidate.seen_pos) ?? positiveNumber(candidate.seen) ?? 0
    const observedAt = Math.min(
      receivedAt,
      responseTime - seenSeconds * 1_000,
    )
    const categoryCode = nonEmptyString(candidate.category)
    const visual = aircraftCategory(categoryCode)
    const groundSpeedKnots = positiveNumber(candidate.gs)
    const verticalRateFeetPerMinute =
      finiteNumber(candidate.baro_rate) ?? finiteNumber(candidate.geom_rate)
    const track = normalizedDirection(candidate.track)
    const heading =
      normalizedDirection(candidate.true_heading) ??
      normalizedDirection(candidate.mag_heading) ??
      normalizedDirection(candidate.nav_heading) ??
      track

    aircraft.push({
      id: `aircraft:${hex.toLowerCase()}`,
      kind: 'aircraft',
      provider: 'ADSB.lol',
      hex: hex.toUpperCase(),
      position: {
        latitude,
        longitude,
        observedAt,
      },
      receivedAt,
      headingDegrees: heading,
      courseDegrees: track,
      speedKph:
        groundSpeedKnots === undefined
          ? undefined
          : groundSpeedKnots * KNOTS_TO_KPH,
      altitudeMeters: altitudeMeters(candidate.alt_baro),
      verticalSpeedMps:
        verticalRateFeetPerMinute === undefined
          ? undefined
          : verticalRateFeetPerMinute *
            FEET_PER_MINUTE_TO_METERS_PER_SECOND,
      callsign: nonEmptyString(candidate.flight),
      registration: nonEmptyString(candidate.r),
      aircraftType: nonEmptyString(candidate.t),
      category: visual.label,
      squawk: nonEmptyString(candidate.squawk),
      markerIcon: visual.icon,
      markerScale: visual.scale,
    })
  }

  return aircraft
}

export class AdsbLolAircraftProvider implements AircraftDataProvider {
  private readonly endpointBaseUrl: string

  constructor(endpointBaseUrl: string) {
    this.endpointBaseUrl = endpointBaseUrl
  }

  async fetchSnapshot(query: TrafficQuery, signal: AbortSignal) {
    const radiusNauticalMiles = Math.max(1, Math.ceil(query.radiusKm / 1.852))
    const url =
      `${this.endpointBaseUrl}/v2/point/` +
      `${query.center.latitude}/${query.center.longitude}/${radiusNauticalMiles}`
    const response = await fetch(url, {
      signal,
      headers: {
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      throw await responseError('ADSB.lol', response)
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new ProviderError('ADSB.lol returned invalid JSON')
    }

    return normalizeAdsbLolResponse(payload, query, Date.now())
  }
}
