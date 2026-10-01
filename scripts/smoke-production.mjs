import { createHash, randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { connect } from 'mqtt'
import portsSource from '../src/config/portsSource.json' with {
  type: 'json',
}
import {
  DEPLOYMENT_PROPAGATION_RETRY_DELAYS_MS,
  PRIVATE_RELAY_SMOKE_TIMEOUT_MS,
  SAME_ORIGIN_SMOKE_FETCH_INIT,
  classifyAircraftProxyStatus,
  deriveOrbitalStaticAssetPaths,
  fetchPrivateRelayWithRetry,
  hasOneYearImmutableCacheControl,
  isRetryableStaticAssetStatus,
  readOptionalJson,
  resolveTargetOrbitalSmokeContract,
  resolveTargetStarlinkSmokeContract,
  verifyTargetOrbitalCatalog,
  verifyTargetStarlinkCatalog,
  waitForExpectedWorkerRelease,
} from './smoke-policy.mjs'

const MAX_AIRCRAFT_RESPONSE_BYTES = 4 * 1_024 * 1_024

const [
  deploymentUrl,
  expectedReleaseSha,
  aircraftDelivery = 'worker-proxy',
  orbitalCatalogEnabled = 'false',
  starlinkCatalogEnabled = 'false',
] = process.argv.slice(2)

if (!deploymentUrl || !expectedReleaseSha) {
  throw new Error(
    'Usage: node scripts/smoke-production.mjs <deployment-url> <release-sha> ' +
      '[aircraft-delivery] [orbital-catalog-enabled] ' +
      '[starlink-catalog-enabled]',
  )
}

if (!/^[0-9a-f]{40}$/.test(expectedReleaseSha)) {
  throw new Error('The expected release SHA must be 40 lowercase hex characters')
}

if (
  aircraftDelivery !== 'worker-proxy' &&
  aircraftDelivery !== 'oci-private-relay' &&
  aircraftDelivery !== 'adsb-lol-direct'
) {
  throw new Error(
    'The aircraft delivery must be "worker-proxy", "oci-private-relay", or "adsb-lol-direct"',
  )
}
if (
  orbitalCatalogEnabled !== 'true' &&
  orbitalCatalogEnabled !== 'false'
) {
  throw new Error(
    'The orbital catalog flag must be "true" or "false"',
  )
}
if (
  starlinkCatalogEnabled !== 'true' &&
  starlinkCatalogEnabled !== 'false'
) {
  throw new Error(
    'The Starlink catalog flag must be "true" or "false"',
  )
}
if (
  starlinkCatalogEnabled === 'true' &&
  orbitalCatalogEnabled !== 'true'
) {
  throw new Error(
    'The Starlink catalog requires the curated orbital catalog',
  )
}

const targetOrbitalContract =
  orbitalCatalogEnabled === 'true'
    ? await import('../worker/orbitalCatalog.ts')
    : undefined
const targetOrbitalSmokeContract = targetOrbitalContract
  ? resolveTargetOrbitalSmokeContract(targetOrbitalContract)
  : undefined
const targetStarlinkContract =
  starlinkCatalogEnabled === 'true'
    ? await import('../worker/starlinkCatalog.ts')
    : undefined
const targetStarlinkSmokeContract = targetStarlinkContract
  ? resolveTargetStarlinkSmokeContract(targetStarlinkContract)
  : undefined

const baseUrl = new URL(deploymentUrl)
if (baseUrl.protocol !== 'https:') {
  throw new Error('The production smoke target must use HTTPS')
}

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const vesselPhotoManifest =
  (await readOptionalJson(
    new URL('../src/config/vesselPhotoManifest.json', import.meta.url),
  )) ?? { photos: [] }
assert(
  Array.isArray(vesselPhotoManifest.photos),
  'Vessel photo manifest photos must be an array',
)

const sha256 = (value) => createHash('sha256').update(value).digest('hex')

const fetchWithTimeout = async (url, init = {}, timeoutMs = 15_000) => {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal
  return fetch(url, {
    ...init,
    signal,
  })
}

const remoteBytes = async (pathname, expectedBytes) => {
  const expectedHash = sha256(expectedBytes)
  let response
  let result
  for (const delayMs of DEPLOYMENT_PROPAGATION_RETRY_DELAYS_MS) {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
    response = await fetchWithTimeout(new URL(pathname, baseUrl))

    if (!response.ok) {
      if (!isRetryableStaticAssetStatus(response.status)) {
        break
      }
      void response.body?.cancel().catch(() => undefined)
      continue
    }

    const bytes = new Uint8Array(await response.arrayBuffer())
    result = { bytes, headers: response.headers }
    if (sha256(bytes) === expectedHash) {
      break
    }
  }

  assert(response.ok, `${pathname} returned HTTP ${response.status}`)
  return result
}

const verifyStaticAssets = async () => {
  const localIndex = await readFile('dist/index.html')
  const remoteIndex = await remoteBytes('/', localIndex)
  assert(
    sha256(remoteIndex.bytes) === sha256(localIndex),
    'Deployed index.html does not match the validated build',
  )
  assert(
    remoteIndex.headers.get('cache-control')?.includes('must-revalidate'),
    'Deployed index.html is not configured for revalidation',
  )

  const localServiceWorker = await readFile('dist/sw.js')
  const remoteServiceWorker = await remoteBytes('/sw.js', localServiceWorker)
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
  const remoteManifest = await remoteBytes(
    '/manifest.webmanifest',
    localManifest,
  )
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
    const remoteIcon = await remoteBytes(iconPath, localIcon)
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
  const remoteWorker = await remoteBytes(
    `/assets/${workerName}`,
    localWorker,
  )
  assert(
    sha256(remoteWorker.bytes) === sha256(localWorker),
    'Deployed MapLibre worker does not match the validated build',
  )
  assert(
    remoteWorker.headers.get('x-content-type-options') === 'nosniff',
    'Static security headers are missing',
  )
  assert(
    hasOneYearImmutableCacheControl(
      remoteWorker.headers.get('cache-control'),
    ),
    'Fingerprinted assets are not configured for immutable caching',
  )

  const portPath =
    `/ports/${portsSource.projection.outputVersion}/ports.geojson`
  const localPorts = await readFile(`dist${portPath}`)
  const remotePorts = await remoteBytes(portPath, localPorts)
  assert(
    sha256(remotePorts.bytes) === sha256(localPorts),
    'Deployed port projection does not match the validated build',
  )
  assert(
    hasOneYearImmutableCacheControl(
      remotePorts.headers.get('cache-control'),
    ),
    'Versioned port data is not configured for immutable caching',
  )

  for (const photo of vesselPhotoManifest.photos) {
    const localPhoto = await readFile(`dist${photo.asset.path}`)
    const remotePhoto = await remoteBytes(photo.asset.path, localPhoto)
    assert(
      sha256(remotePhoto.bytes) === sha256(localPhoto),
      `Deployed vessel photo ${photo.imo} does not match the validated build`,
    )
    assert(
      remotePhoto.headers
        .get('content-type')
        ?.includes(photo.asset.mediaType),
      `Deployed vessel photo ${photo.imo} has the wrong content type`,
    )
    assert(
      hasOneYearImmutableCacheControl(
        remotePhoto.headers.get('cache-control'),
      ),
      `Deployed vessel photo ${photo.imo} does not have one-year immutable caching`,
    )
  }

  if (orbitalCatalogEnabled === 'true') {
    const { bootstrapPath: orbitalPath, noticePath } =
      deriveOrbitalStaticAssetPaths(
        targetOrbitalSmokeContract.bootstrapPath,
      )
    const localOrbital = await readFile(`dist${orbitalPath}`)
    const remoteOrbital = await remoteBytes(orbitalPath, localOrbital)
    assert(
      sha256(remoteOrbital.bytes) === sha256(localOrbital),
      'Deployed orbital bootstrap does not match the validated build',
    )
    assert(
      remoteOrbital.headers
        .get('content-type')
        ?.includes('application/json'),
      'Deployed orbital bootstrap has the wrong content type',
    )
    assert(
      hasOneYearImmutableCacheControl(
        remoteOrbital.headers.get('cache-control'),
      ),
      'Deployed orbital bootstrap is not immutable',
    )

    const localNotice = await readFile(`dist${noticePath}`)
    const remoteNotice = await remoteBytes(noticePath, localNotice)
    assert(
      sha256(remoteNotice.bytes) === sha256(localNotice),
      'Deployed orbital notice does not match the validated build',
    )
    assert(
      remoteNotice.headers.get('content-type')?.includes('text/plain'),
      'Deployed orbital notice has the wrong content type',
    )
    assert(
      hasOneYearImmutableCacheControl(
        remoteNotice.headers.get('cache-control'),
      ),
      'Deployed orbital notice is not immutable',
    )
  }

  if (starlinkCatalogEnabled === 'true') {
    const { bootstrapPath, noticePath } =
      deriveOrbitalStaticAssetPaths(
        targetStarlinkSmokeContract.bootstrapPath,
      )
    const localStarlink = await readFile(`dist${bootstrapPath}`)
    const remoteStarlink = await remoteBytes(
      bootstrapPath,
      localStarlink,
    )
    assert(
      sha256(remoteStarlink.bytes) === sha256(localStarlink),
      'Deployed Starlink bootstrap does not match the validated build',
    )
    assert(
      remoteStarlink.headers
        .get('content-type')
        ?.includes('application/json'),
      'Deployed Starlink bootstrap has the wrong content type',
    )
    assert(
      hasOneYearImmutableCacheControl(
        remoteStarlink.headers.get('cache-control'),
      ),
      'Deployed Starlink bootstrap is not immutable',
    )

    const localNotice = await readFile(`dist${noticePath}`)
    const remoteNotice = await remoteBytes(
      noticePath,
      localNotice,
    )
    assert(
      sha256(remoteNotice.bytes) === sha256(localNotice),
      'Deployed Starlink notice does not match the validated build',
    )
    assert(
      remoteNotice.headers.get('content-type')?.includes('text/plain'),
      'Deployed Starlink notice has the wrong content type',
    )
    assert(
      hasOneYearImmutableCacheControl(
        remoteNotice.headers.get('cache-control'),
      ),
      'Deployed Starlink notice is not immutable',
    )
  }
}

const waitForWorkerRelease = async () => {
  const releaseProbePath = '/api/aircraft/v2/point/91/24.754/11'
  await waitForExpectedWorkerRelease({
    fetchProbe: () =>
      fetchWithTimeout(
        new URL(releaseProbePath, baseUrl),
        SAME_ORIGIN_SMOKE_FETCH_INIT,
      ),
    expectedReleaseSha,
  })
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
  const validUrl = new URL(validPath, baseUrl)
  const privateRelayDeadlineController =
    aircraftDelivery === 'oci-private-relay'
      ? new AbortController()
      : undefined
  const privateRelayDeadline = privateRelayDeadlineController
    ? setTimeout(
        () =>
          privateRelayDeadlineController.abort(
            new Error(
              'Private aircraft relay smoke exceeded its bounded deadline',
            ),
          ),
        PRIVATE_RELAY_SMOKE_TIMEOUT_MS,
      )
    : undefined

  try {
    const response =
      aircraftDelivery === 'oci-private-relay'
        ? await fetchPrivateRelayWithRetry({
            fetchRelay: (signal) =>
              fetchWithTimeout(validUrl, {
                ...SAME_ORIGIN_SMOKE_FETCH_INIT,
                signal,
              }),
            expectedReleaseSha,
            signal: privateRelayDeadlineController?.signal,
          })
        : await fetchWithTimeout(
            validUrl,
            SAME_ORIGIN_SMOKE_FETCH_INIT,
          )
    const status =
      aircraftDelivery === 'oci-private-relay'
        ? response.status === 200
          ? 'available'
          : 'failure'
        : classifyAircraftProxyStatus(response.status)
    assert(
      status !== 'failure',
      `${
        aircraftDelivery === 'oci-private-relay'
          ? 'Private aircraft relay'
          : 'Aircraft proxy'
      } returned ${response.status}`,
    )
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
  } catch (error) {
    if (privateRelayDeadlineController?.signal.aborted) {
      throw privateRelayDeadlineController.signal.reason
    }
    throw error
  } finally {
    if (privateRelayDeadline !== undefined) {
      clearTimeout(privateRelayDeadline)
    }
  }

  const unsupported = await fetchWithTimeout(
    new URL('/api/aircraft/v2/all', baseUrl),
    SAME_ORIGIN_SMOKE_FETCH_INIT,
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

const verifyOrbitalCatalog = () =>
  verifyTargetOrbitalCatalog({
    baseUrl,
    enabled: orbitalCatalogEnabled === 'true',
    expectedReleaseSha,
    contract: targetOrbitalSmokeContract,
    fetchResponse: fetchWithTimeout,
  })

const verifyStarlinkCatalog = () =>
  verifyTargetStarlinkCatalog({
    baseUrl,
    enabled: starlinkCatalogEnabled === 'true',
    expectedReleaseSha,
    contract: targetStarlinkSmokeContract,
    fetchResponse: fetchWithTimeout,
  })

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
await verifyOrbitalCatalog()
await verifyStarlinkCatalog()
await verifyDigitrafficRest()
await verifyDigitrafficMqtt()

console.log(`Production smoke passed for ${baseUrl.origin} at ${expectedReleaseSha}`)
