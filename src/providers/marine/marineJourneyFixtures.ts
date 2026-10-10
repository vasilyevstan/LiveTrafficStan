export const JOURNEY_TEST_NOW = Date.parse('2026-10-10T12:00:00Z')
export const JOURNEY_TEST_MMSI = 230123456

export const marineHistoryFixture = (mmsi = JOURNEY_TEST_MMSI, to = JOURNEY_TEST_NOW) => ({
  type: 'Feature',
  id: mmsi,
  geometry: { type: 'LineString', coordinates: [[24.6, 59.5], [24.61, 59.51], [24.65, 59.55], [24.66, 59.56]] },
  properties: {
    mmsi, from: new Date(to - 86_400_000).toISOString(), to: new Date(to).toISOString(),
    interval: 2, points: 4, simplified: true, tolerance_m: 15, truncated: false, breaks: [2],
    times: [120_000, 100_000, 40_000, 10_000].map(age => new Date(to - age).toISOString()),
    sog: [12, 12, 12, 12], cog: [30, 30, 30, 30],
    heading: [30, 30, 30, 30], nav_status: [0, 0, 0, 0],
  },
  attribution: { aisstream: 'Synthetic test source credit, not an archived vessel track' },
})

export const portCallsFixture = (mmsi = JOURNEY_TEST_MMSI, at = JOURNEY_TEST_NOW) => ({
  dataUpdatedTime: new Date(at).toISOString(),
  portCalls: [{
    mmsi, imoLloyds: 8919805, portCallTimestamp: new Date(at - 60_000).toISOString(),
    portToVisit: 'FIHEL', prevPort: 'EETLL', nextPort: 'FIKTK',
    portAreaDetails: [{
      portAreaCode: 'VUOS',
      ata: new Date(at - 3_600_000).toISOString(),
      atd: new Date(at - 300_000).toISOString(),
    }],
  }],
})

export const portCoordinateFixture = (locode = 'FIHEL', area = 'VUOS', coordinates = [25.19392, 60.21502]) => ({
  dataUpdatedTime: new Date(JOURNEY_TEST_NOW).toISOString(),
  ssnLocations: {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', locode, geometry: null, properties: { locode, locationName: 'Synthetic port' } }],
  },
  portAreas: {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature', locode, portAreaCode: area,
      geometry: { type: 'Point', coordinates },
      properties: { locode, portAreaName: 'Synthetic area' },
    }],
  },
  berths: { berths: [], dataUpdatedTime: new Date(JOURNEY_TEST_NOW).toISOString() },
})
