import type { Point } from 'geojson'
import type {
  GeoJSONSource,
  MapGeoJSONFeature,
  Map as MapLibreMap,
} from 'maplibre-gl'
import type { DisplayTrafficEntity } from '../domain/traffic'
import {
  SOURCE_AIRCRAFT,
  SOURCE_VESSELS,
} from './trafficStyle'

export type TrafficClusterKind = 'aircraft' | 'vessel'

export interface TrafficClusterTarget {
  kind: TrafficClusterKind
  sourceId: typeof SOURCE_AIRCRAFT | typeof SOURCE_VESSELS
  clusterId: number
  center: [number, number]
}

export const trafficSnapshotSignature = (
  entities: readonly DisplayTrafficEntity[],
  selectedId: string | null,
) =>
  entities
    .map((entity) =>
      [
        entity.id,
        entity.position.observedAt,
        entity.position.latitude,
        entity.position.longitude,
        entity.courseDegrees ?? entity.headingDegrees ?? 0,
        entity.markerIcon,
        entity.markerScale,
        entity.freshness,
        entity.id === selectedId ? 1 : 0,
      ].join(':'),
    )
    .join('|')

export const shouldAnimateTrafficSources = (
  clusteringEnabled: boolean,
  hasActiveTrafficMotion: boolean,
) => !clusteringEnabled && hasActiveTrafficMotion

export const setTrafficClustering = async (
  map: MapLibreMap,
  enabled: boolean,
) => {
  const updates: Promise<void>[] = []
  for (const sourceId of [SOURCE_AIRCRAFT, SOURCE_VESSELS] as const) {
    const source = map.getSource(sourceId)
    if (source) {
      updates.push(
        (source as GeoJSONSource).setClusterOptions({
          cluster: enabled,
        }),
      )
    }
  }
  await Promise.all(updates)
}

const finiteCoordinate = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

export const trafficClusterTarget = (
  feature: MapGeoJSONFeature,
): TrafficClusterTarget | null => {
  const sourceId =
    feature.source === SOURCE_AIRCRAFT
      ? SOURCE_AIRCRAFT
      : feature.source === SOURCE_VESSELS
        ? SOURCE_VESSELS
        : undefined
  const clusterId = feature.properties?.cluster_id
  const geometry = feature.geometry as Point
  if (
    !sourceId ||
    !Number.isSafeInteger(clusterId) ||
    clusterId < 0 ||
    geometry.type !== 'Point' ||
    !Array.isArray(geometry.coordinates)
  ) {
    return null
  }

  const [longitude, latitude] = geometry.coordinates
  if (
    !finiteCoordinate(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    !finiteCoordinate(latitude) ||
    latitude < -90 ||
    latitude > 90
  ) {
    return null
  }

  return {
    kind: sourceId === SOURCE_AIRCRAFT ? 'aircraft' : 'vessel',
    sourceId,
    clusterId,
    center: [longitude, latitude],
  }
}

export const firstTrafficClusterTarget = (
  features: readonly MapGeoJSONFeature[],
) => {
  for (const feature of features) {
    const target = trafficClusterTarget(feature)
    if (target) return target
  }
  return null
}

export const clusterExpansionZoom = (
  currentZoom: number,
  requestedZoom: number,
  maximumZoom: number,
) =>
  Math.min(
    Math.max(
      Number.isFinite(requestedZoom) ? requestedZoom : currentZoom + 1,
      Math.floor(currentZoom) + 1,
    ),
    maximumZoom,
  )
