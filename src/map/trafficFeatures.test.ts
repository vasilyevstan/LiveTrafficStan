import { describe, expect, it } from 'vitest'
import type {
  DisplayAircraft,
  DisplayVessel,
} from '../domain/traffic'
import { trafficFeatures } from './trafficFeatures'

const aircraft: DisplayAircraft = {
  id: 'aircraft:abc123',
  kind: 'aircraft',
  provider: 'test',
  hex: 'abc123',
  altitudeMeters: 3_000,
  verticalSpeedMps: -1.016,
  courseDegrees: 120,
  position: {
    latitude: 59,
    longitude: 24,
    observedAt: 1,
  },
  receivedAt: 1,
  markerIcon: 'aircraft',
  markerScale: 1,
  freshness: 'live',
}

const yacht: DisplayVessel = {
  id: 'vessel:230000001',
  kind: 'vessel',
  provider: 'test',
  mmsi: 230000001,
  vesselCategory: 'other',
  navigationCategory: 'underway',
  vesselType: 'Sailing vessel',
  speedKph: 1.852,
  courseDegrees: 210,
  lengthMeters: 20,
  position: {
    latitude: 59.1,
    longitude: 24.1,
    observedAt: 1,
  },
  receivedAt: 1,
  markerIcon: 'vessel',
  markerScale: 0.83,
  freshness: 'live',
}

describe('trafficFeatures presentation projection', () => {
  it('adds render-only aircraft state without changing entity identity', () => {
    const collection = trafficFeatures(
      [aircraft],
      new Map(),
      1,
      aircraft.id,
      false,
    )

    expect(collection.features[0]).toMatchObject({
      id: aircraft.id,
      properties: {
        id: aircraft.id,
        heading: 120,
        markerIcon: 'aircraft-high',
        altitudeBand: 'high',
        verticalTrend: 'descent',
        motionState: 'unknown',
        selected: true,
        stale: false,
      },
    })
  })

  it('projects exact yacht artwork and speed-derived heading without persisting it', () => {
    const collection = trafficFeatures(
      [yacht],
      new Map(),
      1,
      null,
      false,
    )

    expect(yacht.markerIcon).toBe('vessel')
    expect(collection.features[0]).toMatchObject({
      id: yacht.id,
      properties: {
        heading: 210,
        markerIcon: 'vessel-sailing',
        motionState: 'moving',
        navigationConflict: false,
      },
    })
  })

  it('renders slow vessel silhouettes north-up with a non-directional badge', () => {
    const collection = trafficFeatures(
      [{ ...yacht, speedKph: 1.851 }],
      new Map(),
      1,
      null,
      false,
    )

    expect(collection.features[0]?.properties).toMatchObject({
      heading: 0,
      markerIcon: 'vessel-sailing',
      motionState: 'slow-stopped',
    })
  })

  it('projects stopped aircraft as north-up without changing altitude color', () => {
    const collection = trafficFeatures(
      [{ ...aircraft, speedKph: 0, courseDegrees: 220 }],
      new Map(),
      1,
      null,
      false,
    )

    expect(collection.features[0]?.properties).toMatchObject({
      heading: 0,
      markerIcon: 'aircraft-high',
      motionState: 'slow-stopped',
    })
  })
})
