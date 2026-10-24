import { DISCOVERY_CONFIG as config } from '../../config/discoveryConfig'
import type { DiscoveryClass, DiscoveryResponse, LookupRequest } from '../../domain/objectDiscovery'
import { readBoundedBytes } from '../boundedResponse'
import { ProviderError, parseRetryAfterMs } from '../errors'
import { validateDiscoveryResponse } from './lookupContract'

export interface ObjectLookupProvider {
  lookup(request: LookupRequest, signal: AbortSignal): Promise<DiscoveryResponse>
}

export class SameOriginObjectLookupProvider implements ObjectLookupProvider {
  private readonly notBefore = new Map<DiscoveryClass, number>()

  async lookup(request: LookupRequest, signal: AbortSignal) {
    const deadline = this.notBefore.get(request.objectClass) ?? 0
    if (Date.now() < deadline) {
      throw new ProviderError('The lookup source is temporarily rate-limited.', 429, deadline - Date.now())
    }
    const path = request.objectClass === 'ships' ? config.shipsPath : config.aircraftPath
    const response = await fetch(path, {
      method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer',
      cache: 'no-store', redirect: 'error', signal,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ by: request.by, q: request.query }),
    })
    if (response.status !== 200) {
      void response.body?.cancel().catch(() => undefined)
      const retryAfterMs = parseRetryAfterMs(response.headers.get('Retry-After'))
      if (response.status === 429 || response.status === 503 && retryAfterMs !== undefined) {
        this.notBefore.set(request.objectClass, Math.max(deadline, Date.now() + (retryAfterMs ?? config.rateLimitFallbackMs)))
      }
      throw new ProviderError(
        response.status === 503 ? 'The lookup source is busy or unavailable.' :
          `The lookup source returned HTTP ${response.status}.`,
        response.status, retryAfterMs,
      )
    }
    const bytes = await readBoundedBytes(response,
      request.objectClass === 'ships' && request.by === 'position' ? config.shipPositionMaximumBytes : config.maximumBytes,
      ['application/json'], signal)
    if (signal.aborted) throw signal.reason ?? new DOMException('Lookup canceled', 'AbortError')
    let body: unknown
    try {
      body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    } catch {
      throw new ProviderError('The lookup source returned an invalid response.')
    }
    return validateDiscoveryResponse(body, request)
  }
}
