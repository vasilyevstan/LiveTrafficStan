import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import {
  createAircraftRelayHandler,
  FileAdmissionStateStore,
} from './relay.mjs'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 8788
const DEFAULT_STATE_PATH =
  '/var/lib/livetrafficstan-aircraft-relay/admission-state.json'

const readPort = (value) => {
  if (value === undefined) return DEFAULT_PORT
  if (!/^\d+$/.test(value)) throw new Error('Invalid relay port')

  const port = Number(value)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('Invalid relay port')
  }
  return port
}

const readHost = (value) => {
  const host = value ?? DEFAULT_HOST
  if (host !== '127.0.0.1' && host !== '::1') {
    throw new Error('Relay host must be loopback')
  }
  return host
}

export const readRelayConfiguration = (environment = process.env) => ({
  authToken: environment.LTS_RELAY_AUTH_TOKEN ?? '',
  releaseSha: environment.LTS_RELAY_RELEASE_SHA ?? '',
  statePath:
    environment.LTS_RELAY_STATE_PATH ?? DEFAULT_STATE_PATH,
  host: readHost(environment.LTS_RELAY_HOST),
  port: readPort(environment.LTS_RELAY_PORT),
})

const writeResponse = async (nodeResponse, response) => {
  for (const [name, value] of response.headers) {
    nodeResponse.setHeader(name, value)
  }
  nodeResponse.statusCode = response.status
  nodeResponse.statusMessage = response.statusText

  const body = Buffer.from(await response.arrayBuffer())
  nodeResponse.setHeader('Content-Length', String(body.byteLength))
  nodeResponse.end(body)
}

export const startRelayServer = async (
  configuration = readRelayConfiguration(),
  {
    fetchImpl = fetch,
    stateStore = new FileAdmissionStateStore(configuration.statePath),
    log = (message) => process.stdout.write(message),
  } = {},
) => {
  const handler = await createAircraftRelayHandler({
    authToken: configuration.authToken,
    releaseSha: configuration.releaseSha,
    stateStore,
    fetchImpl,
  })

  const server = createServer(async (request, response) => {
    const controller = new AbortController()
    request.once('aborted', () => controller.abort())
    response.once('close', () => {
      if (!response.writableEnded) controller.abort()
    })

    try {
      const headers = new Headers()
      for (const [name, value] of Object.entries(request.headers)) {
        if (Array.isArray(value)) {
          for (const item of value) headers.append(name, item)
        } else if (value !== undefined) {
          headers.set(name, value)
        }
      }

      const relayRequest = new Request(
        `http://relay.internal${request.url ?? '/'}`,
        {
          method: request.method,
          headers,
          signal: controller.signal,
        },
      )
      await writeResponse(response, await handler(relayRequest))
    } catch {
      if (!response.headersSent) {
        await writeResponse(
          response,
          textResponse('Aircraft relay internal error', 500),
        )
      } else {
        response.destroy()
      }
    }
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(configuration.port, configuration.host, resolve)
  })

  log(
    `relay_listening host=${configuration.host} port=${configuration.port} release_sha=${configuration.releaseSha}\n`,
  )
  return server
}

const textResponse = (message, status) =>
  new Response(message, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  })

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startRelayServer().catch(() => {
    process.stderr.write('relay_startup_failed\n')
    process.exitCode = 1
  })
}
