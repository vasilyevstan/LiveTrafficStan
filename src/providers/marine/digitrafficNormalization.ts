import { isValidCoordinate } from '../../domain/geo'
import type { TrafficMarkerIcon, Vessel } from '../../domain/traffic'
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

const validObservedAt = (value: unknown) => {
  const timestamp = finiteNumber(value)
  return timestamp !== undefined && timestamp > 0 ? timestamp : undefined
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
  const observedAtSeconds = validObservedAt(value.time)
  if (
    !mmsi ||
    latitude === undefined ||
    longitude === undefined ||
    !observedAtSeconds ||
    !isValidCoordinate(latitude, longitude)
  ) {
    return undefined
  }

  return {
    mmsi,
    latitude,
    longitude,
    observedAt: observedAtSeconds * 1_000,
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
  const timestamp = validObservedAt(value.timestamp)
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
    const observedAt = validObservedAt(properties.timestampExternal)
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

export const vesselTypeName = (shipType: number | undefined) => {
  if (shipType === undefined || shipType === 0) return undefined
  if (shipType >= 20 && shipType <= 29) return 'Wing-in-ground craft'
  if (shipType === 30) return 'Fishing vessel'
  if (shipType === 31 || shipType === 32) return 'Towing vessel'
  if (shipType === 33) return 'Dredger'
  if (shipType === 34) return 'Diving vessel'
  if (shipType === 35) return 'Military vessel'
  if (shipType === 36) return 'Sailing vessel'
  if (shipType === 37) return 'Pleasure craft'
  if (shipType >= 40 && shipType <= 49) return 'High-speed craft'
  if (shipType === 50) return 'Pilot vessel'
  if (shipType === 51) return 'Search and rescue vessel'
  if (shipType === 52) return 'Tug'
  if (shipType === 53) return 'Port tender'
  if (shipType === 54) return 'Anti-pollution vessel'
  if (shipType === 55) return 'Law enforcement vessel'
  if (shipType === 58) return 'Medical transport'
  if (shipType >= 60 && shipType <= 69) return 'Passenger vessel'
  if (shipType >= 70 && shipType <= 79) return 'Cargo vessel'
  if (shipType >= 80 && shipType <= 89) return 'Tanker'
  return 'Other vessel'
}

export const vesselMarkerIcon = (
  shipType: number | undefined,
): TrafficMarkerIcon => {
  if (shipType === 30) return 'vessel-fishing'
  if (shipType === 52) return 'vessel-tug'
  if (shipType !== undefined && shipType >= 60 && shipType <= 69) {
    return 'vessel-passenger'
  }
  if (shipType !== undefined && shipType >= 70 && shipType <= 79) {
    return 'vessel-cargo'
  }
  if (shipType !== undefined && shipType >= 80 && shipType <= 89) {
    return 'vessel-tanker'
  }
  return 'vessel'
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
    15: 'Undefined',
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
    lengthMeters,
    widthMeters,
    draughtMeters: draught,
    eta: decodeAisEta(metadata?.eta),
    navigationStatus: navigationStatusName(location.navigationStatus),
    markerIcon: vesselMarkerIcon(metadata?.shipType),
    markerScale: Math.min(
      1.35,
      Math.max(0.78, 0.78 + (lengthMeters ?? 40) / 400),
    ),
  }
}
