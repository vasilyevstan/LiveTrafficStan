export const TRAIN_CONFIG = {
  pollIntervalMs: 15_000,
  rateLimitBackoffMaxMs: 5 * 60_000,
  timeoutMs: 8_000,
  maximumBytes: 512 * 1_024,
  maximumTrains: 1_000,
  futureToleranceMs: 60_000,
  staleAfterMs: 2 * 60_000,
  expireAfterMs: 10 * 60_000,
  resultLimit: 20,
  course: {
    minimumDistanceKm: 0.03,
    maximumIntervalMs: 3 * 60_000,
  },
  // Below this zoom trains stay flat dots; above it oriented trains get models.
  modelMinimumZoom: 9,
  clientName: 'livetrafficstan-trackstan',
  fintraffic: {
    endpoint: 'https://rata.digitraffic.fi/api/v2/graphql/graphql',
    lookbackMs: 15 * 60_000,
    // Measured GraphQL responses take 4-14 s; stay below the 15 s cadence.
    timeoutMs: 14_000,
  },
  entur: {
    endpoint: 'https://api.entur.io/realtime/v2/vehicles/graphql',
    maximumDataAge: 'PT10M',
  },
  mbta: {
    endpoint: 'https://api-v3.mbta.com/vehicles',
  },
  lirr: {
    endpoint: '/api/trains/lirr',
    // MTA asks redistributors to disclose lag beyond one minute.
    lagNoticeAfterMs: 60_000,
  },
} as const
