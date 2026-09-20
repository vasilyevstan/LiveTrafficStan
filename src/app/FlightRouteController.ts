import type {
  FlightRouteIdentity,
  FlightRouteViewState,
} from '../domain/flightRoute'
import { flightRouteIdentityKey } from '../domain/flightRoute'
import {
  FlightRouteProviderError,
  type FlightRouteProvider,
} from '../providers/flightRoute/aviationstackFlightRouteProvider'

type Listener = (state: FlightRouteViewState) => void

const isAbortError = (error: unknown) =>
  (error instanceof DOMException || error instanceof Error) &&
  error.name === 'AbortError'

export class FlightRouteController {
  private readonly provider: FlightRouteProvider
  private state: FlightRouteViewState = { phase: 'idle' }
  private listener?: Listener
  private requestController?: AbortController
  private revision = 0
  private selectedIdentity?: FlightRouteIdentity
  private selectedIdentityKey?: string

  constructor(provider: FlightRouteProvider) {
    this.provider = provider
  }

  subscribe(listener: Listener) {
    this.listener = listener
    listener(this.state)
    return () => {
      if (this.listener === listener) this.listener = undefined
    }
  }

  select(identity: FlightRouteIdentity | undefined) {
    const identityKey = identity
      ? flightRouteIdentityKey(identity)
      : undefined
    if (identityKey === this.selectedIdentityKey) return

    this.revision += 1
    this.requestController?.abort()
    this.requestController = undefined
    this.selectedIdentity = identity
    this.selectedIdentityKey = identityKey
    this.publish(
      identityKey ? { phase: 'idle', identityKey } : { phase: 'idle' },
    )
  }

  request(requestedIdentity: FlightRouteIdentity) {
    this.select(requestedIdentity)
    if (
      !this.selectedIdentity ||
      !this.selectedIdentityKey ||
      this.state.phase === 'loading'
    ) {
      return
    }

    this.revision += 1
    const revision = this.revision
    const identity = this.selectedIdentity
    const identityKey = this.selectedIdentityKey
    const requestController = new AbortController()
    this.requestController?.abort()
    this.requestController = requestController
    this.publish({ phase: 'loading', identityKey })

    void this.provider.lookup(identity, requestController.signal).then(
      (result) => {
        if (
          revision !== this.revision ||
          requestController.signal.aborted ||
          identityKey !== this.selectedIdentityKey
        ) {
          return
        }
        this.requestController = undefined
        if (result.kind === 'available') {
          this.publish({
            phase: 'available',
            identityKey,
            route: result.route,
          })
        } else {
          this.publish({
            phase: 'unavailable',
            identityKey,
            reason: result.reason,
          })
        }
      },
      (error: unknown) => {
        if (
          revision !== this.revision ||
          requestController.signal.aborted ||
          identityKey !== this.selectedIdentityKey ||
          isAbortError(error)
        ) {
          return
        }
        this.requestController = undefined
        this.publish({
          phase: 'error',
          identityKey,
          reason:
            error instanceof FlightRouteProviderError
              ? error.reason
              : 'provider-error',
        })
      },
    )
  }

  dispose() {
    this.revision += 1
    this.selectedIdentity = undefined
    this.selectedIdentityKey = undefined
    this.requestController?.abort()
    this.requestController = undefined
    this.listener = undefined
  }

  private publish(state: FlightRouteViewState) {
    this.state = state
    this.listener?.(state)
  }
}
