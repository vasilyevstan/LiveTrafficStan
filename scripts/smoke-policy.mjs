import { readFile } from 'node:fs/promises'

export const DEPLOYMENT_PROPAGATION_RETRY_DELAYS_MS = [
  0,
  1_000,
  2_000,
  4_000,
  8_000,
  15_000,
  30_000,
]

export const PRIVATE_RELAY_MAX_ATTEMPTS = 12
export const PRIVATE_RELAY_MAX_RETRY_AFTER_SECONDS = 30
export const PRIVATE_RELAY_MAX_ADMISSION_WAIT_MS =
  (PRIVATE_RELAY_MAX_ATTEMPTS - 1) *
  PRIVATE_RELAY_MAX_RETRY_AFTER_SECONDS *
  1_000
export const PRIVATE_RELAY_SMOKE_TIMEOUT_MS = 9 * 60_000
export const PRIVATE_RELAY_STATUS_HEADER =
  'x-livetrafficstan-relay-status'
export const PRIVATE_RELAY_ADMISSION_STATUS = 'admission'
export const SAME_ORIGIN_SMOKE_FETCH_INIT = Object.freeze({
  redirect: 'manual',
  cache: 'no-store',
  credentials: 'omit',
})
export const ORBITAL_SCHEMA2_NEGOTIATION_ACCEPT =
  'application/vnd.livetrafficstan.orbital-catalog+json;version=2'
export const STARLINK_CATALOG_MEDIA_TYPE =
  'application/vnd.livetrafficstan.starlink-catalog+json;version=1'
export const STARLINK_SCHEMA2_NEGOTIATION_ACCEPT =
  'application/vnd.livetrafficstan.starlink-catalog+json;version=2'

const releaseShaPattern = /^[0-9a-f]{40}$/

const cancelResponseBody = async (response) => {
  await response.body?.cancel().catch(() => undefined)
}

const defaultWait = (delayMs, signal) =>
  new Promise((resolve, reject) => {
    const handleAbort = () => {
      clearTimeout(timeout)
      reject(signal.reason)
    }
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort)
      resolve()
    }, delayMs)

    if (!signal) return
    if (signal.aborted) {
      handleAbort()
      return
    }
    signal.addEventListener('abort', handleAbort, { once: true })
  })

const classifyWorkerReleaseProbe = (response, expectedReleaseSha) => {
  if (response.status !== 400) {
    throw new Error('Invalid aircraft coordinates were not rejected')
  }
  if (response.headers.get('cache-control') !== 'no-store') {
    throw new Error('Aircraft proxy validation response is cacheable')
  }
  if (response.headers.has('access-control-allow-origin')) {
    throw new Error(
      'Aircraft proxy validation unexpectedly allows cross-origin browser access',
    )
  }

  const releaseSha = response.headers.get('x-livetrafficstan-release')
  if (!releaseShaPattern.test(releaseSha ?? '')) {
    throw new Error('Worker release SHA header is missing or malformed')
  }

  return releaseSha === expectedReleaseSha ? 'current' : 'stale'
}

export const waitForExpectedWorkerRelease = async ({
  fetchProbe,
  expectedReleaseSha,
  retryDelaysMs = DEPLOYMENT_PROPAGATION_RETRY_DELAYS_MS,
  wait = defaultWait,
}) => {
  for (const delayMs of retryDelaysMs) {
    if (delayMs > 0) await wait(delayMs)

    const response = await fetchProbe()
    let state
    try {
      state = classifyWorkerReleaseProbe(response, expectedReleaseSha)
    } catch (error) {
      await cancelResponseBody(response)
      throw error
    }

    await cancelResponseBody(response)
    if (state === 'current') return
  }

  throw new Error('Worker release SHA does not match the deployed source')
}

export const fetchPrivateRelayWithRetry = async ({
  fetchRelay,
  expectedReleaseSha,
  maxAttempts = PRIVATE_RELAY_MAX_ATTEMPTS,
  maxRetryAfterSeconds = PRIVATE_RELAY_MAX_RETRY_AFTER_SECONDS,
  signal,
  wait = defaultWait,
}) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    signal?.throwIfAborted()
    const response = await fetchRelay(signal)
    if (response.status !== 503) return response

    if (
      response.headers.get(PRIVATE_RELAY_STATUS_HEADER) !==
      PRIVATE_RELAY_ADMISSION_STATUS
    ) {
      return response
    }
    if (
      response.headers.get('x-livetrafficstan-release') !==
      expectedReleaseSha
    ) {
      await cancelResponseBody(response)
      throw new Error(
        'Private aircraft relay admission release SHA does not match the deployed source',
      )
    }
    if (response.headers.get('cache-control') !== 'no-store') {
      await cancelResponseBody(response)
      throw new Error(
        'Private aircraft relay admission response is cacheable',
      )
    }
    if (response.headers.has('access-control-allow-origin')) {
      await cancelResponseBody(response)
      throw new Error(
        'Private aircraft relay admission unexpectedly allows cross-origin browser access',
      )
    }

    const retryAfter = response.headers.get('retry-after')
    if (retryAfter === null || !/^\d+$/.test(retryAfter)) {
      await cancelResponseBody(response)
      throw new Error(
        'Private aircraft relay returned 503 without numeric Retry-After',
      )
    }

    const retryAfterSeconds = Number(retryAfter)
    if (
      retryAfterSeconds < 1 ||
      retryAfterSeconds > maxRetryAfterSeconds
    ) {
      await cancelResponseBody(response)
      throw new Error('Private aircraft relay returned an unsafe Retry-After')
    }

    await cancelResponseBody(response)
    if (attempt >= maxAttempts) {
      throw new Error(
        'Private aircraft relay remained unavailable after bounded retries',
      )
    }
    await wait(retryAfterSeconds * 1_000, signal)
  }

  throw new Error('Private aircraft relay retry loop exhausted')
}

export const isRetryableStaticAssetStatus = (status) =>
  status === 404 || status >= 500

export const hasOneYearImmutableCacheControl = (value) => {
  if (typeof value !== 'string') return false

  const directives = value
    .toLowerCase()
    .split(',')
    .map((directive) => directive.trim())
    .filter(Boolean)
  const contradictory = new Set([
    'private',
    'no-cache',
    'no-store',
    'must-revalidate',
    'proxy-revalidate',
  ])
  const maxAges = directives.filter((directive) =>
    directive.startsWith('max-age='),
  )
  const sharedMaxAges = directives.filter((directive) =>
    directive.startsWith('s-maxage='),
  )

  return (
    directives.includes('public') &&
    directives.includes('immutable') &&
    !directives.some((directive) => contradictory.has(directive)) &&
    maxAges.length === 1 &&
    maxAges[0] === 'max-age=31536000' &&
    sharedMaxAges.every(
      (directive) => directive === 's-maxage=31536000',
    )
  )
}

export const deriveOrbitalStaticAssetPaths = (bootstrapPath) => {
  if (
    typeof bootstrapPath !== 'string' ||
    !bootstrapPath.startsWith('/') ||
    bootstrapPath.includes('?') ||
    bootstrapPath.includes('#')
  ) {
    throw new Error('The orbital bootstrap path is invalid')
  }

  const segments = bootstrapPath.slice(1).split('/')
  if (
    segments.length < 2 ||
    segments.some(
      (segment) =>
        segment.length === 0 || segment === '.' || segment === '..',
    )
  ) {
    throw new Error('The orbital bootstrap path is invalid')
  }

  return {
    bootstrapPath,
    noticePath: `${bootstrapPath.slice(
      0,
      bootstrapPath.lastIndexOf('/') + 1,
    )}NOTICE.txt`,
  }
}

const targetExport = (target, name) =>
  target &&
  (typeof target === 'object' || typeof target === 'function') &&
  Object.hasOwn(target, name)
    ? target[name]
    : undefined

export const resolveTargetOrbitalSmokeContract = (target) => {
  const schemaVersion = targetExport(
    target,
    'ORBITAL_CATALOG_SCHEMA_VERSION',
  )
  const sourceContractVersion = targetExport(
    target,
    'ORBITAL_SOURCE_CONTRACT_VERSION',
  )
  const maximumBytes = targetExport(
    target,
    'ORBITAL_MAX_SNAPSHOT_BYTES',
  )
  const bootstrapPath = targetExport(
    target,
    'ORBITAL_BOOTSTRAP_PATH',
  )
  const validateSnapshot = targetExport(
    target,
    'validateOrbitalCatalogSnapshot',
  )

  if (schemaVersion !== 1 && schemaVersion !== 2) {
    throw new Error('The target orbital schema version is unsupported')
  }

  if (
    !Number.isSafeInteger(sourceContractVersion) ||
    sourceContractVersion < 1
  ) {
    throw new Error(
      'The target orbital source contract version is unsupported',
    )
  }
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new Error('The target orbital response limit is invalid')
  }
  if (typeof bootstrapPath !== 'string') {
    throw new Error('The target orbital bootstrap path is missing')
  }
  if (typeof validateSnapshot !== 'function') {
    throw new Error('The target orbital validator is missing')
  }

  const capability = targetExport(
    target,
    'ORBITAL_CATALOG_SMOKE_CAPABILITY',
  )
  if (
    capability !== undefined &&
    capability !== 'dual-representation'
  ) {
    throw new Error('The target orbital smoke capability is unsupported')
  }
  const schema2Accept = targetExport(
    target,
    'ORBITAL_CATALOG_V2_ACCEPT',
  )
  const validateLegacySnapshot = targetExport(
    target,
    'validateLegacyOrbitalCatalogSnapshot',
  )
  const hasDualExports =
    schema2Accept !== undefined ||
    validateLegacySnapshot !== undefined

  if (capability === 'dual-representation' || hasDualExports) {
    if (
      schemaVersion !== 2 ||
      schema2Accept !== ORBITAL_SCHEMA2_NEGOTIATION_ACCEPT ||
      typeof validateLegacySnapshot !== 'function'
    ) {
      throw new Error(
        'The target orbital dual-representation contract is incomplete',
      )
    }
    return {
      mode: 'dual-representation',
      bootstrapPath,
      maximumBytes,
      schemaVersion,
      sourceContractVersion,
      validateSnapshot,
      schema2Accept,
      validateLegacySnapshot,
    }
  }

  return {
    mode: schemaVersion === 1 ? 'schema1-only' : 'schema2-only',
    bootstrapPath,
    maximumBytes,
    schemaVersion,
    sourceContractVersion,
    validateSnapshot,
  }
}

export const resolveTargetStarlinkSmokeContract = (target) => {
  const schemaVersion = targetExport(
    target,
    'STARLINK_CATALOG_SCHEMA_VERSION',
  )
  const sourceContractVersion = targetExport(
    target,
    'STARLINK_SOURCE_CONTRACT_VERSION',
  )
  const maximumBytes = targetExport(
    target,
    'STARLINK_MAX_SNAPSHOT_BYTES',
  )
  const bootstrapPath = targetExport(
    target,
    'STARLINK_BOOTSTRAP_PATH',
  )
  const mediaType = targetExport(
    target,
    'STARLINK_CATALOG_MEDIA_TYPE',
  )
  const validateSnapshot = targetExport(
    target,
    'validateStarlinkCatalogSnapshot',
  )
  if (
    schemaVersion !== 1 ||
    sourceContractVersion !== 1 ||
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 1 ||
    typeof bootstrapPath !== 'string' ||
    mediaType !== STARLINK_CATALOG_MEDIA_TYPE ||
    typeof validateSnapshot !== 'function'
  ) {
    throw new Error(
      'The target Starlink catalog contract is incomplete',
    )
  }
  const schema2Version = targetExport(
    target,
    'STARLINK_CATALOG_V2_SCHEMA_VERSION',
  )
  const schema2SourceContractVersion = targetExport(
    target,
    'STARLINK_V2_SOURCE_CONTRACT_VERSION',
  )
  const schema2MaximumBytes = targetExport(
    target,
    'STARLINK_V2_MAX_SNAPSHOT_BYTES',
  )
  const schema2BootstrapPath = targetExport(
    target,
    'STARLINK_V2_BOOTSTRAP_PATH',
  )
  const schema2MediaType = targetExport(
    target,
    'STARLINK_CATALOG_V2_MEDIA_TYPE',
  )
  const validateSchema2Snapshot = targetExport(
    target,
    'validateStarlinkCatalogSnapshotV2',
  )
  const hasSchema2Contract = [
    schema2Version,
    schema2SourceContractVersion,
    schema2MaximumBytes,
    schema2BootstrapPath,
    schema2MediaType,
    validateSchema2Snapshot,
  ].some((value) => value !== undefined)
  if (hasSchema2Contract) {
    if (
      schema2Version !== 2 ||
      schema2SourceContractVersion !== 2 ||
      !Number.isSafeInteger(schema2MaximumBytes) ||
      schema2MaximumBytes < maximumBytes ||
      typeof schema2BootstrapPath !== 'string' ||
      schema2MediaType !== STARLINK_SCHEMA2_NEGOTIATION_ACCEPT ||
      typeof validateSchema2Snapshot !== 'function'
    ) {
      throw new Error(
        'The target Starlink dual-representation contract is incomplete',
      )
    }
    return {
      mode: 'dual-representation',
      bootstrapPath,
      maximumBytes,
      mediaType,
      schemaVersion,
      sourceContractVersion,
      validateSnapshot,
      schema2Accept: schema2MediaType,
      schema2BootstrapPath,
      schema2MaximumBytes,
      schema2Version,
      schema2SourceContractVersion,
      validateSchema2Snapshot,
    }
  }
  return {
    mode: 'schema1-only',
    bootstrapPath,
    maximumBytes,
    mediaType,
    schemaVersion,
    sourceContractVersion,
    validateSnapshot,
  }
}

const smokeAssert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const isCanonicalTimestamp = (value) => {
  if (typeof value !== 'string') return false
  const timeMs = Date.parse(value)
  return (
    Number.isFinite(timeMs) &&
    new Date(timeMs).toISOString() === value
  )
}

const variesByAccept = (response) =>
  response.headers
    .get('vary')
    ?.toLowerCase()
    .split(',')
    .map((value) => value.trim())
    .includes('accept') === true

export const verifyTargetOrbitalCatalog = async ({
  baseUrl,
  enabled,
  expectedReleaseSha,
  contract,
  fetchResponse,
}) => {
  const url = new URL('/api/orbits/catalog', baseUrl)
  const defaultResponse = await fetchResponse(url)

  if (!enabled) {
    smokeAssert(
      defaultResponse.status === 404,
      'Disabled orbital catalog was exposed',
    )
    await cancelResponseBody(defaultResponse)
    return { mode: 'disabled' }
  }
  if (!contract) {
    throw new Error('The enabled target orbital contract is missing')
  }

  const validateResponse = async ({
    response,
    expectedSchema,
    expectedSourceContract,
    validateSnapshot,
    requireAcceptVary,
  }) => {
    smokeAssert(
      response.headers.get('x-livetrafficstan-release') ===
        expectedReleaseSha,
      'Orbital catalog release SHA does not match the deployed source',
    )
    smokeAssert(
      response.status === 200,
      `Orbital catalog schema ${expectedSchema} returned ${response.status}`,
    )
    smokeAssert(
      response.headers.get('content-type')?.includes('application/json'),
      'Orbital catalog did not return JSON',
    )
    smokeAssert(
      response.headers.get('cache-control') ===
        'public, max-age=300, must-revalidate',
      'Orbital catalog cache guidance is incorrect',
    )
    if (requireAcceptVary) {
      smokeAssert(
        variesByAccept(response),
        'Orbital catalog does not vary by Accept',
      )
    }
    smokeAssert(
      response.headers.get('x-content-type-options') === 'nosniff',
      'Orbital catalog nosniff header is missing',
    )
    smokeAssert(
      !response.headers.has('access-control-allow-origin'),
      'Orbital catalog unexpectedly allows cross-origin access',
    )
    const source = response.headers.get(
      'x-livetrafficstan-orbital-source',
    )
    smokeAssert(
      source === 'kv' || source === 'bootstrap',
      'Orbital catalog source identity is missing',
    )
    smokeAssert(
      response.headers.get('x-livetrafficstan-orbital-schema') ===
        String(expectedSchema),
      'Orbital catalog schema header is incorrect',
    )

    const body = new Uint8Array(await response.arrayBuffer())
    smokeAssert(
      body.byteLength <= contract.maximumBytes,
      'Orbital catalog response is oversized',
    )
    const payload = await validateSnapshot(
      JSON.parse(new TextDecoder().decode(body)),
    )
    smokeAssert(
      payload.schemaVersion === expectedSchema &&
        payload.sourceContractVersion ===
          expectedSourceContract,
      'Orbital catalog returned an unsupported release contract',
    )
    smokeAssert(
      response.headers.get('x-livetrafficstan-orbital-sha256') ===
        payload.sha256,
      'Orbital catalog digest header does not match the payload',
    )
    const etag = response.headers.get('etag')
    smokeAssert(
      etag === `"${payload.sha256}"` ||
        etag === `W/"${payload.sha256}"`,
      'Orbital catalog ETag does not match the payload digest',
    )
    return { etag, payload, source }
  }

  const verifyConditional = async (
    response,
    etag,
    label,
    requireAcceptVary,
  ) => {
    smokeAssert(
      response.status === 304,
      `${label} orbital conditional request did not return 304`,
    )
    smokeAssert(
      response.headers.get('etag') === etag,
      `${label} orbital conditional ETag changed`,
    )
    if (requireAcceptVary) {
      smokeAssert(
        variesByAccept(response),
        `${label} orbital conditional response does not vary by Accept`,
      )
    }
    await cancelResponseBody(response)
  }

  if (contract.mode !== 'dual-representation') {
    const representation = await validateResponse({
      response: defaultResponse,
      expectedSchema: contract.schemaVersion,
      expectedSourceContract: contract.sourceContractVersion,
      validateSnapshot: contract.validateSnapshot,
      requireAcceptVary: false,
    })
    await verifyConditional(
      await fetchResponse(url, {
        headers: { 'If-None-Match': representation.etag },
      }),
      representation.etag,
      `Schema-${contract.schemaVersion}`,
      false,
    )
  } else {
    const schema1 = await validateResponse({
      response: defaultResponse,
      expectedSchema: 1,
      expectedSourceContract: 1,
      validateSnapshot: contract.validateLegacySnapshot,
      requireAcceptVary: true,
    })
    await verifyConditional(
      await fetchResponse(url, {
        headers: { 'If-None-Match': schema1.etag },
      }),
      schema1.etag,
      'Default schema-1',
      true,
    )

    const schema2 = await validateResponse({
      response: await fetchResponse(url, {
        headers: { Accept: contract.schema2Accept },
      }),
      expectedSchema: contract.schemaVersion,
      expectedSourceContract: contract.sourceContractVersion,
      validateSnapshot: contract.validateSnapshot,
      requireAcceptVary: true,
    })
    smokeAssert(
      schema2.etag !== schema1.etag,
      'Orbital schema representations unexpectedly share an ETag',
    )
    if (schema2.source === 'kv') {
      const visualSource = schema2.payload.sources.find(
        (source) => source.group === 'visual',
      )
      smokeAssert(
        schema1.source === 'kv',
        'KV schema 2 did not expose a current KV schema-1 representation',
      )
      smokeAssert(
        visualSource?.gpRecordCount === schema1.payload.recordCount,
        'Default schema-1 visual population does not match schema 2',
      )
      smokeAssert(
        Date.parse(schema1.payload.retrievedAt) >=
          Date.parse(schema2.payload.retrievedAt),
        'Default schema 1 is older than the current KV schema-2 publication',
      )
    }
    await verifyConditional(
      await fetchResponse(url, {
        headers: {
          Accept: contract.schema2Accept,
          'If-None-Match': schema2.etag,
        },
      }),
      schema2.etag,
      'Negotiated schema-2',
      true,
    )

    const crossRepresentation = await fetchResponse(url, {
      headers: {
        Accept: contract.schema2Accept,
        'If-None-Match': schema1.etag,
      },
    })
    smokeAssert(
      crossRepresentation.status === 200,
      'A schema-1 ETag incorrectly validated schema 2',
    )
    smokeAssert(
      crossRepresentation.headers.get('etag') === schema2.etag,
      'Cross-representation schema-2 ETag is incorrect',
    )
    smokeAssert(
      variesByAccept(crossRepresentation),
      'Cross-representation response does not vary by Accept',
    )
    await cancelResponseBody(crossRepresentation)
  }

  const query = await fetchResponse(
    new URL('/api/orbits/catalog?group=active', baseUrl),
  )
  smokeAssert(
    query.status === 400,
    'Orbital catalog query was not rejected',
  )
  await cancelResponseBody(query)
  const method = await fetchResponse(url, { method: 'POST' })
  smokeAssert(
    method.status === 405,
    'Orbital catalog method was not rejected',
  )
  await cancelResponseBody(method)
  return { mode: contract.mode }
}

export const verifyTargetStarlinkCatalog = async ({
  baseUrl,
  enabled,
  expectedReleaseSha,
  contract,
  fetchResponse,
}) => {
  const url = new URL('/api/orbits/starlink', baseUrl)
  const response = await fetchResponse(url)
  if (!enabled) {
    smokeAssert(
      response.status === 404,
      'Disabled Starlink catalog was exposed',
    )
    await cancelResponseBody(response)
    return { mode: 'disabled' }
  }
  if (!contract) {
    throw new Error(
      'The enabled target Starlink contract is missing',
    )
  }
  const validateResponse = async ({
    candidate,
    mediaType,
    maximumBytes,
    schemaVersion,
    sourceContractVersion,
    validateSnapshot,
    requireAcceptVary,
  }) => {
    smokeAssert(
      candidate.headers.get('x-livetrafficstan-release') ===
        expectedReleaseSha,
      'Starlink catalog release SHA does not match the deployed source',
    )
    smokeAssert(
      candidate.status === 200,
      `Starlink catalog schema ${schemaVersion} returned ${candidate.status}`,
    )
    smokeAssert(
      candidate.headers.get('content-type') === mediaType,
      'Starlink catalog media type is incorrect',
    )
    smokeAssert(
      candidate.headers.get('cache-control') === 'no-store',
      'Starlink catalog cache guidance is incorrect',
    )
    smokeAssert(
      candidate.headers.get('x-content-type-options') === 'nosniff',
      'Starlink catalog nosniff header is missing',
    )
    smokeAssert(
      !candidate.headers.has('access-control-allow-origin'),
      'Starlink catalog unexpectedly allows cross-origin access',
    )
    if (requireAcceptVary) {
      smokeAssert(
        variesByAccept(candidate),
        'Starlink catalog does not vary by Accept',
      )
    }
    const source = candidate.headers.get(
      'x-livetrafficstan-starlink-source',
    )
    smokeAssert(
      source === 'kv' || source === 'bootstrap',
      'Starlink catalog source identity is missing',
    )
    smokeAssert(
      candidate.headers.get(
        'x-livetrafficstan-starlink-schema',
      ) === String(schemaVersion),
      'Starlink catalog schema header is incorrect',
    )
    smokeAssert(
      isCanonicalTimestamp(
        candidate.headers.get('x-livetrafficstan-served-at'),
      ),
      'Starlink catalog served-at header is missing or invalid',
    )
    const publishedAt = candidate.headers.get(
      'x-livetrafficstan-starlink-published-at',
    )
    smokeAssert(
      isCanonicalTimestamp(publishedAt),
      'Starlink catalog published-at header is missing or invalid',
    )
    const body = new Uint8Array(await candidate.arrayBuffer())
    smokeAssert(
      body.byteLength <= maximumBytes,
      'Starlink catalog response is oversized',
    )
    const payload = await validateSnapshot(
      JSON.parse(new TextDecoder().decode(body)),
    )
    smokeAssert(
      payload.schemaVersion === schemaVersion &&
        payload.sourceContractVersion === sourceContractVersion,
      'Starlink catalog returned an unsupported release contract',
    )
    smokeAssert(
      candidate.headers.get(
        'x-livetrafficstan-starlink-digest',
      ) === payload.digest,
      'Starlink catalog digest header does not match the payload',
    )
    smokeAssert(
      publishedAt === payload.publishedAt,
      'Starlink catalog published-at header does not match the payload',
    )
    const etag = candidate.headers.get('etag')
    smokeAssert(
      etag === `W/"${payload.digest}"`,
      'Starlink catalog ETag does not match the payload digest',
    )
    return { etag, payload, source }
  }

  const verifyConditional = async ({
    headers,
    representation,
    schemaVersion,
    requireAcceptVary,
  }) => {
    const conditional = await fetchResponse(url, { headers })
    smokeAssert(
      conditional.status === 304,
      `Starlink schema-${schemaVersion} conditional request did not return 304`,
    )
    smokeAssert(
      conditional.headers.get('etag') === representation.etag,
      'Starlink conditional ETag changed',
    )
    smokeAssert(
      conditional.headers.get('cache-control') === 'no-store',
      'Starlink conditional cache guidance is incorrect',
    )
    smokeAssert(
      conditional.headers.get(
        'x-livetrafficstan-starlink-digest',
      ) === representation.payload.digest,
      'Starlink conditional digest header is incorrect',
    )
    smokeAssert(
      conditional.headers.get(
        'x-livetrafficstan-starlink-published-at',
      ) === representation.payload.publishedAt,
      'Starlink conditional published-at header is incorrect',
    )
    smokeAssert(
      conditional.headers.get(
        'x-livetrafficstan-starlink-schema',
      ) === String(schemaVersion),
      'Starlink conditional schema header is incorrect',
    )
    const conditionalSource = conditional.headers.get(
      'x-livetrafficstan-starlink-source',
    )
    smokeAssert(
      conditionalSource === 'kv' ||
        conditionalSource === 'bootstrap',
      'Starlink conditional source identity is missing',
    )
    if (requireAcceptVary) {
      smokeAssert(
        variesByAccept(conditional),
        'Starlink conditional response does not vary by Accept',
      )
    }
    smokeAssert(
      isCanonicalTimestamp(
        conditional.headers.get('x-livetrafficstan-served-at'),
      ),
      'Starlink conditional served-at header is missing or invalid',
    )
    await cancelResponseBody(conditional)
  }

  const schema1 = await validateResponse({
    candidate: response,
    mediaType: contract.mediaType,
    maximumBytes: contract.maximumBytes,
    schemaVersion: contract.schemaVersion,
    sourceContractVersion: contract.sourceContractVersion,
    validateSnapshot: contract.validateSnapshot,
    requireAcceptVary: contract.mode === 'dual-representation',
  })
  await verifyConditional({
    headers: { 'If-None-Match': schema1.etag },
    representation: schema1,
    schemaVersion: contract.schemaVersion,
    requireAcceptVary: contract.mode === 'dual-representation',
  })

  if (contract.mode === 'dual-representation') {
    const schema2 = await validateResponse({
      candidate: await fetchResponse(url, {
        headers: { Accept: contract.schema2Accept },
      }),
      mediaType: contract.schema2Accept,
      maximumBytes: contract.schema2MaximumBytes,
      schemaVersion: contract.schema2Version,
      sourceContractVersion:
        contract.schema2SourceContractVersion,
      validateSnapshot: contract.validateSchema2Snapshot,
      requireAcceptVary: true,
    })
    smokeAssert(
      schema1.etag !== schema2.etag,
      'Starlink schema representations unexpectedly share an ETag',
    )
    if (schema2.source === 'kv') {
      const schema1Generation = Math.max(
        Date.parse(schema1.payload.sources.gp.retrievedAt),
        Date.parse(schema1.payload.sources.satcat.retrievedAt),
      )
      const schema2Generation = Math.max(
        Date.parse(schema2.payload.sources.gp.retrievedAt),
        Date.parse(schema2.payload.sources.satcat.retrievedAt),
      )
      smokeAssert(
        Number.isFinite(schema1Generation) &&
          Number.isFinite(schema2Generation) &&
          schema1Generation >= schema2Generation,
        'Starlink schema 1 is older than the KV schema-2 representation',
      )
      if (schema1Generation === schema2Generation) {
        smokeAssert(
          JSON.stringify(schema1.payload.sources) ===
            JSON.stringify(schema2.payload.sources) &&
            schema1.payload.populationCount ===
              schema2.payload.populationCount &&
            schema1.payload.extraSatcatCount ===
              schema2.payload.extraSatcatCount &&
            schema1.payload.publishedAt ===
              schema2.payload.publishedAt,
          'Same-generation Starlink representations are not aligned',
        )
      }
    }
    await verifyConditional({
      headers: {
        Accept: contract.schema2Accept,
        'If-None-Match': schema2.etag,
      },
      representation: schema2,
      schemaVersion: contract.schema2Version,
      requireAcceptVary: true,
    })
    const crossRepresentation = await fetchResponse(url, {
      headers: {
        Accept: contract.schema2Accept,
        'If-None-Match': schema1.etag,
      },
    })
    smokeAssert(
      crossRepresentation.status === 200 &&
        crossRepresentation.headers.get('etag') === schema2.etag,
      'A Starlink schema-1 ETag incorrectly validated schema 2',
    )
    await cancelResponseBody(crossRepresentation)
  }

  const query = await fetchResponse(
    new URL('/api/orbits/starlink?all=true', baseUrl),
  )
  smokeAssert(
    query.status === 400,
    'Starlink catalog query was not rejected',
  )
  await cancelResponseBody(query)
  const method = await fetchResponse(url, { method: 'POST' })
  smokeAssert(
    method.status === 405,
    'Starlink catalog method was not rejected',
  )
  await cancelResponseBody(method)
  return { mode: contract.mode, source: schema1.source }
}

export const readOptionalJson = async (file) => {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return undefined
    }
    throw error
  }
}

export const classifyAircraftProxyStatus = (status) => {
  if (status === 200) return 'available'
  if (status === 429) return 'provider-throttled'
  return 'failure'
}
