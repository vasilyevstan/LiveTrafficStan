import { OBJECT_SHARE_CONFIG as config } from '../config/objectShareConfig'
import { isObjectShareToken, objectShareIdentityKey, parseObjectShareContext, type ObjectShareContext, type ObjectShareReceipt } from '../domain/objectShare'
import { readBoundedBytes } from '../providers/boundedResponse'
import { isRecord } from '../providers/guards'

export class ObjectShareRequestError extends Error {
  readonly retryAfterMs: number
  constructor(message: string, retryAfterMs = 0) {
    super(message)
    this.retryAfterMs = retryAfterMs
  }
}

export const requestObjectShare = async (
  action: 'create' | 'resolve', value: ObjectShareContext | string, signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<ObjectShareReceipt> => {
  const controller = new AbortController()
  const abort = () => controller.abort(signal.reason)
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) abort()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, config.timeoutMs)
  try {
    const response = await fetchImpl(action === 'create' ? config.createPath : config.resolvePath, {
      method: 'POST', body: JSON.stringify(action === 'create' ? value : { token: value }),
      credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, signal: controller.signal,
    })
    const bytes = await readBoundedBytes(response, config.maximumResponseBytes, ['application/json'], controller.signal)
    const body: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (controller.signal.aborted) throw new DOMException('Sharing canceled', 'AbortError')
    if (response.status !== (action === 'create' ? 201 : 200)) {
      const retry = response.headers.get('Retry-After')
      const seconds = retry && /^[0-9]+$/.test(retry) ? Number(retry) :
        retry ? Math.ceil((Date.parse(retry) - Date.now()) / 1_000) : 0
      const message = response.status === 404 ? 'This shared link has expired or is unavailable.' :
        response.status === 429 ? `The daily shared-link ${action === 'create' ? 'creation' : 'opening'} limit has been reached.` :
        'Object sharing is currently unavailable. The ordinary map is still usable.'
      throw new ObjectShareRequestError(message, Math.max(0, Math.min(config.lifetimeMs, seconds * 1_000 || 0)))
    }
    if (!isRecord(body) || !isObjectShareToken(body.token) ||
      Object.keys(body).some(key => !['token', 'context', 'createdAt', 'expiresAt', 'serverNow'].includes(key)) ||
      typeof body.createdAt !== 'number' || !Number.isSafeInteger(body.createdAt) ||
      body.createdAt < 0 ||
      typeof body.expiresAt !== 'number' || typeof body.serverNow !== 'number' ||
      !Number.isSafeInteger(body.serverNow) || body.createdAt > body.serverNow ||
      body.expiresAt !== body.createdAt + config.lifetimeMs || body.expiresAt <= body.serverNow ||
      action === 'resolve' && body.token !== value) throw new Error('Invalid shared-link response')
    const context = parseObjectShareContext(body.context, body.serverNow)
    if (action === 'create' && (typeof value === 'string' || objectShareIdentityKey(context) !== objectShareIdentityKey(value))) {
      throw new Error('Sharing response does not match the captured identity')
    }
    return {
      token: body.token, context,
      createdAt: body.createdAt, expiresAt: body.expiresAt, serverNow: body.serverNow,
    }
  } catch (error) {
    if (signal.aborted) throw new DOMException('Sharing canceled', 'AbortError')
    if (error instanceof ObjectShareRequestError) throw error
    throw new ObjectShareRequestError(timedOut ? 'Object sharing timed out. Try again explicitly.' :
      'The shared link could not be loaded or created. The ordinary map is still usable.')
  } finally {
    clearTimeout(timeout)
    signal.removeEventListener('abort', abort)
  }
}
