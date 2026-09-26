import {
  handleAircraftProxy,
  type AircraftProxyFetch,
} from './aircraftProxy.js'
import {
  handleMetarProxy,
  METAR_PROXY_PATH,
} from './metarProxy.js'

interface FetchBinding {
  fetch(
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response>
}

export interface WorkerEnv {
  ASSETS: FetchBinding
  AIRCRAFT_DELIVERY?: string
  AIRCRAFT_RELAY?: FetchBinding
  AIRCRAFT_RELAY_AUTH_TOKEN?: string
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
}

export default worker
