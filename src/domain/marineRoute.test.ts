import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { JOURNEY_CONFIG as config } from '../config/appConfig'
import { parseMarineRouteNetwork } from '../providers/marine/marineRouteNetwork'
import { findMarineWaterRoute } from './marineRoute'
import { distanceKm } from './geo'

const collection = (lines: number[][][]) => ({
  type: 'FeatureCollection',
  features: lines.map(coordinates => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } })),
})

describe('bounded illustrative maritime-network routing', () => {
  it('follows the network rather than a direct connector, and never relocates the input', () => {
    const network = parseMarineRouteNetwork(collection([[[-1, 0], [-1, 1], [1, 1], [1, 0]]]))
    const from = { longitude: -1, latitude: 0.001 }
    const route = findMarineWaterRoute(network, from, { longitude: 1, latitude: 0.001 })
    expect(route.kind).toBe('available')
    if (route.kind !== 'available') return
    expect(route.points).toEqual([
      { longitude: -1, latitude: 0 }, { longitude: -1, latitude: 1 },
      { longitude: 1, latitude: 1 }, { longitude: 1, latitude: 0 },
    ])
    expect(from.latitude).toBe(0.001)
    expect(route.fromGapKm).toBeGreaterThan(0)
    expect(route.toGapKm).toBeGreaterThan(0)
  })

  it('rejects distant endpoints, disconnected fragments and absent distinct route sections', () => {
    const network = parseMarineRouteNetwork(collection([[[0, 0], [1, 0]], [[2, 0], [3, 0]]]))
    expect(findMarineWaterRoute(network, { longitude: 0, latitude: 5 }, { longitude: 1, latitude: 0 }).kind).toBe('unavailable')
    expect(findMarineWaterRoute(network, { longitude: 0, latitude: 0 }, { longitude: 3, latitude: 0 }).kind).toBe('unavailable')
    expect(findMarineWaterRoute(network, { longitude: 0, latitude: 0 }, { longitude: 0, latitude: 0 }).kind).toBe('unavailable')
  })

  it('joins equivalent antimeridian vertices without routing around the planet', () => {
    const network = parseMarineRouteNetwork(collection([[[179, 0], [180, 0]], [[-180, 0], [-179, 0]]]))
    const route = findMarineWaterRoute(network, { longitude: 179, latitude: 0 }, { longitude: -179, latitude: 0 })
    expect(route.kind).toBe('available')
    if (route.kind === 'available') expect(route.points.map(point => point.longitude)).toEqual([179, -180, -179])
  })

  it('verifies the exact shipped source, bounded topology and actual routing CPU footprint', () => {
    const bytes = readFileSync(new URL('../../public/marine-routes/searoute-4fc696c5/water-network.json', import.meta.url))
    expect(bytes.byteLength).toBe(467_117)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(config.marineNetworkSha256)
    const started = performance.now()
    const network = parseMarineRouteNetwork(JSON.parse(bytes.toString('utf8')))
    const built = performance.now()
    expect(network.nodes.length).toBeLessThanOrEqual(config.marineNetworkMaximumNodes)
    const paths = [
      [{ latitude: 59.48, longitude: 24.77 }, { latitude: 60.21502, longitude: 25.19392 }],
      [{ latitude: 50.9, longitude: 1.5 }, { latitude: 52, longitude: 3 }],
      [{ latitude: 0, longitude: 120 }, { latitude: 0, longitude: -170 }],
    ].map(([from, to]) => {
      const nearest = (point: { latitude: number; longitude: number }) =>
        network.nodes.reduce((best, node) => distanceKm(point, node) < distanceKm(point, best) ? node : best)
      const start = nearest(from!)
      const end = nearest(to!)
      const at = performance.now()
      const route = findMarineWaterRoute(network, start, end)
      return { ...route, elapsedMs: performance.now() - at, originalEndpointGapsKm: [distanceKm(from!, start), distanceKm(to!, end)] }
    })
    if (process.env.JOURNEY_PERFORMANCE_REPORT === '1') {
      console.info(JSON.stringify({
        marineNetworkBytes: bytes.byteLength, nodes: network.nodes.length,
        buildMs: built - started,
        routes: paths.map(route => ({
          kind: route.kind, elapsedMs: route.elapsedMs,
          originalEndpointGapsKm: route.originalEndpointGapsKm,
          ...(route.kind === 'available' ? { points: route.points.length, fromGapKm: route.fromGapKm, toGapKm: route.toGapKm } : { message: route.message }),
        })),
      }))
    }
    const license = readFileSync(new URL('../../public/marine-routes/searoute-4fc696c5/LICENSE', import.meta.url), 'utf8')
    expect(license).toContain('Mozilla Public License')
    expect(readFileSync(new URL('../../public/marine-routes/searoute-4fc696c5/NOTICE', import.meta.url), 'utf8')).toContain('4fc696c55c4c31bdc4c8286ba76e3261d7bc5a0e')
  })
})
