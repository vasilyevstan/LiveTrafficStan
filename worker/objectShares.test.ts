import { afterEach, describe, expect, it, vi } from 'vitest'
import { OBJECT_SHARE_CONFIG as config } from '../src/config/objectShareConfig.js'
import { cleanupObjectShares, handleObjectShares, objectShareRedirect } from './objectShares.js'
import { ObjectShareTestDatabase } from './test/objectShareDatabase.js'

const now = Date.UTC(2026, 9, 22, 12)
const context = {
  version: 1, kind: 'aircraft', identifier: 'abc123', label: 'TEST123',
  registration: 'G-TEST', source: 'ADSB.lol',
  position: { latitude: 59.4371, longitude: 24.75361, at: now - 5_000 },
}
const request = (path: string, body: unknown = context, init: RequestInit = {}) =>
  new Request(`https://trackstan.xyz${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://trackstan.xyz' },
    body: JSON.stringify(body), ...init,
  })
const token = '9kP4sV7xQ2mN'
const create = (database: ObjectShareTestDatabase, options = {}) =>
  handleObjectShares(request(config.createPath), { OBJECT_SHARES: database, OBJECT_SHARING_ENABLED: 'true' },
    { now: () => now, token: () => token, ...options })
const resolve = (database: ObjectShareTestDatabase, at = now, value = token) =>
  handleObjectShares(request(config.resolvePath, { token: value }),
    { OBJECT_SHARES: database, OBJECT_SHARING_ENABLED: 'true' }, { now: () => at })

describe('bounded D1 object shares', () => {
  afterEach(() => vi.restoreAllMocks())

  it.each(['light', 'dark'])('preserves the optional %s theme without changing the existing storage lifetime', async theme => {
    const database = new ObjectShareTestDatabase()
    const created = await handleObjectShares(request(config.createPath, { ...context, theme }),
      { OBJECT_SHARES: database, OBJECT_SHARING_ENABLED: 'true' }, { now: () => now, token: () => token })
    expect(created.status).toBe(201)
    const receipt = await created.json()
    expect(receipt.context.theme).toBe(theme)
    expect(receipt.expiresAt).toBe(now + config.lifetimeMs)
    expect(await (await resolve(database)).json()).toEqual(receipt)
  })

  it('commits rounded public context with a server TTL and counts only committed creations/resolutions', async () => {
    const database = new ObjectShareTestDatabase()
    const response = await create(database)
    expect(response.status).toBe(201)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    const receipt = await response.json()
    expect(receipt).toMatchObject({
      token, createdAt: now, expiresAt: now + config.lifetimeMs, serverNow: now,
      context: { position: { latitude: 59.437, longitude: 24.754, at: now - 5_000 } },
    })
    expect(receipt.context).not.toHaveProperty('view')
    expect((await resolve(database)).status).toBe(200)
    expect(database.sqlite.prepare('SELECT created, resolved FROM object_share_days').get()).toEqual({ created: 1, resolved: 1 })
    expect(database.sqlite.prepare('SELECT kind, identifier, created, resolved FROM object_share_statistics').get())
      .toEqual({ kind: 'aircraft', identifier: 'abc123', created: 1, resolved: 1 })
    expect((await resolve(database, now + config.lifetimeMs)).status).toBe(404)
    expect(database.sqlite.prepare('SELECT resolved FROM object_share_days WHERE created = 1').get()).toEqual({ resolved: 1 })
  })

  it('stores an orbital-only viewpoint in the existing JSON payload with unchanged TTL and aggregate semantics', async () => {
    const database = new ObjectShareTestDatabase()
    const context = {
      version: 1, kind: 'orbital', identifier: '12345', label: 'PUBLIC SATELLITE',
      source: 'Space-Track.org / USSPACECOM', owner: 'curated', objectType: 'PAY',
      internationalDesignator: '2026-001A', view: 'from-here',
      snapshot: { sha256: 'a'.repeat(64), retrievedAt: now - 10_000, elementEpoch: now - 60_000 },
      position: { latitude: 1.2345, longitude: 2.3456, at: now - 5_000 },
    }
    const created = await handleObjectShares(request(config.createPath, context),
      { OBJECT_SHARES: database, OBJECT_SHARING_ENABLED: 'true' }, { now: () => now, token: () => token })
    expect(created.status).toBe(201)
    const receipt = await created.json()
    expect(receipt).toMatchObject({
      createdAt: now, expiresAt: now + config.lifetimeMs,
      context: { ...context, position: { latitude: 1.234, longitude: 2.346, at: now - 5_000 } },
    })
    const resolved = await resolve(database)
    expect(resolved.status).toBe(200)
    expect(await resolved.json()).toEqual(receipt)
    expect(database.sqlite.prepare('SELECT kind, identifier, created, resolved FROM object_share_statistics').get())
      .toEqual({ kind: 'orbital', identifier: '12345', created: 1, resolved: 1 })
    expect((await resolve(database, now + config.lifetimeMs)).status).toBe(404)
  })

  it('has a narrow uncached GET/HEAD redirect with no storage work and replaces appended fragments', () => {
    for (const method of ['GET', 'HEAD']) {
      const response = objectShareRedirect(new Request(`https://trackstan.xyz/${token}#v=1&lat=0`, { method }))
      expect(response?.status).toBe(302)
      expect(response?.headers.get('location')).toBe(`/#object=${token}`)
      expect(response?.headers.get('referrer-policy')).toBe('no-referrer')
    }
    for (const path of ['/', '/manifest.webmanifest', '/sw.js', '/unknown', `/${token}/`, `/assets/${token}`]) {
      expect(objectShareRedirect(new Request(`https://trackstan.xyz${path}`))).toBeUndefined()
    }
    expect(objectShareRedirect(new Request(`https://trackstan.xyz/${token}?x=1`))?.status).toBe(400)
  })

  it('serializes concurrent creation admission and collision retries without duplicate counters', async () => {
    const database = new ObjectShareTestDatabase()
    let sequence = 0
    const results = await Promise.all(Array.from({ length: 110 }, () =>
      create(database, { token: () => String(++sequence).padStart(12, '0') })))
    expect(results.filter(result => result.status === 201)).toHaveLength(config.dailyCreations)
    expect(results.filter(result => result.status === 429)).toHaveLength(10)
    expect(database.sqlite.prepare('SELECT COUNT(*) AS count FROM object_shares').get()).toEqual({ count: 100 })
    expect(database.sqlite.prepare('SELECT SUM(created) AS count FROM object_share_statistics').get()).toEqual({ count: 100 })
    expect(results.find(result => result.status === 429)?.headers.get('retry-after')).toBe('43200')
  })

  it('bounds valid resolution admission atomically and never diagnoses quota rejection as expiration', async () => {
    const database = new ObjectShareTestDatabase()
    await create(database)
    const results = await Promise.all(Array.from({ length: 1_005 }, () => resolve(database)))
    expect(results.filter(result => result.status === 200)).toHaveLength(1_000)
    const rejected = results.filter(result => result.status === 429)
    expect(rejected).toHaveLength(5)
    expect(await rejected[0]!.json()).toMatchObject({ error: expect.stringContaining('daily shared-link opening limit') })
    expect(database.sqlite.prepare('SELECT resolved FROM object_share_statistics').get()).toEqual({ resolved: 1_000 })
    expect((await resolve(database, now, '000000000000')).status).toBe(404)
  })

  it('retries only a bounded random-token collision and rolls back failed transactions', async () => {
    const database = new ObjectShareTestDatabase()
    await create(database)
    expect((await create(database)).status).toBe(503)
    expect(database.sqlite.prepare('SELECT created FROM object_share_days').get()).toEqual({ created: 1 })
    const tokens = vi.fn().mockReturnValueOnce(token).mockReturnValue('000000000000')
    expect((await create(database, { token: tokens })).status).toBe(201)
    expect(tokens).toHaveBeenCalledTimes(2)
    database.sqlite.exec("CREATE TRIGGER fail_share BEFORE INSERT ON object_shares BEGIN SELECT RAISE(ABORT, 'test'); END;")
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect((await create(database, { token: () => '111111111111' })).status).toBe(503)
    expect(log).toHaveBeenCalledWith('Object sharing storage operation failed')
    expect(database.sqlite.prepare('SELECT created FROM object_share_days').get()).toEqual({ created: 2 })
  })

  it('enforces method, origin, bytes, content type, field allowlists and disabled operation before storage', async () => {
    const database = new ObjectShareTestDatabase()
    const batch = vi.spyOn(database, 'batch')
    for (const candidate of [
      request(config.createPath, context, { method: 'GET', body: undefined }),
      request(config.createPath, context, { headers: { 'Content-Type': 'application/json', Origin: 'https://other.example' } }),
      request(config.createPath, { ...context, home: { latitude: 59 } }),
      request(config.createPath, { ...context, view: 'from-here' }),
      request(config.createPath, { ...context, label: 'x'.repeat(2_000) }),
      request(config.createPath, context, { headers: { 'Content-Type': 'text/plain' } }),
      request(config.resolvePath, { token: '../not-valid' }),
      request(`${config.createPath}?token=bad`),
    ]) {
      expect((await handleObjectShares(candidate, { OBJECT_SHARES: database, OBJECT_SHARING_ENABLED: 'true' }, { now: () => now })).status)
        .toBeGreaterThanOrEqual(400)
    }
    expect((await handleObjectShares(request(config.createPath), { OBJECT_SHARES: database })).status).toBe(503)
    expect(batch).not.toHaveBeenCalled()
  })

  it('times out storage without a retry and bounds active-data and thirty-day counter cleanup independently of activation', async () => {
    const database = new ObjectShareTestDatabase()
    await create(database)
    const day = Math.floor(now / config.lifetimeMs)
    database.sqlite.exec(`INSERT INTO object_share_statistics VALUES (${day - 30}, 'vessel', '123456789', 1, 0);
      INSERT INTO object_share_days VALUES (${day - 30}, 1, 0);`)
    await cleanupObjectShares({ OBJECT_SHARES: database }, now + config.lifetimeMs)
    expect(database.sqlite.prepare('SELECT COUNT(*) AS count FROM object_shares').get()).toEqual({ count: 0 })
    expect(database.sqlite.prepare('SELECT COUNT(*) AS count FROM object_share_statistics').get()).toEqual({ count: 1 })
    expect((await resolve(database, now + config.lifetimeMs)).status).toBe(404)
    const batch = vi.spyOn(database, 'batch').mockImplementation(() => new Promise(() => undefined))
    expect((await create(database, { timeoutMs: 5 })).status).toBe(504)
    expect(batch).toHaveBeenCalledTimes(1)
  })
})
