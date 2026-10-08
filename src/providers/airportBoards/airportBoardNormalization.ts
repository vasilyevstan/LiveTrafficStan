import { AIRPORT_BOARD_CONFIG as config } from '../../config/airportBoardConfig.js'
import {
  AIRPORT_BOARD_STATUS_LABELS,
  type AirportBoardDirection,
  type AirportBoardFlight,
  type AirportBoardQuality,
  type AirportBoardSnapshot,
  type AirportBoardStatus,
  type AirportBoardTime,
} from '../../domain/airportBoard.js'
import { isRecord } from '../guards.js'

export class AirportBoardFormatError extends Error {
  constructor() {
    super('The airport provider returned an invalid board')
    this.name = 'AirportBoardFormatError'
  }
}

export const isAirportBoardIcao = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Z]{4}$/.test(value)

const invalid = (): never => { throw new AirportBoardFormatError() }
const record = (value: unknown) => isRecord(value) ? value : invalid()
const text = (value: unknown, maximum: number): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || value.length > maximum ||
    /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(value)) return invalid()
  return value.trim() || undefined
}
const requiredText = (value: unknown, maximum: number) => text(value, maximum) ?? invalid()
const timestamp = (value: unknown): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : invalid()
const isStatus = (value: unknown): value is AirportBoardStatus =>
  typeof value === 'string' && Object.hasOwn(AIRPORT_BOARD_STATUS_LABELS, value)
const isQuality = (value: unknown): value is AirportBoardQuality =>
  value === 'schedule' || value === 'live' || value === 'approximate'

const clock = (value: unknown, utcOnly = false) => {
  const input = requiredText(value, 40)
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/.exec(input)
  if (!match || (utcOnly && match[5] !== 'Z')) return invalid()
  const base = `${match[1]}T${match[2]}:${match[3] ?? '00'}.${(match[4] ?? '').padEnd(3, '0')}`
  const calendar = Date.parse(`${base}Z`)
  if (!Number.isFinite(calendar) || new Date(calendar).toISOString() !== `${base}Z`) return invalid()
  const zone = match[5]!
  let offset = 0
  if (zone !== 'Z') {
    const hours = Number(zone.slice(1, 3))
    const minutes = Number(zone.slice(4, 6))
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) return invalid()
    offset = (hours * 60 + minutes) * (zone[0] === '+' ? 1 : -1)
  }
  return { utc: calendar - offset * 60_000, local: `${base}${zone}` }
}

const providerTime = (value: unknown): AirportBoardTime | undefined => {
  if (value === undefined || value === null) return undefined
  const input = record(value)
  const utc = clock(input.utc, true)
  const local = clock(input.local)
  if (utc.utc !== local.utc) return invalid()
  return { utc: utc.utc, local: local.local }
}

const boardTime = (value: unknown): AirportBoardTime | undefined => {
  if (value === undefined || value === null) return undefined
  const input = record(value)
  const local = clock(input.local)
  if (timestamp(input.utc) !== local.utc) return invalid()
  return local
}

const otherAirport = (value: unknown): AirportBoardFlight['otherAirport'] => {
  if (value === undefined || value === null) return undefined
  const input = record(value)
  const iata = text(input.iata, 3)
  const icao = text(input.icao, 4)
  if ((iata && !/^[A-Z]{3}$/.test(iata)) || (icao && !isAirportBoardIcao(icao))) return invalid()
  return { name: requiredText(input.name, 160), iata, icao }
}

const boardFlight = (value: unknown): AirportBoardFlight => {
  const input = record(value)
  if (!isStatus(input.status) ||
    (input.codeshare !== 'operator' && input.codeshare !== 'codeshare' && input.codeshare !== 'unknown') ||
    typeof input.cargo !== 'boolean' || !Array.isArray(input.quality) ||
    input.quality.length > 3 || !input.quality.every(isQuality)) return invalid()
  return {
    number: requiredText(input.number, 32),
    airline: text(input.airline, 100),
    otherAirport: otherAirport(input.otherAirport),
    status: input.status,
    codeshare: input.codeshare,
    cargo: input.cargo,
    quality: [...new Set(input.quality)],
    scheduled: boardTime(input.scheduled),
    revised: boardTime(input.revised),
    gate: text(input.gate, 64),
    terminal: text(input.terminal, 64),
  }
}

const providerFlight = (value: unknown, direction: AirportBoardDirection) => {
  const input = record(value)
  const movement = input[direction === 'arrivals' ? 'arrival' : 'departure']
  const opposite = input[direction === 'arrivals' ? 'departure' : 'arrival']
  const current = movement === undefined || movement === null ? undefined : record(movement)
  const other = opposite === undefined || opposite === null ? undefined : record(opposite)
  if (input.movement !== undefined || (current?.quality !== undefined &&
    (!Array.isArray(current.quality) || current.quality.length > 3))) return invalid()
  const quality: AirportBoardQuality[] = []
  for (const item of current?.quality ?? []) {
    if (item === 'Basic') quality.push('schedule')
    else if (item === 'Live') quality.push('live')
    else if (item === 'Approximate') quality.push('approximate')
    else return invalid()
  }
  const codeshare = input.codeshareStatus === 'IsOperator' ? 'operator'
    : input.codeshareStatus === 'IsCodeshared' ? 'codeshare'
      : input.codeshareStatus === 'Unknown' ? 'unknown' : invalid()
  return boardFlight({
    number: input.number,
    airline: input.airline === undefined || input.airline === null
      ? undefined : record(input.airline).name,
    otherAirport: other?.airport,
    status: input.status,
    codeshare,
    cargo: input.isCargo,
    quality,
    scheduled: providerTime(current?.scheduledTime),
    revised: providerTime(current?.revisedTime),
    gate: current?.gate,
    terminal: current?.terminal,
  })
}

const flights = (
  value: unknown,
  parse: (value: unknown) => AirportBoardFlight,
): AirportBoardFlight[] | null => {
  if (value === undefined || value === null) return null
  if (!Array.isArray(value) || value.length > config.maximumFlights) return invalid()
  const unique = new Map<string, AirportBoardFlight>()
  for (const row of value) {
    const flight = parse(row)
    unique.set(JSON.stringify(flight), flight)
  }
  return [...unique.values()]
}

export const parseAirportBoardSnapshot = (
  value: unknown,
  expectedIcao: string,
): AirportBoardSnapshot => {
  const input = record(value)
  if (input.schemaVersion !== 1 || !isAirportBoardIcao(input.airportIcao) ||
    input.airportIcao !== expectedIcao) return invalid()
  const requestedAt = timestamp(input.requestedAt)
  const retrievedAt = timestamp(input.retrievedAt)
  if (retrievedAt < requestedAt || retrievedAt - requestedAt > config.upstreamTimeoutMs) return invalid()
  const arrivals = flights(input.arrivals, boardFlight)
  const departures = flights(input.departures, boardFlight)
  if ((arrivals?.length ?? 0) + (departures?.length ?? 0) > config.maximumFlights) return invalid()
  return { schemaVersion: 1, airportIcao: input.airportIcao, requestedAt, retrievedAt, arrivals, departures }
}

export const normalizeAeroDataBoxBoard = (
  value: unknown,
  airportIcao: string,
  requestedAt: number,
  retrievedAt: number,
): AirportBoardSnapshot => {
  const input = record(value)
  if (!Object.hasOwn(input, 'arrivals') && !Object.hasOwn(input, 'departures')) return invalid()
  if ((Array.isArray(input.arrivals) ? input.arrivals.length : 0) +
    (Array.isArray(input.departures) ? input.departures.length : 0) > config.maximumFlights) return invalid()
  return parseAirportBoardSnapshot({
    schemaVersion: 1,
    airportIcao,
    requestedAt,
    retrievedAt,
    arrivals: flights(input.arrivals, row => providerFlight(row, 'arrivals')),
    departures: flights(input.departures, row => providerFlight(row, 'departures')),
  }, airportIcao)
}
