import { DISCOVERY_CONFIG as config } from '../../config/discoveryConfig.js'
import type { DiscoveryMatch, DiscoveryResponse, LookupRequest } from '../../domain/objectDiscovery.js'
import { SHIP_POSITION_SOURCE } from '../../domain/objectDiscovery.js'
import { isValidCoordinate } from '../../domain/geo.js'
import { hasControlCharacters, isRecord } from '../guards.js'
import { ProviderError } from '../errors.js'
import { parseMarineMmsi, parseMarineTimestamp } from '../marine/marineSourceNormalization.js'

const length = (value: string) => [...value].length
const invalid = () => new ProviderError('The lookup source returned an invalid response.')
const validTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
const text = (value: unknown, maximum: number = config.maximumTextLength) =>
  typeof value === 'string' && length(value) <= maximum && !hasControlCharacters(value)
    ? value.trim() : undefined

export const normalizeLookupRequest = (
  objectClass: unknown,
  by: unknown,
  value: unknown,
): LookupRequest => {
  if (typeof value !== 'string' || hasControlCharacters(value)) {
    throw new ProviderError('Enter a valid name or exact identifier.')
  }
  const query = value.trim()
  if (objectClass === 'ships') {
    if (by === 'position') {
      if (parseMarineMmsi(query) !== undefined) return { objectClass, by, query }
      throw new ProviderError('This identity does not have a supported nine-digit ship MMSI.')
    }
    if (by === 'name' && length(query) >= 2 && length(query) <= config.maximumQueryLength) {
      return { objectClass, by, query }
    }
    if (by === 'mmsi' && /^\d{9}$/.test(query) && Number(query) > 0) {
      return { objectClass, by, query }
    }
    throw new ProviderError(by === 'mmsi' ? 'Enter an exact nine-digit MMSI.' :
      'Enter at least two characters of a ship name. Free exact IMO lookup is unavailable.')
  }
  if (objectClass === 'aircraft') {
    if (by === 'hex' && /^[a-f\d]{6}$/i.test(query)) {
      return { objectClass, by, query: query.toLowerCase() }
    }
    if (by === 'reg' && /^[a-z\d][a-z\d-]{0,15}$/i.test(query)) {
      return { objectClass, by, query: query.toUpperCase() }
    }
    if (by === 'callsign' && /^[a-z\d]{1,8}$/i.test(query)) {
      return { objectClass, by, query: query.toUpperCase() }
    }
    throw new ProviderError(by === 'hex' ? 'Enter an exact six-character ICAO24.' :
      by === 'reg' ? 'Enter an exact registration, including its hyphen.' :
        'Enter an exact callsign of up to eight letters or digits.')
  }
  throw new ProviderError('Choose an aircraft or ship lookup.')
}

const finish = (
  request: LookupRequest,
  values: readonly unknown[],
  retrievedAt: number,
  truncated: boolean,
  parse: (value: unknown) => DiscoveryMatch | undefined,
): DiscoveryResponse => {
  if (values.length > config.maximumSourceRecords) throw invalid()
  const matches: DiscoveryMatch[] = []
  const keys = new Set<string>()
  let rejectedRecords = 0
  for (const value of values) {
    const match = parse(value)
    if (!match || keys.has(match.key)) {
      rejectedRecords += 1
      continue
    }
    keys.add(match.key)
    matches.push(match)
  }
  if (values.length > 0 && matches.length === 0) throw invalid()
  return {
    objectClass: request.objectClass, retrievedAt,
    matches: matches.slice(0, config.maximumResults),
    truncated: truncated || matches.length > config.maximumResults,
    rejectedRecords,
  }
}

export const normalizeAircraftLookup = (
  value: unknown,
  request: Extract<LookupRequest, { objectClass: 'aircraft' }>,
  retrievedAt: number,
): DiscoveryResponse => {
  if (!isRecord(value) || !Array.isArray(value.ac) ||
    !validTime(value.now) || value.now > retrievedAt + config.futureToleranceMs ||
    value.total !== value.ac.length || (value.msg !== undefined && value.msg !== 'No error')) throw invalid()
  const snapshotAt = value.now
  return finish(request, value.ac, retrievedAt, false, (record) => {
    if (!isRecord(record) || typeof record.hex !== 'string' || !/^[a-f\d]{6}$/i.test(record.hex) ||
      typeof record.seen !== 'number' || !Number.isFinite(record.seen) || record.seen < 0) return undefined
    const icao24 = record.hex.toLowerCase()
    const registration = record.r === undefined || record.r === null ? undefined : text(record.r)
    const callsign = record.flight === undefined || record.flight === null ? undefined : text(record.flight)
    if ((record.r != null && registration === undefined) ||
      (record.flight != null && callsign === undefined)) return undefined
    if (request.by === 'hex' && icao24 !== request.query ||
      request.by === 'reg' && registration?.toUpperCase() !== request.query ||
      request.by === 'callsign' && callsign?.toUpperCase() !== request.query) return undefined
    const positionAgeSeconds = record.seen_pos
    const positionAt = typeof positionAgeSeconds === 'number' && Number.isFinite(positionAgeSeconds) &&
      positionAgeSeconds >= 0 ? snapshotAt - positionAgeSeconds * 1_000 : undefined
    const location = typeof record.lat === 'number' && typeof record.lon === 'number' &&
      isValidCoordinate(record.lat, record.lon) &&
      positionAt !== undefined && validTime(positionAt) &&
      retrievedAt - snapshotAt <= config.maximumAircraftSnapshotAgeMs &&
      retrievedAt - positionAt <= config.maximumAircraftPositionAgeMs
      ? { latitude: record.lat, longitude: record.lon, reportedAt: positionAt } : null
    const metadataAt = snapshotAt - record.seen * 1_000
    return {
      objectClass: 'aircraft', key: `adsb-lol:${icao24}`,
      name: callsign || registration || undefined,
      identifiers: { icao24, registration: registration || undefined, callsign: callsign || undefined },
      source: { name: 'ADSB.lol', code: 'ADSB.lol', credit: 'ADSB.lol · ODbL 1.0' },
      metadataReportedAt: validTime(metadataAt) ? metadataAt : null,
      location,
    }
  })
}

export const normalizeShipLookup = (
  value: unknown,
  request: Extract<LookupRequest, { objectClass: 'ships' }>,
  retrievedAt: number,
): DiscoveryResponse => {
  if (request.by === 'position' || !isRecord(value) || !isRecord(value.attribution) ||
    request.by === 'name' && (value.type !== 'FeatureCollection' || !Array.isArray(value.features)) ||
    request.by === 'mmsi' && value.type !== 'Feature' ||
    value.truncated !== undefined && typeof value.truncated !== 'boolean') throw invalid()
  const attribution = value.attribution
  const sourceRecords: readonly unknown[] = request.by === 'name' && Array.isArray(value.features) ? value.features : [value]
  if (sourceRecords.length > config.maximumSourceRecords) throw invalid()
  const records = sourceRecords.filter((feature) => !(isRecord(feature) && isRecord(feature.properties) &&
    ['aton', 'base', 'sar', 'gear'].includes(String(feature.properties.kind))))
  return finish(request, records, retrievedAt, value.truncated === true, (feature) => {
    if (!isRecord(feature) || feature.type !== 'Feature' || !isRecord(feature.properties)) return undefined
    const properties = feature.properties
    if (properties.kind !== 'vessel') return undefined
    const mmsiNumber = properties.mmsi
    if (typeof mmsiNumber !== 'number' || !Number.isSafeInteger(mmsiNumber) ||
      mmsiNumber <= 0 || mmsiNumber > 999_999_999 || feature.id !== mmsiNumber) return undefined
    const mmsi = String(mmsiNumber).padStart(9, '0')
    if (request.by === 'mmsi' && mmsi !== request.query) return undefined
    const source = text(properties.source)
    if (!source) return undefined
    const credit = text(attribution[source.split(':')[0]!], config.maximumCreditLength)
    if (!credit || typeof properties.seen !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(properties.seen)) return undefined
    const metadataReportedAt = Date.parse(properties.seen)
    if (!validTime(metadataReportedAt) || metadataReportedAt > retrievedAt + config.futureToleranceMs) return undefined
    const name = properties.name === undefined ? undefined : text(properties.name)
    const callsign = properties.callsign === undefined ? undefined : text(properties.callsign)
    const imo = properties.imo
    if (properties.name !== undefined && name === undefined ||
      properties.callsign !== undefined && callsign === undefined ||
      imo !== undefined && (typeof imo !== 'number' || !Number.isSafeInteger(imo) || imo <= 0 || imo > 9_999_999)) return undefined
    return {
      objectClass: 'ships', key: `open-waters:${mmsi}`, name: name || undefined,
      identifiers: { mmsi, imo: typeof imo === 'number' ? String(imo) : undefined, callsign: callsign || undefined },
      source: { name: 'Open Waters AIS', code: source, credit },
      metadataReportedAt,
      location: null,
    }
  })
}

export const normalizeShipPositionLookup = (
  value: unknown,
  request: Extract<LookupRequest, { objectClass: 'ships' }>,
  from: number,
  to: number,
  retrievedAt: number,
): DiscoveryResponse => {
  const mmsi = parseMarineMmsi(request.query)
  if (request.by !== 'position' || mmsi === undefined || !isRecord(value) || value.type !== 'Feature' ||
    value.id !== mmsi || !isRecord(value.properties) ||
    !isRecord(value.attribution)) throw invalid()
  const properties = value.properties
  const actualFrom = parseMarineTimestamp(properties.from)
  const actualTo = parseMarineTimestamp(properties.to)
  const count = properties.points
  if (properties.mmsi !== value.id || count !== 0 && count !== 1 ||
    properties.interval !== 0 || typeof properties.truncated !== 'boolean' ||
    actualFrom === undefined || actualTo === undefined ||
    actualFrom !== from || actualTo !== to || actualFrom > actualTo ||
    !Array.isArray(properties.times) || properties.times.length !== count ||
    !validTime(retrievedAt) || to > retrievedAt + config.futureToleranceMs) throw invalid()
  const entries = Object.entries(value.attribution)
  if (entries.length > config.shipPositionMaximumCredits || entries.some(([key, credit]) =>
    !/^[a-z][a-z\d_-]{0,63}$/.test(key) || typeof credit !== 'string' ||
    !credit.trim() || text(credit, config.maximumCreditLength) === undefined)) throw invalid()
  const credit = entries.map(([, value]) => String(value).trim()).join(' · ')
  if (length(credit) > config.maximumCreditLength) throw invalid()
  const result: DiscoveryResponse = {
    objectClass: 'ships', retrievedAt, matches: [], truncated: false, rejectedRecords: 0,
  }
  if (count === 0) {
    if (value.geometry !== null || properties.truncated) throw invalid()
    return result
  }
  const geometry = value.geometry
  const reportedAt = parseMarineTimestamp(properties.times[0])
  if (!credit || !isRecord(geometry) || geometry.type !== 'Point' ||
    !Array.isArray(geometry.coordinates) || geometry.coordinates.length !== 2 ||
    typeof geometry.coordinates[0] !== 'number' || typeof geometry.coordinates[1] !== 'number' ||
    !isValidCoordinate(geometry.coordinates[1], geometry.coordinates[0]) ||
    reportedAt === undefined || reportedAt < actualFrom || reportedAt > actualTo) throw invalid()
  return {
    ...result,
    matches: [{
      objectClass: 'ships', key: `open-waters:${request.query}`,
      identifiers: { mmsi: request.query }, metadataReportedAt: null,
      source: { name: 'Open Waters AIS', code: SHIP_POSITION_SOURCE, credit },
      location: { longitude: geometry.coordinates[0], latitude: geometry.coordinates[1], reportedAt },
    }],
  }
}

export const validateDiscoveryResponse = (
  value: unknown,
  request: LookupRequest,
  receivedAt = Date.now(),
): DiscoveryResponse => {
  if (!isRecord(value) || value.objectClass !== request.objectClass || !validTime(value.retrievedAt) ||
    value.retrievedAt > receivedAt + config.futureToleranceMs ||
    !Array.isArray(value.matches) || value.matches.length > config.maximumResults ||
    typeof value.truncated !== 'boolean' || typeof value.rejectedRecords !== 'number' ||
    !Number.isInteger(value.rejectedRecords) || value.rejectedRecords < 0 ||
    value.rejectedRecords > config.maximumSourceRecords) throw invalid()
  const shipPosition = request.objectClass === 'ships' && request.by === 'position'
  if (shipPosition && (value.matches.length > 1 || value.truncated || value.rejectedRecords !== 0)) throw invalid()
  const matches: DiscoveryMatch[] = []
  const keys = new Set<string>()
  for (const match of value.matches) {
    if (!isRecord(match) || match.objectClass !== request.objectClass || !isRecord(match.identifiers) ||
      !isRecord(match.source) || typeof match.key !== 'string' || !text(match.key) || keys.has(match.key) ||
      match.name !== undefined && text(match.name) === undefined ||
      match.metadataReportedAt !== null && !validTime(match.metadataReportedAt) ||
      typeof match.metadataReportedAt === 'number' && match.metadataReportedAt > value.retrievedAt + config.futureToleranceMs ||
      typeof match.metadataReportedAt === 'number' && match.metadataReportedAt > receivedAt + config.futureToleranceMs ||
      typeof match.source.code !== 'string' || !text(match.source.code) ||
      typeof match.source.credit !== 'string' || !text(match.source.credit, config.maximumCreditLength)) throw invalid()
    const ids = match.identifiers
    for (const field of Object.values(ids)) {
      if (field !== undefined && (typeof field !== 'string' || !text(field))) throw invalid()
    }
    if (request.objectClass === 'ships') {
      if (match.source.name !== 'Open Waters AIS' || typeof ids.mmsi !== 'string' ||
        !/^\d{9}$/.test(ids.mmsi) || Number(ids.mmsi) === 0 ||
        match.key !== `open-waters:${ids.mmsi}` ||
        (shipPosition
          ? ids.mmsi !== request.query || parseMarineMmsi(ids.mmsi) === undefined ||
            match.location === null || match.source.code !== SHIP_POSITION_SOURCE || match.metadataReportedAt !== null
          : match.location !== null) ||
        request.by === 'mmsi' && ids.mmsi !== request.query ||
        ids.icao24 !== undefined || ids.registration !== undefined) throw invalid()
    } else if (match.source.name !== 'ADSB.lol' || typeof ids.icao24 !== 'string' ||
      !/^[a-f\d]{6}$/.test(ids.icao24) || match.key !== `adsb-lol:${ids.icao24}` ||
      request.by === 'hex' && ids.icao24 !== request.query ||
      request.by === 'reg' && (typeof ids.registration !== 'string' || ids.registration.toUpperCase() !== request.query) ||
      request.by === 'callsign' && (typeof ids.callsign !== 'string' || ids.callsign.toUpperCase() !== request.query) ||
      ids.mmsi !== undefined || ids.imo !== undefined) throw invalid()
    let location: DiscoveryMatch['location'] = null
    if (match.location !== null) {
      if (!isRecord(match.location) || typeof match.location.latitude !== 'number' ||
        typeof match.location.longitude !== 'number' ||
        !isValidCoordinate(match.location.latitude, match.location.longitude) ||
        !validTime(match.location.reportedAt) ||
        match.location.reportedAt > value.retrievedAt + config.futureToleranceMs ||
        match.location.reportedAt > receivedAt + config.futureToleranceMs ||
        value.retrievedAt - match.location.reportedAt >
          (shipPosition ? config.shipPositionWindowMs : config.maximumAircraftPositionAgeMs)) throw invalid()
      location = {
        latitude: match.location.latitude,
        longitude: match.location.longitude,
        reportedAt: match.location.reportedAt,
      }
    }
    keys.add(match.key)
    matches.push({
      objectClass: request.objectClass, key: match.key,
      name: typeof match.name === 'string' ? match.name : undefined,
      identifiers: {
        icao24: typeof ids.icao24 === 'string' ? ids.icao24 : undefined,
        registration: typeof ids.registration === 'string' ? ids.registration : undefined,
        callsign: typeof ids.callsign === 'string' ? ids.callsign : undefined,
        mmsi: typeof ids.mmsi === 'string' ? ids.mmsi : undefined,
        imo: typeof ids.imo === 'string' ? ids.imo : undefined,
      },
      source: {
        name: request.objectClass === 'ships' ? 'Open Waters AIS' : 'ADSB.lol',
        code: match.source.code,
        credit: match.source.credit,
      },
      metadataReportedAt: match.metadataReportedAt,
      location,
    })
  }
  return {
    objectClass: request.objectClass, retrievedAt: value.retrievedAt,
    matches, truncated: value.truncated, rejectedRecords: value.rejectedRecords,
  }
}
