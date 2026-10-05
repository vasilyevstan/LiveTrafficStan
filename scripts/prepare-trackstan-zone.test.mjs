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
    expect(workflow).not.toContain('pull_request:')
    expect(workflow).not.toContain('wrangler deploy')
    expect(workflow).not.toContain('upload-artifact')
  })
})
