import { isValidCoordinate } from '../../domain/geo'
import type {
  TrafficMarkerIcon,
  Vessel,
  VesselCategory,
  VesselNavigationCategory,
} from '../../domain/traffic'
import {
  finiteInteger,
  finiteNumber,
  isRecord,
  nonEmptyString,
  normalizedDirection,
} from '../guards'
import { DIGITRAFFIC_PROVIDER_NAME } from './digitrafficCapabilities'

const KNOTS_TO_KPH = 1.852

export interface MarineLocationRecord {
  mmsi: number
  latitude: number
  longitude: number
  observedAt: number
  speedKnots?: number
  courseDegrees?: number
  headingDegrees?: number
  navigationStatus?: number
}

export interface MarineMetadataRecord {
  mmsi: number
  timestamp: number
  name?: string
  callSign?: string
  destination?: string
  imo?: number
  shipType?: number
  referencePointA?: number
  referencePointB?: number
  referencePointC?: number
  referencePointD?: number
  draught?: number
  eta?: number
}

const aisText = (value: unknown) => {
  const text = nonEmptyString(value)?.replace(/@+$/g, '').trim()
  return text || undefined
}

const validMmsi = (value: unknown) => {
  const mmsi = finiteInteger(value)
  return mmsi !== undefined && mmsi > 0 ? mmsi : undefined
}

const positiveFiniteNumber = (value: unknown) => {
  const timestamp = finiteNumber(value)
  return timestamp !== undefined && timestamp > 0 ? timestamp : undefined
}

const validTimestamp = (value: unknown) => {
  const timestamp = positiveFiniteNumber(value)
  return timestamp !== undefined &&
    Number.isFinite(new Date(timestamp).getTime())
    ? timestamp
    : undefined
}

const speedKnots = (value: unknown) => {
  const speed = finiteNumber(value)
  return speed !== undefined && speed >= 0 && speed < 102.3
    ? speed
    : undefined
}

const locationRecord = (
  value: unknown,
  fallbackMmsi?: number,
): MarineLocationRecord | undefined => {
  if (!isRecord(value)) return undefined

  const mmsi = validMmsi(value.mmsi) ?? fallbackMmsi
  const latitude = finiteNumber(value.lat)
  const longitude = finiteNumber(value.lon)
  const observedAtSeconds = positiveFiniteNumber(value.time)
  const observedAt =
    observedAtSeconds === undefined
      ? undefined
      : validTimestamp(observedAtSeconds * 1_000)
  if (
    !mmsi ||
    latitude === undefined ||
    longitude === undefined ||
    !observedAt ||
    !isValidCoordinate(latitude, longitude)
  ) {
    return undefined
  }

  return {
    mmsi,
    latitude,
    longitude,
    observedAt,
    speedKnots: speedKnots(value.sog),
    courseDegrees: normalizedDirection(value.cog),
    headingDegrees: normalizedDirection(value.heading),
    navigationStatus: finiteInteger(value.navStat),
  }
}

const metadataRecord = (
  value: unknown,
  fallbackMmsi?: number,
): MarineMetadataRecord | undefined => {
  if (!isRecord(value)) return undefined

  const mmsi = validMmsi(value.mmsi) ?? fallbackMmsi
  const timestamp = validTimestamp(value.timestamp)
  if (!mmsi || !timestamp) return undefined

  return {
    mmsi,
    timestamp,
    name: aisText(value.name),
    callSign: aisText(value.callSign),
    destination: aisText(value.destination),
    imo: finiteInteger(value.imo),
    shipType: finiteInteger(value.shipType ?? value.type),
    referencePointA: finiteNumber(value.referencePointA ?? value.refA),
    referencePointB: finiteNumber(value.referencePointB ?? value.refB),
    referencePointC: finiteNumber(value.referencePointC ?? value.refC),
    referencePointD: finiteNumber(value.referencePointD ?? value.refD),
    draught: finiteNumber(value.draught),
    eta: finiteInteger(value.eta),
  }
}

export const parseDigitrafficRestLocations = (
  payload: unknown,
): MarineLocationRecord[] => {
  if (!isRecord(payload) || !Array.isArray(payload.features)) {
    throw new Error('Digitraffic returned a malformed vessel location response')
  }

  const locations: MarineLocationRecord[] = []
  for (const feature of payload.features) {
    if (!isRecord(feature) || !isRecord(feature.geometry)) continue
    const coordinates = feature.geometry.coordinates
    const properties = feature.properties
    if (
      !Array.isArray(coordinates) ||
      coordinates.length < 2 ||
      !isRecord(properties)
    ) {
      continue
    }

    const mmsi = validMmsi(properties.mmsi ?? feature.mmsi)
    const longitude = finiteNumber(coordinates[0])
    const latitude = finiteNumber(coordinates[1])
    const observedAt = validTimestamp(properties.timestampExternal)
    if (
      !mmsi ||
      longitude === undefined ||
      latitude === undefined ||
      !observedAt ||
      !isValidCoordinate(latitude, longitude)
    ) {
      continue
    }

    locations.push({
      mmsi,
      latitude,
      longitude,
      observedAt,
      speedKnots: speedKnots(properties.sog),
      courseDegrees: normalizedDirection(properties.cog),
      headingDegrees: normalizedDirection(properties.heading),
      navigationStatus: finiteInteger(properties.navStat),
    })
  }

  return locations
}

export const parseDigitrafficRestMetadata = (
  payload: unknown,
): MarineMetadataRecord[] => {
  if (!Array.isArray(payload)) {
    throw new Error('Digitraffic returned a malformed vessel metadata response')
  }

  return payload
    .map((candidate) => metadataRecord(candidate))
    .filter((candidate): candidate is MarineMetadataRecord => Boolean(candidate))
}

export const parseDigitrafficMqttLocation = (
  payload: unknown,
  mmsi: number,
) => locationRecord(payload, mmsi)

export const parseDigitrafficMqttMetadata = (
  payload: unknown,
  mmsi: number,
) => metadataRecord(payload, mmsi)

export const vesselLengthMeters = (
  metadata: MarineMetadataRecord | undefined,
) => {
  if (!metadata) return undefined
  const first = metadata.referencePointA
  const second = metadata.referencePointB
  if (
    first === undefined ||
    second === undefined ||
    first < 0 ||
    second < 0
  ) {
    return undefined
  }

  const length = first + second
  return length > 0 ? length : undefined
}

export const vesselWidthMeters = (
  metadata: MarineMetadataRecord | undefined,
) => {
  if (!metadata) return undefined
  const first = metadata.referencePointC
  const second = metadata.referencePointD
  if (
    first === undefined ||
    second === undefined ||
    first < 0 ||
    second < 0
  ) {
    return undefined
  }

  const width = first + second
  return width > 0 ? width : undefined
}

export const decodeAisEta = (encoded: number | undefined) => {
  if (encoded === undefined || encoded <= 0) return undefined

  const month = (encoded >> 16) & 0x0f
  const day = (encoded >> 11) & 0x1f
  const hour = (encoded >> 6) & 0x1f
  const minute = encoded & 0x3f
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59
  ) {
    return undefined
  }

  const pad = (value: number) => value.toString().padStart(2, '0')
  return `${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)} UTC`
}

const isOneOf = (value: number | undefined, values: readonly number[]) =>
  value !== undefined && values.includes(value)

export const vesselCategory = (
  shipType: number | undefined,
): VesselCategory => {
  if (shipType === 30) return 'fishing'
  if (
    isOneOf(shipType, [31, 32, 50, 51, 52, 53, 54, 55, 58, 59])
  ) {
    return 'tug-service'
  }
  if (shipType !== undefined && (
    (shipType >= 60 && shipType <= 64) ||
    shipType === 69
  )) {
    return 'passenger'
  }
  if (shipType !== undefined && (
    (shipType >= 70 && shipType <= 74) ||
    shipType === 79
  )) {
    return 'cargo'
  }
  if (shipType !== undefined && (
    (shipType >= 80 && shipType <= 84) ||
    shipType === 89
  )) {
    return 'tanker'
  }
  if (shipType !== undefined && (
    (shipType >= 20 && shipType <= 24) ||
    shipType === 29 ||
    (shipType >= 33 && shipType <= 37) ||
    (shipType >= 40 && shipType <= 44) ||
    shipType === 49 ||
    (shipType >= 90 && shipType <= 94) ||
    shipType === 99
  )) {
    return 'other'
  }
  return 'unknown'
}

export const vesselTypeName = (shipType: number | undefined) => {
  if (
    shipType === undefined ||
    vesselCategory(shipType) === 'unknown'
  ) {
    return undefined
  }
  if (
    (shipType >= 20 && shipType <= 24) ||
    shipType === 29
  ) {
    return 'Wing-in-ground craft'
  }
  if (shipType === 30) return 'Fishing vessel'
  if (shipType === 31 || shipType === 32) return 'Towing vessel'
  if (shipType === 33) return 'Dredger'
  if (shipType === 34) return 'Diving vessel'
  if (shipType === 35) return 'Military vessel'
  if (shipType === 36) return 'Sailing vessel'
  if (shipType === 37) return 'Pleasure craft'
  if (
    (shipType >= 40 && shipType <= 44) ||
    shipType === 49
  ) {
    return 'High-speed craft'
  }
  if (shipType === 50) return 'Pilot vessel'
  if (shipType === 51) return 'Search and rescue vessel'
  if (shipType === 52) return 'Tug'
  if (shipType === 53) return 'Port tender'
  if (shipType === 54) return 'Anti-pollution vessel'
  if (shipType === 55) return 'Law enforcement vessel'
  if (shipType === 58) return 'Medical transport'
  if (shipType === 59) return 'Noncombatant vessel'
  if (vesselCategory(shipType) === 'passenger') return 'Passenger vessel'
  if (vesselCategory(shipType) === 'cargo') return 'Cargo vessel'
  if (vesselCategory(shipType) === 'tanker') return 'Tanker'
  return 'Other vessel'
}

export const vesselMarkerIcon = (
  shipType: number | undefined,
): TrafficMarkerIcon => {
  const category = vesselCategory(shipType)
  if (category === 'fishing') return 'vessel-fishing'
  if (shipType === 52) return 'vessel-tug'
  if (category === 'passenger') return 'vessel-passenger'
  if (category === 'cargo') return 'vessel-cargo'
  if (category === 'tanker') return 'vessel-tanker'
  return 'vessel'
}

export const vesselNavigationCategory = (
  status: number | undefined,
): VesselNavigationCategory => {
  if (status === 0 || status === 8) return 'underway'
  if (status === 1) return 'anchored'
  if (status === 2 || status === 3 || status === 4) return 'restricted'
  if (status === 5) return 'moored'
  if (status === 6) return 'aground'
  if (status === 7) return 'fishing'
  if (status === 14) return 'other'
  return 'unknown'
}

export const navigationStatusName = (status: number | undefined) => {
  const names: Record<number, string> = {
    0: 'Under way using engine',
    1: 'At anchor',
    2: 'Not under command',
    3: 'Restricted manoeuvrability',
    4: 'Constrained by draught',
    5: 'Moored',
    6: 'Aground',
    7: 'Engaged in fishing',
    8: 'Under way sailing',
    14: 'AIS search and rescue transmitter',
  }
  return status === undefined ? undefined : names[status]
}

export const normalizeDigitrafficVessel = (
  location: MarineLocationRecord,
  metadata: MarineMetadataRecord | undefined,
  receivedAt: number,
): Vessel => {
  const lengthMeters = vesselLengthMeters(metadata)
  const widthMeters = vesselWidthMeters(metadata)
  const draught =
    metadata?.draught !== undefined &&
    metadata.draught > 0 &&
    metadata.draught < 255
      ? metadata.draught / 10
      : undefined

  return {
    id: `vessel:${location.mmsi}`,
    kind: 'vessel',
    provider: DIGITRAFFIC_PROVIDER_NAME,
    mmsi: location.mmsi,
    position: {
      latitude: location.latitude,
      longitude: location.longitude,
      observedAt: location.observedAt,
    },
    receivedAt,
    headingDegrees: location.headingDegrees,
    courseDegrees: location.courseDegrees,
    speedKph:
      location.speedKnots === undefined
        ? undefined
        : location.speedKnots * KNOTS_TO_KPH,
    name: metadata?.name,
    callSign: metadata?.callSign,
    destination: metadata?.destination,
    imo:
      metadata?.imo !== undefined && metadata.imo > 0
        ? metadata.imo
        : undefined,
    vesselType: vesselTypeName(metadata?.shipType),
    vesselCategory: vesselCategory(metadata?.shipType),
    lengthMeters,
    widthMeters,
    draughtMeters: draught,
    eta: decodeAisEta(metadata?.eta),
    navigationStatus: navigationStatusName(location.navigationStatus),
    navigationCategory:
      vesselNavigationCategory(location.navigationStatus),
    metadataObservedAt: metadata?.timestamp,
    markerIcon: vesselMarkerIcon(metadata?.shipType),
    markerScale: Math.min(
      1.35,
      Math.max(0.78, 0.78 + (lengthMeters ?? 40) / 400),
    ),
  }
}
