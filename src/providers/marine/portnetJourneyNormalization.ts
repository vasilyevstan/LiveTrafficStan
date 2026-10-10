import { JOURNEY_CONFIG as config } from '../../config/appConfig'
import { isValidCoordinate } from '../../domain/geo'
import type { MarineJourneyPort } from '../../domain/marineJourney'
import type { Vessel } from '../../domain/traffic'
import { isValidImo } from '../../domain/vesselPhotoIdentity'
import { isRecord } from '../guards'
import { parseMarineTimestamp } from './marineSourceNormalization'

export class PortnetJourneyFormatError extends Error {
  constructor() {
    super('Portnet returned invalid or oversized voyage context')
    this.name = 'PortnetJourneyFormatError'
  }
}

export interface PortnetPortReference {
  locode: string
  areaCode?: string
}

export interface PortnetJourneyLeg {
  departedAt?: number
  arrivedAt?: number
  departure?: PortnetPortReference
  destination?: PortnetPortReference
  limitations: string[]
}

interface PortnetEvent {
  port: PortnetPortReference
  previous?: string
  next?: string
  ata?: number
  atd?: number
  eta?: number
}

const locode = (value: unknown) =>
  typeof value === 'string' && /^[A-Z]{2}[A-Z0-9]{3}$/.test(value) ? value : undefined
const areaCode = (value: unknown) =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,12}$/.test(value) ? value : undefined
const portnetTime = (value: unknown) => parseMarineTimestamp(
  typeof value === 'string' ? value.replace(/(T\d{2}:\d{2})Z$/, '$1:00Z') : value,
)
const supplied = (value: unknown) => value !== undefined && value !== null && value !== ''

export const selectPortnetJourneyLeg = (
  value: unknown,
  vessel: Pick<Vessel, 'mmsi' | 'imo'>,
  reportTime: number,
): PortnetJourneyLeg => {
  if (!isRecord(value) || !Array.isArray(value.portCalls) ||
      value.portCalls.length > config.portnetMaximumCalls ||
      portnetTime(value.dataUpdatedTime) === undefined) throw new PortnetJourneyFormatError()
  const events: PortnetEvent[] = []
  let rejected = 0
  for (const call of value.portCalls) {
    if (!isRecord(call) || !Array.isArray(call.portAreaDetails) ||
        call.portAreaDetails.length > config.portnetMaximumAreas) throw new PortnetJourneyFormatError()
    const updatedAt = portnetTime(call.portCallTimestamp)
    const code = locode(call.portToVisit)
    const imo = typeof call.imoLloyds === 'number' && isValidImo(String(call.imoLloyds)) ? call.imoLloyds : undefined
    if (call.mmsi !== vessel.mmsi || (vessel.imo !== undefined && imo !== vessel.imo) ||
        !code || updatedAt === undefined || updatedAt > reportTime ||
        reportTime - updatedAt > config.marineHistoryWindowMs) {
      rejected += 1
      continue
    }
    for (const area of call.portAreaDetails) {
      if (!isRecord(area)) throw new PortnetJourneyFormatError()
      const ata = portnetTime(area.ata)
      const atd = portnetTime(area.atd)
      const eta = portnetTime(area.eta)
      const etd = portnetTime(area.etd)
      const invalidActual = (raw: unknown, time: number | undefined) =>
        supplied(raw) && (time === undefined || time > reportTime ||
          reportTime - time > config.marineHistoryWindowMs)
      const invalidEstimate = (raw: unknown, time: number | undefined) =>
        supplied(raw) && (time === undefined || time > reportTime + config.portnetEstimatedHorizonMs ||
          time < reportTime - config.marineHistoryWindowMs)
      if (invalidActual(area.ata, ata) || invalidActual(area.atd, atd) ||
          invalidEstimate(area.eta, eta) || invalidEstimate(area.etd, etd) ||
          (ata !== undefined && atd !== undefined && atd < ata) ||
          (eta !== undefined && etd !== undefined && etd < eta)) {
        rejected += 1
        continue
      }
      events.push({
        port: { locode: code, areaCode: areaCode(area.portAreaCode) },
        previous: locode(call.prevPort), next: locode(call.nextPort),
        ata, atd, eta,
      })
    }
  }
  const limitations = [
    'Portnet reports are regional and unmoderated; missing records do not establish that there is no voyage.',
  ]
  if (rejected > 0) limitations.push('Incompatible identity or implausible, old or future port-call clocks were excluded.')
  const departures = events.filter((event): event is PortnetEvent & { atd: number } => event.atd !== undefined)
    .sort((a, b) => b.atd - a.atd)
  const departure = departures[0]
  if (!departure || departures.some(event => event.atd === departure.atd &&
      (event.port.locode !== departure.port.locode || event.port.areaCode !== departure.port.areaCode || event.next !== departure.next))) {
    return { limitations: [...limitations, 'No unambiguous actual departure is available in the recent Portnet window.'] }
  }
  const laterArrivals = events.filter(event => event.ata !== undefined && event.ata > departure.atd)
  const arrived = laterArrivals.filter(event => event.port.locode === departure.next &&
    event.previous === departure.port.locode)
  if (laterArrivals.length > 0 && (arrived.length !== 1 || laterArrivals.length !== 1)) {
    return { limitations: [...limitations, 'Later arrivals make the current voyage leg ambiguous.'] }
  }
  const destinationEvents = events.filter(event => event.port.locode === departure.next &&
    event.previous === departure.port.locode &&
    ((event.eta !== undefined && event.eta >= reportTime) || event === arrived[0]))
  const destinationAreas = new Set(destinationEvents.map(event => event.port.areaCode))
  return {
    departedAt: departure.atd, arrivedAt: arrived[0]?.ata,
    departure: departure.port,
    destination: departure.next ? {
      locode: departure.next,
      areaCode: destinationAreas.size === 1 ? [...destinationAreas][0] : undefined,
    } : undefined,
    limitations: [
      ...limitations,
      'The departure clock is reported actual. The next coded port is reported context, not a confirmed future arrival.',
      ...(departure.next ? [] : ['The next coded port is unknown.']),
    ],
  }
}

export const resolvePortnetCoordinate = (
  value: unknown,
  reference: PortnetPortReference,
): MarineJourneyPort | undefined => {
  if (!isRecord(value)) throw new PortnetJourneyFormatError()
  const points = (collection: unknown, exactArea: boolean): MarineJourneyPort[] => {
    if (!isRecord(collection) || collection.type !== 'FeatureCollection' ||
        !Array.isArray(collection.features) || collection.features.length > config.portnetMaximumReferences) {
      throw new PortnetJourneyFormatError()
    }
    const found: MarineJourneyPort[] = []
    for (const feature of collection.features) {
      if (!isRecord(feature) || !isRecord(feature.properties)) throw new PortnetJourneyFormatError()
      if (feature.locode !== reference.locode || feature.properties.locode !== reference.locode ||
          (exactArea && feature.portAreaCode !== reference.areaCode)) continue
      if (feature.geometry === null) continue
      const geometry = feature.geometry
      if (!isRecord(geometry) || geometry.type !== 'Point' || !Array.isArray(geometry.coordinates) ||
          geometry.coordinates.length !== 2 || typeof geometry.coordinates[0] !== 'number' ||
          typeof geometry.coordinates[1] !== 'number' ||
          !isValidCoordinate(geometry.coordinates[1], geometry.coordinates[0])) throw new PortnetJourneyFormatError()
      found.push({
        locode: reference.locode, areaCode: exactArea ? reference.areaCode : undefined,
        longitude: geometry.coordinates[0], latitude: geometry.coordinates[1],
      })
    }
    return [...new Map(found.map(point => [`${point.longitude},${point.latitude}`, point])).values()]
  }
  const locations = points(value.ssnLocations, false)
  if (locations.length > 1) return undefined
  if (locations.length === 1) return locations[0]
  if (!reference.areaCode) return undefined
  const areas = points(value.portAreas, true)
  return areas.length === 1 ? areas[0] : undefined
}
