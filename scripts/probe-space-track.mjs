import { writeFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseRetryAfterMs } from '../src/providers/errors.ts'
import { readBoundedJsonFile } from './read-bounded-json-file.mjs'

export const SPACE_TRACK_LOGIN_URL = 'https://www.space-track.org/ajaxauth/login'
export const SPACE_TRACK_PROBE_URL =
  'https://www.space-track.org/basicspacedata/query/class/gp/' +
  'NORAD_CAT_ID/25544/DECAY_DATE/null-val/EPOCH/%3Enow-10/format/json'
export const SPACE_TRACK_PROBE_INTERVAL_MS = 60 * 60 * 1_000
export const SPACE_TRACK_LOGIN_INTERVAL_MS = 60 * 1_000
const LOGIN_MAX_BYTES = 16 * 1_024
const GP_MAX_BYTES = 64 * 1_024
const COOKIE_MAX_BYTES = 4 * 1_024
const RESPONSE_TIMEOUT_MS = 10_000
const TOTAL_TIMEOUT_MS = 25_000
const USER_AGENT =
  'LiveTrafficStan (+https://github.com/vasilyevstan/LiveTrafficStan)'
const FIELDS = [
  'NORAD_CAT_ID', 'OBJECT_NAME', 'OBJECT_ID', 'OBJECT_TYPE', 'EPOCH',
  'MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE',
  'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'EPHEMERIS_TYPE',
  'CLASSIFICATION_TYPE', 'ELEMENT_SET_NO', 'REV_AT_EPOCH',
  'BSTAR', 'MEAN_MOTION_DOT', 'MEAN_MOTION_DDOT', 'DECAY_DATE',
]
const TEXT_FIELDS = [
  'OBJECT_NAME', 'OBJECT_ID', 'OBJECT_TYPE', 'EPOCH', 'CLASSIFICATION_TYPE',
]
const NUMERIC_FIELDS = FIELDS.filter(field =>
  !TEXT_FIELDS.includes(field) && field !== 'DECAY_DATE',
)

class ProbeError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

const object = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

export function assertSpaceTrackProbeBackoff(receipt, now = Date.now()) {
  if (
    !object(receipt) ||
    ![1, 2].includes(receipt.receiptVersion) ||
    receipt.provider !== 'space-track' ||
    receipt.purpose !== 'fixed-25544-gp-contract' ||
    !['passed', 'failed'].includes(receipt.outcome) ||
    typeof receipt.startedAt !== 'string' ||
    typeof receipt.completedAt !== 'string' ||
    !Number.isFinite(Date.parse(receipt.startedAt)) ||
    !Number.isFinite(Date.parse(receipt.completedAt)) ||
    Date.parse(receipt.completedAt) < Date.parse(receipt.startedAt) ||
    !Number.isSafeInteger(receipt.nextAllowedAtMs) ||
    receipt.nextAllowedAtMs < Date.parse(receipt.completedAt) + (
      receipt.receiptVersion === 1 || receipt.gpRequested
        ? SPACE_TRACK_PROBE_INTERVAL_MS : SPACE_TRACK_LOGIN_INTERVAL_MS
    ) ||
    !Number.isSafeInteger(receipt.requestCount) ||
    receipt.requestCount < 0 || receipt.requestCount > 2 ||
    typeof receipt.gpRequested !== 'boolean' ||
    typeof receipt.requiresReview !== 'boolean'
  ) {
    throw new ProbeError('previous-receipt-invalid')
  }
  if (receipt.outcome === 'passed') {
    throw new ProbeError('qualification-already-passed-reuse-evidence')
  }
  if (receipt.requiresReview) {
    throw new ProbeError('previous-attempt-requires-investigation')
  }
  const completedAt = Date.parse(receipt.completedAt)
  const unspentLegacyGpBudget = (
    receipt.receiptVersion === 1 &&
    receipt.code === 'authentication-not-confirmed' &&
    receipt.requestCount === 1 && receipt.gpRequested === false &&
    !Object.hasOwn(receipt, 'gpRequestedAt') &&
    object(receipt.gp) && Object.keys(receipt.gp).length === 0 &&
    object(receipt.login) && receipt.login.status === 200 &&
    receipt.login.format === 'json' && receipt.login.decodedBytes === 2 &&
    receipt.login.retryAfterPresent !== true &&
    receipt.nextAllowedAtMs === completedAt + SPACE_TRACK_PROBE_INTERVAL_MS
  )
  const nextAllowedAtMs = unspentLegacyGpBudget
    ? completedAt + SPACE_TRACK_LOGIN_INTERVAL_MS : receipt.nextAllowedAtMs
  if (now < nextAllowedAtMs) {
    throw new ProbeError('previous-attempt-backoff-active')
  }
  return {
    nextAllowedAtMs,
    rateBasis: unspentLegacyGpBudget
      ? 'legacy-no-gp-request' : receipt.gpRequested ? 'gp-requested' : 'authentication-only',
  }
}

function sessionCookies(headers, now) {
  const values = headers.getSetCookie()
  if (values.length === 0 || values.length > 8) {
    throw new ProbeError('authentication-cookie-invalid')
  }
  const pairs = []
  const names = new Set()
  for (const value of values) {
    if (Buffer.byteLength(value) > COOKIE_MAX_BYTES) {
      throw new ProbeError('authentication-cookie-oversized')
    }
    const [pair, ...attributes] = value.split(';').map(part => part.trim())
    const separator = pair.indexOf('=')
    const name = pair.slice(0, separator)
    const cookieValue = pair.slice(separator + 1)
    const octets = cookieValue.startsWith('"') && cookieValue.endsWith('"')
      ? cookieValue.slice(1, -1) : cookieValue
    if (
      separator < 1 ||
      !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name) ||
      !cookieValue ||
      !/^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]+$/.test(octets) ||
      names.has(name)
    ) {
      throw new ProbeError('authentication-cookie-invalid')
    }
    names.add(name)
    let path = '/ajaxauth'
    let scoped = true
    let maxAge
    let expiresAt
    for (const attribute of attributes) {
      const equals = attribute.indexOf('=')
      const key = (equals < 0 ? attribute : attribute.slice(0, equals)).toLowerCase()
      const entry = equals < 0 ? '' : attribute.slice(equals + 1)
      if (key === 'domain') {
        const domain = entry.toLowerCase().replace(/^\./, '')
        if (!['space-track.org', 'www.space-track.org'].includes(domain)) {
          scoped = false
        }
      }
      if (key === 'path') path = entry
      if (key === 'max-age') maxAge = /^-?\d+$/.test(entry) ? Number(entry) : NaN
      if (key === 'expires') {
        expiresAt = Date.parse(entry)
      }
    }
    const targetPath = new URL(SPACE_TRACK_PROBE_URL).pathname
    if (
      !scoped || !path.startsWith('/') ||
      (targetPath !== path && !targetPath.startsWith(
        path.endsWith('/') ? path : `${path}/`,
      )) ||
      (maxAge !== undefined
        ? !Number.isFinite(maxAge) || maxAge <= 0
        : expiresAt !== undefined && (!Number.isFinite(expiresAt) || expiresAt <= now))
    ) continue
    pairs.push(pair)
  }
  if (pairs.length === 0) throw new ProbeError('authentication-cookie-scope-invalid')
  const cookie = pairs.join('; ')
  if (Buffer.byteLength(cookie) > COOKIE_MAX_BYTES) {
    throw new ProbeError('authentication-cookie-oversized')
  }
  return cookie
}

export async function probeSpaceTrack({
  username,
  password,
  fetchImpl = fetch,
  now = Date.now,
  responseTimeoutMs = RESPONSE_TIMEOUT_MS,
  totalTimeoutMs = TOTAL_TIMEOUT_MS,
}) {
  const startedAtMs = now()
  const receipt = {
    receiptVersion: 2,
    provider: 'space-track',
    attribution: 'Space-Track.org / USSPACECOM',
    source: 'https://www.space-track.org/',
    purpose: 'fixed-25544-gp-contract',
    startedAt: new Date(startedAtMs).toISOString(),
    outcome: 'failed',
    code: 'not-started',
    nextAllowedAtMs: startedAtMs + SPACE_TRACK_LOGIN_INTERVAL_MS,
    requiresReview: false,
    requestCount: 0,
    gpRequested: false,
    login: {},
    gp: {},
  }
  const total = new AbortController()
  const totalTimer = setTimeout(() => total.abort(), totalTimeoutMs)

  const request = async (url, init, slot, maximumBytes) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), responseTimeoutMs)
    const signal = AbortSignal.any([total.signal, controller.signal])
    let reader
    try {
      receipt.requestCount += 1
      const response = await fetchImpl(url, {
        ...init,
        redirect: 'manual',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        signal,
      })
      slot.status = response.status
      const retry = response.headers.get('retry-after')
      if (retry !== null) {
        const value = retry.trim()
        const duration = /^(?:\d+|[A-Za-z].*)$/.test(value)
          ? parseRetryAfterMs(value, now())
          : undefined
        const retryAt = duration === undefined ? NaN : now() + duration
        if (!Number.isSafeInteger(retryAt) || retryAt > 8.64e15) {
          receipt.requiresReview = true
        } else {
          receipt.nextAllowedAtMs = Math.max(receipt.nextAllowedAtMs, retryAt)
        }
        slot.retryAfterPresent = true
      }
      if (response.status !== 200 || (url === SPACE_TRACK_LOGIN_URL && retry !== null)) {
        receipt.requiresReview ||= (
          response.status >= 300 && response.status < 400
        ) || [401, 403, 404].includes(response.status)
        await response.body?.cancel()
        throw new ProbeError(
          retry !== null ? 'provider-deferred' : 'provider-response-rejected',
        )
      }
      const length = response.headers.get('content-length')
      if (
        length !== null &&
        (!/^\d+$/.test(length) || Number(length) > maximumBytes)
      ) {
        await response.body?.cancel()
        throw new ProbeError('response-length-invalid')
      }
      const chunks = []
      let bytes = 0
      reader = response.body?.getReader()
      if (reader) {
        while (true) {
          const part = await reader.read()
          if (signal.aborted) throw new ProbeError('request-timed-out')
          if (part.done) break
          bytes += part.value.byteLength
          if (bytes > maximumBytes) throw new ProbeError('response-oversized')
          chunks.push(part.value)
        }
      }
      if (signal.aborted) throw new ProbeError('request-timed-out')
      slot.decodedBytes = bytes
      const body = Buffer.concat(chunks)
      let text
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(body)
      } catch {
        throw new ProbeError('response-encoding-invalid')
      }
      return { response, text }
    } catch (error) {
      const timedOut = signal.aborted
      controller.abort()
      try {
        await reader?.cancel()
      } catch {
        slot.cancellationFailed = true
      }
      if (timedOut && !(error instanceof ProbeError)) {
        throw new ProbeError('request-timed-out')
      }
      throw error
    } finally {
      clearTimeout(timer)
      reader?.releaseLock()
    }
  }

  try {
    if (
      typeof username !== 'string' || !username || username.length > 320 ||
      typeof password !== 'string' || !password || password.length > 4_096
    ) {
      throw new ProbeError('credentials-missing-or-invalid')
    }
    const login = await request(
      SPACE_TRACK_LOGIN_URL,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
        },
        body: new URLSearchParams({ identity: username, password }).toString(),
      },
      receipt.login,
      LOGIN_MAX_BYTES,
    )
    const loginText = login.text.trim()
    receipt.login.format = loginText ? 'json' : 'empty'
    receipt.login.acknowledgment = loginText ? 'unrecognized' : 'empty-body'
    if (loginText) {
      let result
      try {
        result = JSON.parse(loginText)
      } catch {
        receipt.login.format = /^\s*</.test(loginText) ? 'html' : 'other'
        receipt.requiresReview = true
        throw new ProbeError('authentication-response-unrecognized')
      }
      if (object(result) && result.Login === 'Success') {
        receipt.login.acknowledgment = 'explicit-success'
      } else if (object(result) && Object.keys(result).length === 0) {
        receipt.login.acknowledgment = 'empty-object'
      } else if (Array.isArray(result) && result.length === 0) {
        receipt.login.acknowledgment = 'empty-array'
      } else if (result === '') {
        receipt.login.acknowledgment = 'empty-string'
      } else {
        receipt.requiresReview = true
        throw new ProbeError('authentication-not-confirmed')
      }
    }
    const cookie = sessionCookies(login.response.headers, now())
    receipt.login.cookieScopeAccepted = true
    receipt.gpRequested = true
    receipt.gpRequestedAt = new Date(now()).toISOString()
    receipt.nextAllowedAtMs = Math.max(
      receipt.nextAllowedAtMs,
      now() + SPACE_TRACK_PROBE_INTERVAL_MS,
    )
    const gp = await request(
      SPACE_TRACK_PROBE_URL,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Cookie: cookie,
          'User-Agent': USER_AGENT,
        },
      },
      receipt.gp,
      GP_MAX_BYTES,
    )
    if (!/^application\/json(?:;|$)/i.test(
      gp.response.headers.get('content-type') ?? '',
    )) {
      throw new ProbeError('gp-content-type-invalid')
    }
    let value
    try {
      value = JSON.parse(gp.text)
    } catch {
      throw new ProbeError('gp-json-invalid')
    }
    receipt.gp.format = Array.isArray(value) ? 'json-array' : 'other-json'
    receipt.gp.recordCount = Array.isArray(value) ? value.length : null
    if (!Array.isArray(value) || value.length !== 1 || !object(value[0])) {
      throw new ProbeError('gp-record-shape-invalid')
    }
    const record = value[0]
    receipt.gp.identityMatched = (
      record.NORAD_CAT_ID === '25544' || record.NORAD_CAT_ID === 25544
    )
    receipt.gp.payloadTypeMatched = record.OBJECT_TYPE === 'PAYLOAD'
    receipt.gp.publicClassificationMatched = record.CLASSIFICATION_TYPE === 'U'
    receipt.gp.fieldTypes = Object.fromEntries(FIELDS.map(field => [
      field,
      !Object.hasOwn(record, field) ? 'missing'
        : record[field] === null ? 'null'
          : ['string', 'number'].includes(typeof record[field])
            ? typeof record[field] : 'other',
    ]))
    receipt.gp.numericFieldsValid = NUMERIC_FIELDS.every(field =>
      typeof record[field] === 'number'
        ? Number.isFinite(record[field])
        : typeof record[field] === 'string' &&
          /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(record[field]) &&
          Number.isFinite(Number(record[field])),
    )
    receipt.gp.epochFormat = 'unrecognized'
    if (
      typeof record.EPOCH === 'string' &&
      /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z?$/.test(record.EPOCH)
    ) {
      const epoch = record.EPOCH.replace(' ', 'T')
      const parsed = Date.parse(epoch.endsWith('Z') ? epoch : `${epoch}Z`)
      if (
        Number.isFinite(parsed) &&
        new Date(parsed).toISOString().slice(0, 19) === epoch.slice(0, 19)
      ) {
        receipt.gp.epochFormat = epoch.endsWith('Z') ? 'utc-z' : 'utc-unzoned'
      }
    }
    if (
      !receipt.gp.identityMatched || !receipt.gp.payloadTypeMatched ||
      !receipt.gp.publicClassificationMatched ||
      !receipt.gp.numericFieldsValid || receipt.gp.epochFormat === 'unrecognized' ||
      record.DECAY_DATE !== null ||
      TEXT_FIELDS.some(field => typeof record[field] !== 'string' || !record[field])
    ) {
      throw new ProbeError('gp-contract-not-qualified')
    }
    if (total.signal.aborted) throw new ProbeError('request-timed-out')
    if (receipt.requiresReview) throw new ProbeError('provider-guidance-unresolved')
    receipt.outcome = 'passed'
    receipt.code = 'fixed-gp-contract-qualified'
  } catch (error) {
    // Fetch exceptions and provider text may contain credentials or session data.
    receipt.code = error instanceof ProbeError ? error.code : 'probe-request-failed'
  } finally {
    clearTimeout(totalTimer)
    total.abort()
    receipt.completedAt = new Date(now()).toISOString()
    receipt.nextAllowedAtMs = Math.max(
      receipt.nextAllowedAtMs,
      now() + (receipt.gpRequested
        ? SPACE_TRACK_PROBE_INTERVAL_MS : SPACE_TRACK_LOGIN_INTERVAL_MS),
    )
  }
  return receipt
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [mode, path, ...extra] = process.argv.slice(2)
  if (
    !['--output', '--check-prior'].includes(mode) ||
    !path || !isAbsolute(path) || extra.length
  ) {
    throw new Error('Use --output or --check-prior with one absolute receipt path')
  }
  if (mode === '--check-prior') {
    const { value } = await readBoundedJsonFile(path, 16 * 1_024, 'Previous probe receipt')
    console.log(JSON.stringify(assertSpaceTrackProbeBackoff(value)))
  } else {
    if (
      process.env.GITHUB_REF !== 'refs/heads/main' ||
      !/^[0-9a-f]{40}$/.test(process.env.EXPECTED_SHA ?? '') ||
      process.env.GITHUB_SHA !== process.env.EXPECTED_SHA ||
      process.env.GITHUB_RUN_ATTEMPT !== '1'
    ) {
      throw new Error('Space-Track qualification requires the first protected exact-main attempt')
    }
    const receipt = await probeSpaceTrack({
      username: process.env.SPACE_TRACK_USERNAME,
      password: process.env.SPACE_TRACK_PASSWORD,
    })
    await writeFile(path, `${JSON.stringify(receipt, null, 2)}\n`, {
      mode: 0o600,
      flag: 'wx',
    })
    console.log(JSON.stringify(receipt))
    if (receipt.outcome !== 'passed') process.exitCode = 1
  }
}
