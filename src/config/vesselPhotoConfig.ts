export const VESSEL_PHOTO_CONFIG = {
  path: '/api/vessel-photos',
  upstreamBaseUrl: 'https://openwaters.io/ais/vessels/media',
  upstreamTimeoutMs: 8_000,
  timeoutMs: 10_000,
  maximumBytes: 128 * 1_024,
  maximumPhotos: 8,
  cacheMaxEntries: 32,
  cacheTtlMs: 60 * 60_000,
  rateLimitFallbackMs: 60_000,
} as const
