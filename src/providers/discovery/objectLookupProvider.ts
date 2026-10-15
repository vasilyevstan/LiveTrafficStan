import { DISCOVERY_CONFIG as config } from '../../config/discoveryConfig'
import type { DiscoveryResponse, LookupRequest } from '../../domain/objectDiscovery'
import { readBoundedBytes } from '../boundedResponse'
import { ProviderError, parseRetryAfterMs } from '../errors'
import { validateDiscoveryResponse } from './lookupContract'

export interface ObjectLookupProvider {
  lookup(request: LookupRequest, signal: AbortSignal): Promise<DiscoveryResponse>
}

export class SameOriginObjectLookupProvider implements ObjectLookupProvider {
  async lookup(request: LookupRequest, signal: AbortSignal) {
    const path = request.objectClass === 'ships' ? config.shipsPath : config.aircraftPath
    const response = await fetch(path, {
      method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer',
      cache: 'no-store', redirect: 'error', signal,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ by: request.by, q: request.query }),
    })
    if (response.status !== 200) {
      void response.body?.cancel().catch(() => undefined)
      throw new ProviderError(
        response.status === 503 ? 'The lookup source is busy or unavailable.' :
          `The lookup source returned HTTP ${response.status}.`,
        response.status, parseRetryAfterMs(response.headers.get('Retry-After')),
      )
    }
    const bytes = await readBoundedBytes(response, config.maximumBytes, ['application/json'], signal)
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
