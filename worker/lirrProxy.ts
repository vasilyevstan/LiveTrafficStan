import { handleGtfsTrainProxy, type GtfsTrainProxyOptions } from './gtfsTrainProxy.js'
import type { GtfsDecodeLimits } from './gtfsRealtime.js'

export type {
  GtfsTrainProxyFetch as LirrProxyFetch,
  GtfsTrainFeedCache as LirrFeedCache,
  GtfsTrainProxyVehicle as LirrProxyVehicle,
  GtfsTrainProxyBody as LirrProxyBody,
} from './gtfsTrainProxy.js'

export const LIRR_PROXY_PATH = '/api/trains/lirr'
export const MTA_LIRR_FEED_URL =
  'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr%2Fgtfs-lirr'
export const LIRR_PROXY_TIMEOUT_MS = 8_000
export const MAX_LIRR_RESPONSE_BYTES = 512 * 1_024
export const LIRR_EDGE_CACHE_SECONDS = 15
export const LIRR_DECODE_LIMITS: GtfsDecodeLimits = {
  maximumEntities: 5_000,
  maximumVehicles: 1_000,
  maximumStringBytes: 128,
}

export const handleLirrProxy = (request: Request, options: GtfsTrainProxyOptions = {}) =>
  handleGtfsTrainProxy(request, {
    path: LIRR_PROXY_PATH,
    upstreamUrl: MTA_LIRR_FEED_URL,
    name: 'LIRR',
    cacheSeconds: LIRR_EDGE_CACHE_SECONDS,
    decodeLimits: LIRR_DECODE_LIMITS,
    identity: 'vehicle',
  }, options)
