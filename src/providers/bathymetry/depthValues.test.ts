import { describe, expect, it, vi } from 'vitest'
import { BATHYMETRY_CONFIG } from '../../config/appConfig'
import { depthValueUrl, fetchDepthValue, normalizeEmodnetDepth, normalizeGebcoDepth } from './depthValues'

const point = { id: 'gebco:1:2', latitude: 59.7479, longitude: 24.7521 }
const emodnet = (depth: unknown) => ({
  type: 'FeatureCollection', numberReturned: 1,
  features: [{ type: 'Feature', geometry: null, properties: { Depth: depth } }],
})
const gebco = (value = '-82', x = '24.752083', y = '59.747917') =>
  `GetFeatureInfo results:\n\nLayer 'GEBCO_LATEST_2'\n  Feature 0:\n    x = '${x}'\n    y = '${y}'\n    value_list = '${value}'\n`

describe('bounded bathymetry values', () => {
  it('uses real negative grid elevations, with land/zero/nil distinct from zero depth', () => {
    expect(normalizeEmodnetDepth(emodnet(-84.837))).toBe(84.837)
    for (const value of [0, 13.48, null, 'NaN']) expect(normalizeEmodnetDepth(emodnet(value))).toBeNull()
    expect(normalizeEmodnetDepth({ type: 'FeatureCollection', features: [], numberReturned: 0 })).toBeNull()
    for (const value of ['-84', undefined, Infinity, NaN, -3.4028235e38]) {
      expect(() => normalizeEmodnetDepth(emodnet(value))).toThrow()
    }
    expect(() => normalizeEmodnetDepth({ ...emodnet(-10), numberReturned: 2 })).toThrow()
    expect(() => normalizeEmodnetDepth({ type: 'FeatureCollection', features: [{}], numberReturned: 1 })).toThrow()
  })

  it('requires the expected global layer, a nearby actual cell, and one complete numeric result', () => {
    expect(normalizeGebcoDepth(gebco(), point)).toBe(82)
    expect(normalizeGebcoDepth(gebco('12'), point)).toBeNull()
    expect(normalizeGebcoDepth(gebco('0'), point)).toBeNull()
    expect(normalizeGebcoDepth(gebco('nan'), point)).toBeNull()
    expect(normalizeGebcoDepth('GetFeatureInfo results:\n', point)).toBeNull()
    for (const value of [gebco('-82', '10'), gebco('-82', '24.75', '95'), gebco('-99999'),
      gebco().replace('GEBCO_LATEST_2', 'other'), `${gebco()}Feature 1:`, gebco('')]) {
      expect(() => normalizeGebcoDepth(value, point)).toThrow()
    }
  })

  it('uses only fixed anonymous one-pixel WMS requests with rounded cell bounds', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(gebco(), { headers: { 'Content-Type': 'text/plain' } }))
    const signal = new AbortController().signal
    await expect(fetchDepthValue('gebco', point, signal, fetchImpl)).resolves.toBe(82)
    const [url, options] = fetchImpl.mock.calls[0]
    const request = new URL(String(url))
    expect(request.origin).toBe('https://wms.gebco.net')
    expect(request.searchParams.get('WIDTH')).toBe('1')
    expect(request.searchParams.get('FEATURE_COUNT')).toBe('1')
    expect(request.searchParams.get('BBOX')).toMatch(/^-?\d+\.\d{4}(,-?\d+\.\d{4}){3}$/)
    expect(options).toEqual({ signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' })
    expect(depthValueUrl('emodnet', point)).toContain('https://ows.emodnet-bathymetry.eu/wms?')
    expect(() => depthValueUrl('gebco', { ...point, latitude: NaN })).toThrow()
  })

  it('rejects oversized, malformed, or wrong-media bodies and preserves rate-limit information', async () => {
    const signal = new AbortController().signal
    await expect(fetchDepthValue('emodnet', point, signal, async () =>
      new Response('{}', { headers: { 'Content-Type': 'text/html' } }))).rejects.toThrow()
    await expect(fetchDepthValue('gebco', point, signal, async () =>
      new Response('x'.repeat(BATHYMETRY_CONFIG.maximumValueBytes + 1), { headers: { 'Content-Type': 'text/plain' } }))).rejects.toThrow()
    await expect(fetchDepthValue('gebco', point, signal, async () =>
      new Response('', { status: 429, headers: { 'Retry-After': '120' } }))).rejects.toMatchObject({
      status: 429, retryAfterMs: 120_000,
    })
    const aborted = new AbortController()
    aborted.abort()
    await expect(fetchDepthValue('gebco', point, aborted.signal, async () =>
      new Response(gebco(), { headers: { 'Content-Type': 'text/plain' } }))).rejects.toMatchObject({ name: 'AbortError' })
  })
})
