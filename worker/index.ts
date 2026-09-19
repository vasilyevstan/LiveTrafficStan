import { handleAircraftProxy } from './aircraftProxy.js'

interface AssetsBinding {
  fetch(request: Request): Promise<Response>
}

export interface WorkerEnv {
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
