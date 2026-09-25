import { createHash, randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { connect } from 'mqtt'
import portsSource from '../src/config/portsSource.json' with {
  type: 'json',
}
import {
  DEPLOYMENT_PROPAGATION_RETRY_DELAYS_MS,
  classifyAircraftProxyStatus,
  isRetryableStaticAssetStatus,
} from './smoke-policy.mjs'

const MAX_AIRCRAFT_RESPONSE_BYTES = 4 * 1_024 * 1_024

const [
  deploymentUrl,
  expectedReleaseSha,
  aircraftDelivery = 'worker-proxy',
] = process.argv.slice(2)

if (!deploymentUrl || !expectedReleaseSha) {
  throw new Error(
    'Usage: node scripts/smoke-production.mjs <deployment-url> <release-sha> [aircraft-delivery]',
  )
}

if (!/^[0-9a-f]{40}$/.test(expectedReleaseSha)) {
  throw new Error('The expected release SHA must be 40 lowercase hex characters')
}

if (
  aircraftDelivery !== 'worker-proxy' &&
  aircraftDelivery !== 'adsb-lol-direct'
) {
  throw new Error(
    'The aircraft delivery must be "worker-proxy" or "adsb-lol-direct"',
  )
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
  let response
  for (const delayMs of DEPLOYMENT_PROPAGATION_RETRY_DELAYS_MS) {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
    response = await fetchWithTimeout(new URL(pathname, baseUrl))
    if (
      response.ok ||
      !isRetryableStaticAssetStatus(response.status)
    ) {
      break
    }
    void response.body?.cancel().catch(() => undefined)
  }

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

  const localServiceWorker = await readFile('dist/sw.js')
  const remoteServiceWorker = await remoteBytes('/sw.js')
  assert(
    sha256(remoteServiceWorker.bytes) === sha256(localServiceWorker),
    'Deployed service worker does not match the validated build',
  )
  assert(
    remoteServiceWorker.headers
      .get('cache-control')
      ?.includes('must-revalidate'),
    'Deployed service worker is not configured for revalidation',
  )
  assert(
    remoteServiceWorker.headers
      .get('content-type')
      ?.includes('application/javascript'),
    'Deployed service worker has the wrong content type',
  )
  assert(
    remoteServiceWorker.headers.get('service-worker-allowed') === '/',
    'Deployed service worker scope header is missing',
  )

  const localManifest = await readFile('dist/manifest.webmanifest')
  const remoteManifest = await remoteBytes('/manifest.webmanifest')
  assert(
    sha256(remoteManifest.bytes) === sha256(localManifest),
    'Deployed manifest does not match the validated build',
  )
  assert(
    remoteManifest.headers
      .get('cache-control')
      ?.includes('must-revalidate'),
    'Deployed manifest is not configured for revalidation',
  )
  assert(
    remoteManifest.headers
      .get('content-type')
      ?.includes('application/manifest+json'),
    'Deployed manifest has the wrong content type',
  )

  for (const size of [192, 512]) {
    const iconPath = `/icons/livetrafficstan-${size}-v1.png`
    const localIcon = await readFile(`dist${iconPath}`)
    const remoteIcon = await remoteBytes(iconPath)
    assert(
      sha256(remoteIcon.bytes) === sha256(localIcon),
      `Deployed ${size}px icon does not match the validated build`,
    )
    assert(
      remoteIcon.headers.get('content-type')?.includes('image/png'),
      `Deployed ${size}px icon has the wrong content type`,
    )
    assert(
      remoteIcon.headers.get('cache-control')?.includes('immutable'),
      `Deployed ${size}px icon is not immutable`,
    )
  }

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

  const portPath =
    `/ports/${portsSource.projection.outputVersion}/ports.geojson`
  const localPorts = await readFile(`dist${portPath}`)
  const remotePorts = await remoteBytes(portPath)
  assert(
    sha256(remotePorts.bytes) === sha256(localPorts),
    'Deployed port projection does not match the validated build',
  )
  assert(
    remotePorts.headers.get('cache-control')?.includes('immutable'),
    'Versioned port data is not configured for immutable caching',
  )
}

const waitForWorkerRelease = async () => {
  const releaseProbePath = '/api/aircraft/v2/point/91/24.754/11'
  let response

  for (const delayMs of DEPLOYMENT_PROPAGATION_RETRY_DELAYS_MS) {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
    response = await fetchWithTimeout(new URL(releaseProbePath, baseUrl))
    if (
      response.headers.get('x-livetrafficstan-release') === expectedReleaseSha
    ) {
      break
    }
    void response.body?.cancel().catch(() => undefined)
  }

  assert(response, 'Worker release probe did not return a response')
  assert(
    response.headers.get('x-livetrafficstan-release') === expectedReleaseSha,
    'Worker release SHA does not match the deployed source',
  )
  assert(response.status === 400, 'Invalid aircraft coordinates were not rejected')
  assert(
    response.headers.get('cache-control') === 'no-store',
    'Aircraft proxy validation response is cacheable',
  )
  assert(
    !response.headers.has('access-control-allow-origin'),
    'Aircraft proxy validation unexpectedly allows cross-origin browser access',
  )
  void response.body?.cancel().catch(() => undefined)
}

const verifyAircraftProxy = async () => {
  await waitForWorkerRelease()

  if (aircraftDelivery === 'adsb-lol-direct') {
    const endpoint = new URL(
      '/v2/point/59.437/24.754/11',
      'https://api.adsb.lol',
    )
    const response = await fetchWithTimeout(endpoint, {
      method: 'GET',
      redirect: 'error',
      cache: 'no-store',
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
        Origin: baseUrl.origin,
        'User-Agent':
          'Mozilla/5.0 AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
      },
    })
    const status = classifyAircraftProxyStatus(response.status)
    assert(
      status !== 'failure',
      `Direct aircraft provider returned ${response.status}`,
    )
    const allowedOrigin = response.headers.get(
      'access-control-allow-origin',
    )
    assert(
      allowedOrigin === '*' || allowedOrigin === baseUrl.origin,
      'Direct aircraft provider did not allow the deployed origin',
    )

    if (status === 'available') {
      assert(
        response.headers.get('content-type')?.includes('application/json'),
        'Direct aircraft provider did not return JSON',
      )
      const declaredBytes = Number(
        response.headers.get('content-length'),
      )
      assert(
        !Number.isFinite(declaredBytes) ||
          declaredBytes <= MAX_AIRCRAFT_RESPONSE_BYTES,
        'Direct aircraft provider declared an oversized response',
      )
      const body = new Uint8Array(await response.arrayBuffer())
      assert(
        body.byteLength <= MAX_AIRCRAFT_RESPONSE_BYTES,
        'Direct aircraft provider returned an oversized response',
      )
      let payload
      try {
        payload = JSON.parse(new TextDecoder().decode(body))
      } catch {
        throw new Error('Direct aircraft provider returned invalid JSON')
      }
      assert(
        payload && typeof payload === 'object' && Array.isArray(payload.ac),
        'Direct aircraft provider returned an unexpected payload',
      )
    } else {
      void response.body?.cancel().catch(() => undefined)
      console.warn(
        'Direct aircraft provider throttled the verified browser-origin request with HTTP 429',
      )
    }
    return
  }

  const validPath = '/api/aircraft/v2/point/59.437/24.754/11'
  const response = await fetchWithTimeout(new URL(validPath, baseUrl))
  const status = classifyAircraftProxyStatus(response.status)
  assert(status !== 'failure', `Aircraft proxy returned ${response.status}`)
  assert(
    response.headers.get('x-livetrafficstan-release') === expectedReleaseSha,
    'Aircraft proxy release SHA does not match the deployed source',
  )
  assert(
    response.headers.get('cache-control') === 'no-store',
    'Aircraft proxy response is cacheable',
  )
  assert(
    !response.headers.has('access-control-allow-origin'),
    'Aircraft proxy unexpectedly allows cross-origin browser access',
  )

  if (status === 'available') {
    assert(
      response.headers.get('content-type')?.includes('application/json'),
      'Aircraft proxy did not preserve the JSON content type',
    )
    const payload = await response.json()
    assert(
      payload && typeof payload === 'object' && Array.isArray(payload.ac),
      'Aircraft proxy returned an unexpected payload',
    )
  } else {
    void response.body?.cancel().catch(() => undefined)
    console.warn(
      'Aircraft provider throttled the verified proxy request with HTTP 429',
    )
  }

  const unsupported = await fetchWithTimeout(
    new URL('/api/aircraft/v2/all', baseUrl),
  )
  assert(unsupported.status === 404, 'Unsupported aircraft path was not rejected')
}

const verifyMetarProxy = async () => {
  const response = await fetchWithTimeout(
    new URL('/api/weather/metar?ids=EETN', baseUrl),
  )
  assert(
    response.status === 200 || response.status === 204,
    `METAR proxy returned ${response.status}`,
  )
  assert(
    response.headers.get('x-livetrafficstan-release') === expectedReleaseSha,
    'METAR proxy release SHA does not match the deployed source',
  )
  assert(
    response.headers.get('cache-control') === 'public, max-age=60',
    'METAR proxy cache guidance is incorrect',
  )
  assert(
    response.headers.get('x-content-type-options') === 'nosniff',
    'METAR proxy nosniff header is missing',
  )
  assert(
    !response.headers.has('access-control-allow-origin'),
    'METAR proxy unexpectedly allows cross-origin browser access',
  )

  const body = new Uint8Array(await response.arrayBuffer())
  assert(body.byteLength <= 256 * 1_024, 'METAR proxy response is oversized')
  if (response.status === 200) {
    assert(
      response.headers.get('content-type')?.includes('application/json'),
      'METAR proxy did not return JSON',
    )
    const payload = JSON.parse(new TextDecoder().decode(body))
    assert(Array.isArray(payload), 'METAR proxy returned an unexpected payload')
    assert(
      payload.every(
        (record) =>
          record &&
          typeof record === 'object' &&
          record.icaoId === 'EETN',
      ),
      'METAR proxy returned an unrequested station',
    )
  }

  const invalid = await fetchWithTimeout(
    new URL('/api/weather/metar?ids=eetn', baseUrl),
  )
  assert(invalid.status === 400, 'Invalid METAR station ID was not rejected')

  const unsupportedMethod = await fetchWithTimeout(
    new URL('/api/weather/metar?ids=EETN', baseUrl),
    { method: 'POST' },
  )
  assert(
    unsupportedMethod.status === 405,
    'Unsupported METAR method was not rejected',
  )
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
await verifyMetarProxy()
await verifyDigitrafficRest()
await verifyDigitrafficMqtt()

console.log(`Production smoke passed for ${baseUrl.origin} at ${expectedReleaseSha}`)
