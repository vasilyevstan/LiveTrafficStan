import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AIRPORT_BOARD_CONFIG as config } from '../src/config/airportBoardConfig.js'
import { AIRPORT_BOARD_TEST_NOW as now, airportBoardFlightFixture } from '../src/providers/airportBoards/airportBoardFixtures.js'
import {
  AirportBoardRequestError,
  AirportBoardService,
  parseAirportBoardAdmission,
  type AirportBoardAdmission,
  type AirportBoardStateStore,
} from './airportBoardService.js'

const quota = (units = 398, requests = 1598, reset = 86_400) => ({
  'Content-Type': 'application/json',
  'x-ratelimit-api-units-limit': '400',
  'x-ratelimit-api-units-remaining': String(units),
  'x-ratelimit-api-units-reset': String(reset),
  'x-ratelimit-requests-limit': '1600',
  'x-ratelimit-requests-remaining': String(requests),
  'x-ratelimit-requests-reset': String(reset),
  'x-ratelimit-rapid-free-plans-hard-limit-limit': '500000',
})
const raw = () => ({ arrivals: [airportBoardFlightFixture()], departures: [airportBoardFlightFixture('departures')] })
const board = (units = 396) => Response.json(raw(), { headers: quota(units, units * 4) })
const initial = (): AirportBoardAdmission => ({
  version: 1, notBefore: 0,
  units: { remaining: 398, resetAt: now + 86_400_000 },
  requests: { remaining: 1598, resetAt: now + 86_400_000 },
})
const store = (initialValue?: AirportBoardAdmission) => {
  let state = initialValue
  return {
    read: vi.fn(() => structuredClone(state)),
    write: vi.fn((next: AirportBoardAdmission) => { state = structuredClone(next) }),
  } satisfies AirportBoardStateStore
}
const setup = (state = store(initial()), fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => board())) => ({
  state, fetchImpl,
  service: new AirportBoardService({ state, fetchImpl, key: 'private-test-key-not-a-credential' }),
})
const settle = async <T>(promise: Promise<T>, milliseconds = config.minimumRequestIntervalMs + 1) => {
  const result = promise.then(value => ({ value, error: undefined }), (error: unknown) => ({ value: undefined, error }))
  await vi.advanceTimersByTimeAsync(milliseconds)
  return result
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now) })
afterEach(() => vi.useRealTimers())

describe('shared airport-board admission', () => {
  it('bootstraps actual billing quotas through one free health read, then reserves before one combined board', async () => {
    const state = store()
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({}, { headers: quota() }))
      .mockImplementationOnce(async () => {
        expect(state.read()?.units?.remaining).toBe(396)
        expect(state.read()?.notBefore).toBeGreaterThan(Date.now())
        return board()
      })
    const { service } = setup(state, fetchImpl)
    const result = await settle(service.load('EETN'))
    expect(result.error).toBeUndefined()
    expect(result.value?.arrivals).toHaveLength(1)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(`${config.upstreamOrigin}/health/services/airports/EETN/feeds`)
    const [url, init] = fetchImpl.mock.calls[1]!
    const target = new URL(String(url))
    expect(target.origin).toBe(config.upstreamOrigin)
    expect(target.pathname).toBe('/flights/airports/icao/EETN')
    expect(Object.fromEntries(target.searchParams)).toEqual({
      offsetMinutes: '-60', durationMinutes: '360', direction: 'Both', withLeg: 'true',
      withCancelled: 'true', withCodeshared: 'true', withCargo: 'true', withPrivate: 'true', withLocation: 'false',
    })
    expect(init).toMatchObject({ redirect: 'manual', cache: 'no-store', method: 'GET' })
    expect(Object.keys(init!.headers!)).toEqual(['Accept', 'X-RapidAPI-Key', 'X-RapidAPI-Host'])
    expect(JSON.stringify(state.read())).not.toMatch(/private-test|EETN|TS100|arrivals|departures/)
  })

  it('makes no request at construction or a cached explicit load and keeps the original retrieval time', async () => {
    const { service, fetchImpl } = setup()
    expect(fetchImpl).not.toHaveBeenCalled()
    const first = await settle(service.load('EETN'))
    const cached = await service.load('EETN')
    expect(cached).toEqual(first.value)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(config.cacheTtlMs)
    await settle(service.load('EETN'))
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('coalesces identical loads and rejects a different airport instead of queuing another paid request', async () => {
    let resolve!: (value: Response) => void
    const fetchImpl = vi.fn<typeof fetch>().mockReturnValue(new Promise<Response>(done => { resolve = done }))
    const { service } = setup(store(initial()), fetchImpl)
    const first = service.load('EETN')
    const second = service.load('EETN')
    await expect(service.load('EFHK')).rejects.toMatchObject({ status: 429 })
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    resolve(board())
    expect(await first).toEqual(await second)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('cancels only one consumer while retaining a shared producer for another', async () => {
    let resolve!: (value: Response) => void
    const fetchImpl = vi.fn<typeof fetch>().mockReturnValue(new Promise<Response>(done => { resolve = done }))
    const { service } = setup(store(initial()), fetchImpl)
    const controller = new AbortController()
    const first = service.load('EETN', controller.signal).catch(error => error)
    const second = service.load('EETN')
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    expect(await first).toMatchObject({ status: 499 })
    expect(fetchImpl.mock.calls[0]?.[1]?.signal?.aborted).toBe(false)
    resolve(board())
    expect((await second).airportIcao).toBe('EETN')
  })

  it('does not start paid work when the sole consumer cancels after the free bootstrap', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}, { headers: quota() }))
    const { service, state } = setup(store(), fetchImpl)
    const controller = new AbortController()
    const result = service.load('EETN', controller.signal).catch(error => error)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    controller.abort()
    expect(await result).toMatchObject({ status: 499 })
    await vi.advanceTimersByTimeAsync(config.minimumRequestIntervalMs * 2)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(state.read()?.units?.remaining).toBe(398)
  })

  it('bounds coalesced consumers instead of retaining an unlimited waiter queue', async () => {
    let resolve!: (value: Response) => void
    const fetchImpl = vi.fn<typeof fetch>().mockReturnValue(new Promise<Response>(done => { resolve = done }))
    const { service } = setup(store(initial()), fetchImpl)
    const consumers = Array.from({ length: config.maximumWaiters }, () => service.load('EETN'))
    await expect(service.load('EETN')).rejects.toMatchObject({ status: 429 })
    await vi.advanceTimersByTimeAsync(0)
    resolve(board())
    await Promise.all(consumers)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('persists a conservative in-flight fence before fetch and does not reset it on recreation', async () => {
    const state = store(initial())
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    }))
    const { service } = setup(state, fetchImpl)
    const result = service.load('EETN').catch(error => error)
    await vi.advanceTimersByTimeAsync(0)
    expect(state.read()?.units?.remaining).toBe(396)
    const restarted = setup(state)
    await expect(restarted.service.load('EETN')).rejects.toMatchObject({ status: 429 })
    expect(restarted.fetchImpl).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(config.upstreamTimeoutMs)
    expect(await result).toMatchObject({ status: 504 })
    expect(state.read()?.units?.remaining).toBe(396)
  })

  it('honors quota exhaustion until the provider billing boundary, not the calendar month', async () => {
    const state = store({ ...initial(), units: { remaining: 1, resetAt: now + 3_600_000 } })
    const { service, fetchImpl } = setup(state)
    await expect(service.load('EETN')).rejects.toMatchObject({ status: 429, retryAt: now + 3_600_000 })
    expect(fetchImpl).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(3_600_001)
    fetchImpl.mockResolvedValueOnce(Response.json({}, { headers: quota(400, 1599) }))
      .mockResolvedValueOnce(board(398))
    const result = await settle(service.load('EETN'))
    expect(result.error).toBeUndefined()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(state.read()?.units?.remaining).toBe(398)
  })

  it('also respects the actual separate request allowance', async () => {
    const { service, fetchImpl } = setup(store({
      ...initial(), requests: { remaining: 0, resetAt: now + 60_000 },
    }))
    await expect(service.load('EETN')).rejects.toMatchObject({ status: 429, retryAt: now + 60_000 })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('never refills an unexpired reservation from a lagging larger response counter', async () => {
    const { service, state } = setup(store(initial()), vi.fn<typeof fetch>().mockResolvedValue(board(400)))
    await settle(service.load('EETN'))
    expect(state.read()?.units?.remaining).toBe(396)
  })

  it('records zero remaining quota and Retry-After on a provider 429, including after recreation', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('not retained', {
      status: 429, headers: { ...quota(0, 1500), 'Retry-After': '120' },
    }))
    const { service, state } = setup(store(initial()), fetchImpl)
    const result = await settle(service.load('EETN'))
    expect(result.error).toMatchObject({ status: 429 })
    expect(state.read()?.units?.remaining).toBe(0)
    expect(state.read()?.notBefore).toBeGreaterThanOrEqual(now + 86_400_000)
    const restarted = setup(state)
    await expect(restarted.service.load('EFHK')).rejects.toBeInstanceOf(AirportBoardRequestError)
    expect(restarted.fetchImpl).not.toHaveBeenCalled()
  })

  it.each(['paid-plan', 'missing-quota', 'invalid-reset'])('does not make a paid call after an unconfirmed %s bootstrap', async failure => {
    const headers: Record<string, string> = quota()
    if (failure === 'paid-plan') headers['x-ratelimit-api-units-limit'] = '5000'
    if (failure === 'missing-quota') delete headers['x-ratelimit-api-units-remaining']
    if (failure === 'invalid-reset') headers['x-ratelimit-api-units-reset'] = '999999999'
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}, { headers }))
    const { service } = setup(store(), fetchImpl)
    const result = await settle(service.load('EETN'))
    expect(result.error).toMatchObject({ status: 503 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('/health/')
  })

  it.each([302, 401, 403, 500, 503])('surfaces HTTP %s without redirects, provider error text or a successful cache entry', async status => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('private provider diagnostic', {
      status, headers: { Location: 'https://untrusted.example/', ...quota(396) },
    }))
    const { service } = setup(store(initial()), fetchImpl)
    const result = await settle(service.load('EETN'))
    expect(result.error).toBeInstanceOf(AirportBoardRequestError)
    expect(String(result.error)).not.toContain('private provider diagnostic')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await expect(service.load('EETN')).rejects.toMatchObject({ status: 429 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it.each([
    () => new Response(' '.repeat(config.maximumBytes + 1), { headers: quota() }),
    () => new Response('{invalid', { headers: quota() }),
    () => Response.json({ arrivals: 'invalid', departures: [] }, { headers: quota() }),
    () => new Response('{}', { headers: { ...quota(), 'Content-Type': 'text/html' } }),
  ])('fails closed on bounded-body or schema failure', async makeResponse => {
    const { service, state } = setup(store(initial()), vi.fn<typeof fetch>().mockImplementation(async () => makeResponse()))
    expect((await settle(service.load('EETN'))).error).toMatchObject({ status: 502 })
    expect(state.read()?.units?.remaining).toBeLessThanOrEqual(396)
  })

  it('keeps 204 unknown coverage distinct from 200 successful empty arrays', async () => {
    const unknown = setup(store(initial()), vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204, headers: quota() })))
    expect((await settle(unknown.service.load('EETN'))).value).toMatchObject({ arrivals: null, departures: null })
    const empty = setup(store(initial()), vi.fn<typeof fetch>().mockResolvedValue(Response.json({ arrivals: [], departures: [] }, { headers: quota() })))
    expect((await settle(empty.service.load('EETN'))).value).toMatchObject({ arrivals: [], departures: [] })
  })

  it('bounds cached airports and refetches the oldest only on explicit demand', async () => {
    const { service, fetchImpl } = setup()
    for (const icao of ['EETA', 'EETB', 'EETC', 'EETD', 'EETE', 'EETF', 'EETG', 'EETH', 'EETI']) {
      expect((await settle(service.load(icao))).error).toBeUndefined()
    }
    expect(fetchImpl).toHaveBeenCalledTimes(9)
    await settle(service.load('EETA'))
    expect(fetchImpl).toHaveBeenCalledTimes(10)
  })

  it('fails closed on unavailable quota storage before contacting the provider', async () => {
    const state = store(initial())
    state.write.mockImplementation(() => { throw new Error('disk unavailable') })
    const { service, fetchImpl } = setup(state)
    expect((await settle(service.load('EETN'))).error).toMatchObject({ status: 503 })
    expect(fetchImpl).not.toHaveBeenCalled()
    await expect(service.load('EETN')).rejects.toMatchObject({ status: 503 })
  })

  it('rejects corrupted persistent counters and invalid codes without provider work', async () => {
    expect(() => parseAirportBoardAdmission({ version: 1, notBefore: 0, units: { remaining: 401, resetAt: now } })).toThrow()
    expect(() => parseAirportBoardAdmission({ version: 1, notBefore: -1 })).toThrow()
    const { service, fetchImpl } = setup()
    await expect(service.load('eetn')).rejects.toMatchObject({ status: 400 })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
