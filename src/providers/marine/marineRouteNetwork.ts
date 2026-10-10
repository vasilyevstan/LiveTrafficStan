import { JOURNEY_CONFIG as config } from '../../config/appConfig'
import { distanceKm, isValidCoordinate } from '../../domain/geo'
import type { JourneyCoordinate } from '../../domain/journey'
import { findMarineWaterRoute, type MarineRouteNetwork, type MarineWaterRoute } from '../../domain/marineRoute'
import { normalizeLongitude } from '../../domain/viewport'
import { readBoundedJson } from '../boundedJson'
import { ProviderError } from '../errors'
import { isRecord } from '../guards'

export const parseMarineRouteNetwork = (value: unknown): MarineRouteNetwork => {
  const invalid = (): never => { throw new ProviderError('The bundled shipping network is invalid') }
  if (!isRecord(value) || value.type !== 'FeatureCollection' || !Array.isArray(value.features) ||
      value.features.length === 0 || value.features.length > config.marineNetworkMaximumFeatures) return invalid()
  const nodes: { latitude: number; longitude: number; edges: Map<number, number> }[] = []
  const indices = new Map<string, number>()
  let coordinates = 0
  for (const feature of value.features) {
    if (!isRecord(feature) || feature.type !== 'Feature' || !isRecord(feature.geometry) ||
        feature.geometry.type !== 'LineString' || !Array.isArray(feature.geometry.coordinates) ||
        feature.geometry.coordinates.length < 2) return invalid()
    let previous: number | undefined
    for (const point of feature.geometry.coordinates) {
      if (++coordinates > config.marineNetworkMaximumCoordinates ||
          !Array.isArray(point) || point.length !== 2 || typeof point[0] !== 'number' ||
          typeof point[1] !== 'number' || !isValidCoordinate(point[1], point[0])) return invalid()
      const longitude = normalizeLongitude(point[0])
      const latitude = point[1]
      const key = `${longitude},${latitude}`
      let index = indices.get(key)
      if (index === undefined) {
        if (nodes.length >= config.marineNetworkMaximumNodes) return invalid()
        index = nodes.length
        indices.set(key, index)
        nodes.push({ longitude, latitude, edges: new Map() })
      }
      if (previous !== undefined && previous !== index) {
        const distance = distanceKm(nodes[previous]!, nodes[index]!)
        nodes[previous]!.edges.set(index, distance)
        nodes[index]!.edges.set(previous, distance)
      }
      previous = index
    }
  }
  return Object.freeze({
    nodes: Object.freeze(nodes.map(node => Object.freeze({
      latitude: node.latitude, longitude: node.longitude,
      edges: Object.freeze([...node.edges].map(([to, distanceKm]) => Object.freeze({ to, distanceKm }))),
    }))),
  })
}

export interface MarineRouteProvider {
  route(from: JourneyCoordinate, to: JourneyCoordinate, signal: AbortSignal): Promise<MarineWaterRoute>
}

export class BundledMarineRouteProvider implements MarineRouteProvider {
  private network?: MarineRouteNetwork
  private readonly options: { fetchImpl?: typeof fetch }

  constructor(options: BundledMarineRouteProvider['options'] = {}) { this.options = options }

  async route(from: JourneyCoordinate, to: JourneyCoordinate, signal: AbortSignal): Promise<MarineWaterRoute> {
    if (signal.aborted) throw new DOMException('Shipping-network request cancelled', 'AbortError')
    if (this.network) return findMarineWaterRoute(this.network, from, to)
    const controller = new AbortController()
    const abort = () => controller.abort(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    const timeout = setTimeout(() => controller.abort(), config.marineNetworkTimeoutMs)
    try {
      const response = await (this.options.fetchImpl ?? fetch)(config.marineNetworkPath, {
        signal: controller.signal, credentials: 'omit', redirect: 'error',
        referrerPolicy: 'no-referrer', cache: 'force-cache', headers: { Accept: 'application/json' },
      })
      if (response.status !== 200) {
        void response.body?.cancel().catch(() => undefined)
        throw new ProviderError('The bundled shipping network is unavailable')
      }
      const value = await readBoundedJson(
        response, config.marineNetworkMaximumBytes, ['application/json'], config.marineNetworkSha256,
      )
      if (controller.signal.aborted) throw new DOMException('Shipping-network request cancelled', 'AbortError')
      const network = parseMarineRouteNetwork(value)
      this.network = network
      return findMarineWaterRoute(network, from, to)
    } catch (error) {
      if (signal.aborted) throw new DOMException('Shipping-network request cancelled', 'AbortError')
      if (error instanceof ProviderError) throw error
      throw new ProviderError('The shipping-network illustration failed validation or timed out.')
    } finally {
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
    }
  }
}
