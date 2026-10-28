import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OrbitalChannel } from '../../domain/orbital'
import {
  SPACE_TRACK_CURATED_MEDIA_TYPE,
  SPACE_TRACK_GP_FIELDS,
  SPACE_TRACK_MAX_STARLINK_BYTES,
  SPACE_TRACK_STARLINK_MEDIA_TYPE,
  parseSpaceTrackSnapshot,
  spaceTrackApplicationSnapshot,
  spaceTrackDigest,
  spaceTrackGpUrl,
} from './spaceTrackCatalogContract'
import {
  SPACE_TRACK_CURATED_KEY,
  SPACE_TRACK_STARLINK_KEY,
  createSpaceTrackCuratedSnapshot,
  createSpaceTrackStarlinkSnapshot,
  handleSpaceTrackCatalog,
  serializeSpaceTrackSnapshot,
  spaceTrackCurationReference,
} from '../../../worker/spaceTrackCatalog'
import { fetchSpaceTrackGp, loginToSpaceTrack } from '../../../worker/spaceTrackClient'
import {
  SPACE_TRACK_LOGIN_URL,
  spaceTrackSessionCookies,
} from '../../../worker/spaceTrackProtocol'
import { refreshSpaceTrackCatalog, type SpaceTrackRefreshCoordinator } from '../../../worker/spaceTrackRefresh'
import {
  ORBITAL_REFRESH_INTERVAL_MS,
  type OrbitalRefreshCompletion,
} from '../../../worker/orbitalCatalog'
import { STARLINK_REFRESH_INTERVAL_MS } from '../../../worker/starlinkCatalog'
import { createAppConfig } from '../../config/appConfig'
import { OrbitalCatalogProvider, type OrbitalCatalogRuntime } from './orbitalCatalogProvider'
import { StarlinkCatalogProvider } from './starlinkCatalogProvider'

const NOW = Date.parse('2026-10-17T15:00:00.000Z')
const row = (id: string, inclination = 53) => ({
  NORAD_CAT_ID: id, OBJECT_NAME: `STARLINK-${id}`, OBJECT_ID: '2026-001A',
  OBJECT_TYPE: 'PAYLOAD', EPOCH: '2026-10-17T14:00:00.123456',
  MEAN_MOTION: '15.2', ECCENTRICITY: '0.001', INCLINATION: String(inclination),
  RA_OF_ASC_NODE: String(Number(id) % 360), ARG_OF_PERICENTER: '30',
  MEAN_ANOMALY: '40', EPHEMERIS_TYPE: '0', CLASSIFICATION_TYPE: 'U',
  ELEMENT_SET_NO: '999', REV_AT_EPOCH: '123', BSTAR: '0.0001',
  MEAN_MOTION_DOT: '0.00001', MEAN_MOTION_DDOT: '0', DECAY_DATE: null,
})
const rows = (channel: OrbitalChannel) => channel === 'curated'
  ? spaceTrackCurationReference().records.map(({ noradCatalogId }) => row(noradCatalogId))
  : Array.from({ length: 512 }, (_unused, index) =>
      row(String(100_000 + index), [43, 53, 70, 97.5][Math.floor(index / 128)]))

const result = async (channel: OrbitalChannel, values: unknown[] = rows(channel)) => {
  const text = JSON.stringify(values)
  return {
    value: values,
    source: {
      url: spaceTrackGpUrl(channel, channel === 'curated'
        ? spaceTrackCurationReference().records.map((record) => record.noradCatalogId) : []),
      retrievedAt: new Date(NOW).toISOString(), recordCount: values.length,
      decodedBytes: new TextEncoder().encode(text).byteLength,
      sha256: await spaceTrackDigest(text),
    },
    retryAtMs: undefined, requiresReview: false,
  }
}

const environment = (values = new Map<string, string>()) => ({
  ORBITAL_CATALOG_ENABLED: 'true', STARLINK_CATALOG_ENABLED: 'true',
  ORBITAL_CATALOG_SOURCE: 'space-track',
  SPACE_TRACK_USERNAME: 'protected-user', SPACE_TRACK_PASSWORD: 'protected-password',
  ASSETS: { fetch: vi.fn(async () => new Response(null, { status: 404 })) },
  ORBITAL_CATALOG: {
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => { values.set(key, value) }),
  },
})

const gate = (starlinkDue = true) => {
  let active: string | undefined
  let next = NOW
  let starlinkNext = starlinkDue ? NOW : NOW + STARLINK_REFRESH_INTERVAL_MS
  let blocked: number | undefined
  const coordinator: SpaceTrackRefreshCoordinator = {
    reserve: vi.fn<SpaceTrackRefreshCoordinator['reserve']>(async (at) => {
      if (blocked !== undefined) return { kind: 'blocked', status: blocked }
      if (at < next || active) return { kind: 'not-due', nextAllowedAtMs: next }
      active = String(at)
      next = Number.MAX_SAFE_INTEGER
      return { kind: 'admitted', attemptId: active }
    }),
    reserveStarlink: vi.fn<SpaceTrackRefreshCoordinator['reserveStarlink']>(async (token, at) => {
      if (active !== token) throw new Error('Obsolete attempt')
      if (at < starlinkNext) return { kind: 'not-due', nextAllowedAtMs: starlinkNext }
      starlinkNext = at + STARLINK_REFRESH_INTERVAL_MS
      return { kind: 'admitted', lastStartedAtMs: at, nextAllowedAtMs: starlinkNext }
    }),
    assertCurrent: vi.fn(async (token) => {
      if (active !== token) throw new Error('Obsolete attempt')
    }),
    complete: vi.fn(async (token, completion: OrbitalRefreshCompletion) => {
      if (token !== active) throw new Error('Obsolete attempt')
      active = undefined
      if (completion.kind === 'blocked') {
        blocked = completion.status
        next = Number.MAX_SAFE_INTEGER
      } else next = completion.nextAllowedAtMs
    }),
    recordOutcome: vi.fn(async () => undefined),
  }
  return { coordinator, next: () => next, starlinkNext: () => starlinkNext }
}

const api = (afterLogin?: () => void, gpValue?: unknown) => vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
  const url = String(input)
  if (url === SPACE_TRACK_LOGIN_URL) {
    afterLogin?.()
    return new Response('""', { headers: { 'Set-Cookie': 'session=private; Path=/; Secure; HttpOnly' } })
  }
  return Response.json(gpValue ?? rows(url.includes('OBJECT_NAME/~~STARLINK') ? 'starlink' : 'curated'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('native Space-Track catalog contract', () => {
  it('pins only current exact IDs/groups, not old names, types, or elements', () => {
    const reference = spaceTrackCurationReference()
    expect(reference.records).toHaveLength(461)
    expect(reference.retrievedAt).toBe('2026-10-17T12:17:07.523Z')
    expect(reference.sha256).toBe('d062e417f365701d3ef2951e400a9196700c514ced47960305f010681d0da5c0')
    expect(reference.records.every((record) =>
      Object.keys(record).sort().join(',') === 'noradCatalogId,sourceGroups')).toBe(true)
  })

  it.each(['curated', 'starlink'] as const)('publishes and verifies complete GP-only %s provenance', async (channel) => {
    const input = await result(channel)
    const snapshot = channel === 'curated'
      ? await createSpaceTrackCuratedSnapshot(input, new Date(NOW).toISOString())
      : await createSpaceTrackStarlinkSnapshot(input, new Date(NOW).toISOString())
    expect(snapshot.schemaVersion).toBe(3)
    expect(snapshot.provider).toBe('space-track')
    expect(snapshot.source.sha256).toBe(input.source.sha256)
    expect(snapshot.records[0].epoch).toBe('2026-10-17T14:00:00.123456Z')
    expect(snapshot.records[0].meanMotion).toBe(15.2)
    expect(snapshot.records[0].objectType).toBe('PAY')
    expect(JSON.stringify(snapshot)).not.toContain('satcat')
    expect(new TextEncoder().encode(serializeSpaceTrackSnapshot(snapshot)).length).toBeLessThan(512 * 1_024)
    if (snapshot.channel === 'curated') {
      const parsed = await parseSpaceTrackSnapshot(snapshot, 'curated')
      const model = spaceTrackApplicationSnapshot(parsed)
      expect(model.curationReference?.id).toBe('curated-reference-2026-10-17-v1')
      expect(model.sources.every((source) => source.satcatSourceUrl === undefined)).toBe(true)
    } else {
      const parsed = await parseSpaceTrackSnapshot(snapshot, 'starlink')
      const model = spaceTrackApplicationSnapshot(parsed)
      expect(parsed.shells.map((shell) => shell.sampleCount)).toEqual([128, 128, 128, 128])
      expect(model.owner).toBe('starlink')
      expect(model.starlink.sources.satcat).toBeUndefined()
      expect(model.starlink.extraSatcatCount).toBeUndefined()
    }
  })

  it('rejects missing, duplicate and substituted curated identities instead of publishing partial coverage', async () => {
    const source = rows('curated')
    for (const values of [
      source.slice(1),
      source.map((value, index) => index === 0 ? source[1] : value),
      source.map((value, index) => index === 0 ? row('999999999') : value),
    ]) {
      await expect(createSpaceTrackCuratedSnapshot(await result('curated', values), new Date(NOW).toISOString()))
        .rejects.toThrow('contract is invalid')
    }
  })

  it.each(['', ' ', '0x10', 'Infinity', 'NaN', '15junk'])('rejects coercion-shaped native numbers %j', async (number) => {
    const values = rows('curated')
    values[0].MEAN_MOTION = number
    await expect(createSpaceTrackCuratedSnapshot(await result('curated', values), new Date(NOW).toISOString()))
      .rejects.toThrow()
  })

  it('maps unrecognized native reported type to unknown without guessing from the name', async () => {
    const values = rows('curated')
    values[0].OBJECT_TYPE = 'FUTURE TYPE'
    const snapshot = await createSpaceTrackCuratedSnapshot(await result('curated', values), new Date(NOW).toISOString())
    expect(snapshot.records[0].name).toMatch(/^STARLINK-/)
    expect(snapshot.records[0].objectType).toBe('UNK')
  })

  it('rejects nonpublic, decayed, extra-field and nonpayload Starlink records', async () => {
    for (const patch of [
      { CLASSIFICATION_TYPE: 'C' }, { DECAY_DATE: '2026-10-16' },
      { OBJECT_TYPE: 'ROCKET BODY' }, { unexpected: 'not-requested' },
    ]) {
      const values = rows('starlink').map((value, index) => index === 0 ? { ...value, ...patch } : value)
      await expect(createSpaceTrackStarlinkSnapshot(await result('starlink', values), new Date(NOW).toISOString()))
        .rejects.toThrow()
    }
  })

  it('uses explicit overflow sentinels and rejects a capped population before sampling', async () => {
    expect(spaceTrackGpUrl('starlink')).toContain('/limit/15001/')
    expect(spaceTrackGpUrl('curated', ['25544'])).toContain('/limit/513/')
    expect(SPACE_TRACK_GP_FIELDS).toHaveLength(19)
    const input = await result('starlink')
    input.value = Array.from({ length: 15_001 }, () => row('25544'))
    input.source.recordCount = 15_001
    await expect(createSpaceTrackStarlinkSnapshot(input, new Date(NOW).toISOString())).rejects.toThrow()
  })

  it('validates the source epoch predicate across the complete population before sampling', async () => {
    const values = [...rows('starlink'), {
      ...row('999999998', 43), EPOCH: '2020-01-01T00:00:00.000000',
    }]
    await expect(createSpaceTrackStarlinkSnapshot(await result('starlink', values), new Date(NOW).toISOString()))
      .rejects.toThrow('contract is invalid')
  })
})

describe('bounded server-only Space-Track session', () => {
  it('supports the Workers getAll cookie API without folding Set-Cookie', () => {
    const headers = new Headers()
    Object.defineProperty(headers, 'getSetCookie', { value: undefined })
    Object.defineProperty(headers, 'getAll', {
      value: (name: string) => {
        expect(name).toBe('Set-Cookie')
        return ['session=private; Path=/; Secure; Expires=Sun, 18 Oct 2026 00:00:00 GMT']
      },
    })
    expect(spaceTrackSessionCookies(headers, NOW)).toBe('session=private')
  })

  it('keeps credentials only in the fixed POST, and only scoped cookies in the one fixed GP request', async () => {
    const fetchImpl = api()
    const options = { fetchImpl, signal: new AbortController().signal, now: () => NOW, timeoutMs: 1_000 }
    const session = await loginToSpaceTrack('protected-user', 'protected-password', options)
    await fetchSpaceTrackGp(session, 'starlink', [], options)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(String(fetchImpl.mock.calls[0][0])).toBe(SPACE_TRACK_LOGIN_URL)
    const requests = fetchImpl.mock.calls
    expect(requests[0][1]?.body).toBe('identity=protected-user&password=protected-password')
    expect(new Headers(requests[1][1]?.headers).get('Cookie')).toBe('session=private')
    expect(JSON.stringify(requests[1])).not.toContain('protected-password')
    expect(requests.every((call) => call[1]?.redirect === 'manual')).toBe(true)
  })

  it('enforces the real per-response GP cap before reading an oversized declared response', async () => {
    const fetchImpl = vi.fn(async () => new Response('[]', {
      headers: { 'Content-Type': 'application/json', 'Content-Length': String(SPACE_TRACK_MAX_STARLINK_BYTES + 1) },
    }))
    await expect(fetchSpaceTrackGp({ cookie: 'session=private' }, 'starlink', [], {
      fetchImpl, signal: new AbortController().signal, now: () => NOW, timeoutMs: 1_000,
    })).rejects.toMatchObject({ code: 'response-length-invalid' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('preserves Retry-After even when a 200 body is invalid', async () => {
    const fetchImpl = vi.fn(async () => new Response('not json', {
      headers: { 'Content-Type': 'application/json', 'Retry-After': '14400' },
    }))
    await expect(fetchSpaceTrackGp({ cookie: 'session=private' }, 'starlink', [], {
      fetchImpl, signal: new AbortController().signal, now: () => NOW, timeoutMs: 1_000,
    })).rejects.toMatchObject({ retryAtMs: NOW + 4 * 60 * 60_000 })
  })

  it('bounds ignored cancellation and cannot turn a late login into a GP request', async () => {
    vi.useFakeTimers()
    let resolve: (response: Response) => void = () => undefined
    const fetchImpl = vi.fn(() => new Promise<Response>((done) => { resolve = done }))
    const pending = loginToSpaceTrack('protected-user', 'protected-password', {
      fetchImpl, signal: new AbortController().signal, timeoutMs: 10,
    })
    const rejected = expect(pending).rejects.toMatchObject({ code: 'request-timed-out' })
    await vi.advanceTimersByTimeAsync(11)
    await rejected
    resolve(new Response('""', { headers: { 'Set-Cookie': 'session=late; Path=/' } }))
    await Promise.resolve()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('one physical producer and one topic per admission', () => {
  it.each([
    ['empty array', () => [], 'empty GP array'],
    ['non-GP array', () => [{ error: 'private-provider-message' }], 'row index 0 rejected: fields'],
    ['duplicate', () => rows('curated').map((value, index, all) => index === 0 ? all[1] : value),
      `duplicate ID ${rows('curated')[1].NORAD_CAT_ID}`],
    ['invalid numeric string', () => rows('curated').map((value, index) =>
      index === 0 ? { ...value, BSTAR: 'private-provider-message' } : value),
      `row ${rows('curated')[0].NORAD_CAT_ID} rejected: BSTAR`],
    ['out-of-range value', () => rows('curated').map((value, index) =>
      index === 0 ? { ...value, MEAN_MOTION: '999' } : value),
      `row ${rows('curated')[0].NORAD_CAT_ID} rejected: GP values`],
    ['decayed row', () => rows('curated').map((value, index) =>
      index === 0 ? { ...value, DECAY_DATE: '2026-10-17' } : value),
      `row ${rows('curated')[0].NORAD_CAT_ID} rejected: DECAY_DATE`],
  ] as const)('classifies %s without exposing provider text or changing admission', async (_name, values, diagnostic) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const env = environment()
    const state = gate(false)
    const fetchImpl = api(undefined, values())
    const outcome = await refreshSpaceTrackCatalog(env, state.coordinator, { fetchImpl, now: () => NOW })
    expect(outcome).toEqual({
      kind: 'failed', reason: `Space-Track curated GP ${diagnostic}`,
      publicationResults: { curated: 'not-attempted' },
    })
    expect(JSON.stringify(outcome)).not.toContain('private-provider-message')
    expect(state.next()).toBe(NOW + ORBITAL_REFRESH_INTERVAL_MS)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(env.ORBITAL_CATALOG.put).not.toHaveBeenCalled()
  })

  it('identifies missing and substituted pinned IDs without publishing partial coverage', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const source = rows('curated')
    for (const [values, unpinned] of [
      [source.slice(1), 'none'],
      [source.map((value, index) => index === 0 ? row('999999999') : value), '999999999'],
    ] as const) {
      const env = environment()
      const outcome = await refreshSpaceTrackCatalog(env, gate(false).coordinator, {
        fetchImpl: api(undefined, values), now: () => NOW,
      })
      expect(outcome).toEqual({
        kind: 'failed',
        reason: `Space-Track curated GP records ${values.length} of 461, missing ${source[0].NORAD_CAT_ID}, unpinned ${unpinned}`,
        publicationResults: { curated: 'not-attempted' },
      })
      expect(env.ORBITAL_CATALOG.put).not.toHaveBeenCalled()
    }
  })

  it('bounds complete-set discrepancy diagnostics to the unchanged receipt format', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const values = rows('curated').map((_value, index) => row(String(900_000_000 + index)))
    const outcome = await refreshSpaceTrackCatalog(environment(), gate(false).coordinator, {
      fetchImpl: api(undefined, values), now: () => NOW,
    })
    expect(outcome).toMatchObject({ kind: 'failed' })
    if (!('reason' in outcome)) throw new Error('Missing fixture failure reason')
    expect(outcome.reason).toMatch(/^[A-Za-z0-9][A-Za-z0-9 _.,:/'()-]{0,159}$/)
    expect(outcome.reason).toContain('records 461 of 461, missing')
    expect(outcome.reason).toContain('and 458 more')
    expect(outcome.reason).toContain('unpinned 900000000, 900000001, 900000002 and 458 more')
    expect(Object.keys(outcome).sort()).toEqual(['kind', 'publicationResults', 'reason'])
  })

  it('distinguishes transport, JSON errors and rejected publication without leaking underlying errors', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    for (const failure of ['transport', 'json', 'publication'] as const) {
      const env = environment()
      const state = gate(false)
      const fetchImpl = api()
      if (failure === 'publication') {
        env.ORBITAL_CATALOG.put.mockRejectedValue(new Error('private-storage-detail'))
      } else {
        fetchImpl.mockImplementationOnce(async () =>
          new Response('""', { headers: { 'Set-Cookie': 'session=private; Path=/' } }))
        if (failure === 'transport') fetchImpl.mockRejectedValueOnce(new Error('private-transport-detail'))
        else fetchImpl.mockImplementationOnce(async () => Response.json({ error: 'private-provider-detail' }))
      }
      const outcome = await refreshSpaceTrackCatalog(env, state.coordinator, { fetchImpl, now: () => NOW })
      expect(outcome).toEqual({
        kind: 'failed',
        reason: `Space-Track curated GP ${failure === 'transport' ? 'transport-unavailable' :
          failure === 'json' ? 'response-json-or-integrity-invalid' : 'snapshot publication failed'}`,
        publicationResults: { curated: failure === 'publication' ? 'rejected' : 'not-attempted' },
        ...(failure === 'json' ? { status: 200 } : {}),
      })
      expect(JSON.stringify(outcome)).not.toContain('private-')
      expect(state.next()).toBe(NOW + ORBITAL_REFRESH_INTERVAL_MS)
      expect(fetchImpl).toHaveBeenCalledTimes(2)
    }
  })

  it('does not turn a later Starlink publication into curated recovery', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const values = new Map([[SPACE_TRACK_CURATED_KEY, 'retained-curated-snapshot']])
    const env = environment(values)
    const state = gate(false)
    const first = await refreshSpaceTrackCatalog(env, state.coordinator, {
      fetchImpl: api(undefined, []), now: () => NOW,
    })
    expect(first).toMatchObject({ kind: 'failed', reason: 'Space-Track curated GP empty GP array' })
    const second = await refreshSpaceTrackCatalog(env, state.coordinator, {
      fetchImpl: api(), now: () => NOW + STARLINK_REFRESH_INTERVAL_MS,
    })
    expect(second).toMatchObject({
      kind: 'published', publicationResults: { curated: 'not-attempted', starlink: 'fulfilled' },
    })
    expect(values.get(SPACE_TRACK_CURATED_KEY)).toBe('retained-curated-snapshot')
    expect(env.ORBITAL_CATALOG.put).toHaveBeenCalledTimes(1)
  })

  it.each(['diagnostic', 'completion'] as const)('keeps %s persistence separate from actual committed publication', async (failure) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const env = environment()
    const state = gate()
    if (failure === 'diagnostic') {
      const recordOutcome = state.coordinator.recordOutcome
      if (!recordOutcome) throw new Error('Missing fixture diagnostic')
      vi.mocked(recordOutcome).mockRejectedValue(new Error('Diagnostic storage unavailable'))
    } else {
      vi.mocked(state.coordinator.complete).mockRejectedValue(new Error('Physical completion unavailable'))
    }
    const fetchImpl = api()
    const outcome = await refreshSpaceTrackCatalog(env, state.coordinator, { fetchImpl, now: () => NOW })
    expect(outcome.kind).toBe(failure === 'diagnostic' ? 'published' : 'unavailable')
    if (failure === 'diagnostic') {
      expect(outcome).toMatchObject({ publicationResults: { curated: 'not-attempted', starlink: 'fulfilled' } })
      expect(state.next()).toBe(NOW + ORBITAL_REFRESH_INTERVAL_MS)
    } else expect(state.next()).toBe(Number.MAX_SAFE_INTEGER)
    expect(env.ORBITAL_CATALOG.put).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
  it('prioritizes a due Starlink batch without claiming curated fulfillment or issuing another GP request', async () => {
    const env = environment()
    const state = gate()
    const fetchImpl = api()
    const outcome = await refreshSpaceTrackCatalog(env, state.coordinator, { fetchImpl, now: () => NOW })
    expect(outcome).toMatchObject({
      kind: 'published', publicationResults: { curated: 'not-attempted', starlink: 'fulfilled' },
      starlink: { kind: 'published', recordCount: 512, populationCount: 512 },
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(env.ORBITAL_CATALOG.put).toHaveBeenCalledTimes(1)
    expect(env.ORBITAL_CATALOG.put.mock.calls[0][0]).toBe(SPACE_TRACK_STARLINK_KEY)
    expect(state.starlinkNext()).toBe(NOW + STARLINK_REFRESH_INTERVAL_MS)
    expect(state.next()).toBe(NOW + ORBITAL_REFRESH_INTERVAL_MS)
  })

  it('uses the curated slot when Starlink is not due and retains its native twelve-hour boundary', async () => {
    const env = environment()
    const state = gate(false)
    const next = state.starlinkNext()
    const outcome = await refreshSpaceTrackCatalog(env, state.coordinator, { fetchImpl: api(), now: () => NOW })
    expect(outcome).toMatchObject({ kind: 'published', publicationResults: { curated: 'fulfilled' } })
    expect(env.ORBITAL_CATALOG.put.mock.calls[0][0]).toBe(SPACE_TRACK_CURATED_KEY)
    expect(state.starlinkNext()).toBe(next)
  })

  it('does no login before eligibility, and accepts the exact two-hour boundary', async () => {
    const env = environment()
    const state = gate()
    let at = NOW
    const fetchImpl = api()
    await refreshSpaceTrackCatalog(env, state.coordinator, { fetchImpl, now: () => at })
    at = NOW + ORBITAL_REFRESH_INTERVAL_MS - 1
    expect(await refreshSpaceTrackCatalog(env, state.coordinator, { fetchImpl, now: () => at }))
      .toMatchObject({ kind: 'not-due' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    at += 1
    expect(await refreshSpaceTrackCatalog(env, state.coordinator, { fetchImpl, now: () => at }))
      .toMatchObject({ kind: 'published' })
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })

  it('reserves the actual twelve-hour child boundary after authentication', async () => {
    let at = NOW
    const state = gate(false)
    const boundary = state.starlinkNext()
    at = boundary - 5
    const fetchImpl = api(() => { at = boundary + 5 })
    const outcome = await refreshSpaceTrackCatalog(environment(), state.coordinator, { fetchImpl, now: () => at })
    expect(outcome).toMatchObject({ starlink: { kind: 'published' } })
    expect(state.starlinkNext()).toBe(boundary + 5 + STARLINK_REFRESH_INTERVAL_MS)
  })

  it('does not consume the child GP boundary or query any GP when authentication is unconfirmed', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const state = gate()
    const before = state.starlinkNext()
    const env = environment()
    const fetchImpl = vi.fn(async () => Response.json({ Login: 'Failed' }))
    expect(await refreshSpaceTrackCatalog(env, state.coordinator, { fetchImpl, now: () => NOW }))
      .toMatchObject({ kind: 'failed', status: 200 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(state.starlinkNext()).toBe(before)
    expect(state.next()).toBe(Number.MAX_SAFE_INTEGER)
    expect(env.ORBITAL_CATALOG.put).not.toHaveBeenCalled()
  })

  it('keeps a malformed selected child from falling through to a curated request', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const fetchImpl = api()
    fetchImpl.mockImplementationOnce(async () => new Response('""', { headers: { 'Set-Cookie': 'session=private; Path=/' } }))
    fetchImpl.mockImplementationOnce(async () => Response.json([]))
    const env = environment()
    const state = gate()
    expect(await refreshSpaceTrackCatalog(env, state.coordinator, { fetchImpl, now: () => NOW }))
      .toMatchObject({ kind: 'failed', starlink: { kind: 'failed' } })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(env.ORBITAL_CATALOG.put).not.toHaveBeenCalled()
    expect(state.starlinkNext()).toBe(NOW + STARLINK_REFRESH_INTERVAL_MS)
  })

  it('composes account-wide Retry-After with the original parent floor', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const fetchImpl = api()
    fetchImpl.mockImplementationOnce(async () => new Response('""', { headers: { 'Set-Cookie': 'session=private; Path=/' } }))
    fetchImpl.mockImplementationOnce(async () => new Response(null, { status: 429, headers: { 'Retry-After': '14400' } }))
    const state = gate()
    const outcome = await refreshSpaceTrackCatalog(environment(), state.coordinator, { fetchImpl, now: () => NOW })
    expect(outcome).toMatchObject({ kind: 'rate-limited', nextAllowedAtMs: NOW + 4 * 60 * 60_000 })
    expect(state.next()).toBe(NOW + 4 * 60 * 60_000)
  })

  it('fences obsolete publication and retains the physical admission until a write settles', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const state = gate()
    vi.mocked(state.coordinator.assertCurrent).mockRejectedValue(new Error('Obsolete attempt'))
    const env = environment()
    expect(await refreshSpaceTrackCatalog(env, state.coordinator, { fetchImpl: api(), now: () => NOW }))
      .toMatchObject({ kind: 'failed' })
    expect(env.ORBITAL_CATALOG.put).not.toHaveBeenCalled()
    const nextState = gate()
    const nextEnv = environment()
    let finishWrite: () => void = () => undefined
    nextEnv.ORBITAL_CATALOG.put.mockImplementation(() => new Promise<void>((done) => { finishWrite = done }))
    const pending = refreshSpaceTrackCatalog(nextEnv, nextState.coordinator, { fetchImpl: api(), now: () => NOW })
    await vi.waitFor(() => expect(nextEnv.ORBITAL_CATALOG.put).toHaveBeenCalled())
    expect(nextState.next()).toBe(Number.MAX_SAFE_INTEGER)
    expect(nextState.coordinator.complete).not.toHaveBeenCalled()
    expect(await nextState.coordinator.reserve(NOW + ORBITAL_REFRESH_INTERVAL_MS)).toMatchObject({ kind: 'not-due' })
    finishWrite()
    expect(await pending).toMatchObject({ kind: 'published' })
  })
})

describe('same-origin schema-3 serving and actual browser-client codecs', () => {
  it.each(['curated', 'starlink'] as const)('serves, verifies and conditionally revalidates native %s without upstream acquisition', async (channel) => {
    const values = new Map<string, string>()
    const env = environment(values)
    const snapshot = channel === 'curated'
      ? await createSpaceTrackCuratedSnapshot(await result(channel), new Date(NOW).toISOString())
      : await createSpaceTrackStarlinkSnapshot(await result(channel), new Date(NOW).toISOString())
    values.set(channel === 'curated' ? SPACE_TRACK_CURATED_KEY : SPACE_TRACK_STARLINK_KEY, serializeSpaceTrackSnapshot(snapshot))
    const runtime: OrbitalCatalogRuntime = {
      fetch: vi.fn(async (input, init) => {
        const response = await handleSpaceTrackCatalog(new Request(`https://example.test${input}`, init), env, channel)
        if (!response) throw new Error('Missing native response')
        return response
      }),
      wallNow: () => Date.now(), performanceNow: () => performance.now(),
      setTimeout: (callback, delay) => Number(setTimeout(callback, delay)),
      clearTimeout: (timer) => {
        if (typeof timer !== 'number') throw new Error('Invalid timer')
        clearTimeout(timer)
      },
    }
    const config = createAppConfig({})
    const provider = channel === 'curated'
      ? new OrbitalCatalogProvider(config.orbital, runtime)
      : new StarlinkCatalogProvider(config.starlink, runtime)
    const first = await provider.load(new AbortController().signal)
    expect(first.snapshot.sourceProvider).toBe('space-track')
    expect(first.snapshot.sha256).toBe(snapshot.sha256)
    expect(first.source).toBe('kv')
    const second = await provider.load(new AbortController().signal)
    expect(second.snapshot).toBe(first.snapshot)
    expect(runtime.fetch).toHaveBeenCalledTimes(2)
    expect(env.ORBITAL_CATALOG.put).not.toHaveBeenCalled()
  })

  it('uses only whole legacy compatibility when native is absent, never when native data is corrupt', async () => {
    const env = environment()
    const request = new Request('https://example.test/api/orbits/catalog', { headers: { Accept: SPACE_TRACK_CURATED_MEDIA_TYPE } })
    expect(await handleSpaceTrackCatalog(request, env, 'curated')).toBeUndefined()
    env.ORBITAL_CATALOG.get.mockResolvedValue('{broken')
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect((await handleSpaceTrackCatalog(request, env, 'curated'))?.status).toBe(503)
    expect(env.ORBITAL_CATALOG.put).not.toHaveBeenCalled()
    expect(SPACE_TRACK_STARLINK_MEDIA_TYPE).toContain('version=3')
  })
})
