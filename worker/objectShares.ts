import { OBJECT_SHARE_CONFIG as config } from '../src/config/objectShareConfig.js'
import { isObjectShareToken, parseObjectShareContext } from '../src/domain/objectShare.js'
import { readBoundedBytes } from '../src/providers/boundedResponse.js'
import { isRecord } from '../src/providers/guards.js'
import { OBJECT_SHARE_SQL as sql } from './objectShareSql.js'

interface ShareStatement {
  bind(...values: (string | number)[]): ShareStatement
}
export interface ShareDatabase {
  prepare(sql: string): ShareStatement
  batch(statements: ShareStatement[]): Promise<{ results: Record<string, unknown>[]; success: boolean }[]>
}
export interface ObjectShareEnvironment {
  OBJECT_SHARES?: ShareDatabase
  OBJECT_SHARING_ENABLED?: string
}
const dayMs = 24 * 60 * 60_000
const headers = {
  'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow',
}
const reply = (body: unknown, status: number, extra?: Record<string, string>) =>
  Response.json(body, { status, headers: { ...headers, ...extra } })
const randomToken = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(9))))
  .replaceAll('+', '-').replaceAll('/', '_')
const retryHeaders = (now: number) => ({ 'Retry-After': String(Math.ceil((dayMs - now % dayMs) / 1_000)) })

export const objectShareRedirect = (request: Request): Response | undefined => {
  const url = new URL(request.url)
  const token = url.pathname.slice(1)
  if (!isObjectShareToken(token)) return undefined
  if (request.method !== 'GET' && request.method !== 'HEAD') return reply({ error: 'Method not allowed' }, 405, { Allow: 'GET, HEAD' })
  if (url.search) return reply({ error: 'Invalid object link' }, 400)
  return new Response(null, { status: 302, headers: { ...headers, Location: `/#object=${token}` } })
}

export const handleObjectShares = async (
  request: Request, env: ObjectShareEnvironment,
  options: { now?: () => number; token?: () => string; timeoutMs?: number } = {},
) => {
  const url = new URL(request.url)
  const create = url.pathname === config.createPath
  if (!create && url.pathname !== config.resolvePath) return reply({ error: 'Not found' }, 404)
  if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405, { Allow: 'POST' })
  const origin = request.headers.get('Origin')
  if (origin !== null && origin !== url.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    return reply({ error: 'Cross-origin sharing rejected' }, 403)
  }
  if (url.search || request.url.includes('?')) return reply({ error: 'Sharing URL queries are not supported' }, 400)
  if (env.OBJECT_SHARING_ENABLED !== 'true' || !env.OBJECT_SHARES) {
    return reply({ error: 'Object sharing is currently unavailable' }, 503)
  }
  const database = env.OBJECT_SHARES
  const controller = new AbortController()
  const abort = () => controller.abort(request.signal.reason)
  request.signal.addEventListener('abort', abort, { once: true })
  if (request.signal.aborted) abort()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, options.timeoutMs ?? config.timeoutMs)
  const canceled = () => reply({ error: timedOut ? 'Object sharing timed out' : 'Object sharing canceled' }, timedOut ? 504 : 499)
  let abortListener: () => void = () => undefined
  const cancellation = new Promise<Response>(resolve => {
    abortListener = () => resolve(canceled())
    controller.signal.addEventListener('abort', abortListener, { once: true })
    if (controller.signal.aborted) abortListener()
  })
  const operation = async () => {
    const now = (options.now ?? Date.now)()
    const day = Math.floor(now / dayMs)
    let body: unknown
    try {
      const bytes = await readBoundedBytes(new Response(request.body, { headers: request.headers }),
        config.maximumRecordBytes, ['application/json'], controller.signal)
      body = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes))
    } catch {
      return controller.signal.aborted ? canceled() : reply({ error: 'Invalid or oversized sharing request' }, 400)
    }
    if (controller.signal.aborted) return canceled()
    if (create) {
      let context
      try {
        context = parseObjectShareContext(body, now)
      } catch {
        return reply({ error: 'Invalid shared identity, position or provenance' }, 400)
      }
      for (let attempt = 0; attempt < config.collisionAttempts; attempt++) {
        if (controller.signal.aborted) return canceled()
        const token = (options.token ?? randomToken)()
        if (!isObjectShareToken(token)) throw new Error('Invalid generated share token')
        const results = await database.batch([
          database.prepare(sql.startDay).bind(day),
          database.prepare(sql.create).bind(
              token, context.kind, context.identifier, JSON.stringify(context), now, now + config.lifetimeMs, day, day, config.dailyCreations),
          database.prepare(sql.dayCounts).bind(day),
        ])
        if (results.some(result => !result.success)) throw new Error('Share transaction failed')
        if (controller.signal.aborted) return canceled()
        if (results[1]?.results.length === 1) {
          return reply({ token, context, createdAt: now, expiresAt: now + config.lifetimeMs, serverNow: now }, 201)
        }
        if (Number(results[2]?.results[0]?.created) >= config.dailyCreations) {
          return reply({ error: 'The daily shared-link creation limit has been reached' }, 429, retryHeaders(now))
        }
      }
      return reply({ error: 'A sharing link could not be allocated. Try again later.' }, 503)
    }
    if (!isRecord(body) || Object.keys(body).length !== 1 || !isObjectShareToken(body.token)) {
      return reply({ error: 'Invalid object link' }, 400)
    }
    const results = await database.batch([
      database.prepare(sql.startDay).bind(day),
      database.prepare(sql.resolve).bind(day, body.token, now, day, config.dailyResolutions),
      database.prepare(sql.expiry).bind(body.token),
    ])
    if (results.some(result => !result.success)) throw new Error('Share transaction failed')
    if (controller.signal.aborted) return canceled()
    const row = results[1]?.results[0]
    if (row) {
      const context = parseObjectShareContext(JSON.parse(String(row.payload)), now)
      return reply({ token: body.token, context, createdAt: row.created_at, expiresAt: row.expires_at, serverNow: now }, 200)
    }
    if (Number(results[2]?.results[0]?.expires_at) > now) {
      return reply({ error: 'The daily shared-link opening limit has been reached' }, 429, retryHeaders(now))
    }
    return reply({ error: 'This shared link has expired or is unavailable' }, 404)
  }
  try {
    return await Promise.race([operation(), cancellation])
  } catch {
    if (controller.signal.aborted) return canceled()
    console.error('Object sharing storage operation failed')
    return reply({ error: 'Object sharing storage is unavailable. The ordinary map is still usable.' }, 503)
  } finally {
    clearTimeout(timeout)
    request.signal.removeEventListener('abort', abort)
    controller.signal.removeEventListener('abort', abortListener)
  }
}

export const cleanupObjectShares = async (env: ObjectShareEnvironment, now = Date.now()) => {
  if (!env.OBJECT_SHARES) return
  const database = env.OBJECT_SHARES
  const oldestDay = Math.floor(now / dayMs) - config.statisticsDays + 1
  const results = await database.batch([
    database.prepare(sql.cleanupLinks).bind(now, config.cleanupBatchSize),
    database.prepare(sql.cleanupStatistics).bind(oldestDay, config.cleanupBatchSize),
    database.prepare(sql.cleanupDays).bind(oldestDay),
  ])
  if (results.some(result => !result.success)) throw new Error('Object sharing cleanup failed')
}
