import type {
  ModeledOrbitalPosition,
  OrbitalControllerState,
  OrbitalObject,
  OrbitalObjectType,
  OrbitalSourceGroup,
} from './orbital'
import {
  orbitalPointInPolygon,
  unwrapOrbitalLongitude,
  orbitalViewportSignature,
  type OrbitalViewport,
} from './orbitalViewport'

export type OrbitalTypeFilter = 'all' | OrbitalObjectType
export type OrbitalSourceGroupFilter = 'all' | OrbitalSourceGroup

export interface OrbitalDiscoveryFilters {
  objectType: OrbitalTypeFilter
  sourceGroup: OrbitalSourceGroupFilter
}

export interface OrbitalDisplayLimits {
  worldMaximumZoom: number
  midMaximumZoom: number
  worldLimit: number
  midLimit: number
  maximumRecords: number
}

export interface OrbitalDisplaySelection {
  available: boolean
  tier: 'unavailable' | 'world' | 'mid' | 'local'
  limit: number
  shownIds: readonly string[]
  shownPositions: readonly ModeledOrbitalPosition[]
  matchingShownIds: readonly string[]
  matchingShownPositions: readonly ModeledOrbitalPosition[]
  matchingPositions: readonly ModeledOrbitalPosition[]
  zoomHiddenCount: number
  selectedException: boolean
  selectedFiltered: boolean
  selectedZoomHidden: boolean
}

export interface OrbitalPopulationCounts {
  catalogCount: number
  acceptedCount: number
  modeledNowCount: number
  catalogMatchCount: number
  modeledMatchCount: number
  inFootprintCount?: number
  shownInFootprintCount?: number
  futureCrossingCount?: number
}

export const DEFAULT_ORBITAL_DISCOVERY_FILTERS: OrbitalDiscoveryFilters = {
  objectType: 'all',
  sourceGroup: 'all',
}

export const orbitalFiltersSignature = (
  filters: OrbitalDiscoveryFilters,
) => `${filters.objectType}|${filters.sourceGroup}`

export const matchesOrbitalFilters = (
  object: Pick<OrbitalObject, 'objectType' | 'sourceGroups'>,
  filters: OrbitalDiscoveryFilters,
) =>
  (filters.objectType === 'all' ||
    object.objectType === filters.objectType) &&
  (filters.sourceGroup === 'all' ||
    object.sourceGroups.includes(filters.sourceGroup))

export const normalizeOrbitalSearchText = (value: string) =>
  value.trim().toLocaleLowerCase('en-US')

type OrbitalSearchRecord = Pick<
  OrbitalObject,
  | 'name'
  | 'noradCatalogId'
  | 'internationalDesignator'
  | 'objectType'
  | 'sourceGroups'
  | 'displayOrder'
>

const searchRank = (record: OrbitalSearchRecord, query: string) => {
  if (!query) return 3
  const values = [
    normalizeOrbitalSearchText(record.name),
    record.noradCatalogId,
    normalizeOrbitalSearchText(record.internationalDesignator),
  ]
  if (values.some((value) => value === query)) return 0
  if (values.some((value) => value.startsWith(query))) return 1
  if (values.some((value) => value.includes(query))) return 2
  return undefined
}

export const discoverOrbitalCatalog = <Record extends OrbitalSearchRecord>(
  records: readonly Record[],
  query: string,
  filters: OrbitalDiscoveryFilters,
) => {
  const normalizedQuery = normalizeOrbitalSearchText(query)
  return records
    .flatMap((record) => {
      if (!matchesOrbitalFilters(record, filters)) return []
      const rank = searchRank(record, normalizedQuery)
      return rank === undefined ? [] : [{ record, rank }]
    })
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        left.record.displayOrder - right.record.displayOrder ||
        normalizeOrbitalSearchText(left.record.name).localeCompare(
          normalizeOrbitalSearchText(right.record.name),
        ) ||
        Number(left.record.noradCatalogId) -
          Number(right.record.noradCatalogId),
    )
    .map(({ record }) => record)
}

export const orbitalCatalogPage = <Value>(
  values: readonly Value[],
  requestedPage: number,
  pageSize: number,
) => {
  const pageCount = Math.max(1, Math.ceil(values.length / pageSize))
  const page = Math.min(Math.max(0, requestedPage), pageCount - 1)
  const startIndex = page * pageSize
  const rows = values.slice(startIndex, startIndex + pageSize)
  return {
    page,
    pageCount,
    rows,
    rangeStart: rows.length === 0 ? 0 : startIndex + 1,
    rangeEnd: startIndex + rows.length,
    listedRowCount: values.length,
  }
}

export const orbitalDisplayLimit = (
  zoom: number,
  limits: OrbitalDisplayLimits,
) => {
  if (zoom < limits.worldMaximumZoom) {
    return { tier: 'world' as const, limit: limits.worldLimit }
  }
  if (zoom < limits.midMaximumZoom) {
    return { tier: 'mid' as const, limit: limits.midLimit }
  }
  return { tier: 'local' as const, limit: limits.maximumRecords }
}

const displayOrderSort = (
  left: Pick<ModeledOrbitalPosition, 'displayOrder'>,
  right: Pick<ModeledOrbitalPosition, 'displayOrder'>,
) => left.displayOrder - right.displayOrder

export const selectOrbitalDisplay = (
  positions: readonly ModeledOrbitalPosition[],
  filters: OrbitalDiscoveryFilters,
  zoom: number | undefined,
  selectedId: string | null,
  limits: OrbitalDisplayLimits,
): OrbitalDisplaySelection => {
  const matchingPositions = positions
    .filter((position) => matchesOrbitalFilters(position, filters))
    .sort(displayOrderSort)
  if (zoom === undefined || !Number.isFinite(zoom)) {
    return {
      available: false,
      tier: 'unavailable',
      limit: 0,
      shownIds: [],
      shownPositions: [],
      matchingShownIds: [],
      matchingShownPositions: [],
      matchingPositions,
      zoomHiddenCount: 0,
      selectedException: false,
      selectedFiltered: false,
      selectedZoomHidden: false,
    }
  }

  const { tier, limit } = orbitalDisplayLimit(zoom, limits)
  const ranked = matchingPositions.slice(0, limit)
  const selected = selectedId
    ? positions.find((position) => position.id === selectedId)
    : undefined
  const selectedInRanked = selected
    ? ranked.some((position) => position.id === selected.id)
    : false
  const selectedMatches = selected
    ? matchesOrbitalFilters(selected, filters)
    : false
  const selectedException = Boolean(selected && !selectedInRanked)
  const matchingShownPositions =
    selected && selectedException && selectedMatches
      ? [...ranked, selected]
      : ranked
  const shownPositions =
    selected && selectedException && !selectedMatches
      ? [...matchingShownPositions, selected]
      : matchingShownPositions

  return {
    available: true,
    tier,
    limit,
    shownIds: shownPositions.map(({ id }) => id),
    shownPositions,
    matchingShownIds: matchingShownPositions.map(({ id }) => id),
    matchingShownPositions,
    matchingPositions,
    zoomHiddenCount: Math.max(
      0,
      matchingPositions.length - matchingShownPositions.length,
    ),
    selectedException,
    selectedFiltered: Boolean(selected && !selectedMatches),
    selectedZoomHidden: Boolean(
      selected &&
        selectedMatches &&
        !selectedInRanked &&
        matchingPositions.some(({ id }) => id === selected.id),
    ),
  }
}

export const orbitalPositionInViewport = (
  position: ModeledOrbitalPosition,
  viewport: OrbitalViewport,
) => {
  if (viewport.kind === 'world') return true
  if (viewport.kind === 'invalid') return false
  return orbitalPointInPolygon(
    position.latitude,
    unwrapOrbitalLongitude(
      position.longitude,
      viewport.center.longitude,
    ),
    viewport.polygon,
  )
}

export const deriveOrbitalPopulationCounts = (
  state: OrbitalControllerState,
  filters: OrbitalDiscoveryFilters,
  display: OrbitalDisplaySelection,
  viewport: OrbitalViewport | undefined,
): OrbitalPopulationCounts => {
  const matchingPositions = state.positions.filter((position) =>
    matchesOrbitalFilters(position, filters),
  )
  const currentPositions = new Map(
    state.positions.map((position) => [position.id, position]),
  )
  const matchingShownPositions = display.available
    ? display.matchingShownIds.flatMap((id) => {
        const position = currentPositions.get(id)
        return position && matchesOrbitalFilters(position, filters)
          ? [position]
          : []
      })
    : []
  const mapCountsAvailable =
    display.available &&
    viewport !== undefined &&
    viewport.kind !== 'invalid'
  const predictionAvailable =
    mapCountsAvailable &&
    state.prediction.mode === viewport.kind &&
    state.prediction.filtersSignature ===
      orbitalFiltersSignature(filters) &&
    state.prediction.viewportSignature ===
      orbitalViewportSignature(viewport)
  return {
    catalogCount: state.snapshot?.recordCount ?? 0,
    acceptedCount: state.acceptedCount,
    modeledNowCount: state.positions.length,
    catalogMatchCount:
      state.snapshot?.records.filter((record) =>
        matchesOrbitalFilters(record, filters),
      ).length ?? 0,
    modeledMatchCount: matchingPositions.length,
    ...(mapCountsAvailable
      ? {
          inFootprintCount: matchingPositions.filter((position) =>
            orbitalPositionInViewport(position, viewport),
          ).length,
          shownInFootprintCount: matchingShownPositions.filter((position) =>
            orbitalPositionInViewport(position, viewport),
          ).length,
        }
      : {}),
    ...(predictionAvailable
      ? { futureCrossingCount: state.prediction.futureCrossingCount }
      : {}),
  }
}
