import { isValidCoordinate } from '../../domain/geo.js'
import {
  finiteInteger,
  finiteNumber,
  isRecord,
  normalizedDirection,
} from '../guards.js'
import type {
  AisMetadataRecord,
  MarineLocationRecord,
} from './digitrafficNormalization.js'

export const AISSTREAM_PROVIDER_NAME = 'AISStream'
export const OPENWATERS_PROVIDER_NAME = 'Open Waters AIS'
export type MarineStreamSource = 'aisstream' | 'openwaters'

export interface MarineSourceObservation {
  mmsi: number
  observedAt: number
  location?: MarineLocationRecord
  metadata?: AisMetadataRecord
  nameHint?: string
  attribution: string
}

export interface OpenWatersMetadata {
  metadata: AisMetadataRecord
  attribution: string
}

const positionTypes = new Set([
  'PositionReport',
  'StandardClassBPositionReport',
  'ExtendedClassBPositionReport',
  'LongRangeAisBroadcastMessage',
])
const messageIds: Record<string, readonly number[]> = {
  PositionReport: [1, 2, 3],
  StandardClassBPositionReport: [18],
  ExtendedClassBPositionReport: [19],
  LongRangeAisBroadcastMessage: [27],
  ShipStaticData: [5],
  StaticDataReport: [24],
}

export const AISSTREAM_ATTRIBUTION = 'AISStream (https://aisstream.io/)'
const openWatersCredit = 'Open Waters AIS (https://openwaters.io/ais/)'
const sourceCredits: Record<string, string> = {
  digitraffic:
    'Source: Fintraffic / digitraffic.fi, license CC 4.0 BY',
  aishub: 'AISHub (https://www.aishub.net)',
  aisstream: 'aisstream.io',
  kystverket:
    'Contains data under the Norwegian licence for Open Government data (NLOD) distributed by the Norwegian Coastal Administration.',
  barentswatch:
    'Data delivered by BarentsWatch. Contains data under the Norwegian licence for Open Government data (NLOD) distributed by the Norwegian Coastal Administration.',
  udp: '',
  station: '',
  mmsi: '',
}

const text = (value: unknown, maximum = 64) => {
  if (typeof value !== 'string') return undefined
  const clean = value.trim().replace(/@+$/g, '').trim()
  return clean.length > 0 &&
    clean.length <= maximum &&
    !/\p{Cc}/u.test(clean)
    ? clean
    : undefined
}

export const parseMarineMmsi = (value: unknown) => {
  if (typeof value === 'string' && /^[1-9]\d{8}$/.test(value)) {
    return Number(value)
  }
  const number = finiteInteger(value)
  return number !== undefined &&
    number >= 100_000_000 &&
    number <= 999_999_999
    ? number
    : undefined
}

export const parseMarineTimestamp = (value: unknown) => {
  if (typeof value !== 'string') return undefined
  const parts =
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(?:Z|\+00:00| \+0000 UTC)$/.exec(
      value,
    )
  if (!parts) return undefined
  const prefix = `${parts[1]}T${parts[2]}`
  const timestamp = Date.parse(
    `${prefix}.${(parts[3] ?? '').slice(0, 3).padEnd(3, '0')}Z`,
  )
  return timestamp > 0 &&
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 19) === prefix
    ? timestamp
    : undefined
}

const integer = (value: unknown, minimum: number, maximum: number) => {
  const number = finiteInteger(value)
  return number !== undefined && number >= minimum && number <= maximum
    ? number
    : undefined
}

const positive = (value: unknown, maximum: number) => {
  const number = finiteNumber(value)
  return number !== undefined && number > 0 && number <= maximum
    ? number
    : undefined
}

const dimensions = (value: unknown) => {
  const dimension = isRecord(value) ? value : {}
  return {
    referencePointA: integer(dimension.A, 0, 511),
    referencePointB: integer(dimension.B, 0, 511),
    referencePointC: integer(dimension.C, 0, 63),
    referencePointD: integer(dimension.D, 0, 63),
    lengthMeters: undefined,
    widthMeters: undefined,
  }
}

const eta = (value: unknown) => {
  if (!isRecord(value)) return undefined
  const month = integer(value.Month, 1, 12)
  const day = integer(value.Day, 1, 31)
  const hour = integer(value.Hour, 0, 23)
  const minute = integer(value.Minute, 0, 59)
  return month === undefined || day === undefined ||
    hour === undefined || minute === undefined
    ? undefined
    : (month << 16) | (day << 11) | (hour << 6) | minute
}

const snapshotEta = (value: unknown) => {
  if (typeof value !== 'string') return undefined
  const parts = /^(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(value)
  return parts ? eta({
    Month: Number(parts[1]), Day: Number(parts[2]),
    Hour: Number(parts[3]), Minute: Number(parts[4]),
  }) : undefined
}

export const openWatersAttribution = (
  source: unknown,
  supplied?: unknown,
) => {
  const suppliedText = text(supplied, 1_024)
  if (suppliedText) return suppliedText
  if (typeof source !== 'string') return undefined
  const kind = source.split(':')[0]
  if (!Object.hasOwn(sourceCredits, kind)) return undefined
  return sourceCredits[kind]
    ? `${openWatersCredit}. ${sourceCredits[kind]}`
    : openWatersCredit
}

const metadataFromPacket = (
  type: string,
  body: Record<string, unknown>,
  mmsi: number,
  timestamp: number | undefined,
): AisMetadataRecord | undefined => {
  if (type === 'StaticDataReport') {
    if (
      (body.PartNumber === false || body.PartNumber === 0) &&
      isRecord(body.ReportA) && body.ReportA.Valid === true
    ) {
      return { mmsi, timestamp, name: text(body.ReportA.Name) }
    }
    if (
      (body.PartNumber === true || body.PartNumber === 1) &&
      isRecord(body.ReportB) && body.ReportB.Valid === true
    ) {
      return {
        mmsi,
        timestamp,
        shipType: integer(body.ReportB.ShipType, 1, 99),
        callSign: text(body.ReportB.CallSign, 16),
        ...dimensions(body.ReportB.Dimension),
      }
    }
    return undefined
  }
  if (type !== 'ShipStaticData' && type !== 'ExtendedClassBPositionReport') {
    return undefined
  }
  const metadata: AisMetadataRecord = {
    mmsi,
    timestamp,
    name: text(body.Name),
    shipType: integer(body.Type, 1, 99),
    ...dimensions(body.Dimension),
  }
  if (type === 'ShipStaticData') {
    const draught = finiteNumber(body.MaximumStaticDraught)
    metadata.callSign = text(body.CallSign, 16)
    metadata.imo = integer(body.ImoNumber, 1, 9_999_999)
    metadata.destination = text(body.Destination)
    metadata.draught =
      draught !== undefined && draught > 0 && draught < 25.5
        ? Math.round(draught * 10)
        : undefined
    metadata.eta = eta(body.Eta)
  }
  return metadata
}

const observation = (
  type: string,
  body: unknown,
  mmsi: number,
  observedAt: number,
  attribution: string,
  metadataTimeKnown: boolean,
  nameHint?: unknown,
): MarineSourceObservation | undefined => {
  if (
    !isRecord(body) || body.Valid !== true ||
    parseMarineMmsi(body.UserID) !== mmsi ||
    !messageIds[type]?.includes(finiteInteger(body.MessageID) ?? -1)
  ) {
    return undefined
  }
  const result: MarineSourceObservation = {
    mmsi,
    observedAt,
    attribution,
    nameHint: text(nameHint),
    metadata: metadataFromPacket(
      type, body, mmsi, metadataTimeKnown ? observedAt : undefined,
    ),
  }
  if (positionTypes.has(type)) {
    const latitude = finiteNumber(body.Latitude)
    const longitude = finiteNumber(body.Longitude)
    if (
      latitude === undefined || longitude === undefined ||
      !isValidCoordinate(latitude, longitude)
    ) {
      return undefined
    }
    const speed = finiteNumber(body.Sog)
    const longRange = type === 'LongRangeAisBroadcastMessage'
    result.location = {
      mmsi,
      latitude,
      longitude,
      observedAt,
      speedKnots: speed !== undefined && speed >= 0 &&
        speed < (longRange ? 63 : 102.3) ? speed : undefined,
      courseDegrees: normalizedDirection(body.Cog),
      headingDegrees: integer(body.TrueHeading, 0, 359),
      navigationStatus:
        type === 'PositionReport' || longRange
          ? integer(body.NavigationalStatus, 0, 14)
          : undefined,
    }
  }
  return result.location || result.metadata ? result : undefined
}

export const parseMarineSourceMessage = (
  source: MarineStreamSource,
  value: unknown,
): MarineSourceObservation | undefined => {
  if (!isRecord(value)) return undefined
  if (source === 'aisstream') {
    if (
      typeof value.MessageType !== 'string' ||
      !Object.hasOwn(messageIds, value.MessageType) ||
      !isRecord(value.Message) || !isRecord(value.MetaData)
    ) {
      return undefined
    }
    const mmsi = parseMarineMmsi(value.MetaData.MMSI)
    const at = parseMarineTimestamp(value.MetaData.time_utc)
    if (
      mmsi === undefined || at === undefined ||
      (value.MetaData.MMSI_String !== undefined &&
        parseMarineMmsi(value.MetaData.MMSI_String) !== mmsi)
    ) {
      return undefined
    }
    return observation(
      value.MessageType, value.Message[value.MessageType], mmsi, at,
      AISSTREAM_ATTRIBUTION, true, value.MetaData.ShipName,
    )
  }
  if (
    value.type !== 'event' || typeof value.msg_type !== 'string' ||
    !Object.hasOwn(messageIds, value.msg_type)
  ) {
    return undefined
  }
  const mmsi = parseMarineMmsi(value.mmsi)
  const at = parseMarineTimestamp(value.time)
  const attribution = openWatersAttribution(value.source, value.attribution)
  if (mmsi === undefined || at === undefined || !attribution) return undefined
  return observation(
    value.msg_type, value.message, mmsi, at, attribution,
    value.synthesized !== true,
  )
}

export const parseOpenWatersMetadataSnapshot = (
  value: unknown,
): OpenWatersMetadata[] => {
  if (
    !isRecord(value) || value.type !== 'FeatureCollection' ||
    !Array.isArray(value.features) || value.truncated === true
  ) {
    throw new Error('Open Waters returned an incomplete or malformed snapshot')
  }
  const credits = isRecord(value.attribution) ? value.attribution : {}
  const result: OpenWatersMetadata[] = []
  for (const feature of value.features) {
    if (!isRecord(feature) || !isRecord(feature.properties)) continue
    const properties = feature.properties
    const mmsi = parseMarineMmsi(properties.mmsi)
    if (
      mmsi === undefined || properties.kind !== 'vessel' ||
      (feature.id !== undefined && parseMarineMmsi(feature.id) !== mmsi)
    ) {
      continue
    }
    const source = properties.source
    const attribution = openWatersAttribution(
      source,
      typeof source === 'string' ? credits[source.split(':')[0]] : undefined,
    )
    if (!attribution) continue
    const draught = finiteNumber(properties.draught)
    const a = integer(properties.to_bow, 0, 511)
    const b = integer(properties.to_stern, 0, 511)
    const c = integer(properties.to_port, 0, 63)
    const d = integer(properties.to_starboard, 0, 63)
    const length = positive(properties.length, 1_022)
    const width = positive(properties.beam, 126)
    const lengthConflict = length !== undefined && a !== undefined && b !== undefined &&
      a + b > 0 && length !== a + b
    const widthConflict = width !== undefined && c !== undefined && d !== undefined &&
      c + d > 0 && width !== c + d
    result.push({
      attribution,
      metadata: {
        mmsi,
        name: text(properties.name),
        callSign: text(properties.callsign, 16),
        shipType: integer(properties.type, 1, 99),
        imo: integer(properties.imo, 1, 9_999_999),
        destination: text(properties.destination),
        eta: snapshotEta(properties.eta),
        draught: draught !== undefined && draught > 0 && draught < 25.5
          ? Math.round(draught * 10) : undefined,
        referencePointA: lengthConflict ? undefined : a,
        referencePointB: lengthConflict ? undefined : b,
        referencePointC: widthConflict ? undefined : c,
        referencePointD: widthConflict ? undefined : d,
        lengthMeters: lengthConflict ? undefined : length,
        widthMeters: widthConflict ? undefined : width,
      },
    })
  }
  return result
}
