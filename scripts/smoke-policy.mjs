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
