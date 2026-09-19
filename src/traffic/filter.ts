import type { TrafficEntity, Vessel } from '../domain/traffic'
import {
  isCoordinateInViewport,
  type TrafficViewport,
} from '../domain/viewport'

export const filterTrafficByViewport = <T extends TrafficEntity>(
  entities: readonly T[],
  viewport: TrafficViewport,
) =>
  entities.filter((entity) =>
    isCoordinateInViewport(entity.position, viewport),
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
