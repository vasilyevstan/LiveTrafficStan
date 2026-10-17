import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SPACE_TRACK_LOGIN_URL,
  SPACE_TRACK_LOGIN_INTERVAL_MS,
  SPACE_TRACK_PROBE_INTERVAL_MS,
  SPACE_TRACK_PROBE_URL,
  assertSpaceTrackProbeBackoff,
  probeSpaceTrack,
} from './probe-space-track.mjs'

const credentials = { username: 'private-user', password: 'private-pass&=+' }
const now = Date.parse('2026-10-17T12:00:00Z')
const record = () => ({
  NORAD_CAT_ID: '25544',
  OBJECT_NAME: 'ISS (ZARYA)',
  OBJECT_ID: '1998-067A',
  OBJECT_TYPE: 'PAYLOAD',
  EPOCH: '2026-10-17T10:00:00.123456',
  MEAN_MOTION: '15.5',
  ECCENTRICITY: '0.0005',
  INCLINATION: '51.6',
  RA_OF_ASC_NODE: '100.0',
  ARG_OF_PERICENTER: '20',
  MEAN_ANOMALY: '30',
  EPHEMERIS_TYPE: '0',
  CLASSIFICATION_TYPE: 'U',
  ELEMENT_SET_NO: '999',
  REV_AT_EPOCH: '50000',
  BSTAR: '0.0001',
  MEAN_MOTION_DOT: '0.00001',
  MEAN_MOTION_DDOT: '0',
  DECAY_DATE: null,
})
const login = (headers = {}) => new Response('{"Login":"Success"}', {
  headers: {
    'content-type': 'application/json',
    'set-cookie': 'session=private-session; Domain=.space-track.org; Path=/; Secure; HttpOnly',
    ...headers,
  },
})
const gp = (value = [record()], headers = {}) => new Response(JSON.stringify(value), {
  headers: { 'content-type': 'application/json', ...headers },
})
const probe = (fetchImpl, options = {}) => probeSpaceTrack({
  ...credentials, fetchImpl, now: () => now, ...options,
})

afterEach(() => vi.useRealTimers())

describe('one bounded Space-Track GP qualification', () => {
  it('uses exactly one fixed login and one fixed GP query, reporting types but no private values', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(login())
      .mockResolvedValueOnce(gp())
    const result = await probe(fetchImpl)
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      SPACE_TRACK_LOGIN_URL, SPACE_TRACK_PROBE_URL,
    ])
    const [, auth] = fetchImpl.mock.calls[0]
    expect(auth.method).toBe('POST')
    expect(new URLSearchParams(auth.body).get('identity')).toBe(credentials.username)
    expect(new URLSearchParams(auth.body).get('password')).toBe(credentials.password)
    expect(auth.headers).not.toHaveProperty('Cookie')
    expect(fetchImpl.mock.calls[1][1].headers.Cookie).toBe('session=private-session')
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init.redirect).toBe('manual')
      expect(init.credentials).toBe('omit')
      expect(init.signal).toBeInstanceOf(AbortSignal)
    }
    expect(result).toMatchObject({
      outcome: 'passed', requestCount: 2, gpRequested: true,
      login: { cookieScopeAccepted: true },
      gp: {
        identityMatched: true, payloadTypeMatched: true, numericFieldsValid: true,
        epochFormat: 'utc-unzoned',
        fieldTypes: { NORAD_CAT_ID: 'string', DECAY_DATE: 'null', BSTAR: 'string' },
      },
    })
    expect(result.nextAllowedAtMs).toBe(now + SPACE_TRACK_PROBE_INTERVAL_MS)
    const output = JSON.stringify(result)
    for (const privateValue of [
      credentials.username, credentials.password, encodeURIComponent(credentials.password),
      'private-session', 'ISS (ZARYA)', '1998-067A', '15.5',
    ]) expect(output).not.toContain(privateValue)
  })

  it('accepts numeric provider fields without changing the observed type distinction', async () => {
    const value = record()
    value.NORAD_CAT_ID = 25544
    value.MEAN_MOTION = 15.5
    value.BSTAR = '1.2e-4'
    const result = await probe(vi.fn().mockResolvedValueOnce(login())
      .mockResolvedValueOnce(gp([value])))
    expect(result.outcome).toBe('passed')
    expect(result.gp.fieldTypes).toMatchObject({
      NORAD_CAT_ID: 'number', MEAN_MOTION: 'number', BSTAR: 'string',
    })
  })

  it.each([
    [{}, 'empty-object'], [[], 'empty-array'], ['', 'empty-string'],
  ])('requires protected GP proof after an empty JSON acknowledgment (%j)', async (ack, kind) => {
    const response = login()
    const makeLogin = () => new Response(JSON.stringify(ack), { headers: response.headers })
    const fetchImpl = vi.fn().mockResolvedValueOnce(makeLogin()).mockResolvedValueOnce(gp())
    const passed = await probe(fetchImpl)
    expect(passed).toMatchObject({
      outcome: 'passed', requestCount: 2,
      login: { acknowledgment: kind, cookieScopeAccepted: true },
      gp: { identityMatched: true, payloadTypeMatched: true },
    })
    const failed = await probe(vi.fn().mockResolvedValueOnce(makeLogin())
      .mockResolvedValueOnce(gp([])))
    expect(failed).toMatchObject({ outcome: 'failed', gpRequested: true })
    expect(failed.nextAllowedAtMs).toBe(now + SPACE_TRACK_PROBE_INTERVAL_MS)
  })

  it.each([null, 10, true, { message: 'private-user' }])(
    'does not treat nonempty or numeric JSON as a recognized acknowledgment (%j)',
    async acknowledgment => {
      const response = login()
      const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(
        JSON.stringify(acknowledgment), { headers: response.headers },
      ))
      const result = await probe(fetchImpl)
      expect(result).toMatchObject({
        outcome: 'failed', requiresReview: true, gpRequested: false,
        login: { acknowledgment: 'unrecognized' },
      })
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(JSON.stringify(result)).not.toContain('private-user')
    },
  )

  it('keeps multiple cookie headers separate and applies domain, path and expiry scope', async () => {
    const response = login()
    response.headers.append('set-cookie', 'other=private-other; Domain=example.com; Path=/')
    response.headers.append('set-cookie', 'path=private-path; Path=/ajaxauth')
    response.headers.append('set-cookie', 'expired=gone; Path=/; Max-Age=0')
    response.headers.append('set-cookie', 'second=private-second; Path=/; Max-Age=3600; Expires=Wed, 01 Jan 2000 00:00:00 GMT')
    const fetchImpl = vi.fn().mockResolvedValueOnce(response).mockResolvedValueOnce(gp())
    expect((await probe(fetchImpl)).outcome).toBe('passed')
    expect(fetchImpl.mock.calls[1][1].headers.Cookie).toBe(
      'session=private-session; second=private-second',
    )
  })

  it.each([
    ['no cookie', {}],
    ['wrong host', { 'set-cookie': 'session=private-session; Domain=example.com; Path=/' }],
    ['wrong path', { 'set-cookie': 'session=private-session; Path=/ajaxauth' }],
    ['oversized', { 'set-cookie': `session=${'a'.repeat(5000)}; Path=/` }],
  ])('does not query GP with %s', async (_name, headers) => {
    const response = Object.keys(headers).length ? login(headers) : new Response('')
    const fetchImpl = vi.fn().mockResolvedValueOnce(response)
    const result = await probe(fetchImpl)
    expect(result.outcome).toBe('failed')
    expect(result.gpRequested).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it.each([
    new Response('{"Login":"Failed","detail":"private-pass&=+"}', {
      headers: { 'set-cookie': 'session=private-session; Path=/' },
    }),
    new Response('<html>private-user private-pass&=+</html>'),
    new Response(null, { status: 302, headers: { location: 'https://example.com/private-session' } }),
    new Response('private-pass&=+', { status: 403 }),
  ])('stops on failed or unrecognized authentication without leaking the response', async response => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(response)
    const result = await probe(fetchImpl)
    expect(result.outcome).toBe('failed')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(result)).not.toMatch(/private-pass|private-user|private-session/)
  })

  it.each([
    [],
    [{ ...record(), NORAD_CAT_ID: '255440' }],
    [{ ...record(), OBJECT_TYPE: 'UNKNOWN' }],
    [{ ...record(), EPOCH: null }],
    [{ ...record(), EPOCH: '2026-02-31T10:00:00' }],
    [{ ...record(), CLASSIFICATION_TYPE: 'C' }],
    [{ ...record(), MEAN_MOTION: 'not-a-number' }],
    [{ ...record(), BSTAR: 'Infinity' }],
    [{ ...record(), DECAY_DATE: '2026-10-16' }],
    [record(), record()],
    { error: 'private-pass&=+' },
  ].map(value => [value]))('does not qualify empty, wrong-identity, incomplete or malformed data', async value => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(login()).mockResolvedValueOnce(gp(value))
    const result = await probe(fetchImpl)
    expect(result.outcome).toBe('failed')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(result)).not.toContain(credentials.password)
  })

  it('rejects a chunked oversized body and retains headers/status without printing body text', async () => {
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('private-pass&=+'.repeat(6000)))
        controller.close()
      },
    }), { headers: { 'content-type': 'application/json' } })
    const result = await probe(vi.fn().mockResolvedValueOnce(login()).mockResolvedValueOnce(response))
    expect(result).toMatchObject({
      outcome: 'failed', code: 'response-oversized', gp: { status: 200 },
    })
    expect(JSON.stringify(result)).not.toContain(credentials.password)
  })

  it('stops on login backoff and preserves guidance longer than one hour', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(login({ 'retry-after': '7200' }))
    const result = await probe(fetchImpl)
    expect(result).toMatchObject({
      outcome: 'failed', code: 'provider-deferred', gpRequested: false,
      nextAllowedAtMs: now + 7200_000,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('preserves HTTP-date backoff and fails closed on unrepresentable guidance', async () => {
    const retryAt = now + 3 * SPACE_TRACK_PROBE_INTERVAL_MS
    const deferred = await probe(vi.fn().mockResolvedValueOnce(
      new Response(null, { status: 429, headers: { 'retry-after': new Date(retryAt).toUTCString() } }),
    ))
    expect(deferred.nextAllowedAtMs).toBe(retryAt)
    const invalid = await probe(vi.fn().mockResolvedValueOnce(
      new Response(null, { status: 429, headers: { 'retry-after': '9'.repeat(200) } }),
    ))
    expect(invalid.requiresReview).toBe(true)
    const invalidSuccess = await probe(vi.fn().mockResolvedValueOnce(login())
      .mockResolvedValueOnce(gp([record()], { 'retry-after': 'not-a-date' })))
    expect(invalidSuccess).toMatchObject({
      outcome: 'failed', requiresReview: true, code: 'provider-guidance-unresolved',
    })
  })

  it('cancels a stalled login at the per-response deadline and makes no second request', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    const pending = probe(fetchImpl, { responseTimeoutMs: 100 })
    await vi.advanceTimersByTimeAsync(100)
    expect(await pending).toMatchObject({
      outcome: 'failed', code: 'request-timed-out', gpRequested: false,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true)
  })

  it('counts body reading in the total deadline and retains an observed 200 status', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn().mockResolvedValueOnce(login())
      .mockImplementationOnce((_url, init) => Promise.resolve(new Response(new ReadableStream({
        start(controller) {
          init.signal.addEventListener('abort', () => controller.error(
            new DOMException('aborted', 'AbortError'),
          ))
        },
      }), { headers: { 'content-type': 'application/json' } })))
    const pending = probe(fetchImpl, { responseTimeoutMs: 1000, totalTimeoutMs: 100 })
    await vi.advanceTimersByTimeAsync(100)
    expect(await pending).toMatchObject({
      outcome: 'failed', code: 'request-timed-out', gp: { status: 200 },
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('rejects missing credentials before any network call', async () => {
    const fetchImpl = vi.fn()
    const result = await probe(fetchImpl, { password: '' })
    expect(result.code).toBe('credentials-missing-or-invalid')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('does not misclassify a network exception as a timeout or expose its text', async () => {
    const result = await probe(vi.fn().mockRejectedValue(
      new Error('private-user private-pass&=+ private-session'),
    ))
    expect(result.code).toBe('probe-request-failed')
    expect(JSON.stringify(result)).not.toMatch(/private-user|private-pass|private-session/)
    expect(result.nextAllowedAtMs).toBe(now + SPACE_TRACK_LOGIN_INTERVAL_MS)
  })
})

describe('qualification evidence and protected workflow', () => {
  it('reuses success and enforces failed-attempt backoff/review across later runs', async () => {
    const passed = await probe(vi.fn().mockResolvedValueOnce(login()).mockResolvedValueOnce(gp()))
    expect(() => assertSpaceTrackProbeBackoff(passed, now + 2 * SPACE_TRACK_PROBE_INTERVAL_MS))
      .toThrow('qualification-already-passed-reuse-evidence')
    const failed = { ...passed, outcome: 'failed' }
    expect(() => assertSpaceTrackProbeBackoff(failed, now)).toThrow('backoff-active')
    expect(() => assertSpaceTrackProbeBackoff(failed, failed.nextAllowedAtMs)).not.toThrow()
    expect(() => assertSpaceTrackProbeBackoff({ ...failed, requiresReview: true }, failed.nextAllowedAtMs))
      .toThrow('requires-investigation')
    expect(() => assertSpaceTrackProbeBackoff({})).toThrow('receipt-invalid')
  })

  it('migrates only the evidenced old two-byte JSON reply that made no GP request', async () => {
    const failed = await probe(vi.fn().mockResolvedValueOnce(new Response('{"Login":"Failed"}')))
    const legacy = {
      ...failed,
      receiptVersion: 1,
      code: 'authentication-not-confirmed',
      requiresReview: false,
      nextAllowedAtMs: now + SPACE_TRACK_PROBE_INTERVAL_MS,
      login: { status: 200, decodedBytes: 2, format: 'json' },
    }
    expect(assertSpaceTrackProbeBackoff(legacy, now + SPACE_TRACK_LOGIN_INTERVAL_MS))
      .toEqual({
        nextAllowedAtMs: now + SPACE_TRACK_LOGIN_INTERVAL_MS,
        rateBasis: 'legacy-no-gp-request',
      })
    expect(() => assertSpaceTrackProbeBackoff(legacy, now)).toThrow('backoff-active')
    for (const changed of [
      { gpRequested: true },
      { requestCount: 2 },
      { gpRequestedAt: new Date(now).toISOString() },
      { gp: { status: 200 } },
      { code: 'provider-deferred' },
      { login: { ...legacy.login, retryAfterPresent: true } },
      { login: { ...legacy.login, status: 403 } },
      { login: { ...legacy.login, decodedBytes: 20 } },
      { nextAllowedAtMs: legacy.nextAllowedAtMs + 1 },
    ]) {
      expect(() => assertSpaceTrackProbeBackoff(
        { ...legacy, ...changed }, now + SPACE_TRACK_LOGIN_INTERVAL_MS,
      )).toThrow()
    }
    expect(() => assertSpaceTrackProbeBackoff(
      { ...legacy, requiresReview: true }, now + SPACE_TRACK_LOGIN_INTERVAL_MS,
    )).toThrow('requires-investigation')
  })

  it('scopes secrets to one exact-main serialized probe, with no app deployment or SATCAT request', () => {
    const workflow = readFileSync(
      new URL('../.github/workflows/qualify-space-track.yml', import.meta.url), 'utf8',
    )
    expect(workflow).toContain('environment: production')
    expect(workflow).toContain('group: production-deployment')
    expect(workflow).toContain('cancel-in-progress: false')
    expect(workflow).toContain('test "$GITHUB_RUN_ATTEMPT" = 1')
    expect(workflow).toContain('test "$(git rev-parse origin/main)" = "$EXPECTED_SHA"')
    expect(workflow).toContain('--check-prior')
    expect(workflow).toContain('jobs?filter=all&per_page=100')
    const probeStep = workflow.slice(workflow.indexOf('      - name: Run bounded GP contract probe'))
    expect(probeStep).toContain('secrets.SPACE_TRACK_USERNAME')
    expect(probeStep).toContain('secrets.SPACE_TRACK_PASSWORD')
    expect(workflow.slice(0, workflow.indexOf('      - name: Run bounded GP contract probe')))
      .not.toContain('secrets.')
    expect(workflow).not.toMatch(/CLOUDFLARE|wrangler|CEL[Ee][Ss][Tt][Rr][Aa][Kk]|--body|set -x/)
    expect(SPACE_TRACK_PROBE_URL).toContain('/class/gp/NORAD_CAT_ID/25544/')
    expect(SPACE_TRACK_PROBE_URL).not.toContain('/satcat/')
  })
})
