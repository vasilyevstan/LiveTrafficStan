import type {
  AircraftMetadataControllerState,
  AircraftMetadataIdentity,
} from '../domain/aircraftMetadata'
import { aircraftMetadataIdentityKey } from '../domain/aircraftMetadata'
import type { AircraftMetadataProvider } from '../providers/aircraftMetadata/staticAircraftMetadataProvider'

type Listener = (state: AircraftMetadataControllerState) => void

const isAbortError = (error: unknown) =>
  (error instanceof DOMException || error instanceof Error) &&
  error.name === 'AbortError'

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

export class AircraftMetadataController {
  private readonly provider: AircraftMetadataProvider
  private state: AircraftMetadataControllerState = { phase: 'idle' }
  private listener?: Listener
  private request?: AbortController
  private revision = 0
  private selectedIdentityKey?: string

  constructor(provider: AircraftMetadataProvider) {
    this.provider = provider
  }

  subscribe(listener: Listener) {
    this.listener = listener
    listener(this.state)
    return () => {
      if (this.listener === listener) this.listener = undefined
    }
  }

  select(identity: AircraftMetadataIdentity | undefined) {
    const identityKey = identity
      ? aircraftMetadataIdentityKey(identity)
      : undefined
    if (identityKey === this.selectedIdentityKey) return

    this.revision += 1
    const revision = this.revision
    this.selectedIdentityKey = identityKey
    this.request?.abort()
    this.request = undefined

    if (!identity || !identityKey) {
      this.publish({ phase: 'idle' })
      return
    }

    const request = new AbortController()
    this.request = request
    this.publish({ phase: 'loading', identityKey })
    void this.provider.lookup(identity, request.signal).then(
      (result) => {
        if (
          revision !== this.revision ||
          request.signal.aborted ||
          identityKey !== this.selectedIdentityKey
        ) {
          return
        }
        this.request = undefined
        if (result.kind === 'available') {
          this.publish({
            phase: 'ready',
            identityKey,
            metadata: result.metadata,
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
          request.signal.aborted ||
          identityKey !== this.selectedIdentityKey ||
          isAbortError(error)
        ) {
          return
        }
        this.request = undefined
        this.publish({
          phase: 'error',
          identityKey,
          message: errorMessage(error),
        })
      },
    )
  }

  dispose() {
    this.revision += 1
    this.selectedIdentityKey = undefined
    this.request?.abort()
    this.request = undefined
    this.listener = undefined
  }

  private publish(state: AircraftMetadataControllerState) {
    this.state = state
    this.listener?.(state)
  }
}
