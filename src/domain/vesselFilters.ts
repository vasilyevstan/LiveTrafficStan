import type {
  Vessel,
  VesselCategory,
  VesselNavigationCategory,
} from './traffic'
import type { UnitSystem } from './units'

export const ONE_KNOT_KPH = 1.852
export const VESSEL_SEARCH_MAX_LENGTH = 64
export const VESSEL_RESULT_LIMIT = 20
export const VESSEL_MINIMUM_LENGTH_OPTIONS = [0, 25, 50, 100, 150] as const
export const VESSEL_MAXIMUM_LENGTH_OPTIONS = [null, 24, 49, 99, 149] as const

export type VesselCategoryFilter = 'all' | VesselCategory
export type VesselNavigationFilter = 'all' | VesselNavigationCategory
export type VesselReportedSpeedFilter =
  | 'all'
  | 'under-one-knot'
  | 'one-knot-or-more'
  | 'unknown'
export type VesselMinimumLength =
  (typeof VESSEL_MINIMUM_LENGTH_OPTIONS)[number]
export type VesselMaximumLength =
  (typeof VESSEL_MAXIMUM_LENGTH_OPTIONS)[number]

export interface VesselFilterState {
  query: string
  category: VesselCategoryFilter
  navigation: VesselNavigationFilter
  reportedSpeed: VesselReportedSpeedFilter
  minimumLengthMeters: VesselMinimumLength
  maximumLengthMeters: VesselMaximumLength
  includeUnknownLength: boolean
}

export const DEFAULT_VESSEL_FILTERS: VesselFilterState = {
  query: '',
  category: 'all',
  navigation: 'all',
  reportedSpeed: 'all',
  minimumLengthMeters: 50,
  maximumLengthMeters: null,
  includeUnknownLength: false,
}

export const VESSEL_CATEGORY_LABELS: Record<VesselCategoryFilter, string> = {
  all: 'All vessel types',
  cargo: 'Cargo',
  tanker: 'Tanker',
  passenger: 'Passenger',
  fishing: 'Fishing',
  'tug-service': 'Tug and service',
  other: 'Other known type',
  unknown: 'Unknown type',
}

export const VESSEL_NAVIGATION_LABELS: Record<
  VesselNavigationFilter,
  string
> = {
  all: 'All navigation states',
  underway: 'Under way',
  anchored: 'At anchor',
  moored: 'Moored',
  restricted: 'Restricted or not under command',
  aground: 'Aground',
  fishing: 'Engaged in fishing',
  other: 'Other reported status',
  unknown: 'Unknown status',
}

export const VESSEL_REPORTED_SPEED_LABELS: Record<
  VesselReportedSpeedFilter,
  string
> = {
  all: 'Any reported speed',
  'under-one-knot': 'Below 1 kn',
  'one-knot-or-more': '1 kn or faster',
  unknown: 'Unknown speed',
}

export const vesselReportedSpeedLabels = (
  units: UnitSystem,
): Record<VesselReportedSpeedFilter, string> =>
  units === 'aviation-nautical'
    ? VESSEL_REPORTED_SPEED_LABELS
    : {
        all: 'Any reported speed',
        'under-one-knot': 'Below 1.9 km/h',
        'one-knot-or-more': '1.9 km/h or faster',
        unknown: 'Unknown speed',
      }

export const isVesselCategoryFilter = (
  value: unknown,
): value is VesselCategoryFilter =>
  typeof value === 'string' &&
  Object.prototype.hasOwnProperty.call(VESSEL_CATEGORY_LABELS, value)

export const isVesselNavigationFilter = (
  value: unknown,
): value is VesselNavigationFilter =>
  typeof value === 'string' &&
  Object.prototype.hasOwnProperty.call(VESSEL_NAVIGATION_LABELS, value)

export const isVesselReportedSpeedFilter = (
  value: unknown,
): value is VesselReportedSpeedFilter =>
  typeof value === 'string' &&
  Object.prototype.hasOwnProperty.call(
    VESSEL_REPORTED_SPEED_LABELS,
    value,
  )

export const isVesselMinimumLength = (
  value: unknown,
): value is VesselMinimumLength =>
  VESSEL_MINIMUM_LENGTH_OPTIONS.includes(value as VesselMinimumLength)

export const isVesselMaximumLength = (
  value: unknown,
): value is VesselMaximumLength =>
  VESSEL_MAXIMUM_LENGTH_OPTIONS.includes(value as VesselMaximumLength)

export const normalizeVesselSearchQuery = (query: string) =>
  query.trim().replace(/\s+/g, ' ').toUpperCase()

const normalizedSearchValue = (value: string | undefined) =>
  value?.trim().replace(/\s+/g, ' ').toUpperCase()

const searchRank = (vessel: Vessel, normalizedQuery: string) => {
  if (!normalizedQuery) return 0

  const identifiers = [
    vessel.mmsi.toString(),
    vessel.imo?.toString(),
  ].filter((value): value is string => Boolean(value))
  if (identifiers.some((value) => value === normalizedQuery)) return 0

  const textValues = [
    normalizedSearchValue(vessel.name),
    normalizedSearchValue(vessel.callSign),
  ].filter((value): value is string => Boolean(value))
  if (textValues.some((value) => value.startsWith(normalizedQuery))) return 1

  return 2
}

const matchesSearch = (vessel: Vessel, normalizedQuery: string) => {
  if (!normalizedQuery) return true

  return [
    normalizedSearchValue(vessel.name),
    normalizedSearchValue(vessel.callSign),
    vessel.mmsi.toString(),
    vessel.imo?.toString(),
  ].some((value) => value?.includes(normalizedQuery))
}

const matchesReportedSpeed = (
  vessel: Vessel,
  filter: VesselReportedSpeedFilter,
) => {
  if (filter === 'all') return true
  if (filter === 'unknown') return vessel.speedKph === undefined
  if (vessel.speedKph === undefined) return false
  if (filter === 'under-one-knot') return vessel.speedKph < ONE_KNOT_KPH
  return vessel.speedKph >= ONE_KNOT_KPH
}

const matchesLength = (
  vessel: Vessel,
  filters: Pick<
    VesselFilterState,
    | 'minimumLengthMeters'
    | 'maximumLengthMeters'
    | 'includeUnknownLength'
  >,
) => {
  if (vessel.lengthMeters === undefined) {
    return filters.includeUnknownLength
  }
  if (vessel.lengthMeters < filters.minimumLengthMeters) return false
  return (
    filters.maximumLengthMeters === null ||
    vessel.lengthMeters <= filters.maximumLengthMeters
  )
}

export const matchesVesselFilters = (
  vessel: Vessel,
  filters: VesselFilterState,
) => {
  const normalizedQuery = normalizeVesselSearchQuery(filters.query)
  return (
    matchesSearch(vessel, normalizedQuery) &&
    (filters.category === 'all' ||
      vessel.vesselCategory === filters.category) &&
    (filters.navigation === 'all' ||
      vessel.navigationCategory === filters.navigation) &&
    matchesReportedSpeed(vessel, filters.reportedSpeed) &&
    matchesLength(vessel, filters)
  )
}

export const filterVessels = <T extends Vessel>(
  vessels: readonly T[],
  filters: VesselFilterState,
) => vessels.filter((vessel) => matchesVesselFilters(vessel, filters))

export const orderVesselSearchResults = <T extends Vessel>(
  vessels: readonly T[],
  query: string,
) => {
  const normalizedQuery = normalizeVesselSearchQuery(query)
  if (!normalizedQuery) return [...vessels]

  return vessels
    .map((vessel, index) => ({
      vessel,
      index,
      rank: searchRank(vessel, normalizedQuery),
    }))
    .sort(
      (first, second) =>
        first.rank - second.rank || first.index - second.index,
    )
    .map(({ vessel }) => vessel)
}

export const withMinimumVesselLength = (
  filters: VesselFilterState,
  minimumLengthMeters: VesselMinimumLength,
): VesselFilterState => ({
  ...filters,
  minimumLengthMeters,
  maximumLengthMeters:
    filters.maximumLengthMeters !== null &&
    filters.maximumLengthMeters < minimumLengthMeters
      ? null
      : filters.maximumLengthMeters,
})

export const isDefaultVesselFilters = (filters: VesselFilterState) =>
  filters.query === DEFAULT_VESSEL_FILTERS.query &&
  filters.category === DEFAULT_VESSEL_FILTERS.category &&
  filters.navigation === DEFAULT_VESSEL_FILTERS.navigation &&
  filters.reportedSpeed === DEFAULT_VESSEL_FILTERS.reportedSpeed &&
  filters.minimumLengthMeters ===
    DEFAULT_VESSEL_FILTERS.minimumLengthMeters &&
  filters.maximumLengthMeters ===
    DEFAULT_VESSEL_FILTERS.maximumLengthMeters &&
  filters.includeUnknownLength ===
    DEFAULT_VESSEL_FILTERS.includeUnknownLength

export const vesselFilterSummary = (
  filters: VesselFilterState,
  units: UnitSystem = 'metric',
) => {
  const criteria = [
    filters.minimumLengthMeters === 0
      ? 'no minimum length'
      : `${filters.minimumLengthMeters} m or longer`,
  ]
  if (filters.maximumLengthMeters !== null) {
    criteria.push(`${filters.maximumLengthMeters} m maximum`)
  }
  criteria.push(
    filters.includeUnknownLength
      ? 'unknown length included'
      : 'unknown length hidden',
  )
  if (filters.category !== 'all') {
    criteria.push(VESSEL_CATEGORY_LABELS[filters.category].toLowerCase())
  }
  if (filters.navigation !== 'all') {
    criteria.push(VESSEL_NAVIGATION_LABELS[filters.navigation].toLowerCase())
  }
  if (filters.reportedSpeed !== 'all') {
    criteria.push(
      vesselReportedSpeedLabels(units)[
        filters.reportedSpeed
      ].toLowerCase(),
    )
  }
  return criteria.join(' · ')
}
