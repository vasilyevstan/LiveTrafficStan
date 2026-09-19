import { describe, expect, it } from 'vitest'
import type { Vessel } from '../domain/traffic'
import type { TrafficViewport } from '../domain/viewport'
import {
  filterTrafficByViewport,
  filterVesselsByMinimumLength,
} from './filter'

const vessel = (
  id: string,
  lengthMeters?: number,
  latitude = 59,
): Vessel => ({
  id,
  kind: 'vessel',
  provider: 'test',
  mmsi: Number(id),
  position: {
    latitude,
    longitude: 24,
    observedAt: 1,
  },
  receivedAt: 1,
  lengthMeters,
  markerIcon: 'vessel',
  markerScale: 1,
})

const viewport: TrafficViewport = {
  center: {
    latitude: 59,
    longitude: 24,
    label: 'Map view',
  },
  enclosingRadiusKm: 20,
  polygon: [
    { latitude: 59.2, longitude: 23.8 },
    { latitude: 59.2, longitude: 24.2 },
    { latitude: 58.8, longitude: 24.2 },
    { latitude: 58.8, longitude: 23.8 },
  ],
}

describe('filterVesselsByMinimumLength', () => {
  it('keeps only vessels with a reliable length at or above the threshold', () => {
    expect(
      filterVesselsByMinimumLength(
        [vessel('1', 49), vessel('2', 50), vessel('3'), vessel('4', 140)],
        50,
      ).map((item) => item.id),
    ).toEqual(['2', '4'])
  })

  it('removes retained entities outside the visible viewport immediately', () => {
    expect(
      filterTrafficByViewport(
        [vessel('1', 50), vessel('2', 50, 60)],
        viewport,
      ).map((item) => item.id),
    ).toEqual(['1'])
  })
})
