import { JOURNEY_CONFIG as config } from '../config/appConfig'
import { distanceKm } from './geo'
import type { JourneyCoordinate } from './journey'

export interface MarineNetworkNode extends JourneyCoordinate {
  readonly edges: readonly { readonly to: number; readonly distanceKm: number }[]
}

export interface MarineRouteNetwork {
  readonly nodes: readonly MarineNetworkNode[]
}

export type MarineWaterRoute =
  | {
      kind: 'available'
      points: readonly JourneyCoordinate[]
      fromGapKm: number
      toGapKm: number
    }
  | { kind: 'unavailable'; message: string }

export const findMarineWaterRoute = (
  network: MarineRouteNetwork,
  from: JourneyCoordinate,
  to: JourneyCoordinate,
): MarineWaterRoute => {
  const nearest = (point: JourneyCoordinate) => {
    let index = -1
    let distance = Infinity
    network.nodes.forEach((node, candidate) => {
      const current = distanceKm(point, node)
      if (current < distance) { index = candidate; distance = current }
    })
    return { index, distance }
  }
  const start = nearest(from)
  const end = nearest(to)
  if (start.index < 0 || end.index < 0 ||
      start.distance > config.marineNetworkMaximumSnapKm || end.distance > config.marineNetworkMaximumSnapKm) {
    return { kind: 'unavailable', message: 'The shipping network is too far from a known endpoint. No land-crossing connector is substituted.' }
  }
  if (start.index === end.index) return { kind: 'unavailable', message: 'These endpoints have no distinct section in the coarse shipping network.' }
  const distances = new Float64Array(network.nodes.length).fill(Infinity)
  const previous = new Int32Array(network.nodes.length).fill(-1)
  const queue: { index: number; distance: number }[] = [{ index: start.index, distance: 0 }]
  distances[start.index] = 0
  while (queue.length > 0) {
    queue.sort((a, b) => b.distance - a.distance)
    const current = queue.pop()!
    if (current.distance !== distances[current.index]) continue
    if (current.index === end.index) break
    for (const edge of network.nodes[current.index]!.edges) {
      const distance = current.distance + edge.distanceKm
      if (distance >= distances[edge.to]!) continue
      distances[edge.to] = distance
      previous[edge.to] = current.index
      queue.push({ index: edge.to, distance })
    }
  }
  if (!Number.isFinite(distances[end.index])) {
    return { kind: 'unavailable', message: 'These endpoints are in disconnected shipping-network fragments. The missing section stays unknown.' }
  }
  const points: JourneyCoordinate[] = []
  let index = end.index
  while (index !== -1) {
    const node = network.nodes[index]!
    points.push(Object.freeze({ latitude: node.latitude, longitude: node.longitude }))
    if (points.length > config.marineNetworkMaximumRoutePoints) {
      return { kind: 'unavailable', message: 'The shipping-network section exceeds the bounded illustration size.' }
    }
    index = previous[index]!
  }
  return {
    kind: 'available', points: Object.freeze(points.reverse()),
    fromGapKm: start.distance, toGapKm: end.distance,
  }
}
