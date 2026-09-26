import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export const ADSB_LOL_ORIGIN = 'https://api.adsb.lol'
export const ADSB_LOL_USER_AGENT =
  'LiveTrafficStan (+https://github.com/vasilyevstan/LiveTrafficStan)'
export const MINIMUM_UPSTREAM_INTERVAL_MS = 20_000
export const MAXIMUM_FALLBACK_BACKOFF_MS = 5 * 60_000
export const UPSTREAM_TIMEOUT_MS = 10_000
export const MAXIMUM_RESPONSE_BYTES = 4 * 1024 * 1024

const coordinatePattern = /^-?(?:0|[1-9]\d*)(?:\.\d{1,7})?$/
const radiusPattern = /^(?:[1-9]|[1-4]\d|5[0-4])$/

class ResponseTooLargeError extends Error {}
class AdmissionStateError extends Error {}

const textResponse = (message, status, headers = {}) =>
  new Response(message, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  })

const decodeCanonicalSegment = (segment) => {
  let decoded
  try {
    decoded = decodeURIComponent(segment)
  } catch {
    return undefined
  }

  return decoded === segment ? decoded : undefined
}

const canonicalCoordinate = (segment, minimum, maximum) => {
  const decoded = decodeCanonicalSegment(segment)
  if (!decoded || !coordinatePattern.test(decoded)) return undefined

  const value = Number(decoded)
  if (
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum ||
    String(value) !== decoded
  ) {
    return undefined
  }

  return decoded
}

export const parsePointPath = (pathname) => {
  const segments = pathname.split('/')
  if (
    segments.length !== 6 ||
    segments[0] !== '' ||
    segments[1] !== 'v2' ||
    segments[2] !== 'point'
  ) {
    return undefined
  }

  const latitude = canonicalCoordinate(segments[3] ?? '', -90, 90)
  const longitude = canonicalCoordinate(segments[4] ?? '', -180, 180)
  const radiusNm = decodeCanonicalSegment(segments[5] ?? '')

  if (!latitude || !longitude || !radiusNm || !radiusPattern.test(radiusNm)) {
    return undefined
  }

  return { latitude, longitude, radiusNm }
}

export const parseRetryAfterMs = (value, nowMs) => {
  if (!value) return undefined

  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed)
    return Number.isSafeInteger(seconds) ? seconds * 1_000 : undefined
  }

  const retryAt = Date.parse(trimmed)
  if (!Number.isFinite(retryAt)) return undefined
  return Math.max(0, retryAt - nowMs)
}

const fallbackBackoffMs = (failureCount) =>
  Math.min(
    MINIMUM_UPSTREAM_INTERVAL_MS * 2 ** Math.max(0, failureCount - 1),
    MAXIMUM_FALLBACK_BACKOFF_MS,
  )

const validateAdmissionState = (value) => {
  if (
    !value ||
    typeof value !== 'object' ||
    !Number.isSafeInteger(value.nextAllowedAtMs) ||
    value.nextAllowedAtMs < 0 ||
    !Number.isSafeInteger(value.failureCount) ||
    value.failureCount < 0
  ) {
    throw new AdmissionStateError('Invalid relay admission state')
  }

  return {
    nextAllowedAtMs: value.nextAllowedAtMs,
    failureCount: value.failureCount,
  }
}

export class FileAdmissionStateStore {
  constructor(path) {
    this.path = path
  }

  async load() {
    try {
      return validateAdmissionState(
        JSON.parse(await readFile(this.path, 'utf8')),
      )
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return { nextAllowedAtMs: 0, failureCount: 0 }
      }
      if (error instanceof AdmissionStateError) throw error
      throw new AdmissionStateError('Unable to read relay admission state')
    }
  }

  async save(state) {
    const validated = validateAdmissionState(state)
    const temporaryPath = `${this.path}.${process.pid}.${randomUUID()}.tmp`

    try {
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
      await writeFile(
        temporaryPath,
        `${JSON.stringify(validated)}\n`,
        { mode: 0o600 },
      )
      await rename(temporaryPath, this.path)
    } catch {
      await unlink(temporaryPath).catch(() => undefined)
      throw new AdmissionStateError('Unable to persist relay admission state')
    }
  }
}

export const createMemoryAdmissionStateStore = (
  initialState = { nextAllowedAtMs: 0, failureCount: 0 },
) => {
  let state = validateAdmissionState(initialState)

  return {
    async load() {
      return { ...state }
    },
    async save(nextState) {
      state = validateAdmissionState(nextState)
    },
    snapshot() {
      return { ...state }
    },
  }
}

class AdmissionController {
  constructor({ state, persist, now }) {
    this.state = state
    this.persist = persist
    this.now = now
    this.inFlight = false
    this.persistenceFailed = false
  }

  retryAfterSeconds(nowMs = this.now()) {
    return Math.max(
      1,
      Math.ceil((this.state.nextAllowedAtMs - nowMs) / 1_000),
    )
  }

  async acquire() {
    if (this.persistenceFailed) {
      throw new AdmissionStateError('Relay admission state is unavailable')
    }

    const nowMs = this.now()
    if (this.inFlight || nowMs < this.state.nextAllowedAtMs) {
      return {
        accepted: false,
        retryAfterSeconds: this.retryAfterSeconds(nowMs),
      }
    }

    this.inFlight = true
    const previous = { ...this.state }
    this.state.nextAllowedAtMs = nowMs + MINIMUM_UPSTREAM_INTERVAL_MS

    try {
      await this.persist(this.state)
    } catch (error) {
      this.state = previous
      this.inFlight = false
      this.persistenceFailed = true
      throw error
    }

    let completed = false
    return {
      accepted: true,
      complete: async ({ status, retryAfter }) => {
        if (completed) return
        completed = true

        try {
          if (status === 429) {
            this.state.failureCount += 1
            const providerDelayMs = parseRetryAfterMs(
              retryAfter,
              this.now(),
            )
            const delayMs =
              providerDelayMs ??
              fallbackBackoffMs(this.state.failureCount)
            this.state.nextAllowedAtMs = Math.max(
              this.state.nextAllowedAtMs,
              this.now() + delayMs,
            )
            await this.persist(this.state)
          } else if (this.state.failureCount !== 0) {
            this.state.failureCount = 0
            await this.persist(this.state)
          }
        } catch (error) {
          this.persistenceFailed = true
          throw error
        } finally {
          this.inFlight = false
        }
      },
      release: () => {
        if (completed) return
        completed = true
        this.inFlight = false
      },
    }
  }
}

const isAuthorized = (request, authToken) => {
  const supplied = request.headers.get('Authorization') ?? ''
  const expectedDigest = createHash('sha256')
    .update(`Bearer ${authToken}`)
    .digest()
  const suppliedDigest = createHash('sha256').update(supplied).digest()
  return timingSafeEqual(expectedDigest, suppliedDigest)
}

const responseHeaders = (upstream) => {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })

  for (const name of ['Content-Type', 'Retry-After']) {
    const value = upstream.headers.get(name)
    if (value) headers.set(name, value)
  }

  return headers
}

const readBoundedBody = async (response, maximumBytes, abort) => {
  const contentLength = response.headers.get('Content-Length')
  if (contentLength) {
    const declaredBytes = Number(contentLength)
    if (Number.isFinite(declaredBytes) && declaredBytes > maximumBytes) {
      abort()
      throw new ResponseTooLargeError()
    }
  }

  if (!response.body) return undefined

  const reader = response.body.getReader()
  const chunks = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue

      totalBytes += value.byteLength
      if (totalBytes > maximumBytes) {
        abort()
        void reader.cancel()
        throw new ResponseTooLargeError()
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  if (totalBytes === 0) return undefined

  const body = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

export const createAircraftRelayHandler = async ({
  authToken,
  releaseSha,
  stateStore,
  fetchImpl = fetch,
  now = Date.now,
  timeoutMs = UPSTREAM_TIMEOUT_MS,
  maximumResponseBytes = MAXIMUM_RESPONSE_BYTES,
}) => {
  if (typeof authToken !== 'string' || authToken.length < 32) {
    throw new Error('Relay authentication token must contain at least 32 characters')
  }
  if (!/^[0-9a-f]{40}$/.test(releaseSha)) {
    throw new Error('Relay release SHA must be 40 lowercase hexadecimal characters')
  }

  const initialState = validateAdmissionState(await stateStore.load())
  const admission = new AdmissionController({
    state: initialState,
    persist: (state) => stateStore.save({ ...state }),
    now,
  })

  return async (request) => {
    const url = new URL(request.url)

    if (url.pathname === '/healthz' && !url.search) {
      if (request.method !== 'GET') {
        return textResponse('Method not allowed', 405, { Allow: 'GET' })
      }
      return new Response(
        JSON.stringify({ status: 'ok', releaseSha }),
        {
          status: 200,
          headers: {
            'Cache-Control': 'no-store',
            'Content-Type': 'application/json',
            'X-Content-Type-Options': 'nosniff',
          },
        },
      )
    }

    const point = parsePointPath(url.pathname)
    if (!point) return textResponse('Not found', 404)
    if (request.method !== 'GET') {
      return textResponse('Method not allowed', 405, { Allow: 'GET' })
    }
    if (url.search || request.url.includes('?')) {
      return textResponse('Aircraft relay queries are not supported', 400)
    }
    if (!isAuthorized(request, authToken)) {
      return textResponse('Unauthorized', 401, {
        'WWW-Authenticate': 'Bearer',
      })
    }
    if (request.signal.aborted) {
      return textResponse('Aircraft request canceled', 499)
    }

    let lease
    try {
      lease = await admission.acquire()
    } catch {
      return textResponse('Aircraft relay admission state unavailable', 503, {
        'Retry-After': '60',
      })
    }

    if (!lease.accepted) {
      return textResponse('Aircraft relay temporarily unavailable', 503, {
        'Retry-After': String(lease.retryAfterSeconds),
      })
    }

    const upstreamController = new AbortController()
    let timedOut = false
    const handleClientAbort = () => {
      upstreamController.abort(request.signal.reason)
    }

    request.signal.addEventListener('abort', handleClientAbort, { once: true })
    const timeout = setTimeout(() => {
      timedOut = true
      upstreamController.abort(new Error('Aircraft upstream timed out'))
    }, timeoutMs)

    try {
      const upstreamUrl =
        `${ADSB_LOL_ORIGIN}/v2/point/` +
        `${point.latitude}/${point.longitude}/${point.radiusNm}`
      const upstream = await fetchImpl(upstreamUrl, {
        method: 'GET',
        signal: upstreamController.signal,
        redirect: 'manual',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'User-Agent': ADSB_LOL_USER_AGENT,
        },
      })

      if (upstream.status >= 300 && upstream.status < 400) {
        lease.release()
        return textResponse('Aircraft upstream redirect rejected', 502)
      }

      const body = await readBoundedBody(
        upstream,
        maximumResponseBytes,
        () => upstreamController.abort(new ResponseTooLargeError()),
      )
      if (timedOut) {
        lease.release()
        return textResponse('Aircraft upstream timed out', 504)
      }
      if (request.signal.aborted) {
        lease.release()
        return textResponse('Aircraft request canceled', 499)
      }

      await lease.complete({
        status: upstream.status,
        retryAfter: upstream.headers.get('Retry-After'),
      })
      return new Response(body ?? null, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders(upstream),
      })
    } catch (error) {
      lease.release()
      if (error instanceof ResponseTooLargeError) {
        return textResponse('Aircraft upstream response was too large', 502)
      }
      if (error instanceof AdmissionStateError) {
        return textResponse('Aircraft relay admission state unavailable', 503, {
          'Retry-After': '60',
        })
      }
      if (timedOut) {
        return textResponse('Aircraft upstream timed out', 504)
      }
      if (request.signal.aborted) {
        return textResponse('Aircraft request canceled', 499)
      }
      return textResponse('Aircraft upstream unavailable', 502)
    } finally {
      clearTimeout(timeout)
      request.signal.removeEventListener('abort', handleClientAbort)
    }
  }
}
