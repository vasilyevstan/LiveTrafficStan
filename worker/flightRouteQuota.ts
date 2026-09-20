import { DurableObject } from 'cloudflare:workers'

export const FLIGHT_ROUTE_QUOTA_PATH = '/reserve'
export const FLIGHT_ROUTE_QUOTA_OBJECT_NAME =
  'aviationstack-global-route-quota-v1'
export const FLIGHT_ROUTE_QUOTA_LIMIT = 90
export const FLIGHT_ROUTE_QUOTA_WINDOW_MS =
  31 * 24 * 60 * 60 * 1_000

export interface FlightRouteQuotaStub {
  fetch(request: Request): Promise<Response>
}

export interface FlightRouteQuotaNamespace {
  idFromName(name: string): unknown
  get(id: unknown): FlightRouteQuotaStub
}

type AttemptRow = {
  attemptedAt: number
}

type QuotaResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number }

const jsonResponse = (
  value: QuotaResult | { error: 'quota-unavailable' },
  status: number,
  headers?: Record<string, string>,
) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  })

const textResponse = (
  message: string,
  status: number,
  headers?: Record<string, string>,
) =>
  new Response(message, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  })

export class FlightRouteQuota extends DurableObject<unknown> {
  private readonly storage: DurableObjectStorage
  private initializationFailed = false

  constructor(state: DurableObjectState, env: unknown) {
    super(state, env)
    this.storage = state.storage
    try {
      this.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS flight_route_attempts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          attempted_at INTEGER NOT NULL
        )
      `)
    } catch {
      this.initializationFailed = true
    }
  }

  fetch(request: Request) {
    const url = new URL(request.url)
    if (url.pathname !== FLIGHT_ROUTE_QUOTA_PATH || url.search) {
      return Promise.resolve(textResponse('Not found', 404))
    }
    if (request.method !== 'POST') {
      return Promise.resolve(
        textResponse('Method not allowed', 405, { Allow: 'POST' }),
      )
    }
    if (this.initializationFailed) {
      return Promise.resolve(
        jsonResponse({ error: 'quota-unavailable' }, 503),
      )
    }

    const now = Date.now()
    if (!Number.isSafeInteger(now) || now <= 0) {
      return Promise.resolve(
        jsonResponse({ error: 'quota-unavailable' }, 503),
      )
    }

    try {
      const result = this.storage.transactionSync<QuotaResult>(() => {
        const rows = this.storage.sql
          .exec<AttemptRow>(
            `SELECT attempted_at AS attemptedAt
             FROM flight_route_attempts
             ORDER BY attempted_at ASC, id ASC`,
          )
          .toArray()
        if (
          rows.length > FLIGHT_ROUTE_QUOTA_LIMIT ||
          rows.some(
            ({ attemptedAt }) =>
              !Number.isSafeInteger(attemptedAt) ||
              attemptedAt <= 0 ||
              attemptedAt > now,
          )
        ) {
          throw new Error('Invalid quota state')
        }

        const cutoff = now - FLIGHT_ROUTE_QUOTA_WINDOW_MS
        this.storage.sql.exec(
          `DELETE FROM flight_route_attempts
           WHERE attempted_at <= ?`,
          cutoff,
        )
        const activeAttempts = rows
          .map(({ attemptedAt }) => attemptedAt)
          .filter((attemptedAt) => attemptedAt > cutoff)
        if (activeAttempts.length >= FLIGHT_ROUTE_QUOTA_LIMIT) {
          return {
            allowed: false,
            retryAfterSeconds: Math.max(
              1,
              Math.ceil(
                (activeAttempts[0]! +
                  FLIGHT_ROUTE_QUOTA_WINDOW_MS -
                  now) /
                  1_000,
              ),
            ),
          }
        }

        this.storage.sql.exec(
          `INSERT INTO flight_route_attempts (attempted_at)
           VALUES (?)`,
          now,
        )
        return {
          allowed: true,
          remaining:
            FLIGHT_ROUTE_QUOTA_LIMIT - activeAttempts.length - 1,
        }
      })

      return Promise.resolve(
        result.allowed
          ? jsonResponse(result, 200)
          : jsonResponse(result, 429, {
              'Retry-After': String(result.retryAfterSeconds),
            }),
      )
    } catch {
      return Promise.resolve(
        jsonResponse({ error: 'quota-unavailable' }, 503),
      )
    }
  }
}
