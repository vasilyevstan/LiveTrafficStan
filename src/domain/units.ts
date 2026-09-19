export const UNIT_SYSTEMS = ['metric', 'aviation-nautical'] as const

export type UnitSystem = (typeof UNIT_SYSTEMS)[number]

export const DEFAULT_UNIT_SYSTEM: UnitSystem = 'metric'

export const KILOMETERS_PER_NAUTICAL_MILE = 1.852
export const KILOMETERS_PER_STATUTE_MILE = 1.609344
export const METERS_PER_FOOT = 0.3048

export const isUnitSystem = (value: unknown): value is UnitSystem =>
  UNIT_SYSTEMS.includes(value as UnitSystem)

export const metersToFeet = (meters: number) => meters / METERS_PER_FOOT

export const kilometersPerHourToKnots = (kilometersPerHour: number) =>
  kilometersPerHour / KILOMETERS_PER_NAUTICAL_MILE

export const knotsToKilometersPerHour = (knots: number) =>
  knots * KILOMETERS_PER_NAUTICAL_MILE

export const metersPerSecondToFeetPerMinute = (
  metersPerSecond: number,
) => metersToFeet(metersPerSecond) * 60

export const statuteMilesToKilometers = (statuteMiles: number) =>
  statuteMiles * KILOMETERS_PER_STATUTE_MILE

export const kilometersToStatuteMiles = (kilometers: number) =>
  kilometers / KILOMETERS_PER_STATUTE_MILE
