import type { Aircraft } from './traffic'

export const AIRCRAFT_SEARCH_MAX_LENGTH = 64
export const AIRCRAFT_RESULT_LIMIT = 20

export const normalizeAircraftSearchQuery = (query: string) =>
  query.trim().replace(/\s+/g, ' ').toUpperCase()

const normalizedSearchValue = (value: string | undefined) =>
  value?.trim().replace(/\s+/g, ' ').toUpperCase()

const searchValues = (aircraft: Aircraft) =>
  [
    normalizedSearchValue(aircraft.callsign),
    normalizedSearchValue(aircraft.registration),
    normalizedSearchValue(aircraft.hex),
    normalizedSearchValue(aircraft.aircraftType),
  ].filter((value): value is string => Boolean(value))

const searchRank = (aircraft: Aircraft, normalizedQuery: string) => {
  const values = searchValues(aircraft)
  if (values.some((value) => value === normalizedQuery)) return 0
  if (values.some((value) => value.startsWith(normalizedQuery))) return 1
  return 2
}

export const orderAircraftSearchResults = <T extends Aircraft>(
  aircraft: readonly T[],
  query: string,
) => {
  const normalizedQuery = normalizeAircraftSearchQuery(query)
  if (!normalizedQuery) return [...aircraft]

  return aircraft
    .map((entity, index) => ({
      entity,
      index,
      values: searchValues(entity),
    }))
    .filter(({ values }) =>
      values.some((value) => value.includes(normalizedQuery)),
    )
    .map(({ entity, index }) => ({
      entity,
      index,
      rank: searchRank(entity, normalizedQuery),
    }))
    .sort(
      (first, second) =>
        first.rank - second.rank || first.index - second.index,
    )
    .map(({ entity }) => entity)
}
