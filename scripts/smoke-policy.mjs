export const STATIC_ASSET_RETRY_DELAYS_MS = [
  0,
  1_000,
  2_000,
  4_000,
  8_000,
]

export const isRetryableStaticAssetStatus = (status) =>
  status === 404 || status >= 500

export const classifyAircraftProxyStatus = (status) => {
  if (status === 200) return 'available'
  if (status === 429) return 'provider-throttled'
  return 'failure'
}
