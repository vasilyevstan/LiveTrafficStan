import { TRAIN_CONFIG } from '../src/config/trainConfig.js'
import { handleGtfsTrainProxy, type GtfsTrainProxyOptions } from './gtfsTrainProxy.js'

export const ELRON_PROXY_PATH = '/api/trains/elron'
export const ELRON_FEED_URL = 'https://jbb.ghsq.de/gtfs/elron/VehiclePositions'

export const handleElronProxy = (request: Request, options: GtfsTrainProxyOptions = {}) =>
  handleGtfsTrainProxy(request, {
    path: ELRON_PROXY_PATH,
    upstreamUrl: ELRON_FEED_URL,
    name: 'Elron community feed',
    cacheSeconds: TRAIN_CONFIG.elron.pollIntervalMs / 1_000,
    decodeLimits: {
      maximumEntities: 1_000,
      maximumVehicles: 1_000,
      maximumStringBytes: 256,
    },
    identity: 'trip-day',
    // This fixed feed omits Content-Type; its full GTFS header and body still validate.
    allowMissingContentType: true,
    userAgent: 'TrackStan/1.6.0 (https://trackstan.xyz)',
  }, options)
