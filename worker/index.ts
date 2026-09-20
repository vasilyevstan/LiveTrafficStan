import { handleAircraftProxy } from './aircraftProxy.js'
import {
  FLIGHT_ROUTE_PATH,
  handleFlightRoute,
  type FlightRouteWorkerEnv,
} from './flightRoute.js'
import {
  handleMetarProxy,
  METAR_PROXY_PATH,
} from './metarProxy.js'
export { FlightRouteQuota } from './flightRouteQuota.js'

interface AssetsBinding {
  fetch(request: Request): Promise<Response>
}

export interface WorkerEnv extends FlightRouteWorkerEnv {
  ASSETS: AssetsBinding
  RELEASE_SHA?: string
}

const releaseShaPattern = /^[0-9a-f]{40}$/

const withReleaseSha = (response: Response, releaseSha: string | undefined) => {
  if (!releaseSha || !releaseShaPattern.test(releaseSha)) return response

  const releasedResponse = new Response(response.body, response)
  releasedResponse.headers.set('X-LiveTrafficStan-Release', releaseSha)
  return releasedResponse
}

const worker = {
  async fetch(request: Request, env: WorkerEnv) {
    const pathname = new URL(request.url).pathname
    if (pathname === FLIGHT_ROUTE_PATH) {
      return withReleaseSha(
        await handleFlightRoute(request, env),
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
      return withReleaseSha(
        await handleAircraftProxy(request),
        env.RELEASE_SHA,
      )
    }

    return env.ASSETS.fetch(request)
  },
}

export default worker
