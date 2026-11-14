import { GtfsDecodeError } from './gtfsRealtime.js'

export interface ElronProxyVehicle {
  id: string
  trainNumber: string
  route?: string
  latitude: number
  longitude: number
  bearing?: number
  speedKph?: number
  delayMinutes?: number
  lastStop?: string
  scheduledDepartureAt?: string
  scheduledArrivalAt?: string
  observedAt: string
}

const MAXIMUM_TRAINS = 200
const MAXIMUM_TEXT = 80
const TIME_ZONE = 'Europe/Tallinn'
const DAY_MS = 86_400_000

const zoneFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

const zoneOffsetMs = (instant: number) => {
  const parts = Object.fromEntries(
    zoneFormat.formatToParts(instant).map(({ type, value }) => [type, Number(value)]),
  )
  const wall = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!)
  return wall - Math.floor(instant / 1_000) * 1_000
}

/** Converts a Tallinn wall-clock time to UTC, settling DST boundaries in two passes. */
export const tallinnWallClockToUtc = (wall: number) => {
  const first = wall - zoneOffsetMs(wall)
  const second = wall - zoneOffsetMs(first)
  return second
}

const text = (value: unknown) => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  // eslint-disable-next-line no-control-regex
  if (!trimmed || trimmed.length > MAXIMUM_TEXT || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    return undefined
  }
  return trimmed
}

const decimal = (value: unknown) => {
  const raw = text(value)
  if (!raw || !/^-?\d{1,4}(?:\.\d{1,8})?$/.test(raw)) return undefined
  return Number(raw)
}

const clockMinutes = (value: unknown) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text(value) ?? '')
  if (!match) return undefined
  const hours = Number(match[1])
  const minutes = Number(match[2])
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : undefined
}

const round = (value: number, digits: number) => Number(value.toFixed(digits))

const isoDay = (wall: number) => new Date(wall).toISOString().slice(0, 10)

const decodeTrain = (record: unknown): ElronProxyVehicle | undefined => {
  if (typeof record !== 'object' || record === null || Array.isArray(record)) return undefined
  const train = record as Record<string, unknown>
  const trainNumber = text(train.reis)
  if (!trainNumber || !/^\d{1,5}$/.test(trainNumber)) return undefined
  const latitude = decimal(train.latitude)
  const longitude = decimal(train.longitude)
  if (latitude === undefined || longitude === undefined ||
    latitude < 57 || latitude > 60.5 || longitude < 21 || longitude > 28.5) return undefined
  const observed = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(text(train.asukoha_uuendus) ?? '')
  if (!observed) return undefined
  const [year, month, day, hour, minute, second] = observed.slice(1).map(Number) as
    [number, number, number, number, number, number]
  const observedWall = Date.UTC(year, month - 1, day, hour, minute, second)
  if (new Date(observedWall).getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) {
    return undefined
  }
  const observedDay = Date.UTC(year, month - 1, day)
  const start = clockMinutes(train.reisi_algus_aeg)
  const end = clockMinutes(train.reisi_lopp_aeg)
  // A journey that starts much "later" in the day than its observation began the day before.
  const serviceDay = start !== undefined && start - (hour * 60 + minute) > 12 * 60
    ? observedDay - DAY_MS : observedDay
  const departureWall = start !== undefined ? serviceDay + start * 60_000 : undefined
  const arrivalWall = end !== undefined
    ? serviceDay + end * 60_000 + (start !== undefined && end < start ? DAY_MS : 0)
    : undefined
  const speed = decimal(train.kiirus)
  const bearing = decimal(train.rongi_suund)
  const delay = decimal(train.erinevus_plaanist)
  const route = text(train.liin)
  const lastStop = text(train.viimane_peatus)
  return {
    id: `${isoDay(serviceDay)}:${trainNumber}`,
    trainNumber,
    ...(route ? { route } : {}),
    latitude: round(latitude, 5),
    longitude: round(longitude, 5),
    ...(bearing !== undefined && bearing >= 0 && bearing <= 360
      ? { bearing: round(bearing % 360, 1) } : {}),
    ...(speed !== undefined && speed >= 0 && speed <= 250 ? { speedKph: Math.round(speed) } : {}),
    ...(delay !== undefined && Number.isInteger(delay) && Math.abs(delay) <= 720
      ? { delayMinutes: delay } : {}),
    ...(lastStop ? { lastStop } : {}),
    ...(departureWall !== undefined
      ? { scheduledDepartureAt: new Date(tallinnWallClockToUtc(departureWall)).toISOString() } : {}),
    ...(arrivalWall !== undefined
      ? { scheduledArrivalAt: new Date(tallinnWallClockToUtc(arrivalWall)).toISOString() } : {}),
    observedAt: new Date(tallinnWallClockToUtc(observedWall)).toISOString(),
  }
}

export const decodeElronMapFeed = (body: Uint8Array): ElronProxyVehicle[] => {
  let payload: unknown
  try {
    payload = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(body))
  } catch {
    throw new GtfsDecodeError('Elron map feed is not valid JSON')
  }
  if (typeof payload !== 'object' || payload === null || !Array.isArray((payload as { data?: unknown }).data)) {
    throw new GtfsDecodeError('Elron map feed has no train list')
  }
  const data = (payload as { data: unknown[] }).data
  if (data.length > MAXIMUM_TRAINS) throw new GtfsDecodeError('Elron map feed has too many trains')
  const newest = new Map<string, ElronProxyVehicle>()
  for (const record of data) {
    const train = decodeTrain(record)
    const current = train && newest.get(train.id)
    if (train && (!current || train.observedAt > current.observedAt)) newest.set(train.id, train)
  }
  return [...newest.values()]
}
