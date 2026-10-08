import {
  handleAircraftProxy,
  type AircraftProxyFetch,
} from './aircraftProxy.js'
import {
  handleMetarProxy,
  METAR_PROXY_PATH,
} from './metarProxy.js'
import {
  handleOrbitalCatalog,
  ORBITAL_CATALOG_PATH,
  type OrbitalKeyValueStore,
} from './orbitalCatalog.js'
import {
  runScheduledOrbitalCatalogRefresh,
  type OrbitalCatalogCoordinatorNamespace,
} from './orbitalCatalogCoordinator.js'
import {
  handleStarlinkCatalog,
  STARLINK_CATALOG_PATH,
} from './starlinkCatalog.js'
import {
  handleMarineStream,
  MARINE_STREAM_PATH,
  type MarineRelayNamespace,
} from './marineStream.js'
import { handleVesselPhotos } from './vesselPhotos.js'
import { VESSEL_PHOTO_CONFIG } from '../src/config/vesselPhotoConfig.js'
import { AIRPORT_BOARD_CONFIG } from '../src/config/airportBoardConfig.js'
import { handleAirportBoards, type AirportBoardEnvironment } from './airportBoards.js'
export { OrbitalCatalogCoordinator } from './orbitalCatalogCoordinator.js'
export { MarineTrafficRelay } from './marineStream.js'
export { AirportBoardCoordinator } from './airportBoards.js'

interface FetchBinding {
  fetch(
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response>
}

interface WorkerScheduledController {
  noRetry(): void
}

export interface WorkerEnv extends AirportBoardEnvironment {
  ASSETS: FetchBinding
  AIRCRAFT_DELIVERY?: string
  AIRCRAFT_RELAY?: FetchBinding
  AIRCRAFT_RELAY_AUTH_TOKEN?: string
  ORBITAL_CATALOG?: OrbitalKeyValueStore
  ORBITAL_CATALOG_COORDINATOR?: OrbitalCatalogCoordinatorNamespace
  ORBITAL_CATALOG_ENABLED?: string
  STARLINK_CATALOG_ENABLED?: string
  MARINE_SUPPLEMENT_ENABLED?: string
  MARINE_TRAFFIC_RELAY?: MarineRelayNamespace
  AISSTREAM_API_KEY?: string
  OPENWATERS_AIS_TOKEN?: string
  RELEASE_SHA?: string
}

const releaseShaPattern = /^[0-9a-f]{40}$/
const privateRelayOrigin = 'http://livetrafficstan-aircraft-relay'
const relayUnavailableRetryAfterSeconds = 20

const unavailableRelayFetch: AircraftProxyFetch = async () =>
  new Response('Aircraft relay unavailable', {
    status: 503,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Retry-After': String(relayUnavailableRetryAfterSeconds),
    },
  })

const privateRelayFetch = (env: WorkerEnv): AircraftProxyFetch => {
  const relay = env.AIRCRAFT_RELAY
  const authToken = env.AIRCRAFT_RELAY_AUTH_TOKEN
  if (!relay || !authToken || authToken.length < 32) {
    return unavailableRelayFetch
  }

  return async (input, init) => {
    const upstreamRequest = new Request(input, init)
    const relayUrl = new URL(upstreamRequest.url)
    relayUrl.protocol = 'http:'
    relayUrl.host = new URL(privateRelayOrigin).host

    const headers = new Headers(upstreamRequest.headers)
    headers.set('Authorization', `Bearer ${authToken}`)

    return relay.fetch(relayUrl, {
      method: upstreamRequest.method,
      headers,
      redirect: 'manual',
      cache: 'no-store',
      signal: upstreamRequest.signal,
    })
  }
}

const aircraftFetch = (env: WorkerEnv) => {
  if (env.AIRCRAFT_DELIVERY === 'oci-private-relay') {
    return privateRelayFetch(env)
  }
  if (
    env.AIRCRAFT_DELIVERY === undefined ||
    env.AIRCRAFT_DELIVERY === 'worker-proxy' ||
    env.AIRCRAFT_DELIVERY === 'adsb-lol-direct'
  ) {
    return undefined
  }
  return unavailableRelayFetch
}

const withReleaseSha = (response: Response, releaseSha: string | undefined) => {
  if (!releaseSha || !releaseShaPattern.test(releaseSha)) return response

  const releasedResponse = new Response(response.body, response)
  releasedResponse.headers.set('X-LiveTrafficStan-Release', releaseSha)
  return releasedResponse
}

const worker = {
  async fetch(request: Request, env: WorkerEnv) {
    const pathname = new URL(request.url).pathname
    if (pathname === AIRPORT_BOARD_CONFIG.path) {
      return withReleaseSha(await handleAirportBoards(request, env), env.RELEASE_SHA)
    }
    if (pathname === VESSEL_PHOTO_CONFIG.path || pathname.startsWith(`${VESSEL_PHOTO_CONFIG.path}/`)) {
      return withReleaseSha(await handleVesselPhotos(request), env.RELEASE_SHA)
    }
    if (pathname === MARINE_STREAM_PATH) {
      const response = await handleMarineStream(request, env)
      return response.status === 101
        ? response : withReleaseSha(response, env.RELEASE_SHA)
    }
    if (pathname === ORBITAL_CATALOG_PATH) {
      return withReleaseSha(
        await handleOrbitalCatalog(request, env),
        env.RELEASE_SHA,
      )
    }
    if (pathname === STARLINK_CATALOG_PATH) {
      return withReleaseSha(
        await handleStarlinkCatalog(request, env),
        env.RELEASE_SHA,
      )
    }
    if (pathname === METAR_PROXY_PATH) {
      return withReleaseSha(
        await handleMetarProxy(request),
        env.RELEASE_SHA,
      )
    }
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      const fetchImpl = aircraftFetch(env)
      return withReleaseSha(
        await handleAircraftProxy(
          request,
          fetchImpl ? { fetchImpl } : {},
        ),
        env.RELEASE_SHA,
      )
    }

    return env.ASSETS.fetch(request)
  },
  async scheduled(controller: WorkerScheduledController, env: WorkerEnv) {
    controller.noRetry()
    await runScheduledOrbitalCatalogRefresh(env)
  },
}

export default worker
