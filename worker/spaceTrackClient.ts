import { parseRetryAfterMs } from '../src/providers/errors.ts'
import {
  SPACE_TRACK_MAX_CURATED_BYTES,
  SPACE_TRACK_MAX_STARLINK_BYTES,
  spaceTrackDigest,
  spaceTrackGpUrl,
} from '../src/providers/orbital/spaceTrackCatalogContract.ts'
import type { OrbitalChannel, StarlinkCatalogSourceMetadata } from '../src/domain/orbital.ts'
import type { OrbitalCatalogFetch } from './orbitalCatalog.js'
import {
  SPACE_TRACK_LOGIN_URL,
  SpaceTrackProtocolError,
  spaceTrackLoginAcknowledgment,
  spaceTrackSessionCookies,
} from './spaceTrackProtocol.ts'

const USER_AGENT = 'LiveTrafficStan (+https://github.com/vasilyevstan/LiveTrafficStan)'

export class SpaceTrackApiError extends SpaceTrackProtocolError {
  readonly status?: number
  readonly retryAtMs?: number
  readonly requiresReview: boolean
  readonly terminal: boolean

  constructor(
    code: string,
    options: {
      status?: number
      retryAtMs?: number
      requiresReview?: boolean
      terminal?: boolean
    } = {},
  ) {
    super(code)
    this.status = options.status
    this.retryAtMs = options.retryAtMs
    this.requiresReview = options.requiresReview === true
    this.terminal = options.terminal === true
  }
}

export interface SpaceTrackRequestOptions {
  fetchImpl?: OrbitalCatalogFetch
  signal: AbortSignal
  now?: () => number
  timeoutMs: number
}

const abortError = (status?: number) =>
  new SpaceTrackApiError('request-timed-out', { status })

const active = (signal: AbortSignal, status?: number) => {
  if (signal.aborted) throw abortError(status)
}

const withAbort = async <Value>(
  operation: Promise<Value>,
  signal: AbortSignal,
  status?: number,
): Promise<Value> => {
  active(signal, status)
  let listener: (() => void) | undefined
  const aborted = new Promise<never>((_resolve, reject) => {
    listener = () => reject(abortError(status))
    signal.addEventListener('abort', listener, { once: true })
    if (signal.aborted) listener()
  })
  try {
    return await Promise.race([operation, aborted])
  } finally {
    if (listener) signal.removeEventListener('abort', listener)
  }
}

const request = async (
  url: string,
  init: RequestInit,
  maximumBytes: number,
  options: SpaceTrackRequestOptions,
) => {
  const now = options.now ?? Date.now
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs)
  const signal = AbortSignal.any([options.signal, controller.signal])
  let status: number | undefined
  let retryAtMs: number | undefined
  let requiresReview = false
  let terminal = false
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    active(signal)
    const pending = (options.fetchImpl ?? fetch)(url, {
      ...init, redirect: 'manual', cache: 'no-store', signal,
    })
    void pending.then((response) => {
      if (signal.aborted) void response.body?.cancel().catch(() => undefined)
    }, () => undefined)
    const response = await withAbort(pending, signal)
    status = response.status
    active(signal, status)
    const directive = response.headers.get('Retry-After')
    if (directive !== null) {
      const value = directive.trim()
      const duration = /^(?:\d+|[A-Za-z].*)$/.test(value)
        ? parseRetryAfterMs(value, now()) : undefined
      const deadline = duration === undefined ? Number.NaN : now() + duration
      if (!Number.isSafeInteger(deadline) || deadline > 8.64e15) requiresReview = true
      else retryAtMs = deadline
    }
    terminal = (status >= 300 && status < 400) || [401, 403, 404].includes(status)
    if (status !== 200 || (url === SPACE_TRACK_LOGIN_URL && directive !== null)) {
      void response.body?.cancel().catch(() => undefined)
      throw new SpaceTrackApiError(
        directive === null ? 'provider-response-rejected' : 'provider-deferred',
        { status, retryAtMs, requiresReview, terminal },
      )
    }
    const mediaType = response.headers.get('Content-Type')
    if (
      url !== SPACE_TRACK_LOGIN_URL &&
      (!mediaType || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(mediaType.trim()))
    ) {
      void response.body?.cancel().catch(() => undefined)
      throw new SpaceTrackApiError('response-content-type-invalid', { status })
    }
    const length = response.headers.get('Content-Length')
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > maximumBytes)) {
      void response.body?.cancel().catch(() => undefined)
      throw new SpaceTrackApiError('response-length-invalid', { status })
    }
    const chunks: Uint8Array[] = []
    let bytes = 0
    reader = response.body?.getReader()
    if (reader) {
      while (true) {
        const part = await withAbort(reader.read(), signal, status)
        active(signal, status)
        if (part.done) break
        bytes += part.value.byteLength
        if (bytes > maximumBytes) throw new SpaceTrackApiError('response-oversized', { status })
        chunks.push(part.value)
      }
    }
    active(signal, status)
    const body = new Uint8Array(bytes)
    let offset = 0
    for (const chunk of chunks) {
      body.set(chunk, offset)
      offset += chunk.byteLength
    }
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(body)
    } catch {
      throw new SpaceTrackApiError('response-encoding-invalid', { status })
    }
    return { response, body, text, retryAtMs, requiresReview, receivedAtMs: now() }
  } catch (error) {
    const timedOut = signal.aborted
    controller.abort()
    if (reader) void reader.cancel().catch(() => undefined)
    if (error instanceof SpaceTrackApiError) {
      throw new SpaceTrackApiError(error.code, {
        status: error.status ?? status,
        retryAtMs: error.retryAtMs ?? retryAtMs,
        requiresReview: error.requiresReview || requiresReview,
        terminal: error.terminal || terminal,
      })
    }
    throw timedOut
      ? new SpaceTrackApiError('request-timed-out', { status, retryAtMs, requiresReview, terminal })
      : new SpaceTrackApiError('transport-unavailable', { status, retryAtMs, requiresReview, terminal })
  } finally {
    clearTimeout(timer)
    if (reader) {
      try { reader.releaseLock() } catch {
        controller.abort()
      }
    }
  }
}

export const loginToSpaceTrack = async (
  username: string,
  password: string,
  options: SpaceTrackRequestOptions,
) => {
  if (!username || username.length > 320 || !password || password.length > 4_096) {
    throw new SpaceTrackApiError('credentials-missing-or-invalid', { requiresReview: true })
  }
  const login = await request(SPACE_TRACK_LOGIN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: new URLSearchParams({ identity: username, password }).toString(),
  }, 16 * 1_024, options)
  active(options.signal, login.response.status)
  try {
    spaceTrackLoginAcknowledgment(login.text)
    return {
      cookie: spaceTrackSessionCookies(login.response.headers, (options.now ?? Date.now)()),
    }
  } catch (error) {
    if (error instanceof SpaceTrackProtocolError) {
      throw new SpaceTrackApiError(error.code, { status: login.response.status, requiresReview: true })
    }
    throw error
  }
}

export const fetchSpaceTrackGp = async (
  session: { cookie: string },
  channel: OrbitalChannel,
  ids: readonly string[],
  options: SpaceTrackRequestOptions,
) => {
  const url = spaceTrackGpUrl(channel, ids)
  const response = await request(url, {
    method: 'GET',
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, Cookie: session.cookie },
  }, channel === 'curated' ? SPACE_TRACK_MAX_CURATED_BYTES : SPACE_TRACK_MAX_STARLINK_BYTES, options)
  active(options.signal, response.response.status)
  let value: unknown
  let sha256: string
  try {
    value = JSON.parse(response.text)
    if (!Array.isArray(value)) throw new SpaceTrackProtocolError('response-shape-invalid')
    sha256 = await spaceTrackDigest(response.body)
  } catch {
    throw new SpaceTrackApiError('response-json-or-integrity-invalid', {
      status: response.response.status, retryAtMs: response.retryAtMs,
      requiresReview: response.requiresReview,
    })
  }
  const source: StarlinkCatalogSourceMetadata = {
    url, retrievedAt: new Date(response.receivedAtMs).toISOString(),
    recordCount: Array.isArray(value) ? value.length : 0,
    decodedBytes: response.body.byteLength, sha256,
  }
  active(options.signal, response.response.status)
  return {
    value, source, retryAtMs: response.retryAtMs, requiresReview: response.requiresReview,
  }
}
