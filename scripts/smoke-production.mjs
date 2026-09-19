import { createHash, randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { connect } from 'mqtt'

const [deploymentUrl, expectedReleaseSha] = process.argv.slice(2)

if (!deploymentUrl || !expectedReleaseSha) {
  throw new Error(
    'Usage: node scripts/smoke-production.mjs <deployment-url> <release-sha>',
  )
}

if (!/^[0-9a-f]{40}$/.test(expectedReleaseSha)) {
  throw new Error('The expected release SHA must be 40 lowercase hex characters')
}

const baseUrl = new URL(deploymentUrl)
if (baseUrl.protocol !== 'https:') {
  throw new Error('The production smoke target must use HTTPS')
}

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex')

const fetchWithTimeout = async (url, init = {}, timeoutMs = 15_000) => {
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(new Error(`Timed out fetching ${url}`)),
    timeoutMs,
  )

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

const remoteBytes = async (pathname) => {
  const response = await fetchWithTimeout(new URL(pathname, baseUrl))
  assert(response.ok, `${pathname} returned HTTP ${response.status}`)
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    headers: response.headers,
  }
}

const verifyStaticAssets = async () => {
  const localIndex = await readFile('dist/index.html')
  const remoteIndex = await remoteBytes('/')
  assert(
    sha256(remoteIndex.bytes) === sha256(localIndex),
    'Deployed index.html does not match the validated build',
  )
  assert(
    remoteIndex.headers.get('cache-control')?.includes('must-revalidate'),
    'Deployed index.html is not configured for revalidation',
  )

  const workerFiles = (await readdir('dist/assets')).filter((name) =>
    /^maplibre-gl-worker-[A-Za-z0-9_-]+\.js$/.test(name),
  )
  assert(workerFiles.length === 1, 'Expected one emitted MapLibre worker')

  const workerName = workerFiles[0]
  const localWorker = await readFile(`dist/assets/${workerName}`)
  const remoteWorker = await remoteBytes(`/assets/${workerName}`)
  assert(
    sha256(remoteWorker.bytes) === sha256(localWorker),
    'Deployed MapLibre worker does not match the validated build',
  )
  assert(
    remoteWorker.headers.get('x-content-type-options') === 'nosniff',
    'Static security headers are missing',
  )
  assert(
    remoteWorker.headers.get('cache-control')?.includes('immutable'),
    'Fingerprinted assets are not configured for immutable caching',
  )
}

const verifyAircraftProxy = async () => {
  const validPath = '/api/aircraft/v2/point/59.437/24.754/11'
  const response = await fetchWithTimeout(new URL(validPath, baseUrl))
  assert(response.status === 200, `Aircraft proxy returned ${response.status}`)
  assert(
    response.headers.get('x-livetrafficstan-release') === expectedReleaseSha,
    'Aircraft proxy release SHA does not match the deployed source',
  )
  assert(
    response.headers.get('cache-control') === 'no-store',
    'Aircraft proxy response is cacheable',
  )
  assert(
    response.headers.get('content-type')?.includes('application/json'),
    'Aircraft proxy did not preserve the JSON content type',
  )
  assert(
    !response.headers.has('access-control-allow-origin'),
    'Aircraft proxy unexpectedly allows cross-origin browser access',
  )

  const payload = await response.json()
  assert(
    payload && typeof payload === 'object' && Array.isArray(payload.ac),
    'Aircraft proxy returned an unexpected payload',
  )

  const invalid = await fetchWithTimeout(
    new URL('/api/aircraft/v2/point/91/24.754/11', baseUrl),
  )
  assert(invalid.status === 400, 'Invalid aircraft coordinates were not rejected')

  const unsupported = await fetchWithTimeout(
    new URL('/api/aircraft/v2/all', baseUrl),
  )
  assert(unsupported.status === 404, 'Unsupported aircraft path was not rejected')
}

const verifyDigitrafficRest = async () => {
  const endpoint = new URL(
    'https://meri.digitraffic.fi/api/ais/v1/locations',
  )
  endpoint.search = new URLSearchParams({
    latitude: '59.437',
    longitude: '24.754',
    radius: '20',
    from: (Date.now() - 15 * 60_000).toString(),
  }).toString()

  const origin = baseUrl.origin
  const preflight = await fetchWithTimeout(endpoint, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'digitraffic-user',
    },
  })
  assert(preflight.ok, `Digitraffic preflight returned ${preflight.status}`)
  assert(
    preflight.headers.get('access-control-allow-origin') === '*' ||
      preflight.headers.get('access-control-allow-origin') === origin,
    'Digitraffic preflight did not allow the deployed origin',
  )

  const response = await fetchWithTimeout(endpoint, {
    headers: {
      Accept: 'application/json',
      'Digitraffic-User': 'LiveTrafficStan/1.0',
      Origin: origin,
    },
  })
  assert(response.ok, `Digitraffic REST returned ${response.status}`)
  await response.json()
}

const verifyDigitrafficMqtt = () =>
  new Promise((resolve, reject) => {
    const client = connect('wss://meri.digitraffic.fi:443/mqtt', {
      protocolVersion: 4,
      clean: true,
      reconnectPeriod: 0,
      connectTimeout: 10_000,
      clientId: `livetrafficstan-smoke-${randomUUID()}`,
    })
    let finished = false

    const finish = (error) => {
      if (finished) return
      finished = true
      clearTimeout(timeout)
      client.end(true, {}, () => {
        if (error) reject(error)
        else resolve()
      })
    }

    const timeout = setTimeout(
      () => finish(new Error('Digitraffic MQTT smoke timed out')),
      15_000,
    )

    client.once('error', (error) => finish(error))
    client.once('connect', () => {
      client.subscribe('vessels-v2/+/location', { qos: 0 }, (error) => {
        if (error) finish(error)
      })
    })
    client.once('message', (_topic, payload) => {
      try {
        JSON.parse(payload.toString())
        finish()
      } catch {
        finish(new Error('Digitraffic MQTT returned invalid JSON'))
      }
    })
  })

await verifyStaticAssets()
await verifyAircraftProxy()
await verifyDigitrafficRest()
await verifyDigitrafficMqtt()

console.log(`Production smoke passed for ${baseUrl.origin} at ${expectedReleaseSha}`)
