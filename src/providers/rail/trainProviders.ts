import {
  trainId,
  type TrainCategory,
  type TrainPosition,
  type TrainSourceDataset,
  type TrainSourceId,
} from '../../domain/trains'
import { BoundedJsonError, readBoundedJson } from '../boundedJson'
import { ProviderError, parseRetryAfterMs } from '../errors'
import {
  finiteNumber,
  hasControlCharacters,
  isRecord,
  nonEmptyString,
} from '../guards'
import { TRAIN_SOURCES } from './trainSources'

export interface TrainProviderConfig {
  timeoutMs: number
  maximumBytes: number
  maximumTrains: number
  futureToleranceMs: number
  clientName: string
  fintraffic: { endpoint: string; lookbackMs: number; timeoutMs: number }
  entur: { endpoint: string; maximumDataAge: string }
  mbta: { endpoint: string }
  lirr: { endpoint: string }
}

export type TrainFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export interface TrainProviderOptions {
  fetchImpl?: TrainFetch
  now?: () => number
  origin?: string
}

export interface TrainProvider {
  readonly sourceId: TrainSourceId
  load(signal: AbortSignal): Promise<TrainSourceDataset>
}

interface ParseContext {
  sourceId: TrainSourceId
  retrievedAt: number
  futureToleranceMs: number
  maximumTrains: number
}

const MAX_TEXT_CHARACTERS = 120
const MAX_SPEED_KPH = 400

const abortError = () =>
  new DOMException('The operation was aborted', 'AbortError')

const text = (value: unknown) => {
  const trimmed = nonEmptyString(value)
  if (!trimmed || trimmed.length > MAX_TEXT_CHARACTERS || hasControlCharacters(trimmed)) {
    return undefined
  }
  return trimmed
}

const identityText = (value: unknown) => {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return String(value)
  }
  return text(value)
}

const timestamp = (value: unknown) => {
  const raw = text(value)
  if (!raw) return undefined
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

const course = (value: unknown) => {
  const degrees = finiteNumber(value)
  if (degrees === undefined || degrees < 0 || degrees > 360) return undefined
  return degrees % 360
}

const speedKph = (value: unknown, factor = 1) => {
  const speed = finiteNumber(value)
  if (speed === undefined || speed < 0) return undefined
  const kph = speed * factor
  return kph <= MAX_SPEED_KPH ? Math.round(kph) : undefined
}

const validPosition = (
  longitude: number | undefined,
  latitude: number | undefined,
): longitude is number =>
  longitude !== undefined &&
  latitude !== undefined &&
  longitude >= -180 &&
  longitude <= 180 &&
  latitude >= -90 &&
  latitude <= 90 &&
  !(longitude === 0 && latitude === 0)

/**
 * Applies the shared invariants: valid coordinates, a source position clock no
 * later than retrieval plus tolerance, one newest report per identity, and a cap.
 */
const finalize = (
  context: ParseContext,
  candidates: Iterable<TrainPosition | undefined>,
): TrainPosition[] => {
  const newest = new Map<string, TrainPosition>()
  for (const candidate of candidates) {
    if (!candidate) continue
    if (!validPosition(candidate.longitude, candidate.latitude)) continue
    if (!Number.isFinite(candidate.observedAt)) continue
    if (candidate.observedAt > context.retrievedAt + context.futureToleranceMs) continue
    const current = newest.get(candidate.id)
    if (!current || candidate.observedAt > current.observedAt) {
      newest.set(candidate.id, candidate)
    }
  }
  if (newest.size > context.maximumTrains) {
    throw new ProviderError(`${TRAIN_SOURCES[context.sourceId].name} returned too many trains`)
  }
  return [...newest.values()]
}

const graphqlData = (payload: unknown, sourceName: string) => {
  if (!isRecord(payload)) throw new ProviderError(`${sourceName} returned an invalid response`)
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    throw new ProviderError(`${sourceName} rejected the train query`)
  }
  if (!isRecord(payload.data)) throw new ProviderError(`${sourceName} returned an invalid response`)
  return payload.data
}

const fintrafficCategory = (value: unknown): TrainCategory => {
  switch (text(value)) {
    case 'Long-distance':
      return 'long-distance'
    case 'Commuter':
      return 'commuter'
    case 'Cargo':
      return 'freight'
    default:
      return 'other'
  }
}

export const parseFintrafficTrains = (
  payload: unknown,
  context: ParseContext,
): TrainPosition[] => {
  const data = graphqlData(payload, 'Fintraffic')
  if (!Array.isArray(data.currentlyRunningTrains)) {
    throw new ProviderError('Fintraffic returned an invalid response')
  }
  return finalize(context, data.currentlyRunningTrains.map((record): TrainPosition | undefined => {
    if (!isRecord(record)) return undefined
    const trainNumber = identityText(record.trainNumber)
    const departureDate = text(record.departureDate)
    if (!trainNumber || !departureDate || !/^\d{4}-\d{2}-\d{2}$/.test(departureDate)) {
      return undefined
    }
    const locations = Array.isArray(record.trainLocations) ? record.trainLocations : []
    const location = locations[0]
    if (!isRecord(location) || !Array.isArray(location.location)) return undefined
    const longitude = finiteNumber(location.location[0])
    const latitude = finiteNumber(location.location[1])
    const observedAt = timestamp(location.timestamp)
    if (!validPosition(longitude, latitude) || latitude === undefined || observedAt === undefined) {
      return undefined
    }
    const trainType = isRecord(record.trainType) ? record.trainType : {}
    const typeName = text(trainType.name)
    const categoryRecord = isRecord(trainType.trainCategory) ? trainType.trainCategory : {}
    const operator = isRecord(record.operator) ? record.operator : {}
    const line = text(record.commuterLineid)
    const speed = speedKph(location.speed)
    const operatorName = text(operator.name) ?? text(operator.shortCode)?.toUpperCase()
    return {
      id: trainId('fintraffic', `${departureDate}:${trainNumber}`),
      sourceId: 'fintraffic',
      name: typeName ? `${typeName} ${trainNumber}` : `Train ${trainNumber}`,
      category: fintrafficCategory(categoryRecord.name),
      longitude,
      latitude,
      observedAt,
      trainNumber,
      ...(line ? { line } : {}),
      ...(operatorName ? { operator: operatorName } : {}),
      ...(speed !== undefined ? { speedKph: speed } : {}),
    }
  }))
}

export const parseEnturTrains = (
  payload: unknown,
  context: ParseContext,
): TrainPosition[] => {
  const data = graphqlData(payload, 'Entur')
  if (!Array.isArray(data.vehicles)) throw new ProviderError('Entur returned an invalid response')
  return finalize(context, data.vehicles.map((record): TrainPosition | undefined => {
    if (!isRecord(record)) return undefined
    const vehicleId = text(record.vehicleId)
    const location = isRecord(record.location) ? record.location : undefined
    const observedAt = timestamp(record.lastUpdated)
    if (!vehicleId || !location || observedAt === undefined) return undefined
    const longitude = finiteNumber(location.longitude)
    const latitude = finiteNumber(location.latitude)
    if (!validPosition(longitude, latitude) || latitude === undefined) return undefined
    const line = isRecord(record.line) ? record.line : {}
    const operator = isRecord(record.operator) ? record.operator : {}
    const publicCode = text(line.publicCode)
    const lineName = text(line.lineName)
    const trainNumber = /^(\d{1,6})-\d{4}-\d{2}-\d{2}$/.exec(vehicleId)?.[1]
    const destination = text(record.destinationName)
    const operatorName = text(operator.name)
    const bearing = course(record.bearing)
    return {
      id: trainId('entur', vehicleId),
      sourceId: 'entur',
      name: publicCode
        ? `${publicCode}${trainNumber ? ` ${trainNumber}` : ''}`
        : trainNumber ? `Train ${trainNumber}` : lineName ?? 'Train',
      category: 'passenger',
      longitude,
      latitude,
      observedAt,
      ...(trainNumber ? { trainNumber } : {}),
      ...(lineName ? { line: lineName } : publicCode ? { line: publicCode } : {}),
      ...(destination ? { destination } : {}),
      ...(operatorName ? { operator: operatorName } : {}),
      // Entur speed units are not documented for this field; it is not shown.
      ...(bearing !== undefined ? { courseDegrees: bearing, courseOrigin: 'reported' as const } : {}),
    }
  }))
}

const includedAttributes = (payload: Record<string, unknown>, type: string) => {
  const records = new Map<string, Record<string, unknown>>()
  if (!Array.isArray(payload.included)) return records
  for (const item of payload.included) {
    if (!isRecord(item) || item.type !== type || !isRecord(item.attributes)) continue
    const id = text(item.id)
    if (id) records.set(id, item.attributes)
  }
  return records
}

const relationshipId = (relationships: unknown, name: string) => {
  if (!isRecord(relationships)) return undefined
  const relation = relationships[name]
  if (!isRecord(relation) || !isRecord(relation.data)) return undefined
  return text(relation.data.id)
}

export const parseMbtaTrains = (
  payload: unknown,
  context: ParseContext,
): TrainPosition[] => {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new ProviderError('MBTA returned an invalid response')
  }
  const routes = includedAttributes(payload, 'route')
  const trips = includedAttributes(payload, 'trip')
  return finalize(context, payload.data.map((record): TrainPosition | undefined => {
    if (!isRecord(record) || record.type !== 'vehicle' || !isRecord(record.attributes)) {
      return undefined
    }
    const vehicleId = text(record.id)
    const attributes = record.attributes
    const longitude = finiteNumber(attributes.longitude)
    const latitude = finiteNumber(attributes.latitude)
    const observedAt = timestamp(attributes.updated_at)
    if (!vehicleId || !validPosition(longitude, latitude) || latitude === undefined || observedAt === undefined) {
      return undefined
    }
    const route = routes.get(relationshipId(record.relationships, 'route') ?? '')
    const trip = trips.get(relationshipId(record.relationships, 'trip') ?? '')
    const trainNumber = text(trip?.name)
    const line = text(route?.long_name) ?? text(route?.short_name)
    const destination = text(trip?.headsign)
    const label = text(attributes.label)
    const bearing = course(attributes.bearing)
    const speed = speedKph(attributes.speed, 3.6)
    return {
      id: trainId('mbta', vehicleId),
      sourceId: 'mbta',
      name: trainNumber ? `Train ${trainNumber}` : `Train ${label ?? vehicleId}`,
      category: 'commuter',
      longitude,
      latitude,
      observedAt,
      ...(trainNumber ? { trainNumber } : {}),
      ...(line ? { line } : {}),
      ...(destination ? { destination } : {}),
      ...(label ? { vehicleLabel: label } : {}),
      ...(speed !== undefined ? { speedKph: speed } : {}),
      ...(bearing !== undefined ? { courseDegrees: bearing, courseOrigin: 'reported' as const } : {}),
    }
  }))
}

export const parseLirrTrains = (
  payload: unknown,
  context: ParseContext,
): TrainPosition[] => {
  if (!isRecord(payload) || !Array.isArray(payload.vehicles)) {
    throw new ProviderError('LIRR returned an invalid response')
  }
  return finalize(context, payload.vehicles.map((record): TrainPosition | undefined => {
    if (!isRecord(record)) return undefined
    const vehicleId = text(record.id)
    const longitude = finiteNumber(record.longitude)
    const latitude = finiteNumber(record.latitude)
    const observedAt = timestamp(record.observedAt)
    if (!vehicleId || !validPosition(longitude, latitude) || latitude === undefined || observedAt === undefined) {
      return undefined
    }
    const tripId = text(record.tripId)
    const trainNumber = tripId ? /^[A-Z]+\d+_\d+_(\d{1,6})(?:_|$)/.exec(tripId)?.[1] : undefined
    const label = text(record.label)
    const bearing = course(record.bearing)
    const speed = speedKph(record.speedMetersPerSecond, 3.6)
    return {
      id: trainId('lirr', vehicleId),
      sourceId: 'lirr',
      name: trainNumber ? `Train ${trainNumber}` : `Train ${label ?? vehicleId}`,
      category: 'commuter',
      longitude,
      latitude,
      observedAt,
      ...(trainNumber ? { trainNumber } : {}),
      ...(label ? { vehicleLabel: label } : {}),
      ...(speed !== undefined ? { speedKph: speed } : {}),
      ...(bearing !== undefined ? { courseDegrees: bearing, courseOrigin: 'reported' as const } : {}),
    }
  }))
}

const fintrafficQuery = (since: string) => `{ currentlyRunningTrains(where: {trainLocations: {contains: {timestamp: {greaterThan: "${since}"}}}}) { trainNumber departureDate operator { shortCode name } trainType { name trainCategory { name } } commuterLineid trainLocations(orderBy: {timestamp: DESCENDING}, take: 1) { timestamp speed location } } }`

const enturQuery = (maximumDataAge: string) => `{ vehicles(mode: RAIL, maxDataAge: "${maximumDataAge}") { vehicleId lastUpdated location { latitude longitude } speed bearing line { lineName publicCode } operator { name } destinationName } }`

const MBTA_SEARCH = new URLSearchParams({
  'filter[route_type]': '2',
  'fields[vehicle]': 'latitude,longitude,bearing,speed,updated_at,label',
  include: 'route,trip',
  'fields[route]': 'long_name,short_name',
  'fields[trip]': 'headsign,name',
}).toString()

interface RequestPlan {
  url: URL
  init: RequestInit
  contentTypes: readonly string[]
  parse: (payload: unknown, context: ParseContext) => TrainPosition[]
  timeoutMs?: number
}

class HttpTrainProvider implements TrainProvider {
  readonly sourceId: TrainSourceId
  private readonly config: TrainProviderConfig
  private readonly plan: (now: number) => RequestPlan
  private readonly fetchImpl: TrainFetch
  private readonly now: () => number

  constructor(
    sourceId: TrainSourceId,
    config: TrainProviderConfig,
    plan: (now: number) => RequestPlan,
    options: TrainProviderOptions,
  ) {
    this.sourceId = sourceId
    this.config = config
    this.plan = plan
    this.fetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init))
    this.now = options.now ?? Date.now
  }

  async load(signal: AbortSignal): Promise<TrainSourceDataset> {
    if (signal.aborted) throw abortError()
    const sourceName = TRAIN_SOURCES[this.sourceId].name
    const { url, init, contentTypes, parse, timeoutMs } = this.plan(this.now())
    const controller = new AbortController()
    const handleAbort = () => controller.abort(signal.reason)
    signal.addEventListener('abort', handleAbort, { once: true })
    let timedOut = false
    const timeout = globalThis.setTimeout(() => {
      timedOut = true
      controller.abort(new Error(`${sourceName} timed out`))
    }, timeoutMs ?? this.config.timeoutMs)
    try {
      const response = await this.fetchImpl(url, {
        ...init,
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        signal: controller.signal,
      })
      if (response.status !== 200) {
        void response.body?.cancel().catch(() => undefined)
        throw new ProviderError(
          `${sourceName} returned HTTP ${response.status}`,
          response.status,
          parseRetryAfterMs(response.headers.get('Retry-After'), this.now()),
        )
      }
      const payload = await readBoundedJson(response, this.config.maximumBytes, contentTypes)
      if (controller.signal.aborted) throw abortError()
      const retrievedAt = this.now()
      return {
        sourceId: this.sourceId,
        retrievedAt,
        trains: parse(payload, {
          sourceId: this.sourceId,
          retrievedAt,
          futureToleranceMs: this.config.futureToleranceMs,
          maximumTrains: this.config.maximumTrains,
        }),
      }
    } catch (error) {
      if (signal.aborted) throw abortError()
      if (timedOut) throw new ProviderError(`${sourceName} timed out`)
      if (error instanceof BoundedJsonError) {
        throw new ProviderError(`${sourceName} returned an invalid or oversized response`)
      }
      if (error instanceof ProviderError) throw error
      throw new ProviderError(`${sourceName} is unavailable`)
    } finally {
      globalThis.clearTimeout(timeout)
      signal.removeEventListener('abort', handleAbort)
    }
  }
}

const graphqlInit = (query: string, headers: Record<string, string>): RequestInit => ({
  method: 'POST',
  headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify({ query }),
})

const sameOriginUrl = (path: string, origin: string | undefined) => {
  const browserOrigin = origin ?? (typeof location === 'undefined' ? undefined : location.origin)
  if (!browserOrigin) throw new ProviderError('LIRR requires a same-origin application endpoint')
  const applicationOrigin = new URL(browserOrigin).origin
  const url = new URL(path, applicationOrigin)
  if (url.origin !== applicationOrigin || url.search || url.hash) {
    throw new ProviderError('LIRR endpoint must remain same-origin')
  }
  return url
}

export const createTrainProviders = (
  config: TrainProviderConfig,
  options: TrainProviderOptions = {},
): Readonly<Record<TrainSourceId, TrainProvider>> => ({
  fintraffic: new HttpTrainProvider('fintraffic', config, (now) => ({
    url: new URL(config.fintraffic.endpoint),
    init: graphqlInit(
      fintrafficQuery(new Date(now - config.fintraffic.lookbackMs).toISOString()),
      { 'Digitraffic-User': config.clientName },
    ),
    contentTypes: ['application/json'],
    parse: parseFintrafficTrains,
    timeoutMs: config.fintraffic.timeoutMs,
  }), options),
  entur: new HttpTrainProvider('entur', config, () => ({
    url: new URL(config.entur.endpoint),
    init: graphqlInit(enturQuery(config.entur.maximumDataAge), {
      'ET-Client-Name': config.clientName,
    }),
    contentTypes: ['application/json'],
    parse: parseEnturTrains,
  }), options),
  mbta: new HttpTrainProvider('mbta', config, () => {
    const url = new URL(config.mbta.endpoint)
    url.search = MBTA_SEARCH
    return {
      url,
      init: { method: 'GET', headers: { Accept: 'application/vnd.api+json' } },
      contentTypes: ['application/vnd.api+json', 'application/json'],
      parse: parseMbtaTrains,
    }
  }, options),
  lirr: new HttpTrainProvider('lirr', config, () => ({
    url: sameOriginUrl(config.lirr.endpoint, options.origin),
    init: { method: 'GET', headers: { Accept: 'application/json' } },
    contentTypes: ['application/json'],
    parse: parseLirrTrains,
  }), options),
})
