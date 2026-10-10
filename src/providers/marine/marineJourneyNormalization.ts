import { APP_CONFIG, JOURNEY_CONFIG as config } from '../../config/appConfig'
import { isValidCoordinate } from '../../domain/geo'
import type { MarineJourneyHistory } from '../../domain/marineJourney'
import type { TrailPoint } from '../../domain/traffic'
import { finiteInteger, finiteNumber, isRecord } from '../guards'
import { parseMarineMmsi, parseMarineTimestamp } from './marineSourceNormalization'

export class MarineJourneyFormatError extends Error {
  constructor() {
    super('Ship history returned invalid identity, positions, clocks or attribution')
    this.name = 'MarineJourneyFormatError'
  }
}

const validSeries = (value: unknown, size: number, maximum: number, integer = false) =>
  Array.isArray(value) && value.length === size && value.every(item =>
    item === null || (typeof item === 'number' && Number.isFinite(item) &&
      item >= 0 && item <= maximum && (!integer || Number.isInteger(item))))

export const parseMarineJourneyHistory = (
  value: unknown,
  mmsi: number,
  from: number,
  to: number,
  retrievedAt: number,
): MarineJourneyHistory => {
  if (!isRecord(value) || value.type !== 'Feature' ||
      value.id !== mmsi || !isRecord(value.properties)) throw new MarineJourneyFormatError()
  const properties = value.properties
  const count = finiteInteger(properties.points)
  const interval = finiteInteger(properties.interval)
  const tolerance = finiteNumber(properties.tolerance_m)
  const actualFrom = parseMarineTimestamp(properties.from)
  const actualTo = parseMarineTimestamp(properties.to)
  const reportedBreaks: unknown[] | undefined = properties.breaks === undefined ? undefined
    : Array.isArray(properties.breaks) ? properties.breaks : undefined
  if (parseMarineMmsi(properties.mmsi) !== mmsi ||
      actualFrom === undefined || actualTo === undefined ||
      actualFrom < from || actualTo > to || actualFrom > actualTo ||
      count === undefined || count < 0 || count > config.maximumObservedPoints ||
      interval === undefined || interval < 0 || interval > config.marineHistoryWindowMs / 1_000 ||
      (properties.tolerance_m !== undefined && (tolerance === undefined || tolerance < 0)) ||
      (properties.simplified !== undefined && typeof properties.simplified !== 'boolean') ||
      typeof properties.truncated !== 'boolean' ||
      !Array.isArray(properties.times) || properties.times.length !== count ||
      (properties.breaks !== undefined && (!reportedBreaks || reportedBreaks.length > count)) ||
      !validSeries(properties.sog, count, 102.3) ||
      !validSeries(properties.cog, count, 360) ||
      !validSeries(properties.heading, count, 511, true) ||
      !validSeries(properties.nav_status, count, 15, true)) throw new MarineJourneyFormatError()

  const geometry = value.geometry
  let coordinates: unknown[]
  if (count === 0 && geometry === null) coordinates = []
  else if (isRecord(geometry) && geometry.type === 'Point' && count === 1) coordinates = [geometry.coordinates]
  else if (isRecord(geometry) && geometry.type === 'LineString' &&
      count >= 2 && Array.isArray(geometry.coordinates)) coordinates = geometry.coordinates
  else throw new MarineJourneyFormatError()
  if (coordinates.length !== count) throw new MarineJourneyFormatError()

  const breaks = new Set<number>()
  let previousBreak = -1
  for (const index of reportedBreaks ?? []) {
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= count || index <= previousBreak) {
      throw new MarineJourneyFormatError()
    }
    breaks.add(index)
    previousBreak = index
  }
  const attribution = value.attribution
  if (!isRecord(attribution) || Object.keys(attribution).length > config.marineHistoryMaximumCredits) {
    throw new MarineJourneyFormatError()
  }
  const credits: string[] = []
  for (const [key, credit] of Object.entries(attribution)) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(key) || typeof credit !== 'string' ||
        !credit.trim() || credit.length > config.marineHistoryMaximumCreditLength ||
        /\p{Cc}/u.test(credit)) throw new MarineJourneyFormatError()
    credits.push(credit.trim())
  }
  if (count > 0 && credits.length === 0) throw new MarineJourneyFormatError()

  const segments: TrailPoint[][] = []
  let segment: TrailPoint[] = []
  let previousTime = actualFrom - 1
  let timeGaps = 0
  for (let index = 0; index < coordinates.length; index += 1) {
    const point = coordinates[index]
    const observedAt = parseMarineTimestamp(properties.times[index])
    if (!Array.isArray(point) || point.length !== 2 ||
        typeof point[0] !== 'number' || typeof point[1] !== 'number' ||
        !isValidCoordinate(point[1], point[0]) || observedAt === undefined ||
        observedAt < actualFrom || observedAt > actualTo || observedAt <= previousTime) {
      throw new MarineJourneyFormatError()
    }
    const timeGap = index > 0 && observedAt - previousTime > APP_CONFIG.history.vesselTrailGapMs
    if (breaks.has(index) || timeGap) {
      if (segment.length > 0) segments.push(segment)
      segment = []
      if (timeGap && !breaks.has(index)) timeGaps += 1
    }
    segment.push(Object.freeze({ longitude: point[0], latitude: point[1], observedAt }))
    previousTime = observedAt
  }
  if (segment.length > 0) segments.push(segment)
  return Object.freeze({
    mmsi, from: actualFrom, to: actualTo, retrievedAt, pointCount: count,
    segments: Object.freeze(segments.map(points => Object.freeze(points))),
    receptionBreaks: reportedBreaks ? breaks.size : undefined, timeGaps,
    simplified: properties.simplified, toleranceMeters: tolerance,
    truncated: properties.truncated, windowLimited: actualFrom > from || actualTo < to,
    attribution: Object.freeze(credits),
  })
}
