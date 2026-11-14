import { describe, expect, it, vi } from 'vitest'
import { TRAIN_CONFIG } from '../src/config/trainConfig.js'
import { ELRON_FEED_URL, ELRON_PROXY_PATH, handleElronProxy } from './elronProxy.js'
import { decodeElronMapFeed, tallinnWallClockToUtc } from './elronMapFeed.js'
import type { GtfsTrainFeedCache, GtfsTrainProxyFetch } from './gtfsTrainProxy.js'

const train = (overrides: Record<string, string> = {}) => ({
  reis: '106',
  liin: 'Tallinn - Tartu',
  reisi_algus_aeg: '20:34',
  reisi_lopp_aeg: '23:22',
  kiirus: '103',
  latitude: '58.395780',
  longitude: '26.681312',
  rongi_suund: '159',
  erinevus_plaanist: '',
  lisateade: '',
  pohjus_teade: '',
  avalda_kodulehel: '',
  asukoha_uuendus: '2026-11-14 23:19:22',
  reisi_staatus: 'plaaniline',
  viimane_peatus: 'Kärkna',
  ...overrides,
})

const encode = (data: unknown) =>
  new TextEncoder().encode(JSON.stringify({ status: 1, data, src: 'cache' }))

const jsonResponse = (data: unknown, init?: ResponseInit) =>
  new Response(encode(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })

const proxyRequest = (path = ELRON_PROXY_PATH, init?: RequestInit) =>
  new Request(`https://app.example${path}`, init)

describe('Elron train map decoder', () => {
  it('normalizes number, route, schedule, delay, heading, speed and Tallinn clocks', () => {
    expect(decodeElronMapFeed(encode([train({ erinevus_plaanist: '2' })]))).toEqual([{
      id: '2026-11-14:106',
      trainNumber: '106',
      route: 'Tallinn - Tartu',
      latitude: 58.39578,
      longitude: 26.68131,
      bearing: 159,
      speedKph: 103,
      delayMinutes: 2,
      lastStop: 'Kärkna',
      scheduledDepartureAt: '2026-11-14T18:34:00.000Z',
      scheduledArrivalAt: '2026-11-14T21:22:00.000Z',
      observedAt: '2026-11-14T21:19:22.000Z',
    }])
  })

  it('applies summer time and assigns after-midnight journeys to their service day', () => {
    expect(new Date(tallinnWallClockToUtc(Date.UTC(2026, 6, 1, 12))).toISOString())
      .toBe('2026-07-01T09:00:00.000Z')
    const [overnight] = decodeElronMapFeed(encode([train({
      reisi_algus_aeg: '23:40', reisi_lopp_aeg: '01:10',
      asukoha_uuendus: '2026-11-15 00:20:00',
    })]))
    expect(overnight).toMatchObject({
      id: '2026-11-14:106',
      scheduledDepartureAt: '2026-11-14T21:40:00.000Z',
      scheduledArrivalAt: '2026-11-14T23:10:00.000Z',
      observedAt: '2026-11-14T22:20:00.000Z',
    })
  })

  it('omits invalid optional fields and drops unidentifiable or implausible trains', () => {
    const trains = decodeElronMapFeed(encode([
      train({ reis: '', latitude: '58.1' }),
      train({ reis: '1x' }),
      train({ reis: '7', latitude: '0', longitude: '0' }),
      train({ reis: '8', asukoha_uuendus: '2026-02-30 10:00:00' }),
      train({
        reis: '9', liin: 'x'.repeat(81), kiirus: 'fast', rongi_suund: '400',
        erinevus_plaanist: '1.5', reisi_algus_aeg: '25:00', reisi_lopp_aeg: '', viimane_peatus: '',
      }),
      'not a train',
    ]))
    expect(trains).toEqual([{
      id: '2026-11-14:9',
      trainNumber: '9',
      latitude: 58.39578,
      longitude: 26.68131,
      observedAt: '2026-11-14T21:19:22.000Z',
    }])
  })

  it('rejects non-JSON, missing lists and oversized lists', () => {
    for (const body of [
      new TextEncoder().encode('<html>'),
      new TextEncoder().encode('{"status":1}'),
      encode(Array.from({ length: 201 }, () => train())),
    ]) {
      expect(() => decodeElronMapFeed(body)).toThrow()
    }
  })
})

describe('Elron train map proxy', () => {
  it('fetches only the fixed operator map without browser credentials', async () => {
    const fetchImpl = vi.fn<GtfsTrainProxyFetch>(async () => jsonResponse([train()]))
    const response = await handleElronProxy(proxyRequest(ELRON_PROXY_PATH, {
      headers: { Cookie: 'private=true', Authorization: 'private', Referer: 'https://private.example/' },
    }), { fetchImpl, cache: null, now: () => Date.parse('2026-11-14T21:19:30Z') })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.json() as { retrievedAt: string; vehicles: { id: string }[] }
    expect(body.retrievedAt).toBe('2026-11-14T21:19:30.000Z')
    expect(body.vehicles.map(({ id }) => id)).toEqual(['2026-11-14:106'])
    expect(fetchImpl).toHaveBeenCalledWith(ELRON_FEED_URL, expect.objectContaining({
      redirect: 'manual',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'TrackStan/1.6.0 (https://trackstan.xyz)',
      },
    }))
  })

  it('uses a one-minute edge cache while keeping browser responses no-store', async () => {
    const stored = new Map<string, Response>()
    const cache: GtfsTrainFeedCache = {
      match: async (request) => stored.get(request.url)?.clone(),
      put: async (request, response) => { stored.set(request.url, response) },
    }
    const fetchImpl = vi.fn<GtfsTrainProxyFetch>(async () => jsonResponse([train()]))
    const first = await handleElronProxy(proxyRequest(), { cache, fetchImpl })
    const second = await handleElronProxy(proxyRequest(), { cache, fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(await second.text()).toBe(await first.text())
    expect(stored.get(`https://app.example${ELRON_PROXY_PATH}`)?.headers.get('cache-control'))
      .toBe(`public, max-age=${TRAIN_CONFIG.elron.pollIntervalMs / 1_000}`)
    expect(TRAIN_CONFIG.elron.endpoint).toBe(ELRON_PROXY_PATH)
  })

  it('rejects unsupported requests, unsafe bodies and redirects, and preserves Retry-After', async () => {
    const fetchImpl = vi.fn<GtfsTrainProxyFetch>()
    for (const [path, method, status] of [
      ['/elsewhere', 'GET', 404], [ELRON_PROXY_PATH, 'POST', 405],
      [`${ELRON_PROXY_PATH}?url=anything`, 'GET', 400],
    ] as const) {
      expect((await handleElronProxy(proxyRequest(path, { method }), { fetchImpl })).status).toBe(status)
    }
    expect(fetchImpl).not.toHaveBeenCalled()
    for (const upstream of [
      new Response('<html>', { headers: { 'Content-Type': 'text/html' } }),
      new Response(encode([train()])),
      new Response('not json', { headers: { 'Content-Type': 'application/json' } }),
      new Response(null, { status: 302, headers: { Location: 'https://elsewhere.example/' } }),
    ]) {
      const response = await handleElronProxy(proxyRequest(), { cache: null, fetchImpl: async () => upstream })
      expect(response.status).toBe(502)
    }
    const tooLarge = await handleElronProxy(proxyRequest(), {
      cache: null, maxResponseBytes: 64, fetchImpl: async () => jsonResponse([train()]),
    })
    expect(tooLarge.status).toBe(502)
    const limited = await handleElronProxy(proxyRequest(), {
      cache: null,
      fetchImpl: async () => new Response(null, { status: 429, headers: { 'Retry-After': '120' } }),
    })
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('120')
  })
})
