import { TRAIN_CONFIG } from '../src/config/trainConfig.js'
import { decodeElronMapFeed } from './elronMapFeed.js'
import { handleGtfsTrainProxy, type GtfsTrainProxyOptions } from './gtfsTrainProxy.js'

export const ELRON_PROXY_PATH = '/api/trains/elron'
export const ELRON_FEED_URL = 'https://elron.ee/map_data.json'

export const handleElronProxy = (request: Request, options: GtfsTrainProxyOptions = {}) =>
  handleGtfsTrainProxy(request, {
    path: ELRON_PROXY_PATH,
    upstreamUrl: ELRON_FEED_URL,
    name: 'Elron train map',
    cacheSeconds: TRAIN_CONFIG.elron.pollIntervalMs / 1_000,
    userAgent: 'TrackStan/1.6.0 (https://trackstan.xyz)',
    decoder: {
      accept: 'application/json',
      contentTypes: ['application/json'],
      decode: decodeElronMapFeed,
    },
  }, options)
