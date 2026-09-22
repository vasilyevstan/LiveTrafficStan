import type { FeatureCollection, Point } from 'geojson'
import type { DisplayTrafficEntity } from '../domain/traffic'
import { trafficPresentation } from '../domain/trafficPresentation'
import {
  sampleMotion,
  type MotionStates,
} from '../traffic/interpolation'

export const trafficFeatures = (
  entities: readonly DisplayTrafficEntity[],
  motion: MotionStates,
  now: number,
  selectedId: string | null,
  interpolate: boolean,
): FeatureCollection<Point> => ({
  type: 'FeatureCollection',
  features: entities.map((entity) => {
    const sampled = interpolate && motion.get(entity.id)
      ? sampleMotion(motion.get(entity.id)!, now)
      : entity.position
    const presentation = trafficPresentation(entity)

    return {
      type: 'Feature',
      id: entity.id,
      properties: {
        id: entity.id,
        heading: presentation.headingDegrees,
        markerIcon: presentation.markerIcon,
        markerScale: entity.markerScale,
        selected: entity.id === selectedId,
        stale: entity.freshness === 'stale',
        motionState: presentation.motionState,
        ...(presentation.kind === 'aircraft'
          ? {
              altitudeBand: presentation.altitudeBand,
              verticalTrend: presentation.verticalTrend,
            }
          : {
              navigationConflict: presentation.navigationConflict,
            }),
      },
      geometry: {
        type: 'Point',
        coordinates: [sampled.longitude, sampled.latitude],
      },
    }
  }),
})
