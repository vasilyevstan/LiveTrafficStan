import { readObjectShareIntent, type ObjectShareReceipt } from '../domain/objectShare'
import { requestObjectShare } from './objectShareRequest'

export type ObjectShareStartupResult = { receipt: ObjectShareReceipt; linkDeadline: number } | { error: string }

export class ObjectShareStartup {
  private readonly controller = new AbortController()
  private active = true
  private settled = false
  readonly result: Promise<ObjectShareStartupResult>
  constructor(token: string | undefined, fetchImpl?: typeof fetch) {
    const requestedAt = performance.now()
    this.result = (token ? requestObjectShare('resolve', token, this.controller.signal, fetchImpl)
      .then(receipt => ({ receipt, linkDeadline: requestedAt + receipt.expiresAt - receipt.serverNow }),
        error => ({ error: error instanceof Error ? error.message : 'The shared link is unavailable.' }))
      : Promise.resolve({ error: 'This shared link is invalid. Showing the ordinary map.' }))
      .then(result => { this.settled = true; return result })
  }
  get current() { return this.active && !this.controller.signal.aborted }
  get pending() { return this.current && !this.settled }
  consume() {
    if (!this.current || !this.settled) return false
    this.active = false
    return true
  }
  cancel() {
    this.active = false
    this.controller.abort()
  }
}

export const startObjectShare = (
  location: Pick<Location, 'hash' | 'pathname' | 'search'>,
  history: Pick<History, 'replaceState' | 'state'>,
  fetchImpl?: typeof fetch,
) => {
  const intent = readObjectShareIntent(location.hash)
  if (!intent) return undefined
  history.replaceState(history.state, '', `${location.pathname}${location.search}`)
  return new ObjectShareStartup(intent.token, fetchImpl)
}
