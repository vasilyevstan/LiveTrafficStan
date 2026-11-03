import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEPLOYMENT_PROPAGATION_RETRY_DELAYS_MS,
  METAR_SMOKE_TIMEOUT_MS,
  METAR_TIMEOUT_RETRY_DELAY_MS,
  ORBITAL_SCHEMA2_NEGOTIATION_ACCEPT,
  PRIVATE_RELAY_MAX_ATTEMPTS,
  PRIVATE_RELAY_MAX_ADMISSION_WAIT_MS,
  PRIVATE_RELAY_MAX_RETRY_AFTER_SECONDS,
  PRIVATE_RELAY_SMOKE_TIMEOUT_MS,
  SAME_ORIGIN_SMOKE_FETCH_INIT,
  STARLINK_CATALOG_MEDIA_TYPE,
  STARLINK_SCHEMA2_NEGOTIATION_ACCEPT,
  classifyAircraftProxyStatus,
  deriveOrbitalStaticAssetPaths,
  fetchMetarWithTimeoutRetry,
  fetchPrivateRelayWithRetry,
  formatMetarReleaseMismatch,
  hasOneYearImmutableCacheControl,
  isRetryableStaticAssetStatus,
  readOptionalJson,
  resolveTargetOrbitalSmokeContract,
  resolveTargetStarlinkSmokeContract,
  runProductionSmokeChecks,
  verifyMetarProxyContract,
  formatProductionSmokeReport,
  writeProductionSmokeReport,
  verifyTargetOrbitalCatalog,
  verifyTargetStarlinkCatalog,
  waitForExpectedWorkerRelease,
} from './smoke-policy.mjs'

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const smokeScript = readFileSync(
  join(repositoryRoot, 'scripts/smoke-production.mjs'),
  'utf8',
)
const smokePolicyScript = readFileSync(
  join(repositoryRoot, 'scripts/smoke-policy.mjs'),
  'utf8',
)

const releaseSha = 'c'.repeat(40)

const orbitalPayload = ({
  schemaVersion,
  sourceContractVersion = schemaVersion,
  digestCharacter,
  ...overrides
}) => ({
  schemaVersion,
  sourceContractVersion,
  retrievedAt: '2026-09-30T18:25:59.094Z',
  recordCount: 1,
  records: [{ noradCatalogId: '25544' }],
  sha256: digestCharacter.repeat(64),
  ...overrides,
})

const createTargetContractFixture = (mode) => {
  if (mode === 'disabled') return { target: undefined }

  const schemaVersion = mode === 'schema1-only' ? 1 : 2
  const validateSnapshot = vi.fn(async (value) => value)
  const target = {
    ORBITAL_BOOTSTRAP_PATH:
      schemaVersion === 1
        ? '/orbital-data/v1/visual-catalog.json'
        : '/orbital-data/curated-2026-09-30-v1/catalog.json',
    ORBITAL_CATALOG_SCHEMA_VERSION: schemaVersion,
    ORBITAL_MAX_SNAPSHOT_BYTES: 512 * 1_024,
    ORBITAL_SOURCE_CONTRACT_VERSION: schemaVersion,
    validateOrbitalCatalogSnapshot: validateSnapshot,
  }
  const fixture = { target, validateSnapshot }
  if (mode === 'dual-representation') {
    fixture.validateLegacySnapshot = vi.fn(async (value) => value)
    Object.assign(target, {
      ORBITAL_CATALOG_V2_ACCEPT:
        ORBITAL_SCHEMA2_NEGOTIATION_ACCEPT,
      validateLegacyOrbitalCatalogSnapshot:
        fixture.validateLegacySnapshot,
    })
  }
  return fixture
}

const createOrbitalRouteFixture = (mode) => {
  const requests = []
  const defaultPayload =
    mode === 'schema1-only' || mode === 'dual-representation'
      ? orbitalPayload({
          schemaVersion: 1,
          digestCharacter: '1',
        })
      : orbitalPayload({
          schemaVersion: 2,
          digestCharacter: '2',
        })
  const schema2Payload = orbitalPayload({
    schemaVersion: 2,
    digestCharacter: '2',
    sources: [{ group: 'visual', gpRecordCount: 1 }],
  })

  return {
    requests,
    fetchResponse: vi.fn(async (input, init = {}) => {
      const url = new URL(input)
      const headers = new Headers(init.headers)
      const method = init.method ?? 'GET'
      requests.push({
        accept: headers.get('accept'),
        ifNoneMatch: headers.get('if-none-match'),
        method,
        url: url.toString(),
      })

      if (mode === 'disabled') {
        return new Response('Not found', { status: 404 })
      }
      if (url.search) {
        return new Response('Unsupported query', { status: 400 })
      }
      if (method === 'POST') {
        return new Response('Method not allowed', { status: 405 })
      }

      const negotiated =
        mode === 'dual-representation' &&
        headers.get('accept') ===
          ORBITAL_SCHEMA2_NEGOTIATION_ACCEPT
      const payload = negotiated ? schema2Payload : defaultPayload
      const weakEtag = mode !== 'schema1-only'
      const etag = `${weakEtag ? 'W/' : ''}"${payload.sha256}"`
      const responseHeaders = {
        'Cache-Control': 'public, max-age=300, must-revalidate',
        'Content-Type': 'application/json; charset=utf-8',
        ETag: etag,
        'X-Content-Type-Options': 'nosniff',
        'X-LiveTrafficStan-Orbital-Schema': String(
          payload.schemaVersion,
        ),
        'X-LiveTrafficStan-Orbital-Sha256': payload.sha256,
        'X-LiveTrafficStan-Orbital-Source': 'kv',
        'X-LiveTrafficStan-Release': releaseSha,
      }
      if (mode === 'dual-representation') {
        responseHeaders.Vary = 'Accept'
      }
      if (headers.get('if-none-match') === etag) {
        return new Response(null, {
          status: 304,
          headers: responseHeaders,
        })
      }
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: responseHeaders,
      })
    }),
  }
}

describe('production smoke policy', () => {
  const metarMismatch = (observedReleaseSha, status = 200) =>
    formatMetarReleaseMismatch({
      expectedReleaseSha: releaseSha,
      observedReleaseSha,
      targetOrigin: 'https://app.example',
      status,
    })

  it('records exact expected and observed METAR release identities and target', () => {
    const observedReleaseSha = 'a'.repeat(40)
    expect(metarMismatch(observedReleaseSha)).toBe(
      'METAR proxy release SHA does not match the deployed source: ' +
      `expected=${releaseSha}, observed="${observedReleaseSha}", ` +
      'target=https://app.example/api/weather/metar?ids=EETN, status=200',
    )
  })

  it.each([
    [null, '<missing>'],
    ['', '""'],
    ['not-a-sha', '"not-a-sha"'],
    ['C'.repeat(40), `"${'C'.repeat(40)}"`],
    [` ${releaseSha} `, `" ${releaseSha} "`],
    ['"\\\n\r\t\u001b', '"\\"\\\\\\n\\r\\t\\u001b"'],
  ])('safely distinguishes the observed METAR value %j', (observed, formatted) => {
    expect(metarMismatch(observed, 204)).toContain(
      `observed=${formatted}, target=https://app.example/api/weather/metar?ids=EETN, status=204`,
    )
  })

  it('bounds diagnostic values without hiding truncation', () => {
    expect(metarMismatch('a'.repeat(128))).toContain(
      `observed="${'a'.repeat(128)}",`,
    )
    const message = metarMismatch('a'.repeat(128) + 'SECRET_TAIL')
    expect(message).toContain(`observed="${'a'.repeat(128)}" (truncated),`)
    expect(message).not.toContain('SECRET_TAIL')
  })

  it('keeps strict METAR assertions after the bounded timeout-only retry', () => {
    const metarCheck = smokePolicyScript.slice(
      smokePolicyScript.indexOf('export const verifyMetarProxyContract'),
      smokePolicyScript.indexOf('export const runProductionSmokeChecks'),
    )
    expect(smokeScript).toContain('const verifyMetarProxy = () => verifyMetarProxyContract({')
    expect(smokePolicyScript).toContain('observedReleaseSha !== expectedReleaseSha')
    expect(metarCheck).toContain('await fetchMetarWithTimeoutRetry({')
    expect(metarCheck).toContain('AbortSignal.timeout(METAR_SMOKE_TIMEOUT_MS)')
    expect(metarCheck).toContain('{ ...SAME_ORIGIN_SMOKE_FETCH_INIT, signal }')
    expect(metarCheck).toContain("...SAME_ORIGIN_SMOKE_FETCH_INIT, method: 'POST', signal")
    expect(metarCheck).toContain('await readMetarBody(response, signal)')
    expect(smokePolicyScript).toContain("length <= 256 * 1_024, 'METAR proxy response is oversized'")
    for (const assertion of [
      "response.headers.get('cache-control') === 'public, max-age=60'",
      "response.headers.get('x-content-type-options') === 'nosniff'",
      "!response.headers.has('access-control-allow-origin')",
      "response.headers.get('content-type')?.includes('application/json')",
      'Array.isArray(payload)',
      "record.icaoId === 'EETN'",
      "invalid.status === 400",
      "unsupportedMethod.status === 405",
    ]) {
      expect(metarCheck).toContain(assertion)
    }
  })

  describe('METAR timeout recovery', () => {
    afterEach(() => {
      vi.useRealTimers()
      vi.restoreAllMocks()
    })

    const metarResponse = (status = 504, headers = {}) =>
      new Response(status === 204 ? null : status === 200 ? '[]' : 'METAR upstream timed out', {
        status,
        headers: {
          'X-LiveTrafficStan-Release': releaseSha,
          'Cache-Control': status === 504 ? 'no-store' : 'public, max-age=60',
          'Content-Type': status === 504 ? 'text/plain; charset=utf-8' : 'application/json',
          'X-Content-Type-Options': 'nosniff',
          ...headers,
        },
      })

    const options = (fetchMetar, wait = vi.fn(async () => undefined)) => ({
      fetchMetar,
      wait,
      expectedReleaseSha: releaseSha,
      targetOrigin: 'https://app.example',
    })

    it.each([200, 204])('returns HTTP %i without another request', async (status) => {
      const response = metarResponse(status)
      const fetchMetar = vi.fn(async () => response)
      const input = options(fetchMetar)
      expect(await fetchMetarWithTimeoutRetry(input)).toBe(response)
      expect(fetchMetar).toHaveBeenCalledTimes(1)
      expect(input.wait).not.toHaveBeenCalled()
    })

    it('retries one exact-release timeout after 60 seconds and records it', async () => {
      const timeout = metarResponse()
      const success = metarResponse(200)
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const fetchMetar = vi.fn()
        .mockResolvedValueOnce(timeout)
        .mockResolvedValueOnce(success)
      const input = options(fetchMetar)

      expect(await fetchMetarWithTimeoutRetry(input)).toBe(success)
      expect(fetchMetar).toHaveBeenCalledTimes(2)
      expect(timeout.bodyUsed).toBe(true)
      expect(input.wait).toHaveBeenCalledExactlyOnceWith(
        METAR_TIMEOUT_RETRY_DELAY_MS,
        fetchMetar.mock.calls[0][0],
      )
      expect(METAR_TIMEOUT_RETRY_DELAY_MS).toBe(60_000)
      expect(warning).toHaveBeenCalledWith(
        `METAR proxy returned 504 for exact release ${releaseSha}; retrying once after 60 seconds`,
      )
    })

    it('leaves a second timeout as a failure, never an empty success', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const last = metarResponse()
      const fetchMetar = vi.fn()
        .mockResolvedValueOnce(metarResponse())
        .mockResolvedValueOnce(last)
      const input = options(fetchMetar)
      expect(await fetchMetarWithTimeoutRetry(input)).toBe(last)
      expect(last.status).toBe(504)
      expect(fetchMetar).toHaveBeenCalledTimes(2)
      expect(input.wait).toHaveBeenCalledTimes(1)
    })

    it.each([301, 400, 403, 429, 500, 502, 503])(
      'does not retry HTTP %i',
      async (status) => {
        const response = metarResponse(status)
        const fetchMetar = vi.fn(async () => response)
        const input = options(fetchMetar)
        expect(await fetchMetarWithTimeoutRetry(input)).toBe(response)
        expect(fetchMetar).toHaveBeenCalledTimes(1)
        expect(input.wait).not.toHaveBeenCalled()
      },
    )

    it.each([
      { 'Cache-Control': 'public, max-age=60' },
      { 'X-Content-Type-Options': '' },
      { 'Content-Type': 'text/html' },
      { 'Access-Control-Allow-Origin': '*' },
      { 'Retry-After': '120' },
      { 'Retry-After': 'invalid' },
    ])('does not retry a timeout with unsafe policy or provider guidance: %j', async (headers) => {
      const response = metarResponse(504, headers)
      const fetchMetar = vi.fn(async () => response)
      const input = options(fetchMetar)
      expect(await fetchMetarWithTimeoutRetry(input)).toBe(response)
      expect(fetchMetar).toHaveBeenCalledTimes(1)
      expect(input.wait).not.toHaveBeenCalled()
    })

    it.each([null, '', 'not-a-sha', 'a'.repeat(40)])(
      'fails a timeout with release %j immediately',
      async (observed) => {
        const response = metarResponse()
        if (observed === null) response.headers.delete('x-livetrafficstan-release')
        else response.headers.set('x-livetrafficstan-release', observed)
        const input = options(vi.fn(async () => response))
        await expect(fetchMetarWithTimeoutRetry(input)).rejects.toThrow(metarMismatch(observed, 504))
        expect(input.fetchMetar).toHaveBeenCalledTimes(1)
        expect(input.wait).not.toHaveBeenCalled()
        expect(response.bodyUsed).toBe(true)
      },
    )

    it('fails a wrong release after a timeout instead of retrying again', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const input = options(vi.fn()
        .mockResolvedValueOnce(metarResponse())
        .mockResolvedValueOnce(metarResponse(200, {
          'X-LiveTrafficStan-Release': 'a'.repeat(40),
        })))
      await expect(fetchMetarWithTimeoutRetry(input)).rejects.toThrow(metarMismatch('a'.repeat(40)))
      expect(input.fetchMetar).toHaveBeenCalledTimes(2)
      expect(input.wait).toHaveBeenCalledTimes(1)
    })

    it('does not retry a network exception', async () => {
      const error = new Error('network failure')
      const input = options(vi.fn().mockRejectedValue(error))
      await expect(fetchMetarWithTimeoutRetry(input)).rejects.toBe(error)
      expect(input.fetchMetar).toHaveBeenCalledTimes(1)
      expect(input.wait).not.toHaveBeenCalled()
    })

    it('stops during the 60-second wait if the total deadline expires', async () => {
      vi.useFakeTimers()
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const controller = new AbortController()
      const fetchMetar = vi.fn(async () => metarResponse())
      const pending = fetchMetarWithTimeoutRetry({
        ...options(fetchMetar),
        wait: undefined,
        signal: controller.signal,
      })
      const error = new Error('METAR smoke deadline')
      const rejected = expect(pending).rejects.toBe(error)
      await vi.advanceTimersByTimeAsync(1)
      controller.abort(error)
      await rejected
      await vi.advanceTimersByTimeAsync(60_000)
      expect(fetchMetar).toHaveBeenCalledTimes(1)
      expect(METAR_SMOKE_TIMEOUT_MS).toBe(90_000)
    })

    it('waits the full 60 seconds and aborts a pending second request at 90 seconds', async () => {
      vi.useFakeTimers()
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const deadline = vi.spyOn(AbortSignal, 'timeout').mockImplementation((delayMs) => {
        const controller = new AbortController()
        setTimeout(() => controller.abort(new Error('METAR smoke deadline')), delayMs)
        return controller.signal
      })
      const fetchMetar = vi.fn()
        .mockResolvedValueOnce(metarResponse())
        .mockImplementationOnce((signal) => new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        }))
      const pending = fetchMetarWithTimeoutRetry({
        ...options(fetchMetar),
        wait: undefined,
      })
      const rejected = expect(pending).rejects.toThrow('METAR smoke deadline')
      await vi.advanceTimersByTimeAsync(59_999)
      expect(fetchMetar).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(fetchMetar).toHaveBeenCalledTimes(2)
      expect(fetchMetar.mock.calls[1][0].aborted).toBe(false)
      await vi.advanceTimersByTimeAsync(30_000)
      await rejected
      expect(fetchMetar.mock.calls[1][0].aborted).toBe(true)
      expect(deadline).toHaveBeenCalledExactlyOnceWith(90_000)
    })
  })

  describe('METAR diagnostic continuation', () => {
    afterEach(() => vi.restoreAllMocks())
    const response = (status, body, headers = {}) => new Response(
      status === 204 ? null : body,
      { status, headers: {
        'X-LiveTrafficStan-Release': releaseSha,
        'Cache-Control': status === 504 ? 'no-store' : 'public, max-age=60',
        'Content-Type': status === 504 ? 'text/plain; charset=utf-8' : 'application/json',
        'X-Content-Type-Options': 'nosniff',
        ...headers,
      } },
    )
    const verify = (responses, overrides = {}) => {
      const fetchResponse = vi.fn()
        .mockResolvedValueOnce(new Response(null, { status: 400 }))
        .mockResolvedValueOnce(new Response(null, { status: 405 }))
      for (const response of responses) fetchResponse.mockResolvedValueOnce(response)
      return {
        fetchResponse,
        run: () => verifyMetarProxyContract({
          baseUrl: new URL('https://app.example'), expectedReleaseSha: releaseSha,
          fetchResponse, wait: vi.fn(async () => undefined), ...overrides,
        }),
      }
    }
    const names = ['Static assets', 'Aircraft', 'METAR', 'Airport boards',
      'Orbital catalog', 'Starlink catalog', 'Digitraffic REST', 'Digitraffic MQTT']
    const checks = (metar, fail) => names.map((name) => ({
      name,
      run: vi.fn(name === 'METAR' ? metar : async () => {
        if (name === fail) throw new Error('contract failed')
      }),
    }))

    it.each([200, 204])('keeps HTTP %i success and moves local probes ahead of retrieval', async (status) => {
      const fixture = verify([response(status, '[]')])
      const runs = checks(fixture.run)
      const result = await runProductionSmokeChecks(runs)
      expect(result.overall).toBe('passed')
      expect(result.exitCode).toBe(0)
      expect(fixture.fetchResponse).toHaveBeenCalledTimes(3)
      expect(fixture.fetchResponse.mock.calls.map(([url, init]) =>
        [url.search, init.method ?? 'GET'])).toEqual([
        ['?ids=eetn', 'GET'], ['?ids=EETN', 'POST'], ['?ids=EETN', 'GET'],
      ])
      const signals = fixture.fetchResponse.mock.calls.map(([, init]) => init.signal)
      expect(signals.every((signal) => signal === signals[0])).toBe(true)
      for (const { run } of runs) expect(run).toHaveBeenCalledTimes(1)
    })

    it.each(['METAR upstream timed out', 'upstream gateway timeout'])(
      'keeps persistent 504 red and executes all diagnostics without claiming provenance: %s',
      async (body) => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        const fixture = verify([response(504, body), response(504, body)])
        const runs = checks(fixture.run)
        const result = await runProductionSmokeChecks(runs)
        expect(result.overall).toBe('metar-unavailable')
        expect(result.exitCode).toBe(1)
        expect(result.results.map(({ name }) => name)).toEqual(names)
        for (const { run } of runs) expect(run).toHaveBeenCalledTimes(1)
        expect(runs.map(({ run }) => run.mock.invocationCallOrder[0]))
          .toEqual([...runs.map(({ run }) => run.mock.invocationCallOrder[0])].sort((a, b) => a - b))
        expect(fixture.fetchResponse).toHaveBeenCalledTimes(4)
        const report = formatProductionSmokeReport(result, 'https://app.example', releaseSha)
        expect(report).toContain('METAR unavailable (HTTP 504)')
        expect(report).toContain('no release regression demonstrated')
        expect(report).not.toContain(body)
        expect(report).not.toContain('Smoke: passed')
      },
    )

    it('collects later failures and gives them precedence over provider-only guidance', async () => {
      const runs = checks(async () => 'metar-unavailable', 'Orbital catalog')
      const result = await runProductionSmokeChecks(runs)
      expect(result.overall).toBe('check-failure')
      expect(result.exitCode).toBe(1)
      for (const { run } of runs) expect(run).toHaveBeenCalledTimes(1)
      expect(result.results.find(({ name }) => name === 'Orbital catalog').status).toBe('failed')
      expect(formatProductionSmokeReport(result, 'https://app.example', releaseSha))
        .not.toContain('no release regression demonstrated')
    })

    it.each([
      [504, { 'X-LiveTrafficStan-Release': 'a'.repeat(40) }],
      [504, { 'X-LiveTrafficStan-Release': '' }],
      [504, { 'Access-Control-Allow-Origin': '*' }],
      [504, { 'Retry-After': '120' }],
      [504, { 'Cache-Control': 'public, max-age=60' }],
      [504, { 'Content-Type': 'text/html' }],
      [504, { 'X-Content-Type-Options': '' }],
      [502, {}],
      [429, {}],
    ])('fails closed without diagnostic continuation for status %i headers %j', async (status, headers) => {
      const fixture = verify([response(status, 'bad response', headers)])
      const runs = checks(fixture.run)
      const result = await runProductionSmokeChecks(runs)
      expect(result.overall).toBe('check-failure')
      expect(result.exitCode).toBe(1)
      expect(result.results.slice(3).every(({ status }) => status === 'not-run')).toBe(true)
      for (const { run } of runs.slice(3)) expect(run).not.toHaveBeenCalled()
    })

    it.each([
      ['{}', {}, 'unexpected payload'],
      ['[{"icaoId":"KJFK"}]', {}, 'unrequested station'],
      ['[]', { 'Content-Type': 'text/html' }, 'did not return JSON'],
      ['[]', { 'Cache-Control': 'no-store' }, 'cache guidance'],
      ['[]', { 'X-Content-Type-Options': '' }, 'nosniff'],
      ['[]', { 'Access-Control-Allow-Origin': '*' }, 'cross-origin'],
    ])('retains successful response assertions: %s %j', async (body, headers, error) => {
      const fixture = verify([response(200, body, headers)])
      await expect(fixture.run()).rejects.toThrow(error)
    })

    it('rejects an oversized final 504 and cancels its stream', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const cancel = vi.fn()
      const body = new ReadableStream({
        start(controller) { controller.enqueue(new Uint8Array(256 * 1_024 + 1)) },
        cancel,
      })
      const fixture = verify([response(504, 'timeout'), response(504, body)])
      await expect(fixture.run()).rejects.toThrow('oversized')
      expect(cancel).toHaveBeenCalledTimes(1)
    })

    it('accepts the exact 256 KiB final-response cap without logging its body', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const fixture = verify([
        response(504, 'timeout'), response(504, new Uint8Array(256 * 1_024)),
      ])
      expect(await fixture.run()).toBe('metar-unavailable')
    })

    it('reports malformed JSON without including response contents', async () => {
      const fixture = verify([response(200, 'PRIVATE_RESPONSE_TEXT_NOT_JSON')])
      const result = await runProductionSmokeChecks(checks(fixture.run))
      expect(result.overall).toBe('check-failure')
      expect(result.results.find(({ name }) => name === 'METAR').diagnostic)
        .toBe('METAR proxy returned invalid JSON')
    })

    it('rejects unreadable and expired final bodies without classifying an outage', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const body = new ReadableStream({
        start(controller) { controller.error(new Error('body read failed')) },
      })
      await expect(verify([response(504, 'timeout'), response(504, body)]).run())
        .rejects.toThrow('body read failed')
      const controller = new AbortController()
      const cancel = vi.fn()
      const pendingBody = new ReadableStream({ cancel })
      const fixture = verify([response(200, pendingBody)], { signal: controller.signal })
      const pending = fixture.run()
      const assertion = expect(pending).rejects.toThrow('deadline')
      await vi.waitFor(() => expect(fixture.fetchResponse).toHaveBeenCalledTimes(3))
      controller.abort(new Error('deadline'))
      await assertion
      expect(cancel).toHaveBeenCalledTimes(1)
    })

    it('does not reach upstream after a boundary failure', async () => {
      const fixture = verify([response(200, '[]')])
      fixture.fetchResponse.mockReset().mockResolvedValueOnce(new Response(null, { status: 200 }))
      await expect(fixture.run()).rejects.toThrow('Invalid METAR station ID')
      expect(fixture.fetchResponse).toHaveBeenCalledTimes(1)
    })

    it('preserves normal fail-fast and rejects unknown results', async () => {
      const result = await runProductionSmokeChecks(checks(async () => undefined, 'Aircraft'))
      expect(result.results.slice(2).every(({ status }) => status === 'not-run')).toBe(true)
      expect(result.exitCode).toBe(1)
      expect((await runProductionSmokeChecks(checks(async () => 'unknown'))).overall).toBe('check-failure')
      expect((await runProductionSmokeChecks([])).overall).toBe('incomplete')
    })

    it('writes the same bounded escaped report to stdout and Actions and propagates write errors', async () => {
      const directory = mkdtempSync(join(tmpdir(), 'smoke-report-'))
      try {
        const result = await runProductionSmokeChecks(checks(async () => 'metar-unavailable'))
        const summaryPath = join(directory, 'summary')
        const outputPath = join(directory, 'output')
        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
        await writeProductionSmokeReport({ result, targetOrigin: 'https://app.example',
          expectedReleaseSha: releaseSha, summaryPath, outputPath })
        expect(readFileSync(summaryPath, 'utf8')).toBe(log.mock.calls[0][0])
        expect(readFileSync(outputPath, 'utf8')).toBe('smoke_result=metar-unavailable\n')
        await expect(writeProductionSmokeReport({ result, targetOrigin: 'https://app.example',
          expectedReleaseSha: releaseSha, summaryPath: directory, outputPath }))
          .rejects.toThrow()
        const unsafe = await runProductionSmokeChecks([
          { name: 'METAR', run: async () => { throw new Error('\n::error:: | <script>`' + 'x'.repeat(900)) } },
        ])
        expect(unsafe.results[0].diagnostic.length).toBe(512)
        expect(formatProductionSmokeReport(unsafe, 'https://app.example', releaseSha))
          .toContain(' \\| &lt;script&gt;\\`')
      } finally {
        rmSync(directory, { recursive: true })
      }
    })

    it('uses a real nonzero Node exit for an unavailable standalone smoke result', () => {
      const moduleUrl = new URL('./smoke-policy.mjs', import.meta.url).href
      const child = spawnSync(process.execPath, ['--input-type=module', '-e',
        `import {runProductionSmokeChecks, writeProductionSmokeReport} from ${JSON.stringify(moduleUrl)};
         const result = await runProductionSmokeChecks([
           {name:'METAR',run:async()=> 'metar-unavailable'},
           {name:'Digitraffic MQTT',run:async()=>undefined}
         ]);
         await writeProductionSmokeReport({result,targetOrigin:'https://app.example',
           expectedReleaseSha:${JSON.stringify(releaseSha)},summaryPath:null,outputPath:null});
         process.exitCode=result.exitCode;`,
      ], { encoding: 'utf8' })
      expect(child.status).toBe(1)
      expect(child.stdout).toContain('| Digitraffic MQTT | passed |')
      expect(child.stdout).not.toContain('Smoke: passed')
    })

    it('wires the tested runner and guarded operation records into both workflows', () => {
      expect(smokeScript).toContain('await runProductionSmokeChecks([')
      expect(smokeScript).toContain('process.exitCode = result.exitCode')
      for (const file of ['deploy-production.yml', 'rollback-production.yml']) {
        const source = readFileSync(join(repositoryRoot, '.github/workflows', file), 'utf8')
        expect(source).toContain('id: smoke')
        expect(source).toContain("steps.smoke.outputs.smoke_result || 'incomplete'")
        expect(source).toContain('echo "- Smoke: $SMOKE_RESULT (step $SMOKE_OUTCOME)"')
        expect(source).not.toContain('echo "- Smoke: passed"')
        expect(source).not.toContain('continue-on-error')
        expect(source).toContain('if: always() && steps.')
      }
    })
  })

  const workerProbe = (releaseSha, overrides = {}) =>
    new Response(null, {
      status: overrides.status ?? 400,
      headers: {
        'Cache-Control': overrides.cacheControl ?? 'no-store',
        ...(releaseSha
          ? { 'X-LiveTrafficStan-Release': releaseSha }
          : {}),
        ...(overrides.allowOrigin
          ? { 'Access-Control-Allow-Origin': '*' }
          : {}),
      },
    })

  it('bounds deployment propagation retries', () => {
    expect(DEPLOYMENT_PROPAGATION_RETRY_DELAYS_MS).toEqual([
      0,
      1_000,
      2_000,
      4_000,
      8_000,
      15_000,
      30_000,
    ])
    expect(
      DEPLOYMENT_PROPAGATION_RETRY_DELAYS_MS.reduce(
        (total, delayMs) => total + delayMs,
        0,
      ),
    ).toBe(60_000)
    expect(isRetryableStaticAssetStatus(404)).toBe(true)
    expect(isRetryableStaticAssetStatus(503)).toBe(true)
    expect(isRetryableStaticAssetStatus(403)).toBe(false)
    expect(smokeScript).toContain(
      "const remoteIndex = await remoteBytes('/', localIndex)",
    )
    expect(smokeScript).toContain(
      'if (sha256(bytes) === expectedHash)',
    )
  })

  it('waits on a local Worker response before the single provider request', () => {
    const releaseProbeIndex = smokeScript.indexOf(
      "const releaseProbePath = '/api/aircraft/v2/point/91/24.754/11'",
    )
    const providerRequestIndex = smokeScript.indexOf(
      "const validPath = '/api/aircraft/v2/point/59.437/24.754/135'",
    )

    expect(releaseProbeIndex).toBeGreaterThan(-1)
    expect(providerRequestIndex).toBeGreaterThan(releaseProbeIndex)
    expect(smokeScript).toContain(
      "response.headers.get('x-livetrafficstan-release') === expectedReleaseSha",
    )
    expect(smokeScript).toContain('await waitForWorkerRelease()')
  })

  it('recovers from a transient canonical stale Worker release', async () => {
    const expectedReleaseSha = 'b'.repeat(40)
    const responses = [
      workerProbe('a'.repeat(40)),
      workerProbe(expectedReleaseSha),
    ]
    const waits = []
    let fetches = 0

    await expect(
      waitForExpectedWorkerRelease({
        fetchProbe: async () => responses[fetches++],
        expectedReleaseSha,
        retryDelaysMs: [0, 1_000],
        wait: async (delayMs) => waits.push(delayMs),
      }),
    ).resolves.toBeUndefined()

    expect(fetches).toBe(2)
    expect(waits).toEqual([1_000])
  })

  it('fails after the bounded Worker propagation window', async () => {
    const staleRelease = workerProbe('a'.repeat(40))
    let fetches = 0

    await expect(
      waitForExpectedWorkerRelease({
        fetchProbe: async () => {
          fetches += 1
          return staleRelease.clone()
        },
        expectedReleaseSha: 'b'.repeat(40),
        retryDelaysMs: [0, 1, 2],
        wait: async () => undefined,
      }),
    ).rejects.toThrow(
      'Worker release SHA does not match the deployed source',
    )
    expect(fetches).toBe(3)
  })

  it('fails immediately on malformed or unsafe Worker probes', async () => {
    let fetches = 0
    await expect(
      waitForExpectedWorkerRelease({
        fetchProbe: async () => {
          fetches += 1
          return workerProbe(undefined)
        },
        expectedReleaseSha: 'b'.repeat(40),
        retryDelaysMs: [0, 1],
        wait: async () => undefined,
      }),
    ).rejects.toThrow('Worker release SHA header is missing or malformed')
    expect(fetches).toBe(1)

    await expect(
      waitForExpectedWorkerRelease({
        fetchProbe: async () =>
          workerProbe('a'.repeat(40), { status: 503 }),
        expectedReleaseSha: 'b'.repeat(40),
        retryDelaysMs: [0, 1],
        wait: async () => undefined,
      }),
    ).rejects.toThrow('Invalid aircraft coordinates were not rejected')
  })

  it('supports a browser-origin ADSB.lol delivery smoke', () => {
    expect(smokeScript).toContain(
      "aircraftDelivery = 'worker-proxy'",
    )
    expect(smokeScript).toContain(
      "aircraftDelivery === 'adsb-lol-direct'",
    )
    expect(smokeScript).toContain(
      "aircraftDelivery === 'oci-private-relay'",
    )
    expect(smokeScript).toContain(
      "new URL(\n      '/v2/point/59.437/24.754/135',\n      'https://api.adsb.lol',",
    )
    expect(smokeScript).toContain(
      "'Direct aircraft provider did not allow the deployed origin'",
    )
    expect(smokeScript).toContain("redirect: 'error'")
    expect(smokeScript).toContain("cache: 'no-store'")
    expect(smokeScript).toContain("credentials: 'omit'")
    expect(smokeScript).toContain(
      'body.byteLength <= MAX_AIRCRAFT_RESPONSE_BYTES',
    )
    expect(smokeScript).toContain(
      'Aircraft wide-view probe passed delivery=${aircraftDelivery}',
    )
  })

  it('distinguishes provider throttling from proxy regressions', () => {
    expect(classifyAircraftProxyStatus(200)).toBe('available')
    expect(classifyAircraftProxyStatus(429)).toBe(
      'provider-throttled',
    )
    expect(classifyAircraftProxyStatus(403)).toBe('failure')
    expect(classifyAircraftProxyStatus(502)).toBe('failure')
  })

  it('bounds private relay admission retries', () => {
    expect(PRIVATE_RELAY_MAX_ATTEMPTS).toBe(12)
    expect(PRIVATE_RELAY_MAX_RETRY_AFTER_SECONDS).toBe(30)
    expect(PRIVATE_RELAY_MAX_ADMISSION_WAIT_MS).toBe(330_000)
    expect(PRIVATE_RELAY_SMOKE_TIMEOUT_MS).toBe(540_000)
    expect(SAME_ORIGIN_SMOKE_FETCH_INIT).toEqual({
      redirect: 'manual',
      cache: 'no-store',
      credentials: 'omit',
    })
  })

  it('recovers after bounded private relay admission guidance', async () => {
    const expectedReleaseSha = 'b'.repeat(40)
    const admissionHeaders = (retryAfter) => ({
      'Cache-Control': 'no-store',
      'Retry-After': retryAfter,
      'X-LiveTrafficStan-Release': expectedReleaseSha,
      'X-LiveTrafficStan-Relay-Status': 'admission',
    })
    const responses = [
      new Response(null, {
        status: 503,
        headers: admissionHeaders('20'),
      }),
      new Response(null, {
        status: 503,
        headers: admissionHeaders('3'),
      }),
      new Response('{"ac":[]}', { status: 200 }),
    ]
    const waits = []
    let fetches = 0

    const response = await fetchPrivateRelayWithRetry({
      fetchRelay: async () => responses[fetches++],
      expectedReleaseSha,
      wait: async (delayMs) => waits.push(delayMs),
    })

    expect(response.status).toBe(200)
    expect(fetches).toBe(3)
    expect(waits).toEqual([20_000, 3_000])
  })

  it('fails closed when private relay admission never clears', async () => {
    const expectedReleaseSha = 'b'.repeat(40)
    let fetches = 0
    const waits = []

    await expect(
      fetchPrivateRelayWithRetry({
        fetchRelay: async () => {
          fetches += 1
          return new Response(null, {
            status: 503,
            headers: {
              'Cache-Control': 'no-store',
              'Retry-After': '1',
              'X-LiveTrafficStan-Release': expectedReleaseSha,
              'X-LiveTrafficStan-Relay-Status': 'admission',
            },
          })
        },
        expectedReleaseSha,
        maxAttempts: 3,
        wait: async (delayMs) => waits.push(delayMs),
      }),
    ).rejects.toThrow(
      'Private aircraft relay remained unavailable after bounded retries',
    )
    expect(fetches).toBe(3)
    expect(waits).toEqual([1_000, 1_000])
  })

  it('rejects malformed private relay guidance immediately', async () => {
    const expectedReleaseSha = 'b'.repeat(40)
    await expect(
      fetchPrivateRelayWithRetry({
        fetchRelay: async () =>
          new Response(null, {
            status: 503,
            headers: {
              'Cache-Control': 'no-store',
              'Retry-After': 'later',
              'X-LiveTrafficStan-Release': expectedReleaseSha,
              'X-LiveTrafficStan-Relay-Status': 'admission',
            },
          }),
        expectedReleaseSha,
      }),
    ).rejects.toThrow(
      'Private aircraft relay returned 503 without numeric Retry-After',
    )
  })

  it('does not retry an unmarked provider 503', async () => {
    let fetches = 0
    const response = await fetchPrivateRelayWithRetry({
      fetchRelay: async () => {
        fetches += 1
        return new Response('provider unavailable', {
          status: 503,
          headers: { 'Retry-After': '20' },
        })
      },
      expectedReleaseSha: 'b'.repeat(40),
    })

    expect(response.status).toBe(503)
    expect(fetches).toBe(1)
  })

  it('stops private relay retries when the smoke deadline aborts', async () => {
    const controller = new AbortController()
    controller.abort(
      new Error('Private aircraft relay smoke exceeded its bounded deadline'),
    )
    let fetches = 0

    await expect(
      fetchPrivateRelayWithRetry({
        fetchRelay: async () => {
          fetches += 1
          return new Response(null, { status: 200 })
        },
        expectedReleaseSha: 'b'.repeat(40),
        signal: controller.signal,
      }),
    ).rejects.toThrow(
      'Private aircraft relay smoke exceeded its bounded deadline',
    )
    expect(fetches).toBe(0)
  })

  it('requires a non-contradictory one-year immutable cache policy', () => {
    expect(
      hasOneYearImmutableCacheControl(
        'public, max-age=31536000, immutable',
      ),
    ).toBe(true)
    expect(
      hasOneYearImmutableCacheControl(
        'public, max-age=0, immutable',
      ),
    ).toBe(false)
    expect(
      hasOneYearImmutableCacheControl(
        'public, max-age=31536000, no-cache, immutable',
      ),
    ).toBe(false)
    expect(
      hasOneYearImmutableCacheControl(
        'public, max-age=31536000, s-maxage=0, immutable',
      ),
    ).toBe(false)
  })

  it.each([
    [
      'v1 rollback',
      '/orbital-data/v1/visual-catalog.json',
      '/orbital-data/v1/NOTICE.txt',
    ],
    [
      'schema-v1 expiry bridge',
      '/orbital-data/v2/visual-catalog.json',
      '/orbital-data/v2/NOTICE.txt',
    ],
    [
      'schema-v2 current release',
      '/orbital-data/curated-2026-09-30-v1/catalog.json',
      '/orbital-data/curated-2026-09-30-v1/NOTICE.txt',
    ],
  ])(
    'derives target-specific orbital assets for %s',
    (_label, bootstrapPath, noticePath) => {
      expect(deriveOrbitalStaticAssetPaths(bootstrapPath)).toEqual({
        bootstrapPath,
        noticePath,
      })
    },
  )

  it.each([
    ['disabled', 1],
    ['schema1-only', 4],
    ['schema2-only', 4],
    ['dual-representation', 7],
  ])(
    'validates the %s rollback target without retries or provider requests',
    async (mode, expectedRequests) => {
      const contractFixture = createTargetContractFixture(mode)
      const routeFixture = createOrbitalRouteFixture(mode)
      const contract = contractFixture.target
        ? resolveTargetOrbitalSmokeContract(contractFixture.target)
        : undefined

      await expect(
        verifyTargetOrbitalCatalog({
          baseUrl: new URL('https://app.example/'),
          enabled: mode !== 'disabled',
          expectedReleaseSha: releaseSha,
          contract,
          fetchResponse: routeFixture.fetchResponse,
        }),
      ).resolves.toEqual({ mode })

      expect(routeFixture.requests).toHaveLength(expectedRequests)
      expect(
        routeFixture.requests.every(
          ({ url }) => new URL(url).origin === 'https://app.example',
        ),
      ).toBe(true)
      expect(
        routeFixture.requests.some(({ url }) =>
          url.includes('celestrak'),
        ),
      ).toBe(false)

      if (mode === 'disabled') return
      expect(contractFixture.validateSnapshot).toHaveBeenCalledTimes(1)
      if (mode === 'dual-representation') {
        expect(
          contractFixture.validateLegacySnapshot,
        ).toHaveBeenCalledTimes(1)
        expect(
          routeFixture.requests.filter(
            ({ accept }) =>
              accept === ORBITAL_SCHEMA2_NEGOTIATION_ACCEPT,
          ),
        ).toHaveLength(3)
      } else {
        expect(
          routeFixture.requests.every(({ accept }) => accept === null),
        ).toBe(true)
      }
    },
  )

  it('fails closed on a partial dual-representation target contract', () => {
    const fixture = createTargetContractFixture('schema2-only')
    fixture.target.ORBITAL_CATALOG_V2_ACCEPT =
      ORBITAL_SCHEMA2_NEGOTIATION_ACCEPT

    expect(() =>
      resolveTargetOrbitalSmokeContract(fixture.target),
    ).toThrow('dual-representation contract is incomplete')
  })

  it('feature-detects and validates the fixed Starlink route contract', async () => {
    const payload = {
      schemaVersion: 1,
      sourceContractVersion: 1,
      catalogId: 'celestrak-starlink-sample-v1',
      sources: {},
      populationCount: 1,
      extraSatcatCount: 0,
      sampleLimit: 150,
      sampleAlgorithm: 'inclination-raan-systematic-v1',
      recordCount: 1,
      records: [],
      publishedAt: '2026-10-01T19:45:03.000Z',
      digest: 'd'.repeat(64),
    }
    const validateSnapshot = vi.fn(async (value) => value)
    const contract = resolveTargetStarlinkSmokeContract({
      STARLINK_BOOTSTRAP_PATH:
        '/orbital-data/starlink-2026-10-02-v1/catalog.json',
      STARLINK_CATALOG_MEDIA_TYPE,
      STARLINK_CATALOG_SCHEMA_VERSION: 1,
      STARLINK_MAX_SNAPSHOT_BYTES: 256 * 1_024,
      STARLINK_SOURCE_CONTRACT_VERSION: 1,
      validateStarlinkCatalogSnapshot: validateSnapshot,
    })
    const requests = []
    const fetchResponse = vi.fn(async (input, init = {}) => {
      const url = new URL(input)
      const headers = new Headers(init.headers)
      const method = init.method ?? 'GET'
      requests.push({ url: url.toString(), method })
      if (url.search) {
        return new Response('Unsupported query', { status: 400 })
      }
      if (method !== 'GET') {
        return new Response('Method not allowed', { status: 405 })
      }
      const etag = `W/"${payload.digest}"`
      const responseHeaders = {
        'Cache-Control': 'no-store',
        'Content-Type': STARLINK_CATALOG_MEDIA_TYPE,
        ETag: etag,
        'X-Content-Type-Options': 'nosniff',
        'X-LiveTrafficStan-Release': releaseSha,
        'X-LiveTrafficStan-Starlink-Digest': payload.digest,
        'X-LiveTrafficStan-Starlink-Published-At':
          payload.publishedAt,
        'X-LiveTrafficStan-Starlink-Schema': '1',
        'X-LiveTrafficStan-Starlink-Source': 'kv',
        'X-LiveTrafficStan-Served-At':
          '2026-10-01T19:45:04.000Z',
      }
      if (headers.get('if-none-match') === etag) {
        return new Response(null, {
          status: 304,
          headers: responseHeaders,
        })
      }
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: responseHeaders,
      })
    })

    await expect(
      verifyTargetStarlinkCatalog({
        baseUrl: new URL('https://app.example/'),
        enabled: true,
        expectedReleaseSha: releaseSha,
        contract,
        fetchResponse,
      }),
    ).resolves.toEqual({ mode: 'schema1-only', source: 'kv' })
    expect(requests).toHaveLength(4)
    expect(
      requests.every(
        ({ url }) => new URL(url).origin === 'https://app.example',
      ),
    ).toBe(true)
    expect(
      requests.some(({ url }) => url.includes('celestrak')),
    ).toBe(false)
    expect(validateSnapshot).toHaveBeenCalledTimes(1)

    await expect(
      verifyTargetStarlinkCatalog({
        baseUrl: new URL('https://app.example/'),
        enabled: false,
        expectedReleaseSha: releaseSha,
        contract: undefined,
        fetchResponse: async () =>
          new Response('Not found', { status: 404 }),
      }),
    ).resolves.toEqual({ mode: 'disabled' })
    expect(() =>
      resolveTargetStarlinkSmokeContract({
        STARLINK_CATALOG_SCHEMA_VERSION: 1,
      }),
    ).toThrow('Starlink catalog contract is incomplete')
  })

  it.each([
    {
      label: 'aligned',
      schema1GpRetrievedAt: '2026-10-02T08:40:03.000Z',
      schema1SatcatRetrievedAt: '2026-10-02T08:40:05.000Z',
      schema1PublishedAt: '2026-10-02T08:40:06.000Z',
    },
    {
      label: 'newer schema-1 rollback',
      schema1GpRetrievedAt: '2026-10-02T20:40:03.000Z',
      schema1SatcatRetrievedAt: '2026-10-02T20:40:05.000Z',
      schema1PublishedAt: '2026-10-02T20:40:06.000Z',
    },
  ])(
    'validates $label Starlink dual representations and cross-representation ETags',
    async ({
      schema1GpRetrievedAt,
      schema1SatcatRetrievedAt,
      schema1PublishedAt,
    }) => {
    const shared = {
      sources: {
        gp: {
          retrievedAt: '2026-10-02T08:40:03.000Z',
          sha256: 'a'.repeat(64),
        },
        satcat: {
          retrievedAt: '2026-10-02T08:40:05.000Z',
          sha256: 'b'.repeat(64),
        },
      },
      populationCount: 11_125,
      extraSatcatCount: 0,
      publishedAt: '2026-10-02T08:40:06.000Z',
      records: [],
    }
    const schema1 = {
      ...shared,
      sources: {
        gp: {
          retrievedAt: schema1GpRetrievedAt,
          sha256: 'a'.repeat(64),
        },
        satcat: {
          retrievedAt: schema1SatcatRetrievedAt,
          sha256: 'b'.repeat(64),
        },
      },
      publishedAt: schema1PublishedAt,
      schemaVersion: 1,
      sourceContractVersion: 1,
      catalogId: 'celestrak-starlink-sample-v1',
      sampleLimit: 150,
      sampleAlgorithm: 'inclination-raan-systematic-v1',
      recordCount: 150,
      digest: '1'.repeat(64),
    }
    const schema2 = {
      ...shared,
      schemaVersion: 2,
      sourceContractVersion: 2,
      catalogId: 'celestrak-starlink-shell-balanced-v1',
      sampleLimit: 512,
      sampleAlgorithm: 'inclination-shell-raan-phase-grid-v1',
      samplingReferenceTime: '2026-10-02T08:40:03.000Z',
      shells: [],
      recordCount: 512,
      digest: '2'.repeat(64),
    }
    const validateSchema1 = vi.fn(async (value) => value)
    const validateSchema2 = vi.fn(async (value) => value)
    const contract = resolveTargetStarlinkSmokeContract({
      STARLINK_BOOTSTRAP_PATH:
        '/orbital-data/starlink-2026-10-02-v1/catalog.json',
      STARLINK_CATALOG_MEDIA_TYPE,
      STARLINK_CATALOG_SCHEMA_VERSION: 1,
      STARLINK_MAX_SNAPSHOT_BYTES: 256 * 1_024,
      STARLINK_SOURCE_CONTRACT_VERSION: 1,
      validateStarlinkCatalogSnapshot: validateSchema1,
      STARLINK_CATALOG_V2_SCHEMA_VERSION: 2,
      STARLINK_V2_SOURCE_CONTRACT_VERSION: 2,
      STARLINK_V2_MAX_SNAPSHOT_BYTES: 512 * 1_024,
      STARLINK_V2_BOOTSTRAP_PATH:
        '/orbital-data/starlink-shell-balanced-2026-10-02-v1/catalog.json',
      STARLINK_CATALOG_V2_MEDIA_TYPE:
        STARLINK_SCHEMA2_NEGOTIATION_ACCEPT,
      validateStarlinkCatalogSnapshotV2: validateSchema2,
    })
    const fetchResponse = vi.fn(async (input, init = {}) => {
      const url = new URL(input)
      if (url.search) {
        return new Response('Unsupported query', { status: 400 })
      }
      if ((init.method ?? 'GET') !== 'GET') {
        return new Response('Method not allowed', { status: 405 })
      }
      const requestHeaders = new Headers(init.headers)
      const payload =
        requestHeaders.get('accept') ===
        STARLINK_SCHEMA2_NEGOTIATION_ACCEPT
          ? schema2
          : schema1
      const mediaType =
        payload.schemaVersion === 2
          ? STARLINK_SCHEMA2_NEGOTIATION_ACCEPT
          : STARLINK_CATALOG_MEDIA_TYPE
      const etag = `W/"${payload.digest}"`
      const responseHeaders = {
        'Cache-Control': 'no-store',
        'Content-Type': mediaType,
        ETag: etag,
        Vary: 'Accept',
        'X-Content-Type-Options': 'nosniff',
        'X-LiveTrafficStan-Release': releaseSha,
        'X-LiveTrafficStan-Starlink-Digest': payload.digest,
        'X-LiveTrafficStan-Starlink-Published-At':
          payload.publishedAt,
        'X-LiveTrafficStan-Starlink-Schema': String(
          payload.schemaVersion,
        ),
        'X-LiveTrafficStan-Starlink-Source': 'kv',
        'X-LiveTrafficStan-Served-At':
          '2026-10-02T08:40:07.000Z',
      }
      return requestHeaders.get('if-none-match') === etag
        ? new Response(null, {
            status: 304,
            headers: responseHeaders,
          })
        : new Response(JSON.stringify(payload), {
            status: 200,
            headers: responseHeaders,
          })
    })

    await expect(
      verifyTargetStarlinkCatalog({
        baseUrl: new URL('https://app.example/'),
        enabled: true,
        expectedReleaseSha: releaseSha,
        contract,
        fetchResponse,
      }),
    ).resolves.toEqual({
      mode: 'dual-representation',
      source: 'kv',
    })
    expect(validateSchema1).toHaveBeenCalledTimes(1)
    expect(validateSchema2).toHaveBeenCalledTimes(1)
    },
  )

  it.each(
    ['initial', 'conditional'].flatMap((phase) =>
      [
        'ETag',
        'X-LiveTrafficStan-Starlink-Digest',
        'X-LiveTrafficStan-Starlink-Published-At',
        'X-LiveTrafficStan-Starlink-Schema',
        'X-LiveTrafficStan-Starlink-Source',
        'X-LiveTrafficStan-Served-At',
      ].map((header) => [phase, header]),
    ),
  )(
    'rejects a missing %s Starlink %s header',
    async (phase, missingHeader) => {
      const payload = {
        schemaVersion: 1,
        sourceContractVersion: 1,
        catalogId: 'celestrak-starlink-sample-v1',
        sources: {},
        populationCount: 1,
        extraSatcatCount: 0,
        sampleLimit: 150,
        sampleAlgorithm: 'inclination-raan-systematic-v1',
        recordCount: 1,
        records: [],
        publishedAt: '2026-10-01T19:45:03.000Z',
        digest: 'd'.repeat(64),
      }
      const contract = resolveTargetStarlinkSmokeContract({
        STARLINK_BOOTSTRAP_PATH:
          '/orbital-data/starlink-2026-10-02-v1/catalog.json',
        STARLINK_CATALOG_MEDIA_TYPE,
        STARLINK_CATALOG_SCHEMA_VERSION: 1,
        STARLINK_MAX_SNAPSHOT_BYTES: 256 * 1_024,
        STARLINK_SOURCE_CONTRACT_VERSION: 1,
        validateStarlinkCatalogSnapshot: vi.fn(
          async (value) => value,
        ),
      })
      const etag = `W/"${payload.digest}"`
      const fetchResponse = vi.fn(async (input, init = {}) => {
        const url = new URL(input)
        const requestHeaders = new Headers(init.headers)
        if (url.search) {
          return new Response('Unsupported query', { status: 400 })
        }
        if ((init.method ?? 'GET') !== 'GET') {
          return new Response('Method not allowed', { status: 405 })
        }
        const conditional =
          requestHeaders.get('if-none-match') === etag
        const responseHeaders = new Headers({
          'Cache-Control': 'no-store',
          'Content-Type': STARLINK_CATALOG_MEDIA_TYPE,
          ETag: etag,
          'X-Content-Type-Options': 'nosniff',
          'X-LiveTrafficStan-Release': releaseSha,
          'X-LiveTrafficStan-Starlink-Digest': payload.digest,
          'X-LiveTrafficStan-Starlink-Published-At':
            payload.publishedAt,
          'X-LiveTrafficStan-Starlink-Schema': '1',
          'X-LiveTrafficStan-Starlink-Source': 'kv',
          'X-LiveTrafficStan-Served-At':
            '2026-10-01T19:45:04.000Z',
        })
        if (
          (phase === 'initial' && !conditional) ||
          (phase === 'conditional' && conditional)
        ) {
          responseHeaders.delete(missingHeader)
        }
        return conditional
          ? new Response(null, {
              status: 304,
              headers: responseHeaders,
            })
          : new Response(JSON.stringify(payload), {
              status: 200,
              headers: responseHeaders,
            })
      })

      await expect(
        verifyTargetStarlinkCatalog({
          baseUrl: new URL('https://app.example/'),
          enabled: true,
          expectedReleaseSha: releaseSha,
          contract,
          fetchResponse,
        }),
      ).rejects.toThrow()
    },
  )

  it('loads the orbital bootstrap source of truth from the target checkout', () => {
    const targetImportIndex = smokeScript.indexOf(
      "await import('../worker/orbitalCatalog.ts')",
    )
    expect(targetImportIndex).toBeGreaterThan(-1)
    expect(smokeScript).toContain(
      "orbitalCatalogEnabled === 'true'",
    )
    expect(smokeScript).toContain(
      'deriveOrbitalStaticAssetPaths(',
    )
    expect(smokeScript).toContain(
      'resolveTargetOrbitalSmokeContract(targetOrbitalContract)',
    )
    expect(smokeScript).toContain('verifyTargetOrbitalCatalog({')
    expect(smokeScript).not.toContain(
      'targetOrbitalContract.validateLegacyOrbitalCatalogSnapshot',
    )
    expect(smokeScript).not.toContain(
      'targetOrbitalContract.ORBITAL_CATALOG_V2_ACCEPT',
    )
    expect(smokePolicyScript).toContain(
      "visualSource?.gpRecordCount === schema1.payload.recordCount",
    )
    const kvFreshnessStart = smokePolicyScript.indexOf(
      "if (schema2.source === 'kv')",
    )
    const kvFreshnessCheck = smokePolicyScript.slice(
      kvFreshnessStart,
      smokePolicyScript.indexOf(
        '    await verifyConditional(',
        kvFreshnessStart,
      ),
    )
    expect(kvFreshnessCheck).toContain(
      'visualSource?.gpRecordCount === schema1.payload.recordCount',
    )
    expect(smokePolicyScript).toContain(
      'Date.parse(schema1.payload.retrievedAt) >=',
    )
    expect(smokePolicyScript).toContain(
      "new URL('/api/orbits/catalog', baseUrl)",
    )
    expect(smokePolicyScript).not.toContain('/api/orbits/catalog/v2')
    expect(smokeScript).toContain(
      'targetOrbitalSmokeContract.bootstrapPath',
    )
    expect(smokeScript).toContain(
      "starlinkCatalogEnabled === 'true'",
    )
    expect(smokeScript).toContain(
      "await import('../worker/starlinkCatalog.ts')",
    )
    expect(smokeScript).toContain(
      'resolveTargetStarlinkSmokeContract(targetStarlinkContract)',
    )
    expect(smokeScript).toContain(
      'verifyTargetStarlinkCatalog({',
    )
    expect(smokeScript).not.toContain(
      "const orbitalPath = '/orbital-data/",
    )
    expect(smokeScript).not.toContain(
      "const noticePath = '/orbital-data/",
    )
  })

  it('allows current smoke policy to inspect a target without new manifests', async () => {
    const manifest = await readOptionalJson(
      join(repositoryRoot, 'src/config/vesselPhotoManifest.json'),
    )
    const absentManifest = await readOptionalJson(
      join(repositoryRoot, 'src/config/does-not-exist.json'),
    )

    expect(manifest?.photos).toHaveLength(8)
    expect(absentManifest).toBeUndefined()
    expect(smokeScript).not.toContain('import vesselPhotoManifest')
  })
})
