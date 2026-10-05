import { MARINE_STREAM_CONFIG } from '../../config/marineStreamConfig.js'
import { isValidCoordinate } from '../../domain/geo.js'
import {
  VESSEL_MARKER_ICONS,
  type ProviderStatus,
  type Vessel,
  type VesselCategory,
  type VesselNavigationCategory,
} from '../../domain/traffic.js'
import { finiteNumber, isRecord } from '../guards.js'
import type { TrafficQuery } from '../types.js'
import {
  AISSTREAM_PROVIDER_NAME,
  OPENWATERS_PROVIDER_NAME,
  parseMarineMmsi,
  type MarineStreamSource,
} from './marineSourceNormalization.js'

export type MarineBoundingBox =
  readonly [south: number, west: number, north: number, east: number]

export interface MarineStreamView {
  version: 1
  type: 'view'
  revision: number
  center: { latitude: number; longitude: number }
  radiusKm: number
}

export interface MarineStreamStatus extends ProviderStatus {
  source: MarineStreamSource
}

export interface MarineStreamSnapshot {
  version: 1
  type: 'snapshot'
  revision: number
  sequence: number
  vessels: Vessel[]
  sources: MarineStreamStatus[]
}

export interface MarineStreamRetry {
  version: 1
  type: 'retry'
  retryAt: number
  error: string
}

const validRevision = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0

export const marineQueryBoxes = (
  query: Pick<TrafficQuery, 'center' | 'radiusKm'>,
): MarineBoundingBox[] | undefined => {
  const { latitude, longitude } = query.center
  if (
    !isValidCoordinate(latitude, longitude) ||
    !Number.isFinite(query.radiusKm) || query.radiusKm <= 0 ||
    query.radiusKm > MARINE_STREAM_CONFIG.maximumRadiusKm
  ) {
    return undefined
  }
  const radians = Math.PI / 180
  const angularRadius = query.radiusKm / 6_371
  const latitudeDelta = angularRadius / radians
  if (latitude + latitudeDelta >= 90 || latitude - latitudeDelta <= -90) {
    return undefined
  }
  const longitudeDelta =
    Math.asin(Math.sin(angularRadius) / Math.cos(latitude * radians)) / radians
  if (!Number.isFinite(longitudeDelta)) return undefined
  const factor = 10 ** MARINE_STREAM_CONFIG.coordinatePrecision
  const lower = (value: number) => Math.floor(value * factor) / factor
  const upper = (value: number) => Math.ceil(value * factor) / factor
  const south = lower(latitude - latitudeDelta)
  const north = upper(latitude + latitudeDelta)
  const west = lower(longitude - longitudeDelta)
  const east = upper(longitude + longitudeDelta)
  if (west < -180) {
    return [
      [south, Math.round((west + 360) * factor) / factor, north, 180],
      [south, -180, north, east],
    ]
  }
  if (east > 180) {
    return [
      [south, west, north, 180],
      [south, -180, north, Math.round((east - 360) * factor) / factor],
    ]
  }
  return [[south, west, north, east]]
}

export const compactMarineBoxes = (
  boxes: readonly MarineBoundingBox[],
): MarineBoundingBox[] => {
  const result: MarineBoundingBox[] = []
  const contains = (outer: MarineBoundingBox, inner: MarineBoundingBox) =>
    outer[0] <= inner[0] && outer[1] <= inner[1] &&
    outer[2] >= inner[2] && outer[3] >= inner[3]
  for (const box of boxes) {
    if (result.some((existing) => contains(existing, box))) continue
    for (let index = result.length - 1; index >= 0; index -= 1) {
      if (contains(box, result[index])) result.splice(index, 1)
    }
    result.push(box)
  }
  return result
}

export const marineBoxArea = (boxes: readonly MarineBoundingBox[]) =>
  boxes.reduce((sum, box) => sum + (box[2] - box[0]) * (box[3] - box[1]), 0)

export const parseMarineStreamView = (
  value: unknown,
): MarineStreamView | undefined => {
  if (
    !isRecord(value) || value.version !== 1 || value.type !== 'view' ||
    !validRevision(value.revision) || !isRecord(value.center)
  ) {
    return undefined
  }
  const latitude = finiteNumber(value.center.latitude)
  const longitude = finiteNumber(value.center.longitude)
  const radiusKm = finiteNumber(value.radiusKm)
  const factor = 10 ** MARINE_STREAM_CONFIG.coordinatePrecision
  if (
    latitude === undefined || longitude === undefined || radiusKm === undefined ||
    Math.round(latitude * factor) / factor !== latitude ||
    Math.round(longitude * factor) / factor !== longitude
  ) {
    return undefined
  }
  const view: MarineStreamView = {
    version: 1, type: 'view', revision: value.revision,
    center: { latitude, longitude }, radiusKm,
  }
  if (!marineQueryBoxes({
    center: { ...view.center, label: 'View' },
    radiusKm,
  })) return undefined
  return view
}

const categories: readonly VesselCategory[] = [
  'cargo', 'tanker', 'passenger', 'fishing', 'tug-service', 'other', 'unknown',
]
const navigationCategories: readonly VesselNavigationCategory[] = [
  'underway', 'anchored', 'moored', 'restricted', 'aground',
  'fishing', 'other', 'unknown',
]
const optionalString = (value: unknown, maximum = 64) =>
  value === undefined ||
  (typeof value === 'string' && value.length <= maximum &&
    !/\p{Cc}/u.test(value))
const optionalNumber = (value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) =>
  value === undefined ||
  (typeof value === 'number' && Number.isFinite(value) &&
    value >= minimum && value <= maximum)

const isStreamVessel = (value: unknown): value is Vessel => {
  if (
    !isRecord(value) || value.kind !== 'vessel' ||
    (value.provider !== AISSTREAM_PROVIDER_NAME &&
      value.provider !== OPENWATERS_PROVIDER_NAME) ||
    typeof value.mmsi !== 'number' ||
    parseMarineMmsi(value.mmsi) !== value.mmsi ||
    value.id !== `vessel:${value.mmsi}` ||
    !isRecord(value.position) ||
    typeof value.position.latitude !== 'number' ||
    typeof value.position.longitude !== 'number' ||
    !isValidCoordinate(value.position.latitude, value.position.longitude) ||
    typeof value.position.observedAt !== 'number' ||
    !optionalNumber(value.position.observedAt, 1) ||
    typeof value.receivedAt !== 'number' ||
    !optionalNumber(value.receivedAt, 1) ||
    !categories.some((category) => category === value.vesselCategory) ||
    !navigationCategories.some((category) => category === value.navigationCategory) ||
    !VESSEL_MARKER_ICONS.some((icon) => icon === value.markerIcon) ||
    typeof value.markerScale !== 'number' ||
    !optionalNumber(value.markerScale, 0.8, 1.6) ||
    typeof value.attribution !== 'string' ||
    !value.attribution || !optionalString(value.attribution, 4_096)
  ) {
    return false
  }
  return (
    optionalString(value.name) && optionalString(value.callSign, 16) &&
    optionalString(value.vesselType) && optionalString(value.destination) &&
    optionalString(value.eta, 32) && optionalString(value.navigationStatus) &&
    optionalNumber(value.imo, 1, 9_999_999) &&
    optionalNumber(value.headingDegrees, 0, 359) &&
    optionalNumber(value.courseDegrees, 0, 359.999999999) &&
    optionalNumber(value.speedKph, 0, 190) &&
    optionalNumber(value.lengthMeters, 0, 1_022) &&
    optionalNumber(value.widthMeters, 0, 126) &&
    optionalNumber(value.draughtMeters, 0, 25.4) &&
    optionalNumber(value.metadataObservedAt, 1)
  )
}

const isStreamStatus = (value: unknown): value is MarineStreamStatus => {
  if (
    !isRecord(value) ||
    (value.source !== 'aisstream' && value.source !== 'openwaters') ||
    typeof value.phase !== 'string' ||
    !['idle', 'loading', 'live', 'error'].includes(value.phase) ||
    typeof value.paused !== 'boolean'
  ) {
    return false
  }
  return optionalString(value.error, 512) &&
    optionalNumber(value.lastSuccessAt, 1) &&
    optionalNumber(value.lastDataAt, 1) &&
    (value.updating === undefined || typeof value.updating === 'boolean')
}

export const parseMarineStreamSnapshot = (
  value: unknown,
): MarineStreamSnapshot | undefined => {
  if (
    !isRecord(value) || value.version !== 1 || value.type !== 'snapshot' ||
    !validRevision(value.revision) || !validRevision(value.sequence) ||
    !Array.isArray(value.vessels) ||
    value.vessels.length > MARINE_STREAM_CONFIG.maximumRecords ||
    !value.vessels.every(isStreamVessel) || !Array.isArray(value.sources) ||
    value.sources.length !== 2 || !value.sources.every(isStreamStatus) ||
    new Set(value.sources.map((source) => source.source)).size !== 2 ||
    new Set(value.vessels.map((vessel) => vessel.id)).size !== value.vessels.length
  ) {
    return undefined
  }
  return {
    version: 1, type: 'snapshot', revision: value.revision, sequence: value.sequence,
    vessels: value.vessels, sources: value.sources,
  }
}

export const parseMarineStreamAcknowledgement = (value: unknown) =>
  isRecord(value) && value.version === 1 && value.type === 'ack' &&
    validRevision(value.sequence)
    ? value.sequence
    : undefined

export const parseMarineStreamRetry = (
  value: unknown,
): MarineStreamRetry | undefined =>
  isRecord(value) && value.version === 1 && value.type === 'retry' &&
    typeof value.retryAt === 'number' && Number.isSafeInteger(value.retryAt) &&
    value.retryAt > 0 && typeof value.error === 'string' &&
    optionalString(value.error, 512)
    ? { version: 1, type: 'retry', retryAt: value.retryAt, error: value.error }
    : undefined
