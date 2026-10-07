import {
  ZOOM_TRAFFIC_CONTEXT_CONFIG,
  type FreshnessThresholds,
} from '../config/appConfig'
import type {
  DisplayTrafficEntity,
  TrafficEntity,
} from '../domain/traffic'
import {
  unwrapLongitude,
  type TrafficViewport,
  type ViewportAssessment,
} from '../domain/viewport'
import { filterTrafficByViewport } from '../traffic/filter'
import { displayTraffic } from '../traffic/freshness'

export interface LastLocalTrafficView {
  viewport: TrafficViewport
  zoom: number
  viewRequestId: number
}

export const trafficZoomContextViewport = (
  lastView: LastLocalTrafficView | null,
  assessment: ViewportAssessment | null,
  zoom: number | undefined,
  viewRequestId: number,
  enabled: boolean,
): TrafficViewport | null =>
  enabled &&
  lastView !== null &&
  lastView.viewRequestId === viewRequestId &&
  assessment?.kind === 'ineligible' &&
  zoom !== undefined &&
  Number.isFinite(zoom) &&
  zoom < lastView.zoom
    ? lastView.viewport
    : null

export const trafficZoomContextEntities = <T extends TrafficEntity>(
  entities: readonly T[],
  viewport: TrafficViewport | null,
  now: number,
  thresholds: FreshnessThresholds,
) =>
  viewport
    ? displayTraffic(filterTrafficByViewport(entities, viewport), now, {
        staleAfterMs: thresholds.staleAfterMs,
        expireAfterMs: Math.min(
          thresholds.expireAfterMs,
          ZOOM_TRAFFIC_CONTEXT_CONFIG.maximumAgeMs,
        ),
      })
    : []

interface ContextMap {
  getZoom(): number
  getCenter(): { lng: number }
  getCanvas(): { clientWidth: number; clientHeight: number }
  project(coordinates: [number, number]): { x: number; y: number }
}

export const sampleTrafficZoomContext = (
  map: ContextMap,
  entities: readonly DisplayTrafficEntity[],
): readonly DisplayTrafficEntity[] => {
  if (map.getZoom() <= ZOOM_TRAFFIC_CONTEXT_CONFIG.minimumZoom) return []

  const { clientWidth: width, clientHeight: height } = map.getCanvas()
  const longitude = map.getCenter().lng
  const chosen: {
    entity: DisplayTrafficEntity
    x: number
    y: number
  }[] = []

  for (const entity of [...entities].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  )) {
    const { x, y } = map.project([
      unwrapLongitude(entity.position.longitude, longitude),
      entity.position.latitude,
    ])
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      x < 0 ||
      x > width ||
      y < 0 ||
      y > height ||
      chosen.some(
        (point) =>
          Math.hypot(x - point.x, y - point.y) <
          ZOOM_TRAFFIC_CONTEXT_CONFIG.minimumSeparationPx,
      )
    ) {
      continue
    }
    chosen.push({ entity, x, y })
    if (chosen.length === ZOOM_TRAFFIC_CONTEXT_CONFIG.maximumPointsPerKind) {
      break
    }
  }

  return chosen.map(({ entity }) => entity)
}
