import type { MapGeoJSONFeature } from 'maplibre-gl'
import { describe, expect, it, vi } from 'vitest'
import {
  clusterExpansionZoom,
  firstTrafficClusterTarget,
  setTrafficClustering,
  shouldAnimateTrafficSources,
  trafficSnapshotSignature,
  trafficClusterTarget,
} from './clustering'
import {
  SOURCE_AIRCRAFT,
  SOURCE_VESSELS,
} from './trafficStyle'

const feature = (
  source: string,
  clusterId: unknown,
  coordinates: unknown = [24.75, 59.44],
) =>
  ({
    source,
    properties: { cluster_id: clusterId },
    geometry: { type: 'Point', coordinates },
  }) as unknown as MapGeoJSONFeature

describe('traffic clustering', () => {
  it('toggles the two existing sources without changing fixed options', async () => {
    const aircraft = { setClusterOptions: vi.fn(async () => undefined) }
    const vessels = { setClusterOptions: vi.fn(async () => undefined) }
    const map = {
      getSource: (id: string) =>
        id === SOURCE_AIRCRAFT ? aircraft : vessels,
    } as never

    await setTrafficClustering(map, true)

    expect(aircraft.setClusterOptions).toHaveBeenCalledWith({
      cluster: true,
    })
    expect(vessels.setClusterOptions).toHaveBeenCalledWith({
      cluster: true,
    })
  })

  it('accepts only finite cluster targets from the two traffic sources', () => {
    expect(
      trafficClusterTarget(feature(SOURCE_AIRCRAFT, 7)),
    ).toEqual({
      kind: 'aircraft',
      sourceId: SOURCE_AIRCRAFT,
      clusterId: 7,
      center: [24.75, 59.44],
    })
    expect(
      trafficClusterTarget(feature(SOURCE_VESSELS, 8)),
    ).toMatchObject({ kind: 'vessel', clusterId: 8 })
    expect(trafficClusterTarget(feature('other', 7))).toBeNull()
    expect(trafficClusterTarget(feature(SOURCE_AIRCRAFT, '7'))).toBeNull()
    expect(
      trafficClusterTarget(feature(SOURCE_AIRCRAFT, 7, [181, 59])),
    ).toBeNull()
  })

  it('uses the first valid rendered cluster', () => {
    expect(
      firstTrafficClusterTarget([
        feature('other', 1),
        feature(SOURCE_VESSELS, 2),
        feature(SOURCE_AIRCRAFT, 3),
      ]),
    ).toMatchObject({ kind: 'vessel', clusterId: 2 })
  })

  it('advances coincident clusters and caps expansion to the map maximum', () => {
    expect(clusterExpansionZoom(8.5, 8, 20)).toBe(9)
    expect(clusterExpansionZoom(8.5, 14, 20)).toBe(14)
    expect(clusterExpansionZoom(19.5, 22, 20)).toBe(20)
    expect(clusterExpansionZoom(8, Number.NaN, 20)).toBe(9)
  })

  it('uses stable snapshot signatures and suppresses clustered interpolation', () => {
    const entity = {
      id: 'aircraft:abc123',
      kind: 'aircraft',
      hex: 'abc123',
      provider: 'fixture',
      receivedAt: 1_000,
      position: {
        latitude: 59.44,
        longitude: 24.75,
        observedAt: 1_000,
      },
      markerIcon: 'aircraft',
      markerScale: 1,
      freshness: 'live',
    } as const

    expect(trafficSnapshotSignature([entity], null)).toBe(
      'aircraft:abc123:1000:59.44:24.75:0:aircraft:1:live:0',
    )
    expect(trafficSnapshotSignature([entity], entity.id)).not.toBe(
      trafficSnapshotSignature([entity], null),
    )
    expect(shouldAnimateTrafficSources(true, true)).toBe(false)
    expect(shouldAnimateTrafficSources(false, true)).toBe(true)
    expect(shouldAnimateTrafficSources(false, false)).toBe(false)
  })
})
