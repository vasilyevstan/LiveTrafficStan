import { describe, expect, it, vi } from 'vitest'
import { MARINE_STREAM_CONFIG } from '../src/config/marineStreamConfig.js'
import {
  handleMarineStream,
  MARINE_RELAY_OBJECT_NAME,
  SqlMarineRuntimeState,
  type MarineSqlStorage,
} from './marineStream.js'

class Storage implements MarineSqlStorage {
  budget?: { day: number; used: number }
  retries = new Map<string, { notBefore: number; failures: number; metadataNotBefore: number }>()
  sql = {
    exec: (query: string, ...bindings: (string | number)[]) => {
      let rows: Record<string, unknown>[] = []
      if (query.startsWith('SELECT day')) {
        rows = this.budget ? [{ ...this.budget }] : []
      } else if (query.startsWith('SELECT not_before')) {
        const retry = this.retries.get(String(bindings[0]))
        rows = retry ? [{ ...retry }] : []
      } else if (query.startsWith('INSERT INTO marine_budget')) {
        this.budget = { day: Number(bindings[0]), used: Number(bindings[1]) }
      } else if (query.startsWith('INSERT INTO marine_retry')) {
        this.retries.set(String(bindings[0]), {
          notBefore: Number(bindings[1]), failures: Number(bindings[2]),
          metadataNotBefore: Number(bindings[3]),
        })
      } else if (!query.includes('CREATE TABLE')) {
        throw new Error('Unexpected SQL statement')
      }
      return { toArray: () => rows }
    },
  }
  transactionSync<T>(callback: () => T) { return callback() }
}

describe('durable marine operational state', () => {
  const now = Date.parse('2026-10-05T12:00:00Z')
  const day = Math.floor(now / 86_400_000)

  it('reserves a bounded budget before use and never resets it on restart', () => {
    const storage = new Storage()
    expect(new SqlMarineRuntimeState(storage).consume(1, now)).toBe(true)
    expect(storage.budget?.used).toBe(MARINE_STREAM_CONFIG.budgetReservationMessages)
    expect(new SqlMarineRuntimeState(storage).consume(1, now)).toBe(true)
    expect(storage.budget?.used).toBe(2 * MARINE_STREAM_CONFIG.budgetReservationMessages)
  })

  it('stops before the shared allowance and only resets on a later UTC day', () => {
    const storage = new Storage()
    storage.budget = { day, used: MARINE_STREAM_CONFIG.dailyRequestBudget * 20 - 2 }
    const state = new SqlMarineRuntimeState(storage)
    expect(state.consume(1, now)).toBe(true)
    expect(state.consume(1, now)).toBe(true)
    expect(state.consume(1, now)).toBe(false)
    expect(state.consume(1, now + 86_400_000)).toBe(true)
    expect(state.consume(1, now)).toBe(false)
  })

  it('preserves each source retry deadline and metadata Retry-After independently', () => {
    const storage = new Storage()
    const state = new SqlMarineRuntimeState(storage)
    state.writeRetry('openwaters', {
      notBefore: now + 15_000, failures: 1, metadataNotBefore: now + 120_000,
    })
    expect(new SqlMarineRuntimeState(storage).readRetry('openwaters')).toEqual({
      notBefore: now + 15_000, failures: 1, metadataNotBefore: now + 120_000,
    })
    expect(state.readRetry('aisstream').notBefore).toBe(0)
  })

  it('fails closed on corrupt operational state', () => {
    const storage = new Storage()
    storage.budget = { day, used: -1 }
    expect(() => new SqlMarineRuntimeState(storage).consume(1, now)).toThrow('Invalid marine budget')
  })
})

describe('fixed same-origin marine gateway', () => {
  const request = (url = 'https://app.example/api/marine/stream', origin = 'https://app.example') =>
    new Request(url, { headers: { Origin: origin, Upgrade: 'websocket' } })

  it('does not resolve a namespace while disabled or for another origin', async () => {
    const get = vi.fn()
    const env = { MARINE_TRAFFIC_RELAY: { idFromName: vi.fn(), get } }
    expect((await handleMarineStream(request(), env)).status).toBe(404)
    expect((await handleMarineStream(request(undefined, 'https://other.example'), {
      ...env, MARINE_SUPPLEMENT_ENABLED: 'true',
    })).status).toBe(403)
    expect(get).not.toHaveBeenCalled()
  })

  it('refuses coordinate-bearing URLs and uses one fixed object identity', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('accepted'))
    const idFromName = vi.fn().mockReturnValue('one-object')
    const get = vi.fn().mockReturnValue({ fetch })
    const env = { MARINE_SUPPLEMENT_ENABLED: 'true', MARINE_TRAFFIC_RELAY: { idFromName, get } }
    expect((await handleMarineStream(request('https://app.example/api/marine/stream?lat=59'), env)).status).toBe(400)
    expect(get).not.toHaveBeenCalled()
    await handleMarineStream(request(), env)
    expect(idFromName).toHaveBeenCalledWith(MARINE_RELAY_OBJECT_NAME)
    expect(get).toHaveBeenCalledWith('one-object')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
