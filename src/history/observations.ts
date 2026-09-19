import {
  TRAFFIC_MARKER_ICONS,
  type Aircraft,
  type TrafficEntity,
  type TrafficKind,
  type TrafficMarkerIcon,
  type Vessel,
  type VesselCategory,
  type VesselNavigationCategory,
} from '../domain/traffic'

export const HISTORY_SCHEMA_VERSION = 1
export const HISTORY_NORMALIZATION_VERSION = '2026-09-19-v1'
export const ADSB_HISTORY_LICENSE_DECISION =
  'adsb-lol-odbl-local-playback-2026-09-19'
export const DIGITRAFFIC_HISTORY_LICENSE_DECISION =
  'fintraffic-cc-by-local-playback-2026-09-19'

interface HistoricalObservationBase {
  schemaVersion: typeof HISTORY_SCHEMA_VERSION
  normalizationVersion: typeof HISTORY_NORMALIZATION_VERSION
  provider: string
  entityId: string
  kind: TrafficKind
  observedAt: number
  receivedAt: number
  latitude: number
  longitude: number
  headingDegrees?: number
  courseDegrees?: number
  speedKph?: number
  markerIcon: TrafficMarkerIcon
  markerScale: number
  sessionId: string
  segmentId: string
  licenseDecisionId:
    | typeof ADSB_HISTORY_LICENSE_DECISION
    | typeof DIGITRAFFIC_HISTORY_LICENSE_DECISION
  logicalBytes: number
}

export interface HistoricalAircraftObservation
  extends HistoricalObservationBase {
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

export interface HistoricalVesselObservation
  extends HistoricalObservationBase {
  kind: 'vessel'
  mmsi: number
  vesselCategory: VesselCategory
  navigationCategory: VesselNavigationCategory
  name?: string
  vesselType?: string
  imo?: number
  callSign?: string
  lengthMeters?: number
  widthMeters?: number
  draughtMeters?: number
  navigationStatus?: string
  metadataObservedAt?: number
}

export type HistoricalObservation =
  | HistoricalAircraftObservation
  | HistoricalVesselObservation

export interface ObservationProjectionContext {
  sessionId: string
  segmentId: string
}

const logicalBytesPropertyBytes = ',"logicalBytes":'.length

const AIRCRAFT_HISTORY_FIELDS = [
  'schemaVersion',
  'normalizationVersion',
  'provider',
  'entityId',
  'kind',
  'observedAt',
  'receivedAt',
  'latitude',
  'longitude',
  'headingDegrees',
  'courseDegrees',
  'speedKph',
  'markerIcon',
  'markerScale',
  'sessionId',
  'segmentId',
  'licenseDecisionId',
  'hex',
  'callsign',
  'registration',
  'aircraftType',
  'category',
  'altitudeMeters',
  'verticalSpeedMps',
  'squawk',
] as const

const VESSEL_HISTORY_FIELDS = [
  'schemaVersion',
  'normalizationVersion',
  'provider',
  'entityId',
  'kind',
  'observedAt',
  'receivedAt',
  'latitude',
  'longitude',
  'headingDegrees',
  'courseDegrees',
  'speedKph',
  'markerIcon',
  'markerScale',
  'sessionId',
  'segmentId',
  'licenseDecisionId',
  'mmsi',
  'vesselCategory',
  'navigationCategory',
  'name',
  'vesselType',
  'imo',
  'callSign',
  'lengthMeters',
  'widthMeters',
  'draughtMeters',
  'navigationStatus',
  'metadataObservedAt',
] as const

const AIRCRAFT_HISTORY_FIELD_SET = new Set<string>([
  ...AIRCRAFT_HISTORY_FIELDS,
  'logicalBytes',
])
const AIRCRAFT_REQUIRED_HISTORY_FIELDS = [
  'schemaVersion',
  'normalizationVersion',
  'provider',
  'entityId',
  'kind',
  'observedAt',
  'receivedAt',
  'latitude',
  'longitude',
  'markerIcon',
  'markerScale',
  'sessionId',
  'segmentId',
  'licenseDecisionId',
  'hex',
  'logicalBytes',
] as const
const VESSEL_HISTORY_FIELD_SET = new Set<string>([
  ...VESSEL_HISTORY_FIELDS,
  'logicalBytes',
])
const VESSEL_REQUIRED_HISTORY_FIELDS = [
  'schemaVersion',
  'normalizationVersion',
  'provider',
  'entityId',
  'kind',
  'observedAt',
  'receivedAt',
  'latitude',
  'longitude',
  'markerIcon',
  'markerScale',
  'sessionId',
  'segmentId',
  'licenseDecisionId',
  'mmsi',
  'vesselCategory',
  'navigationCategory',
  'logicalBytes',
] as const

const finiteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const positiveNumber = (value: unknown): value is number =>
  finiteNumber(value) && value > 0

const optionalFiniteNumber = (value: unknown) =>
  value === undefined || finiteNumber(value)

const optionalString = (value: unknown) =>
  value === undefined || typeof value === 'string'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isTrafficMarkerIcon = (value: unknown): value is TrafficMarkerIcon =>
  typeof value === 'string' &&
  TRAFFIC_MARKER_ICONS.some((icon) => icon === value)

const VESSEL_CATEGORIES: readonly VesselCategory[] = [
  'cargo',
  'tanker',
  'passenger',
  'fishing',
  'tug-service',
  'other',
  'unknown',
]

const VESSEL_NAVIGATION_CATEGORIES: readonly VesselNavigationCategory[] = [
  'underway',
  'anchored',
  'moored',
  'restricted',
  'aground',
  'fishing',
  'other',
  'unknown',
]

const isVesselCategory = (value: unknown): value is VesselCategory =>
  typeof value === 'string' &&
  VESSEL_CATEGORIES.some((category) => category === value)

const isVesselNavigationCategory = (
  value: unknown,
): value is VesselNavigationCategory =>
  typeof value === 'string' &&
  VESSEL_NAVIGATION_CATEGORIES.some((category) => category === value)

const historyLicenseDecision = (provider: string) => {
  if (provider === 'ADSB.lol') return ADSB_HISTORY_LICENSE_DECISION
  if (provider === 'Fintraffic Digitraffic') {
    return DIGITRAFFIC_HISTORY_LICENSE_DECISION
  }
  return undefined
}

const compactDefined = <T extends Record<string, unknown>>(value: T): T =>
  Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== undefined),
  ) as T

const utf8ByteLength = (value: string) => {
  let bytes = 0
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 0x80) {
      bytes += 1
    } else if (code < 0x800) {
      bytes += 2
    } else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      index + 1 < value.length &&
      value.charCodeAt(index + 1) >= 0xdc00 &&
      value.charCodeAt(index + 1) <= 0xdfff
    ) {
      bytes += 4
      index += 1
    } else {
      bytes += 3
    }
  }
  return bytes
}

const measureLogicalBytes = (
  observation: Record<string, unknown>,
  fields?: readonly string[],
) => {
  const baseBytes = utf8ByteLength(
    fields
      ? JSON.stringify(observation, [...fields])
      : JSON.stringify(observation),
  )
  let logicalBytes =
    baseBytes + logicalBytesPropertyBytes + String(baseBytes).length
  while (true) {
    const measured =
      baseBytes +
      logicalBytesPropertyBytes +
      String(logicalBytes).length
    if (measured === logicalBytes) return measured
    logicalBytes = measured
  }
}

const isCanonicalStoredObservation = (
  value: Record<string, unknown>,
  fields: ReadonlySet<string>,
  requiredFields: readonly string[],
  logicalBytes: number,
) =>
  value.logicalBytes === logicalBytes &&
  requiredFields.every((field) => Object.hasOwn(value, field)) &&
  Object.keys(value).every(
    (key) => fields.has(key) && value[key] !== undefined,
  )

const withLogicalBytes = <const T extends Record<string, unknown>>(
  observation: T,
): T & { logicalBytes: number } => {
  const compact = compactDefined(
    observation as unknown as Record<string, unknown>,
  ) as T
  return {
    ...compact,
    logicalBytes: measureLogicalBytes(
      compact as unknown as Record<string, unknown>,
    ),
  }
}

const projectAircraft = (
  entity: Aircraft,
  context: ObservationProjectionContext,
  licenseDecisionId: typeof ADSB_HISTORY_LICENSE_DECISION,
): HistoricalAircraftObservation =>
  withLogicalBytes({
    schemaVersion: HISTORY_SCHEMA_VERSION,
    normalizationVersion: HISTORY_NORMALIZATION_VERSION,
    provider: entity.provider,
    entityId: entity.id,
    kind: 'aircraft',
    observedAt: entity.position.observedAt,
    receivedAt: entity.receivedAt,
    latitude: entity.position.latitude,
    longitude: entity.position.longitude,
    headingDegrees: entity.headingDegrees,
    courseDegrees: entity.courseDegrees,
    speedKph: entity.speedKph,
    markerIcon: entity.markerIcon,
    markerScale: entity.markerScale,
    sessionId: context.sessionId,
    segmentId: context.segmentId,
    licenseDecisionId,
    hex: entity.hex,
    callsign: entity.callsign,
    registration: entity.registration,
    aircraftType: entity.aircraftType,
    category: entity.category,
    altitudeMeters: entity.altitudeMeters,
    verticalSpeedMps: entity.verticalSpeedMps,
    squawk: entity.squawk,
  })

const projectVessel = (
  entity: Vessel,
  context: ObservationProjectionContext,
  licenseDecisionId: typeof DIGITRAFFIC_HISTORY_LICENSE_DECISION,
): HistoricalVesselObservation =>
  withLogicalBytes({
    schemaVersion: HISTORY_SCHEMA_VERSION,
    normalizationVersion: HISTORY_NORMALIZATION_VERSION,
    provider: entity.provider,
    entityId: entity.id,
    kind: 'vessel',
    observedAt: entity.position.observedAt,
    receivedAt: entity.receivedAt,
    latitude: entity.position.latitude,
    longitude: entity.position.longitude,
    headingDegrees: entity.headingDegrees,
    courseDegrees: entity.courseDegrees,
    speedKph: entity.speedKph,
    markerIcon: entity.markerIcon,
    markerScale: entity.markerScale,
    sessionId: context.sessionId,
    segmentId: context.segmentId,
    licenseDecisionId,
    mmsi: entity.mmsi,
    vesselCategory: entity.vesselCategory,
    navigationCategory: entity.navigationCategory,
    name: entity.name,
    vesselType: entity.vesselType,
    imo: entity.imo,
    callSign: entity.callSign,
    lengthMeters: entity.lengthMeters,
    widthMeters: entity.widthMeters,
    draughtMeters: entity.draughtMeters,
    navigationStatus: entity.navigationStatus,
    metadataObservedAt: entity.metadataObservedAt,
  })

export const projectHistoricalObservation = (
  entity: TrafficEntity,
  context: ObservationProjectionContext,
): HistoricalObservation | undefined => {
  const licenseDecisionId = historyLicenseDecision(entity.provider)
  if (!licenseDecisionId) return undefined

  return entity.kind === 'aircraft'
    ? projectAircraft(
        entity,
        context,
        licenseDecisionId as typeof ADSB_HISTORY_LICENSE_DECISION,
      )
    : projectVessel(
        entity,
        context,
        licenseDecisionId as typeof DIGITRAFFIC_HISTORY_LICENSE_DECISION,
      )
}

export const historicalObservationKey = (
  observation: Pick<
    HistoricalObservation,
    'provider' | 'entityId' | 'observedAt'
  >,
) =>
  `${observation.provider}\u0000${observation.entityId}\u0000${observation.observedAt}`

export const historicalEntityKey = (
  observation: Pick<HistoricalObservation, 'provider' | 'entityId'>,
) => `${observation.provider}\u0000${observation.entityId}`

const validBase = (value: Record<string, unknown>) =>
  value.schemaVersion === HISTORY_SCHEMA_VERSION &&
  value.normalizationVersion === HISTORY_NORMALIZATION_VERSION &&
  typeof value.provider === 'string' &&
  typeof value.entityId === 'string' &&
  value.entityId.length > 0 &&
  (value.kind === 'aircraft' || value.kind === 'vessel') &&
  positiveNumber(value.observedAt) &&
  positiveNumber(value.receivedAt) &&
  finiteNumber(value.latitude) &&
  value.latitude >= -90 &&
  value.latitude <= 90 &&
  finiteNumber(value.longitude) &&
  value.longitude >= -180 &&
  value.longitude <= 180 &&
  optionalFiniteNumber(value.headingDegrees) &&
  optionalFiniteNumber(value.courseDegrees) &&
  optionalFiniteNumber(value.speedKph) &&
  isTrafficMarkerIcon(value.markerIcon) &&
  positiveNumber(value.markerScale) &&
  typeof value.sessionId === 'string' &&
  value.sessionId.length > 0 &&
  typeof value.segmentId === 'string' &&
  value.segmentId.length > 0

export const isCanonicalHistoricalObservation = (
  value: unknown,
  observation: HistoricalObservation,
) => {
  if (!isRecord(value)) return false
  const storedKeys = Object.keys(value)
  const canonicalKeys = Object.keys(observation)
  return (
    storedKeys.length === canonicalKeys.length &&
    canonicalKeys.every(
      (key) =>
        Object.hasOwn(value, key) &&
        Object.is(value[key], observation[key as keyof HistoricalObservation]),
    )
  )
}

export const validateHistoricalObservation = (
  value: unknown,
): HistoricalObservation | undefined => {
  if (!isRecord(value) || !validBase(value)) return undefined

  if (
    value.kind === 'aircraft' &&
    value.provider === 'ADSB.lol' &&
    value.licenseDecisionId === ADSB_HISTORY_LICENSE_DECISION &&
    typeof value.hex === 'string' &&
    value.hex.length > 0 &&
    optionalString(value.callsign) &&
    optionalString(value.registration) &&
    optionalString(value.aircraftType) &&
    optionalString(value.category) &&
    optionalFiniteNumber(value.altitudeMeters) &&
    optionalFiniteNumber(value.verticalSpeedMps) &&
    optionalString(value.squawk)
  ) {
    const logicalBytes = measureLogicalBytes(
      value,
      AIRCRAFT_HISTORY_FIELDS,
    )
    if (
      isCanonicalStoredObservation(
        value,
        AIRCRAFT_HISTORY_FIELD_SET,
        AIRCRAFT_REQUIRED_HISTORY_FIELDS,
        logicalBytes,
      )
    ) {
      return value as unknown as HistoricalAircraftObservation
    }
    const aircraft = value as unknown as HistoricalAircraftObservation
    return withLogicalBytes({
      schemaVersion: HISTORY_SCHEMA_VERSION,
      normalizationVersion: HISTORY_NORMALIZATION_VERSION,
      provider: 'ADSB.lol',
      entityId: aircraft.entityId,
      kind: 'aircraft',
      observedAt: aircraft.observedAt,
      receivedAt: aircraft.receivedAt,
      latitude: aircraft.latitude,
      longitude: aircraft.longitude,
      headingDegrees: aircraft.headingDegrees,
      courseDegrees: aircraft.courseDegrees,
      speedKph: aircraft.speedKph,
      markerIcon: aircraft.markerIcon,
      markerScale: aircraft.markerScale,
      sessionId: aircraft.sessionId,
      segmentId: aircraft.segmentId,
      licenseDecisionId: ADSB_HISTORY_LICENSE_DECISION,
      hex: aircraft.hex,
      callsign: aircraft.callsign,
      registration: aircraft.registration,
      aircraftType: aircraft.aircraftType,
      category: aircraft.category,
      altitudeMeters: aircraft.altitudeMeters,
      verticalSpeedMps: aircraft.verticalSpeedMps,
      squawk: aircraft.squawk,
    })
  }

  if (
    value.kind === 'vessel' &&
    value.provider === 'Fintraffic Digitraffic' &&
    value.licenseDecisionId === DIGITRAFFIC_HISTORY_LICENSE_DECISION &&
    positiveNumber(value.mmsi) &&
    isVesselCategory(value.vesselCategory) &&
    isVesselNavigationCategory(value.navigationCategory) &&
    optionalString(value.name) &&
    optionalString(value.vesselType) &&
    optionalFiniteNumber(value.imo) &&
    optionalString(value.callSign) &&
    optionalFiniteNumber(value.lengthMeters) &&
    optionalFiniteNumber(value.widthMeters) &&
    optionalFiniteNumber(value.draughtMeters) &&
    optionalString(value.navigationStatus) &&
    optionalFiniteNumber(value.metadataObservedAt)
  ) {
    const logicalBytes = measureLogicalBytes(
      value,
      VESSEL_HISTORY_FIELDS,
    )
    if (
      isCanonicalStoredObservation(
        value,
        VESSEL_HISTORY_FIELD_SET,
        VESSEL_REQUIRED_HISTORY_FIELDS,
        logicalBytes,
      )
    ) {
      return value as unknown as HistoricalVesselObservation
    }
    const vessel = value as unknown as HistoricalVesselObservation
    return withLogicalBytes({
      schemaVersion: HISTORY_SCHEMA_VERSION,
      normalizationVersion: HISTORY_NORMALIZATION_VERSION,
      provider: 'Fintraffic Digitraffic',
      entityId: vessel.entityId,
      kind: 'vessel',
      observedAt: vessel.observedAt,
      receivedAt: vessel.receivedAt,
      latitude: vessel.latitude,
      longitude: vessel.longitude,
      headingDegrees: vessel.headingDegrees,
      courseDegrees: vessel.courseDegrees,
      speedKph: vessel.speedKph,
      markerIcon: vessel.markerIcon,
      markerScale: vessel.markerScale,
      sessionId: vessel.sessionId,
      segmentId: vessel.segmentId,
      licenseDecisionId: DIGITRAFFIC_HISTORY_LICENSE_DECISION,
      mmsi: vessel.mmsi,
      vesselCategory: vessel.vesselCategory,
      navigationCategory: vessel.navigationCategory,
      name: vessel.name,
      vesselType: vessel.vesselType,
      imo: vessel.imo,
      callSign: vessel.callSign,
      lengthMeters: vessel.lengthMeters,
      widthMeters: vessel.widthMeters,
      draughtMeters: vessel.draughtMeters,
      navigationStatus: vessel.navigationStatus,
      metadataObservedAt: vessel.metadataObservedAt,
    })
  }

  return undefined
}

export const historicalObservationToEntity = (
  observation: HistoricalObservation,
  cursor: number,
): TrafficEntity => {
  const base = {
    id: observation.entityId,
    provider: observation.provider,
    position: {
      observedAt: observation.observedAt,
      latitude: observation.latitude,
      longitude: observation.longitude,
    },
    receivedAt: observation.receivedAt,
    headingDegrees: observation.headingDegrees,
    courseDegrees: observation.courseDegrees,
    speedKph: observation.speedKph,
    markerIcon: observation.markerIcon,
    markerScale: observation.markerScale,
  }

  if (observation.kind === 'aircraft') {
    return {
      ...base,
      kind: 'aircraft',
      hex: observation.hex,
      callsign: observation.callsign,
      registration: observation.registration,
      aircraftType: observation.aircraftType,
      category: observation.category,
      altitudeMeters: observation.altitudeMeters,
      verticalSpeedMps: observation.verticalSpeedMps,
      squawk: observation.squawk,
    }
  }

  const metadataAvailable =
    observation.metadataObservedAt === undefined ||
    observation.metadataObservedAt <= cursor

  return {
    ...base,
    kind: 'vessel',
    mmsi: observation.mmsi,
    vesselCategory: metadataAvailable
      ? observation.vesselCategory
      : 'unknown',
    navigationCategory: observation.navigationCategory,
    name: metadataAvailable ? observation.name : undefined,
    vesselType: metadataAvailable ? observation.vesselType : undefined,
    imo: metadataAvailable ? observation.imo : undefined,
    callSign: metadataAvailable ? observation.callSign : undefined,
    lengthMeters: metadataAvailable ? observation.lengthMeters : undefined,
    widthMeters: metadataAvailable ? observation.widthMeters : undefined,
    draughtMeters: metadataAvailable ? observation.draughtMeters : undefined,
    navigationStatus: observation.navigationStatus,
    metadataObservedAt: metadataAvailable
      ? observation.metadataObservedAt
      : undefined,
    markerIcon: metadataAvailable ? observation.markerIcon : 'vessel',
    markerScale: metadataAvailable ? observation.markerScale : 0.88,
  }
}
