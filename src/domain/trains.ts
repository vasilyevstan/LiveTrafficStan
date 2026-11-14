import { distanceKm } from './geo'
import type { TrafficViewport } from './viewport'
import { isCoordinateInViewport } from './viewport'

export const TRAIN_SOURCE_IDS = ['fintraffic', 'entur', 'mbta', 'lirr'] as const
export type TrainSourceId = (typeof TRAIN_SOURCE_IDS)[number]

/** Only what the source states; freight is never inferred. */
export type TrainCategory =
  | 'long-distance'
  | 'commuter'
  | 'passenger'
  | 'freight'
  | 'other'

/** `reported` comes from the source; `derived` from two observed positions. */
export type TrainCourseOrigin = 'reported' | 'derived'

export type TrainFreshness = 'current' | 'stale'

export interface TrainPosition {
  /** `train:<source>:<provider identity>`; stable across polls. */
  id: string
  sourceId: TrainSourceId
  name: string
  category: TrainCategory
  longitude: number
  latitude: number
  /** Source position time, never the feed or HTTP time. */
  observedAt: number
  trainNumber?: string
  line?: string
  destination?: string
  operator?: string
  vehicleLabel?: string
  speedKph?: number
  courseDegrees?: number
  courseOrigin?: TrainCourseOrigin
}

export interface DisplayTrain extends TrainPosition {
  freshness: TrainFreshness
}

export interface TrainSourceBounds {
  west: number
  south: number
  east: number
  north: number
}

export interface TrainSource {
  id: TrainSourceId
  name: string
  coverage: string
  /** Rail-network rectangles; one country box would also poll its neighbours. */
  areas: readonly TrainSourceBounds[]
  websiteUrl: string
  licenseName: string
  licenseUrl: string
  attribution: string
}

export interface TrainSourceDataset {
  sourceId: TrainSourceId
  trains: readonly TrainPosition[]
  retrievedAt: number
}

export interface TrainFreshnessLimits {
  staleAfterMs: number
  expireAfterMs: number
}

export const trainId = (sourceId: TrainSourceId, identity: string) =>
  `train:${sourceId}:${identity}`

export const mapTrainSources = <T>(project: (sourceId: TrainSourceId) => T) =>
  Object.fromEntries(
    TRAIN_SOURCE_IDS.map((sourceId) => [sourceId, project(sourceId)]),
  ) as Record<TrainSourceId, T>

export const isTrainId = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith('train:')

/** Conservative rectangle test so a source is queried only when it can matter. */
export const viewportIntersectsTrainSource = (
  viewport: TrafficViewport,
  bounds: TrainSourceBounds,
) => {
  if (viewport.polygon.length === 0) return false
  let west = Infinity
  let east = -Infinity
  let south = Infinity
  let north = -Infinity
  for (const { latitude, longitude } of viewport.polygon) {
    west = Math.min(west, longitude)
    east = Math.max(east, longitude)
    south = Math.min(south, latitude)
    north = Math.max(north, latitude)
  }
  if (!Number.isFinite(west + east + south + north)) return false
  if (north < bounds.south || south > bounds.north) return false
  return [-360, 0, 360].some(
    (shift) => east + shift >= bounds.west && west + shift <= bounds.east,
  )
}

export const viewportIntersectsTrainAreas = (
  viewport: TrafficViewport,
  areas: readonly TrainSourceBounds[],
) => areas.some((area) => viewportIntersectsTrainSource(viewport, area))

export const displayTrains = (
  trains: readonly TrainPosition[],
  viewport: TrafficViewport | null,
  now: number,
  limits: TrainFreshnessLimits,
): DisplayTrain[] => {
  if (!viewport) return []
  return trains.flatMap((train) => {
    const age = Math.max(0, now - train.observedAt)
    if (age > limits.expireAfterMs) return []
    if (!isCoordinateInViewport(train, viewport)) return []
    return [{ ...train, freshness: age > limits.staleAfterMs ? 'stale' : 'current' }]
  })
}

export interface TrainCourseLimits {
  minimumDistanceKm: number
  maximumIntervalMs: number
}

const bearingDegrees = (
  from: Pick<TrainPosition, 'latitude' | 'longitude'>,
  to: Pick<TrainPosition, 'latitude' | 'longitude'>,
) => {
  const radians = Math.PI / 180
  const fromLatitude = from.latitude * radians
  const toLatitude = to.latitude * radians
  const longitudeDelta = (to.longitude - from.longitude) * radians
  const y = Math.sin(longitudeDelta) * Math.cos(toLatitude)
  const x =
    Math.cos(fromLatitude) * Math.sin(toLatitude) -
    Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(longitudeDelta)
  return ((Math.atan2(y, x) / radians) % 360 + 360) % 360
}

/**
 * Adds a course only for trains whose source omitted it, from two observed
 * positions of the same train. A stationary train keeps its last observed
 * course; nothing is taken from schedules, tracks, or snapping.
 */
export const withDerivedCourses = (
  trains: readonly TrainPosition[],
  previous: readonly TrainPosition[],
  limits: TrainCourseLimits,
): TrainPosition[] => {
  if (previous.length === 0) return [...trains]
  const prior = new Map(previous.map((train) => [train.id, train]))
  return trains.map((train) => {
    if (train.courseOrigin === 'reported') return train
    const before = prior.get(train.id)
    if (!before) return train
    const interval = train.observedAt - before.observedAt
    if (interval < 0) return train
    if (interval === 0 || distanceKm(before, train) < limits.minimumDistanceKm) {
      return before.courseOrigin === 'derived' && before.courseDegrees !== undefined
        ? { ...train, courseDegrees: before.courseDegrees, courseOrigin: 'derived' }
        : train
    }
    if (interval > limits.maximumIntervalMs) return train
    return {
      ...train,
      courseDegrees: bearingDegrees(before, train),
      courseOrigin: 'derived',
    }
  })
}

export const trainCategoryLabel = (category: TrainCategory) => {
  switch (category) {
    case 'long-distance':
      return 'Long-distance passenger'
    case 'commuter':
      return 'Commuter'
    case 'passenger':
      return 'Passenger'
    case 'freight':
      return 'Freight'
    case 'other':
      return 'Other rail movement'
  }
}

export const trainSummary = (train: TrainPosition) =>
  train.destination ? `${train.name} → ${train.destination}` : train.name
