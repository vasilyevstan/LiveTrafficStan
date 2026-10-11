import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WEB_ANALYTICS_CONFIG } from '../config/appConfig'

class FakeScript extends EventTarget {
  id = ''
  type = ''
  async = false
  crossOrigin = ''
  referrerPolicy = ''
  src = ''
  attributes = new Map<string, string>()
  setAttribute(name: string, value: string) { this.attributes.set(name, value) }
}

const fixture = async () => {
  const scripts: FakeScript[] = []
  const head = { append: vi.fn((script: FakeScript) => scripts.push(script)) }
  const querySelector = vi.fn(() => scripts.find(script => script.attributes.has('data-cf-beacon')))
  const createElement = vi.fn(() => new FakeScript())
  const document = { head, createElement, querySelector }
  vi.stubGlobal('document', document)
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  const { installWebAnalytics } = await import('./webAnalytics')
  return { scripts, document, head, createElement, querySelector, warning, installWebAnalytics }
}

beforeEach(() => vi.resetModules())
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('production-only official Cloudflare Web Analytics', () => {
  it('installs the real official module with SPA tracking disabled and anonymous script loading', async () => {
    const { scripts, installWebAnalytics } = await fixture()
    installWebAnalytics(true, 'https://trackstan.xyz')
    expect(scripts).toHaveLength(1)
    expect(scripts[0]).toMatchObject({
      id: 'trackstan-web-analytics',
      type: 'module',
      async: true,
      crossOrigin: 'anonymous',
      referrerPolicy: 'origin',
      src: 'https://static.cloudflareinsights.com/beacon.min.js',
    })
    expect(JSON.parse(scripts[0].attributes.get('data-cf-beacon')!)).toEqual({
      token: WEB_ANALYTICS_CONFIG.siteToken, spa: false,
    })
    expect(WEB_ANALYTICS_CONFIG.siteToken).toMatch(/^[0-9a-f]{32}$/)
  })

  it.each([
    [false, 'https://trackstan.xyz'],
    [true, 'https://livetrafficstan.syntal.workers.dev'],
    [true, 'http://localhost:5173'],
    [true, 'https://www.trackstan.xyz'],
    [true, 'https://trackstan.xyz.example.com'],
    [true, 'http://trackstan.xyz'],
    [true, 'https://trackstan.xyz:8443'],
  ])('does not contact analytics outside the exact production build/origin: %s %s', async (production, origin) => {
    const { installWebAnalytics, querySelector, createElement } = await fixture()
    installWebAnalytics(production, origin)
    expect(querySelector).not.toHaveBeenCalled()
    expect(createElement).not.toHaveBeenCalled()
  })

  it('does not load or inspect the document when explicitly disabled', async () => {
    const { installWebAnalytics, querySelector, createElement } = await fixture()
    installWebAnalytics(true, 'https://trackstan.xyz', { ...WEB_ANALYTICS_CONFIG, enabled: false })
    expect(querySelector).not.toHaveBeenCalled()
    expect(createElement).not.toHaveBeenCalled()
  })

  it('rejects a missing or malformed token once without logging its value', async () => {
    const { installWebAnalytics, scripts, warning } = await fixture()
    for (const siteToken of ['', 'private-invalid-token']) {
      installWebAnalytics(true, 'https://trackstan.xyz', { enabled: true, siteToken })
    }
    expect(scripts).toHaveLength(0)
    expect(warning).toHaveBeenCalledOnce()
    expect(warning).toHaveBeenCalledWith(
      'Cloudflare Web Analytics configuration is invalid; no beacon was loaded.',
    )
  })

  it('attempts once per document despite repeated invocation and script removal', async () => {
    const { installWebAnalytics, scripts, createElement } = await fixture()
    installWebAnalytics(true, 'https://trackstan.xyz')
    scripts.pop()
    installWebAnalytics(true, 'https://trackstan.xyz')
    expect(createElement).toHaveBeenCalledOnce()
  })

  it('does not duplicate an already installed official beacon', async () => {
    const { installWebAnalytics, scripts, createElement, warning } = await fixture()
    const existing = new FakeScript()
    existing.setAttribute('data-cf-beacon', '{}')
    scripts.push(existing)
    installWebAnalytics(true, 'https://trackstan.xyz')
    expect(createElement).not.toHaveBeenCalled()
    expect(scripts).toEqual([existing])
    expect(warning).toHaveBeenCalledWith(
      'A Web Analytics beacon is already installed; TrackStan did not add another.',
    )
  })

  it('reports blocked loading once without retrying or leaking request diagnostics', async () => {
    const { installWebAnalytics, scripts, warning } = await fixture()
    installWebAnalytics(true, 'https://trackstan.xyz')
    scripts[0].dispatchEvent(new Event('error'))
    scripts[0].dispatchEvent(new Event('error'))
    installWebAnalytics(true, 'https://trackstan.xyz')
    expect(scripts).toHaveLength(1)
    expect(warning).toHaveBeenCalledOnce()
    expect(warning).toHaveBeenCalledWith(
      'Cloudflare Web Analytics could not load; the application remains usable.',
    )
  })

  it('isolates synchronous DOM failure and never automatically retries', async () => {
    const { installWebAnalytics, head, warning } = await fixture()
    head.append.mockImplementation(() => { throw new Error('private URL diagnostic') })
    expect(() => installWebAnalytics(true, 'https://trackstan.xyz')).not.toThrow()
    installWebAnalytics(true, 'https://trackstan.xyz')
    expect(head.append).toHaveBeenCalledOnce()
    expect(warning).toHaveBeenCalledWith(
      'Cloudflare Web Analytics could not load; the application remains usable.',
    )
  })
})
