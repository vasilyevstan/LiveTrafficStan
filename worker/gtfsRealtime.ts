import { hasControlCharacters } from '../src/providers/guards.js'
/**
 * Minimal, bounded GTFS-Realtime decoder for VehiclePosition entities only.
 * Field numbers follow gtfs-realtime.proto; unknown fields are skipped.
 */

export interface GtfsVehiclePosition {
  entityId: string
  vehicleId?: string
  label?: string
  tripId?: string
  routeId?: string
  latitude: number
  longitude: number
  bearing?: number
  speedMetersPerSecond?: number
  timestamp: number
}

export interface GtfsVehicleFeed {
  feedTimestamp?: number
  vehicles: GtfsVehiclePosition[]
}

export interface GtfsDecodeLimits {
  maximumEntities: number
  maximumVehicles: number
  maximumStringBytes: number
}

export class GtfsDecodeError extends Error {
  constructor(message = 'Invalid GTFS-Realtime payload') {
    super(message)
    this.name = 'GtfsDecodeError'
  }
}

interface Field {
  number: number
  wireType: number
  value: number
  bytes?: Uint8Array
}

const MAX_SAFE_TIMESTAMP = 32_503_680_000 // year 3000 in seconds

class Reader {
  private offset = 0
  private readonly bytes: Uint8Array
  constructor(bytes: Uint8Array) {
    this.bytes = bytes
  }

  get done() {
    return this.offset >= this.bytes.length
  }

  private varint() {
    let result = 0
    let multiplier = 1
    for (let index = 0; index < 10; index += 1) {
      if (this.offset >= this.bytes.length) throw new GtfsDecodeError()
      const byte = this.bytes[this.offset++]!
      result += (byte & 0x7f) * multiplier
      if ((byte & 0x80) === 0) {
        if (!Number.isSafeInteger(result)) throw new GtfsDecodeError()
        return result
      }
      multiplier *= 128
    }
    throw new GtfsDecodeError()
  }

  private take(length: number) {
    if (length < 0 || this.offset + length > this.bytes.length) {
      throw new GtfsDecodeError()
    }
    const slice = this.bytes.subarray(this.offset, this.offset + length)
    this.offset += length
    return slice
  }

  next(): Field {
    const key = this.varint()
    const number = Math.floor(key / 8)
    const wireType = key % 8
    if (number < 1) throw new GtfsDecodeError()
    switch (wireType) {
      case 0:
        return { number, wireType, value: this.varint() }
      case 1: {
        const bytes = this.take(8)
        const view = new DataView(bytes.buffer, bytes.byteOffset, 8)
        return { number, wireType, value: view.getFloat64(0, true), bytes }
      }
      case 2: {
        const bytes = this.take(this.varint())
        return { number, wireType, value: bytes.length, bytes }
      }
      case 5: {
        const bytes = this.take(4)
        const view = new DataView(bytes.buffer, bytes.byteOffset, 4)
        return { number, wireType, value: view.getFloat32(0, true), bytes }
      }
      default:
        throw new GtfsDecodeError()
    }
  }
}

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false })

const text = (field: Field, maximumBytes: number) => {
  if (field.wireType !== 2 || !field.bytes) return undefined
  if (field.bytes.length === 0 || field.bytes.length > maximumBytes) return undefined
  try {
    const value = decoder.decode(field.bytes).trim()
    return value && !hasControlCharacters(value) ? value : undefined
  } catch {
    return undefined
  }
}

const fields = (bytes: Uint8Array, visit: (field: Field) => void) => {
  const reader = new Reader(bytes)
  while (!reader.done) visit(reader.next())
}

const float32 = (field: Field) =>
  field.wireType === 5 && Number.isFinite(field.value) ? field.value : undefined

const decodeVehicle = (
  entityId: string,
  bytes: Uint8Array,
  limits: GtfsDecodeLimits,
): GtfsVehiclePosition | undefined => {
  let latitude: number | undefined
  let longitude: number | undefined
  let bearing: number | undefined
  let speed: number | undefined
  let timestamp: number | undefined
  let tripId: string | undefined
  let routeId: string | undefined
  let vehicleId: string | undefined
  let label: string | undefined
  fields(bytes, (field) => {
    if (field.number === 1 && field.bytes) {
      fields(field.bytes, (trip) => {
        if (trip.number === 1) tripId = text(trip, limits.maximumStringBytes)
        if (trip.number === 5) routeId = text(trip, limits.maximumStringBytes)
      })
    } else if (field.number === 2 && field.bytes) {
      fields(field.bytes, (position) => {
        if (position.number === 1) latitude = float32(position)
        if (position.number === 2) longitude = float32(position)
        if (position.number === 3) bearing = float32(position)
        if (position.number === 5) speed = float32(position)
      })
    } else if (field.number === 5 && field.wireType === 0) {
      timestamp = field.value
    } else if (field.number === 8 && field.bytes) {
      fields(field.bytes, (vehicle) => {
        if (vehicle.number === 1) vehicleId = text(vehicle, limits.maximumStringBytes)
        if (vehicle.number === 2) label = text(vehicle, limits.maximumStringBytes)
      })
    }
  })
  if (
    latitude === undefined ||
    longitude === undefined ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    (latitude === 0 && longitude === 0) ||
    timestamp === undefined ||
    timestamp <= 946_684_800 ||
    timestamp > MAX_SAFE_TIMESTAMP
  ) {
    return undefined
  }
  return {
    entityId,
    ...(vehicleId ? { vehicleId } : {}),
    ...(label ? { label } : {}),
    ...(tripId ? { tripId } : {}),
    ...(routeId ? { routeId } : {}),
    latitude,
    longitude,
    ...(bearing !== undefined && bearing >= 0 && bearing <= 360 ? { bearing } : {}),
    ...(speed !== undefined && speed >= 0 && speed <= 150
      ? { speedMetersPerSecond: speed }
      : {}),
    timestamp,
  }
}

export const decodeGtfsVehicleFeed = (
  bytes: Uint8Array,
  limits: GtfsDecodeLimits,
): GtfsVehicleFeed => {
  let feedTimestamp: number | undefined
  let entities = 0
  const vehicles: GtfsVehiclePosition[] = []
  fields(bytes, (field) => {
    if (field.number === 1 && field.bytes) {
      fields(field.bytes, (header) => {
        if (header.number === 3 && header.wireType === 0) feedTimestamp = header.value
      })
      return
    }
    if (field.number !== 2 || !field.bytes) return
    entities += 1
    if (entities > limits.maximumEntities) throw new GtfsDecodeError('Too many GTFS-Realtime entities')
    let entityId: string | undefined
    let deleted = false
    let vehicleBytes: Uint8Array | undefined
    fields(field.bytes, (entity) => {
      if (entity.number === 1) entityId = text(entity, limits.maximumStringBytes)
      if (entity.number === 2 && entity.wireType === 0) deleted = entity.value !== 0
      if (entity.number === 4 && entity.bytes) vehicleBytes = entity.bytes
    })
    if (!entityId || deleted || !vehicleBytes) return
    const vehicle = decodeVehicle(entityId, vehicleBytes, limits)
    if (!vehicle) return
    if (vehicles.length >= limits.maximumVehicles) {
      throw new GtfsDecodeError('Too many GTFS-Realtime vehicles')
    }
    vehicles.push(vehicle)
  })
  return {
    ...(feedTimestamp !== undefined && feedTimestamp > 0 ? { feedTimestamp } : {}),
    vehicles,
  }
}
