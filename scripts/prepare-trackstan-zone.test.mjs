import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { prepareTrackstanZone } from './prepare-trackstan-zone.mjs'

const accountId = 'a'.repeat(32)
const zone = {
  id: 'b'.repeat(32),
  account: { id: accountId },
  name: 'trackstan.xyz',
  type: 'full',
  status: 'pending',
  paused: false,
  plan: { legacy_id: 'free' },
  name_servers: ['one.ns.cloudflare.com', 'two.ns.cloudflare.com'],
}
const response = (result, total = Array.isArray(result) ? result.length : undefined) =>
  Response.json({
    success: true,
    result,
    result_info: total === undefined ? undefined : { total_count: total },
  })
const run = (fetchImpl, overrides = {}) =>
  prepareTrackstanZone({ accountId, apiToken: 'fixture-token', fetchImpl, ...overrides })
const parking = [
  { id: 'c'.repeat(32), name: 'trackstan.xyz', type: 'A', content: '3.33.130.190' },
  { id: 'd'.repeat(32), name: 'trackstan.xyz', type: 'A', content: '15.197.148.33' },
]
const mail = { id: 'e'.repeat(32), name: 'trackstan.xyz', type: 'MX', content: 'mail.example.com' }
const verification = { id: 'f'.repeat(32), name: 'trackstan.xyz', type: 'TXT', content: 'fixture-verification' }
const activeZone = () => response([{ ...zone, status: 'active' }])

describe('fixed TrackStan zone preparation', () => {
  it('reuses exactly one owned full zone without any write', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response([zone]))
    expect(await run(fetchImpl)).toEqual({
      domain: 'trackstan.xyz',
      status: 'pending',
      nameservers: zone.name_servers,
      created: false,
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url.origin).toBe('https://api.cloudflare.com')
    expect(url.searchParams.get('name')).toBe('trackstan.xyz')
    expect(url.searchParams.get('account.id')).toBe(accountId)
    expect(url.searchParams.get('per_page')).toBe('5')
    expect(init).toMatchObject({ method: 'GET', redirect: 'error' })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('creates only the fixed full zone after a complete empty lookup', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response(zone))
    expect((await run(fetchImpl)).created).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const [url, init] = fetchImpl.mock.calls[1]
    expect(url).toBe('https://api.cloudflare.com/client/v4/zones')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      account: { id: accountId }, name: 'trackstan.xyz', type: 'full',
    })
    expect(init.headers.Authorization).toBe('Bearer fixture-token')
  })

  it.each([
    [[], 1],
    [[zone, zone], 2],
  ])('does not create from ambiguous or incomplete discovery', async (zones, count) => {
    const fetchImpl = vi.fn().mockResolvedValue(response(zones, count))
    await expect(run(fetchImpl)).rejects.toThrow('ambiguous or incomplete')
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it.each([
    { account: { id: 'c'.repeat(32) } },
    { name: 'another.example' },
    { type: 'partial' },
    { paused: true },
    { status: 'deactivated' },
    { plan: { legacy_id: 'pro' } },
    { name_servers: ['one.ns.cloudflare.com', 'one.ns.cloudflare.com'] },
    { name_servers: ['ns.example.com', 'two.ns.cloudflare.com'] },
  ])('rejects incompatible zone state without modifying it', async (change) => {
    const fetchImpl = vi.fn().mockResolvedValue(response([{ ...zone, ...change }]))
    await expect(run(fetchImpl)).rejects.toThrow()
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('surfaces permission failure without printing the body or creating a zone', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('sensitive diagnostic content', { status: 403 }),
    )
    await expect(run(fetchImpl)).rejects.toThrow('HTTP 403')
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('never retries an unconfirmed create', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response([]))
      .mockRejectedValueOnce(new Error('connection lost'))
    await expect(run(fetchImpl)).rejects.toThrow('connection lost')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('rejects oversized API responses', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('x'.repeat(128 * 1024 + 1)))
    await expect(run(fetchImpl)).rejects.toThrow('byte limit')
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('does not contact Cloudflare with absent credentials', async () => {
    const fetchImpl = vi.fn()
    await expect(run(fetchImpl, { accountId: '' })).rejects.toThrow('ACCOUNT_ID')
    await expect(run(fetchImpl, { apiToken: '' })).rejects.toThrow('API_TOKEN')
    await expect(run(fetchImpl, { apiToken: 'fixture-token\n' })).rejects.toThrow('API_TOKEN')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('does not expose malformed API response content', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('sensitive malformed content'))
    await expect(run(fetchImpl)).rejects.toThrow('returned malformed JSON')
  })

  it('removes only the verified parking A records and confirms unrelated records remain', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(activeZone())
      .mockResolvedValueOnce(response([...parking, mail, verification]))
      .mockResolvedValueOnce(response({ id: parking[0].id }))
      .mockResolvedValueOnce(response({ id: parking[1].id }))
      .mockResolvedValueOnce(response([verification, mail]))
    expect(await run(fetchImpl, { removeParkingRecords: true })).toMatchObject({
      status: 'active', created: false, removedParkingRecords: 2,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(5)
    const [url] = fetchImpl.mock.calls[1]
    expect(url.pathname).toBe(`/client/v4/zones/${zone.id}/dns_records`)
    expect(url.searchParams.get('name')).toBe('trackstan.xyz')
    expect(url.searchParams.get('per_page')).toBe('100')
    expect(fetchImpl.mock.calls.filter(([, init]) => init.method === 'DELETE').map(([url]) => url)).toEqual(
      parking.map((record) => `https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records/${record.id}`),
    )
  })

  it('does not write when a fresh read confirms the parking records are already gone', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(activeZone())
      .mockResolvedValueOnce(response([mail]))
    expect((await run(fetchImpl, { removeParkingRecords: true })).removedParkingRecords).toBe(0)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(fetchImpl.mock.calls.every(([, init]) => init.method === 'GET')).toBe(true)
  })

  it.each([[[]], [[zone]]])('never creates or modifies a non-active zone during cleanup', async (zones) => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(response(zones))
    await expect(run(fetchImpl, { removeParkingRecords: true })).rejects.toThrow('existing active owned zone')
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it.each([
    [[...parking, { ...mail, type: 'A', content: '192.0.2.1' }], 'Unexpected apex address'],
    [[{ ...parking[0], type: 'AAAA', content: '2001:db8::1' }], 'Unexpected apex address'],
    [[{ ...parking[0], type: 'CNAME', content: 'example.com' }], 'Unexpected apex address'],
    [[{ ...parking[0], id: '../other-record' }], 'malformed or incomplete'],
    [[{ ...parking[0], name: 'www.trackstan.xyz' }], 'malformed or incomplete'],
    [[parking[0], parking[0]], 'malformed or incomplete'],
  ])('rejects unknown or malformed apex records before any deletion', async (records, error) => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(activeZone())
      .mockResolvedValueOnce(response(records))
    await expect(run(fetchImpl, { removeParkingRecords: true })).rejects.toThrow(error)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(fetchImpl.mock.calls.every(([, init]) => init.method === 'GET')).toBe(true)
  })

  it('rejects incomplete DNS discovery before a write', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(activeZone())
      .mockResolvedValueOnce(response(parking, 3))
    await expect(run(fetchImpl, { removeParkingRecords: true })).rejects.toThrow('incomplete')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('reports the actual DNS access failure without exposing its body', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(activeZone())
      .mockResolvedValueOnce(new Response('private diagnostic', { status: 403 }))
    await expect(run(fetchImpl, { removeParkingRecords: true })).rejects.toThrow('Cloudflare DNS GET failed with HTTP 403')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('does not retry an unconfirmed deletion or proceed to the next record', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(activeZone())
      .mockResolvedValueOnce(response(parking))
      .mockRejectedValueOnce(new Error('connection lost'))
    await expect(run(fetchImpl, { removeParkingRecords: true })).rejects.toThrow('connection lost')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('reports DNS write denial and stops without attempting the next deletion', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(activeZone())
      .mockResolvedValueOnce(response(parking))
      .mockResolvedValueOnce(new Response('private diagnostic', { status: 403 }))
    await expect(run(fetchImpl, { removeParkingRecords: true })).rejects.toThrow('Cloudflare DNS DELETE failed with HTTP 403')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('requires the deletion acknowledgement to match the exact record', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(activeZone())
      .mockResolvedValueOnce(response(parking))
      .mockResolvedValueOnce(response({ id: mail.id }))
    await expect(run(fetchImpl, { removeParkingRecords: true })).rejects.toThrow('not confirmed')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('does not claim cleanup if the read-back still contains the parking record', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(activeZone())
      .mockResolvedValueOnce(response([parking[0], mail]))
      .mockResolvedValueOnce(response({ id: parking[0].id }))
      .mockResolvedValueOnce(response([parking[0], mail]))
    await expect(run(fetchImpl, { removeParkingRecords: true })).rejects.toThrow('not confirmed')
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })

  it('rejects a non-boolean cleanup request before contacting Cloudflare', async () => {
    const fetchImpl = vi.fn()
    await expect(run(fetchImpl, { removeParkingRecords: 'true' })).rejects.toThrow('explicit boolean')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('does not claim preserved records when the read-back shows a concurrent change', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(activeZone())
      .mockResolvedValueOnce(response([parking[0], mail]))
      .mockResolvedValueOnce(response({ id: parking[0].id }))
      .mockResolvedValueOnce(response([{ ...mail, content: 'changed.example.com' }]))
    await expect(run(fetchImpl, { removeParkingRecords: true })).rejects.toThrow('state changed')
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })

  it('keeps credentials in protected exact-main serialized automation', () => {
    const workflow = readFileSync(
      new URL('../.github/workflows/prepare-trackstan-domain.yml', import.meta.url),
      'utf8',
    )
    expect(workflow).toContain('name: production')
    expect(workflow).toContain('group: production-deployment')
    expect(workflow).toContain('cancel-in-progress: false')
    expect(workflow).toContain('test "$GITHUB_REF" = refs/heads/main')
    expect(workflow).toContain('test "$(git rev-parse origin/main)" = "$EXPECTED_SHA"')
    expect(workflow).toContain('.name == "validate"')
    expect(workflow).toContain('CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}')
    expect(workflow).toContain('remove_parking_records:')
    expect(workflow).toContain('default: false')
    expect(workflow).toContain('REMOVE_PARKING_RECORDS: ${{ inputs.remove_parking_records }}')
    expect(workflow).not.toContain('pull_request:')
    expect(workflow).not.toContain('wrangler deploy')
    expect(workflow).not.toContain('upload-artifact')
  })
})
