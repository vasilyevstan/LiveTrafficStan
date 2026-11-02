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
  vesselCategory: 'unknown',
  navigationCategory: 'unknown',
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

  it('uses the exact rotated polygon across the antimeridian, not the transport circle', () => {
    const rotatedAntimeridianViewport: TrafficViewport = {
      center: {
        latitude: 0,
        longitude: 179.9,
        label: 'Map view',
      },
      enclosingRadiusKm: 80,
      polygon: [
        { latitude: 0.5, longitude: 179.9 },
        { latitude: 0, longitude: 180.4 },
        { latitude: -0.5, longitude: 179.9 },
        { latitude: 0, longitude: 179.4 },
      ],
    }
    const entity = (
      id: string,
      latitude: number,
      longitude: number,
    ): Vessel => ({
      ...vessel(id, 50, latitude),
      position: {
        latitude,
        longitude,
        observedAt: 1,
      },
    })

    expect(
      filterTrafficByViewport(
        [
          entity('1', 0.2, -179.9),
          entity('2', 0.4, -179.7),
          entity('3', 0, 179.4),
        ],
        rotatedAntimeridianViewport,
      ).map(({ id }) => id),
    ).toEqual(['1', '3'])
  })
})
