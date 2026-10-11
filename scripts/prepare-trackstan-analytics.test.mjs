import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { prepareTrackstanAnalytics } from './prepare-trackstan-analytics.mjs'

const accountId = 'a'.repeat(32)
const site = {
  site_tag: 'b'.repeat(32),
  site_token: 'c'.repeat(32),
  auto_install: false,
  ruleset: { zone_name: 'trackstan.xyz' },
  rules: [{ host: 'trackstan.xyz', inclusive: true, is_paused: false, paths: ['*'] }],
}
const response = (result, total = Array.isArray(result) ? result.length : undefined) =>
  Response.json({ success: true, result, result_info: total === undefined ? undefined : { total_count: total } })
const run = (fetchImpl, overrides = {}) =>
  prepareTrackstanAnalytics({ accountId, apiToken: 'fixture-token', fetchImpl, ...overrides })

describe('protected exact-site Web Analytics setup', () => {
  it('reuses a manual exact-domain site without writing or exposing other sites', async () => {
    const other = { ...site, site_tag: 'd'.repeat(32), ruleset: { zone_name: 'other.example' }, rules: [] }
    const fetchImpl = vi.fn().mockResolvedValue(response([other, site]))
    expect(await run(fetchImpl)).toEqual({
      domain: 'trackstan.xyz', siteId: site.site_tag, siteToken: site.site_token,
      autoInstall: false, created: false, updated: false, readOnly: false,
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url.pathname).toBe(`/client/v4/accounts/${accountId}/rum/site_info/list`)
    expect(url.searchParams.get('per_page')).toBe('10')
    expect(init).toMatchObject({ method: 'GET', redirect: 'error' })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('creates only the fixed manual site after complete discovery and confirms it', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response(site))
      .mockResolvedValueOnce(response([site]))
    expect((await run(fetchImpl)).created).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ host: 'trackstan.xyz', auto_install: false })
    expect(fetchImpl.mock.calls[1][1].method).toBe('POST')
    expect(fetchImpl.mock.calls[2][1].method).toBe('GET')
  })

  it('changes only the exact auto-injected site to manual and confirms identity', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response([{ ...site, auto_install: true }]))
      .mockResolvedValueOnce(response(site))
      .mockResolvedValueOnce(response([site]))
    expect((await run(fetchImpl)).updated).toBe(true)
    expect(fetchImpl.mock.calls[1][0]).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/rum/site_info/${site.site_tag}`,
    )
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({
      host: 'trackstan.xyz', auto_install: false, lite: false,
    })
  })

  it('reads the exact existing automatic site without any account write', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response([{ ...site, auto_install: true }]))
    expect(await run(fetchImpl, { readOnly: true })).toEqual({
      domain: 'trackstan.xyz', siteId: site.site_tag, siteToken: site.site_token,
      autoInstall: true, created: false, updated: false, readOnly: true,
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(fetchImpl.mock.calls[0][1].method).toBe('GET')
  })

  it('never creates a missing site in read-only mode', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response([]))
    await expect(run(fetchImpl, { readOnly: true })).rejects.toThrow('read-only mode cannot create')
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('rejects an invalid read-only request before network work', async () => {
    const fetchImpl = vi.fn()
    await expect(run(fetchImpl, { readOnly: 'true' })).rejects.toThrow('explicit boolean')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('follows bounded pagination before deciding whether the site exists', async () => {
    const others = Array.from({ length: 10 }, (_, index) => ({
      site_tag: index.toString(16).padStart(32, '0'),
      ruleset: { zone_name: `other-${index}.example` },
    }))
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response(others, 11))
      .mockResolvedValueOnce(response([site], 11))
    expect((await run(fetchImpl)).created).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(fetchImpl.mock.calls[1][0].searchParams.get('page')).toBe('2')
  })

  it.each([
    [[site, site], 2],
    [[site], 2],
    [[site], 101],
    [[{ ...site, ruleset: { zone_name: 'other.example' } }], 1],
    [[{ ...site, site_token: 'invalid' }], 1],
    [[{ ...site, rules: [...site.rules, { host: 'other.example' }] }], 1],
  ])('rejects ambiguity, incomplete discovery or mixed-site scope before writing', async (sites, total) => {
    const fetchImpl = vi.fn().mockResolvedValue(response(sites, total))
    await expect(run(fetchImpl)).rejects.toThrow()
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('reports the actual read permission denial without printing response content', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('private diagnostic', { status: 403 }))
    await expect(run(fetchImpl)).rejects.toThrow('GET failed with HTTP 403; Account Settings Read')
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('reports write permission denial without retrying or creating another site', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(new Response('private diagnostic', { status: 403 }))
    await expect(run(fetchImpl)).rejects.toThrow('POST failed with HTTP 403; Account Settings Write')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('does not retry an unconfirmed write or expose its transport error', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response([]))
      .mockRejectedValueOnce(new Error('private request details'))
    await expect(run(fetchImpl)).rejects.toThrow('POST transport failed; inspect site state')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it.each([
    { ...site, auto_install: true },
    { ...site, site_tag: 'd'.repeat(32) },
  ])('rejects an unconfirmed read-back without retrying the write', async (confirmed) => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response(site))
      .mockResolvedValueOnce(response([confirmed]))
    await expect(run(fetchImpl)).rejects.toThrow('not confirmed by a fresh read')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('bounds response bytes and rejects malformed or unsuccessful API payloads', async () => {
    for (const payload of [
      new Response('x'.repeat(128 * 1024 + 1)),
      new Response('private malformed response'),
      Response.json({ success: false, errors: [{ message: 'private diagnostic' }] }),
    ]) {
      const fetchImpl = vi.fn().mockResolvedValue(payload)
      await expect(run(fetchImpl)).rejects.toThrow()
      expect(fetchImpl).toHaveBeenCalledOnce()
    }
  })

  it('rejects invalid credentials before network work', async () => {
    const fetchImpl = vi.fn()
    await expect(run(fetchImpl, { accountId: '' })).rejects.toThrow('ACCOUNT_ID')
    await expect(run(fetchImpl, { apiToken: 'fixture-token\n' })).rejects.toThrow('API_TOKEN')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('verifies only bounded exact-host aggregate counts without an account write', async () => {
    const now = Date.parse('2026-10-11T20:00:00Z')
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response([{ ...site, auto_install: true }]))
      .mockResolvedValueOnce(Response.json({ data: { viewer: { accounts: [{
        rumPageloadEventsAdaptiveGroups: [{
          count: 12, sum: { visits: 8 }, avg: { sampleInterval: 1 },
          dimensions: { requestHost: 'trackstan.xyz' },
        }],
      }] } }, errors: null }))
    const result = await run(fetchImpl, { readOnly: true, verifyStatistics: true, now })
    expect(result).toMatchObject({
      created: false, updated: false, readOnly: true, autoInstall: true,
      statistics: {
        from: '2026-10-10T20:00:00.000Z', to: '2026-10-11T20:00:00.000Z',
        pageViews: 12, visits: 8, sampleInterval: 1,
      },
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const [url, init] = fetchImpl.mock.calls[1]
    expect(url).toBe('https://api.cloudflare.com/client/v4/graphql')
    const { query } = JSON.parse(init.body)
    expect(query).toContain(`siteTag: "${site.site_tag}", requestHost: "trackstan.xyz"`)
    expect(query).toContain('limit: 1')
    expect(query).toContain('datetime_lt:')
    expect(query).not.toMatch(/mutation|refererHost|requestPath|countryName/)
  })

  it('distinguishes a complete empty statistics result from refused or absent data', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(response([site]))
      .mockResolvedValueOnce(Response.json({ data: { viewer: { accounts: [{ rumPageloadEventsAdaptiveGroups: [] }] } } }))
    expect((await run(fetchImpl, { readOnly: true, verifyStatistics: true })).statistics).toMatchObject({
      pageViews: 0, visits: 0, sampleInterval: null,
    })
  })

  it.each([
    Response.json({ errors: [{ message: 'private account does not have permission' }] }),
    Response.json({ errors: [{ message: 'Cannot query field private field' }] }),
    Response.json({ data: null }),
    new Response('private diagnostic', { status: 403 }),
  ])('fails explicitly on a rejected aggregate read without exposing or retrying it', async (payload) => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(response([site])).mockResolvedValueOnce(payload)
    await expect(run(fetchImpl, { readOnly: true, verifyStatistics: true })).rejects.toThrow('Cloudflare analytics')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it.each([
    { count: 1, sum: { visits: 1 }, avg: { sampleInterval: 1 }, dimensions: { requestHost: 'other.example' } },
    { count: -1, sum: { visits: 0 }, avg: { sampleInterval: 1 }, dimensions: { requestHost: 'trackstan.xyz' } },
    { count: 1, sum: { visits: 2 }, avg: { sampleInterval: 1 }, dimensions: { requestHost: 'trackstan.xyz' } },
    { count: 1, sum: { visits: 1 }, avg: { sampleInterval: 0 }, dimensions: { requestHost: 'trackstan.xyz' } },
  ])('rejects incompatible host or aggregate numbers', async (group) => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(response([site]))
      .mockResolvedValueOnce(Response.json({ data: { viewer: { accounts: [{ rumPageloadEventsAdaptiveGroups: [group] }] } } }))
    await expect(run(fetchImpl, { readOnly: true, verifyStatistics: true })).rejects.toThrow('invalid exact-host counts')
  })

  it('rejects unsafe verification modes and clocks before any request', async () => {
    for (const overrides of [
      { verifyStatistics: true },
      { readOnly: true, verifyStatistics: 'true' },
      { readOnly: true, verifyStatistics: true, now: NaN },
    ]) {
      const fetchImpl = vi.fn()
      await expect(run(fetchImpl, overrides)).rejects.toThrow()
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  })

  it('retains exact-main, validation, production serialization and exclusive DNS operation', () => {
    const workflow = readFileSync(new URL('../.github/workflows/prepare-trackstan-domain.yml', import.meta.url), 'utf8')
    expect(workflow).toContain('name: production')
    expect(workflow).toContain('group: production-deployment')
    expect(workflow).toContain('cancel-in-progress: false')
    expect(workflow).toContain('test "$GITHUB_REF" = refs/heads/main')
    expect(workflow).toContain('test "$(git rev-parse origin/main)" = "$EXPECTED_SHA"')
    expect(workflow).toContain('.name == "validate"')
    expect(workflow).toContain('test "$REMOVE_PARKING_RECORDS" = false')
    expect(workflow).toContain("if: inputs.operation != 'web-analytics'")
    expect(workflow).toContain("if: inputs.operation == 'web-analytics'")
    expect(workflow).toContain("inputs.operation != 'web-analytics-read'")
    expect(workflow).toContain("ANALYTICS_READ_ONLY: ${{ inputs.operation != 'web-analytics' }}")
    expect(workflow).toContain("ANALYTICS_VERIFY_STATISTICS: ${{ inputs.operation == 'web-analytics-statistics' }}")
    expect(workflow).toContain("inputs.operation != 'web-analytics-statistics'")
    expect(workflow).not.toContain('pull_request_target')
  })
})
