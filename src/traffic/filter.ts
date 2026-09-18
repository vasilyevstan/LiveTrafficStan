import { distanceKm } from '../domain/geo'
import type { GeoPosition, TrafficEntity, Vessel } from '../domain/traffic'

export const filterTrafficByRadius = <T extends TrafficEntity>(
  entities: readonly T[],
  center: Pick<GeoPosition, 'latitude' | 'longitude'>,
  radiusKm: number,
) =>
  entities.filter(
    (entity) => distanceKm(center, entity.position) <= radiusKm,
  )

export const filterVesselsByMinimumLength = <T extends Vessel>(
  vessels: readonly T[],
  minimumLengthMeters: number,
) =>
  vessels.filter(
    (vessel) =>
      vessel.lengthMeters !== undefined &&
      vessel.lengthMeters >= minimumLengthMeters,
  )
