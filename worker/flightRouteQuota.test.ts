import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FLIGHT_ROUTE_QUOTA_LIMIT,
  FLIGHT_ROUTE_QUOTA_WINDOW_MS,
  FlightRouteQuota,
} from './flightRouteQuota.js'

class FakeCursor<Row> implements Iterable<Row> {
  private readonly rows: Row[]

  constructor(rows: Row[]) {
    this.rows = rows
  }

  toArray() {
    return [...this.rows]
  }

  [Symbol.iterator]() {
    return this.rows[Symbol.iterator]()
  }
}

class FakeStorage {
  attempts: Array<{ id: number; attemptedAt: number }> = []
  nextId = 1
  fail = false

  readonly sql = {
    exec: <Row,>(query: string, ...bindings: Array<string | number | null>) => {
      if (this.fail) throw new Error('Storage failed')
      const normalized = query.replace(/\s+/g, ' ').trim()
      if (normalized.startsWith('CREATE TABLE')) {
        return new FakeCursor<Row>([])
      }
      if (normalized.startsWith('SELECT attempted_at')) {
        return new FakeCursor<Row>(
          [...this.attempts]
            .sort(
              (left, right) =>
                left.attemptedAt - right.attemptedAt ||
                left.id - right.id,
            )
            .map(({ attemptedAt }) => ({ attemptedAt }) as Row),
        )
      }
      if (normalized.startsWith('DELETE FROM flight_route_attempts')) {
        const cutoff = bindings[0]
        if (typeof cutoff !== 'number') throw new Error('Missing cutoff')
        this.attempts = this.attempts.filter(
          ({ attemptedAt }) => attemptedAt > cutoff,
        )
        return new FakeCursor<Row>([])
      }
      if (normalized.startsWith('INSERT INTO flight_route_attempts')) {
        const attemptedAt = bindings[0]
        if (typeof attemptedAt !== 'number') {
          throw new Error('Missing attempt time')
        }
        this.attempts.push({
          id: this.nextId,
          attemptedAt,
        })
        this.nextId += 1
        return new FakeCursor<Row>([])
      }
      throw new Error(`Unexpected SQL: ${normalized}`)
    },
  }

  transactionSync<Result>(callback: () => Result): Result {
    const attempts = this.attempts.map((attempt) => ({ ...attempt }))
    const nextId = this.nextId
    try {
      return callback()
    } catch (error) {
      this.attempts = attempts
      this.nextId = nextId
      throw error
    }
  }
}

const reservationRequest = () =>
  new Request('https://quota.internal/reserve', { method: 'POST' })

const createQuota = (storage: FakeStorage) =>
  new FlightRouteQuota(
    { storage } as unknown as DurableObjectState,
    {},
  )

describe('FlightRouteQuota', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('durably admits 90 rolling-window attempts and rejects the next', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-20T12:00:00Z'))
    const storage = new FakeStorage()
    const quota = createQuota(storage)

    for (let index = 0; index < FLIGHT_ROUTE_QUOTA_LIMIT; index += 1) {
      const response = await quota.fetch(reservationRequest())
      expect(response.status).toBe(200)
    }
    const rejected = await quota.fetch(reservationRequest())

    expect(rejected.status).toBe(429)
    expect(rejected.headers.get('retry-after')).toBe(
      String(Math.ceil(FLIGHT_ROUTE_QUOTA_WINDOW_MS / 1_000)),
    )
    expect(storage.attempts).toHaveLength(FLIGHT_ROUTE_QUOTA_LIMIT)
  })

  it('prunes attempts at the rolling-window boundary before reserving', async () => {
    vi.useFakeTimers()
    const now = Date.parse('2026-09-20T12:00:00Z')
    vi.setSystemTime(now)
    const storage = new FakeStorage()
    storage.attempts = Array.from(
      { length: FLIGHT_ROUTE_QUOTA_LIMIT },
      (_, index) => ({
        id: index + 1,
        attemptedAt:
          index === 0
            ? now - FLIGHT_ROUTE_QUOTA_WINDOW_MS
            : now - FLIGHT_ROUTE_QUOTA_WINDOW_MS + 1,
      }),
    )
    storage.nextId = FLIGHT_ROUTE_QUOTA_LIMIT + 1
    const quota = createQuota(storage)

    const response = await quota.fetch(reservationRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      allowed: true,
      remaining: 0,
    })
    expect(storage.attempts).toHaveLength(FLIGHT_ROUTE_QUOTA_LIMIT)
    expect(storage.attempts.some(({ attemptedAt }) => attemptedAt === now))
      .toBe(true)
  })

  it('fails closed for corrupt or unavailable storage', async () => {
    vi.useFakeTimers()
    const now = Date.parse('2026-09-20T12:00:00Z')
    vi.setSystemTime(now)
    const corruptStorage = new FakeStorage()
    corruptStorage.attempts = [{ id: 1, attemptedAt: now + 1 }]
    const corruptQuota = createQuota(corruptStorage)

    expect((await corruptQuota.fetch(reservationRequest())).status).toBe(
      503,
    )
    expect(corruptStorage.attempts).toHaveLength(1)

    const failedStorage = new FakeStorage()
    const failedQuota = createQuota(failedStorage)
    failedStorage.fail = true
    expect((await failedQuota.fetch(reservationRequest())).status).toBe(
      503,
    )
  })

  it('rejects non-reservation routes and methods without storage writes', async () => {
    const storage = new FakeStorage()
    const quota = createQuota(storage)

    expect(
      (
        await quota.fetch(
          new Request('https://quota.internal/other', {
            method: 'POST',
          }),
        )
      ).status,
    ).toBe(404)
    const wrongMethod = await quota.fetch(
      new Request('https://quota.internal/reserve'),
    )
    expect(wrongMethod.status).toBe(405)
    expect(wrongMethod.headers.get('allow')).toBe('POST')
    expect(storage.attempts).toHaveLength(0)
  })
})
