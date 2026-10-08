import { describe, expect, it, vi } from 'vitest'
import { AIRPORT_BOARD_CONFIG as config } from '../src/config/airportBoardConfig.js'
import { AIRPORT_BOARD_OBJECT_NAME, handleAirportBoards, type AirportBoardEnvironment } from './airportBoards.js'

const key = 'private-test-key-not-a-credential'
const create = () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ marker: 'normalized board' }))
  const idFromName = vi.fn().mockReturnValue('one-object')
  const get = vi.fn().mockReturnValue({ fetch })
  const env: AirportBoardEnvironment = {
    AIRPORT_BOARDS_ENABLED: 'true', AERODATABOX_RAPIDAPI_KEY: key,
    AIRPORT_BOARD_COORDINATOR: { idFromName, get },
  }
  return { env, fetch, idFromName, get }
}
const url = `https://trackstan.xyz${config.path}?icao=EETN`

describe('airport board Worker boundary', () => {
  it('uses one fixed coordinator and strips incoming credentials and arbitrary headers', async () => {
    const { env, fetch, idFromName, get } = create()
    const request = new Request(url, { headers: {
      Origin: 'https://trackstan.xyz', Cookie: 'private-browser-cookie',
      Authorization: 'private-browser-token', 'X-RapidAPI-Key': 'attacker-key',
    } })
    expect((await handleAirportBoards(request, env)).status).toBe(200)
    expect(idFromName).toHaveBeenCalledWith(AIRPORT_BOARD_OBJECT_NAME)
    expect(get).toHaveBeenCalledWith('one-object')
    const forwarded: Request = fetch.mock.calls[0]![0]
    expect([...forwarded.headers]).toEqual([])
    expect(forwarded.url).toBe(url)
  })

  it.each([
    '?icao=eetn', '?icao=TLL', '?icao=EETN&icao=EFHK',
    '?icao=%45ETN', '?icao=EETN&offsetMinutes=0', '?icao=EETN&url=https://untrusted.example',
    '', '?icao=EETN%20', '?icao=EETN&', '?ICAO=EETN',
  ])('rejects noncanonical query %s without coordinator work', async query => {
    const { env, fetch } = create()
    expect((await handleAirportBoards(new Request(`https://trackstan.xyz${config.path}${query}`), env)).status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each(['POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'])('rejects %s', async method => {
    const { env, fetch } = create()
    const result = await handleAirportBoards(new Request(url, { method }), env)
    expect(result.status).toBe(405)
    expect(result.headers.get('Allow')).toBe('GET')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects cross-origin and cross-site requests without wildcard CORS', async () => {
    const { env, fetch } = create()
    const sources: HeadersInit[] = [{ Origin: 'https://other.example' }, { 'Sec-Fetch-Site': 'cross-site' }]
    for (const headers of sources) {
      const result = await handleAirportBoards(new Request(url, { headers }), env)
      expect(result.status).toBe(403)
      expect(result.headers.has('Access-Control-Allow-Origin')).toBe(false)
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('keeps disabled, missing key, missing binding, canceled and failed coordinator states explicit', async () => {
    const { env, fetch } = create()
    expect((await handleAirportBoards(new Request(url), { ...env, AIRPORT_BOARDS_ENABLED: 'false' })).status).toBe(404)
    expect((await handleAirportBoards(new Request(url), { ...env, AERODATABOX_RAPIDAPI_KEY: undefined })).status).toBe(503)
    expect((await handleAirportBoards(new Request(url), { ...env, AIRPORT_BOARD_COORDINATOR: undefined })).status).toBe(503)
    const controller = new AbortController(); controller.abort()
    expect((await handleAirportBoards(new Request(url, { signal: controller.signal }), env)).status).toBe(499)
    expect(fetch).not.toHaveBeenCalled()
    fetch.mockRejectedValue(new Error('internal storage failure'))
    const failed = await handleAirportBoards(new Request(url), env)
    expect(failed.status).toBe(503)
    expect(failed.headers.get('Cache-Control')).toBe('no-store')
    expect(failed.headers.get('Retry-After')).toBe('60')
    expect(await failed.text()).not.toContain('internal storage failure')
  })
})
