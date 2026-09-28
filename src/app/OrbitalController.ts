import type { AppConfig } from '../config/appConfig'
import {
  EMPTY_ORBITAL_PREDICTION,
  parseOrbitalTimestamp,
  type OrbitalCatalogSnapshot,
  type OrbitalControllerPhase,
  type OrbitalControllerState,
} from '../domain/orbital'
import {
  orbitalViewportSignature,
  type OrbitalViewport,
} from '../domain/orbitalViewport'
import type {
  OrbitalCatalogLoadResult,
  OrbitalCatalogProvider,
} from '../providers/orbital/orbitalCatalogProvider'
import { errorMessage, ProviderError } from '../providers/errors'
import type {
  OrbitalWorkerLike,
  OrbitalWorkerRequest,
  OrbitalWorkerResponse,
} from '../workers/orbitalProtocol'

interface OrbitalControllerRuntime {
  wallNow: () => number
  performanceNow: () => number
  setTimeout: (callback: () => void, delayMs: number) => unknown
  clearTimeout: (handle: unknown) => void
}

interface OrbitalControllerOptions {
  provider: Pick<OrbitalCatalogProvider, 'load'>
  workerFactory: () => OrbitalWorkerLike
  config: AppConfig['orbital']
  onState: (state: OrbitalControllerState) => void
  runtime?: OrbitalControllerRuntime
  onWarning?: (message: string) => void
}

interface ClockAnchor {
  serverTimeMs: number
  wallTimeMs: number
  performanceTimeMs: number
}

const browserRuntime: OrbitalControllerRuntime = {
  wallNow: () => Date.now(),
  performanceNow: () => performance.now(),
  setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clearTimeout: (handle) => window.clearTimeout(handle as number),
}

const initialState = (): OrbitalControllerState => ({
  phase: 'disabled',
  positions: [],
  prediction: EMPTY_ORBITAL_PREDICTION,
})

const waitingPrediction = (message?: string) => ({
  ...EMPTY_ORBITAL_PREDICTION,
  message,
})

type PredictionRequest = Extract<
  OrbitalWorkerRequest,
  { type: 'prediction' }
>

export class OrbitalController {
  private readonly provider: Pick<OrbitalCatalogProvider, 'load'>
  private readonly workerFactory: () => OrbitalWorkerLike
  private readonly config: AppConfig['orbital']
  private readonly onState: (state: OrbitalControllerState) => void
  private readonly runtime: OrbitalControllerRuntime
  private readonly onWarning: (message: string) => void
  private state = initialState()
  private running = false
  private enabled = false
  private pageVisible = true
  private historyActive = false
  private online = true
  private viewport: OrbitalViewport = {
    kind: 'invalid',
    reason: 'invalid-geometry',
    message: 'Waiting for a settled map view.',
  }
  private viewportSignature = orbitalViewportSignature(this.viewport)
  private selectedId: string | null = null
  private snapshot?: OrbitalCatalogSnapshot
  private clock?: ClockAnchor
  private lastSuccessAt?: number
  private lastFetchPerformanceAt?: number
  private retryNotBeforePerformanceAt?: number
  private fetchController?: AbortController
  private fetching = false
  private fetchGeneration = 0
  private worker?: OrbitalWorkerLike
  private workerLoaded = false
  private positionReady = false
  private catalogRevision = 0
  private positionRequestId = 0
  private predictionRequestId = 0
  private predictionInFlightId?: number
  private pendingPrediction?: PredictionRequest
  private lastPositionRequestAt?: number
  private lastPredictionRequestAt?: number
  private positionTimer?: unknown
  private predictionTimer?: unknown
  private revalidationTimer?: unknown
  private expiryTimer?: unknown
  private lastWarning?: string

  constructor(options: OrbitalControllerOptions) {
    this.provider = options.provider
    this.workerFactory = options.workerFactory
    this.config = options.config
    this.onState = options.onState
    this.runtime = options.runtime ?? browserRuntime
    this.onWarning =
      options.onWarning ??
      ((message) => console.warn(`Orbital provider error: ${message}`))
  }

  start() {
    if (this.running) return
    this.running = true
    this.reconcile()
  }

  stop() {
    this.running = false
    this.fetchGeneration += 1
    this.fetchController?.abort()
    this.fetchController = undefined
    this.fetching = false
    this.clearTimers()
    this.destroyWorker()
  }

  setEnabled(enabled: boolean) {
    if (this.enabled === enabled) return
    this.enabled = enabled
    this.reconcile()
  }

  setPageVisible(visible: boolean) {
    if (this.pageVisible === visible) return
    this.pageVisible = visible
    if (visible && this.clock && this.modeledNow() !== undefined) {
      const now = this.runtime.performanceNow()
      this.clock = {
        serverTimeMs: this.clock.serverTimeMs +
          (now - this.clock.performanceTimeMs),
        wallTimeMs: this.runtime.wallNow(),
        performanceTimeMs: now,
      }
    }
    this.reconcile()
  }

  setHistoryActive(active: boolean) {
    if (this.historyActive === active) return
    this.historyActive = active
    this.reconcile()
  }

  setOnline(online: boolean) {
    if (this.online === online) return
    this.online = online
    this.reconcile()
  }

  setViewport(viewport: OrbitalViewport) {
    const signature = orbitalViewportSignature(viewport)
    if (signature === this.viewportSignature) return
    this.viewport = viewport
    this.viewportSignature = signature
    this.setState({
      ...this.state,
      prediction: waitingPrediction('Calculating upcoming crossings.'),
    })
    this.requestPrediction(true)
  }

  setSelectedId(id: string | null) {
    if (this.selectedId === id) return
    this.selectedId = id
    this.setState({
      ...this.state,
      prediction: {
        ...this.state.prediction,
        trackSegments: [],
      },
    })
    this.requestPrediction(true)
  }

  retry() {
    if (!this.running || !this.enabled || !this.online) return
    void this.fetchCatalog(true)
  }

  private active() {
    return (
      this.running &&
      this.enabled &&
      this.pageVisible &&
      !this.historyActive
    )
  }

  private clearTimer(
    name:
      | 'positionTimer'
      | 'predictionTimer'
      | 'revalidationTimer'
      | 'expiryTimer',
  ) {
    const timer = this[name]
    if (timer === undefined) return
    this.runtime.clearTimeout(timer)
    this[name] = undefined
  }

  private clearTimers() {
    this.clearTimer('positionTimer')
    this.clearTimer('predictionTimer')
    this.clearTimer('revalidationTimer')
    this.clearTimer('expiryTimer')
  }

  private destroyWorker() {
    if (this.worker) {
      this.worker.removeEventListener('message', this.handleWorkerMessage)
      this.worker.removeEventListener('error', this.handleWorkerError)
      this.worker.removeEventListener(
        'messageerror',
        this.handleWorkerMessageError,
      )
      this.worker.terminate()
    }
    this.worker = undefined
    this.workerLoaded = false
    this.positionReady = false
    this.predictionInFlightId = undefined
    this.pendingPrediction = undefined
    this.lastPositionRequestAt = undefined
    this.lastPredictionRequestAt = undefined
  }

  private pause(phase: OrbitalControllerPhase) {
    this.fetchGeneration += 1
    this.fetchController?.abort()
    this.fetchController = undefined
    this.fetching = false
    this.clearTimers()
    this.destroyWorker()
    this.setState({
      phase,
      positions: [],
      prediction: EMPTY_ORBITAL_PREDICTION,
      snapshot: this.snapshot,
      lastSuccessAt: this.lastSuccessAt,
      message:
        phase === 'paused-history'
          ? 'Modeled orbital objects are hidden during historical playback.'
          : phase === 'paused-hidden'
            ? 'Modeled orbital objects are paused while the page is hidden.'
            : undefined,
    })
  }

  private reconcile() {
    if (!this.running) return
    if (!this.enabled) {
      this.pause('disabled')
      return
    }
    if (this.historyActive) {
      this.pause('paused-history')
      return
    }
    if (!this.pageVisible) {
      this.pause('paused-hidden')
      return
    }

    if (!this.snapshot || !this.clock) {
      if (!this.online) {
        this.setState({
          phase: 'offline',
          positions: [],
          prediction: EMPTY_ORBITAL_PREDICTION,
          message: 'The orbital catalog is unavailable while offline.',
        })
        return
      }
      void this.fetchCatalog(true)
      return
    }

    const modeledNow = this.modeledNow()
    if (modeledNow === undefined) {
      this.clearTimers()
      this.destroyWorker()
      this.setState({
        phase: 'clock-invalid',
        positions: [],
        prediction: EMPTY_ORBITAL_PREDICTION,
        snapshot: this.snapshot,
        lastSuccessAt: this.lastSuccessAt,
        message:
          'Device time changed unexpectedly. Revalidating the orbital clock.',
      })
      if (this.online) void this.fetchCatalog(true)
      return
    }

    const snapshotAge = this.snapshotAge(modeledNow)
    if (snapshotAge > this.config.expireAfterMs) {
      this.clearTimers()
      this.destroyWorker()
      this.setState({
        phase: this.online ? 'unavailable' : 'offline',
        positions: [],
        prediction: EMPTY_ORBITAL_PREDICTION,
        snapshot: this.snapshot,
        lastSuccessAt: this.lastSuccessAt,
        message: this.online
          ? 'The orbital catalog is too old to model safely.'
          : 'The retained orbital catalog expired while offline.',
      })
      if (this.online) void this.fetchCatalog(true)
      return
    }

    this.ensureWorker()
    this.scheduleRevalidation()
    this.scheduleExpiry()
    this.updateOperationalPhase()
  }

  private modeledNow() {
    const clock = this.clock
    if (!clock) return undefined
    const performanceDelta =
      this.runtime.performanceNow() - clock.performanceTimeMs
    const wallDelta = this.runtime.wallNow() - clock.wallTimeMs
    if (
      Math.abs(wallDelta - performanceDelta) >
      this.config.maximumWallClockJumpMs
    ) {
      return undefined
    }
    return clock.serverTimeMs + performanceDelta
  }

  private snapshotAge(modeledNow: number) {
    const retrievedAt = this.snapshot
      ? parseOrbitalTimestamp(this.snapshot.retrievedAt)
      : undefined
    return retrievedAt === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(0, modeledNow - retrievedAt)
  }

  private currentPhase(positionCount = this.state.positions.length): OrbitalControllerPhase {
    const modeledNow = this.modeledNow()
    if (modeledNow === undefined) return 'clock-invalid'
    if (!this.online) return 'offline'
    if (this.snapshotAge(modeledNow) > this.config.expireAfterMs) {
      return 'unavailable'
    }
    if (this.fetching && this.snapshot) return 'refreshing'
    if (this.snapshotAge(modeledNow) > this.config.staleAfterMs) {
      return 'stale'
    }
    if (!this.positionReady) {
      return this.state.phase === 'refreshing' ? 'refreshing' : 'loading'
    }
    return positionCount === 0 ? 'empty' : 'ready'
  }

  private updateOperationalPhase(message = this.state.message) {
    if (!this.active() || !this.snapshot) return
    this.setState({
      ...this.state,
      phase: this.currentPhase(),
      snapshot: this.snapshot,
      lastSuccessAt: this.lastSuccessAt,
      message,
    })
  }

  private scheduleRevalidation() {
    this.clearTimer('revalidationTimer')
    if (!this.active() || !this.online) return
    const elapsed =
      this.lastFetchPerformanceAt === undefined
        ? this.config.revalidationIntervalMs
        : this.runtime.performanceNow() - this.lastFetchPerformanceAt
    const cadenceDelay = Math.max(
      0,
      this.config.revalidationIntervalMs - elapsed,
    )
    const retryDelay =
      this.retryNotBeforePerformanceAt === undefined
        ? 0
        : Math.max(
            0,
            this.retryNotBeforePerformanceAt -
              this.runtime.performanceNow(),
          )
    const delay = Math.max(cadenceDelay, retryDelay)
    this.revalidationTimer = this.runtime.setTimeout(() => {
      this.revalidationTimer = undefined
      void this.fetchCatalog(false)
    }, delay)
  }

  private scheduleExpiry() {
    this.clearTimer('expiryTimer')
    if (!this.active() || !this.snapshot || !this.clock) return
    const modeledNow = this.modeledNow()
    if (modeledNow === undefined) return
    const delay =
      this.config.expireAfterMs - this.snapshotAge(modeledNow)
    this.expiryTimer = this.runtime.setTimeout(() => {
      this.expiryTimer = undefined
      this.reconcile()
    }, Math.max(0, delay + 1))
  }

  private async fetchCatalog(force: boolean) {
    if (!this.active() || !this.online || this.fetchController) return
    const now = this.runtime.performanceNow()
    if (
      this.retryNotBeforePerformanceAt !== undefined &&
      now < this.retryNotBeforePerformanceAt
    ) {
      this.scheduleRevalidation()
      return
    }
    if (
      !force &&
      this.lastFetchPerformanceAt !== undefined &&
      now - this.lastFetchPerformanceAt <
        this.config.revalidationIntervalMs
    ) {
      this.scheduleRevalidation()
      return
    }

    const generation = ++this.fetchGeneration
    const controller = new AbortController()
    this.fetchController = controller
    this.fetching = true
    this.lastFetchPerformanceAt = now
    const modeledNow = this.modeledNow()
    const retainedSnapshotIsSafe =
      this.snapshot !== undefined &&
      modeledNow !== undefined &&
      this.snapshotAge(modeledNow) <= this.config.expireAfterMs
    this.setState({
      ...this.state,
      phase: retainedSnapshotIsSafe ? 'refreshing' : 'loading',
      message: undefined,
    })

    try {
      const result = await this.provider.load(controller.signal)
      if (
        generation !== this.fetchGeneration ||
        controller.signal.aborted ||
        !this.active()
      ) {
        return
      }
      this.retryNotBeforePerformanceAt = undefined
      this.acceptCatalog(result)
    } catch (error) {
      if (
        generation !== this.fetchGeneration ||
        this.fetchController !== controller ||
        controller.signal.aborted ||
        !this.active()
      ) {
        return
      }
      this.fetching = false
      if (
        error instanceof ProviderError &&
        error.retryAfterMs !== undefined
      ) {
        this.retryNotBeforePerformanceAt =
          this.runtime.performanceNow() + error.retryAfterMs
      }
      const message = errorMessage(error)
      if (message !== this.lastWarning) {
        this.lastWarning = message
        this.onWarning(message)
      }
      const modeledNow = this.modeledNow()
      if (this.snapshot && this.clock && modeledNow !== undefined) {
        if (this.snapshotAge(modeledNow) > this.config.expireAfterMs) {
          this.reconcile()
        } else {
          this.updateOperationalPhase(
            `Refresh failed; using the retained catalog. ${message}`,
          )
        }
      } else {
        this.setState({
          phase: this.online ? 'unavailable' : 'offline',
          positions: [],
          prediction: EMPTY_ORBITAL_PREDICTION,
          snapshot: this.snapshot,
          lastSuccessAt: this.lastSuccessAt,
          message,
        })
      }
    } finally {
      if (
        generation === this.fetchGeneration &&
        this.fetchController === controller
      ) {
        this.fetching = false
        this.fetchController = undefined
        if (
          this.snapshot &&
          this.active() &&
          this.state.phase === 'refreshing'
        ) {
          this.updateOperationalPhase()
        }
        this.scheduleRevalidation()
      }
    }
  }

  private acceptCatalog(result: OrbitalCatalogLoadResult) {
    const hadSnapshot = this.snapshot !== undefined
    const skew = Math.abs(
      result.clock.serverTimeMs -
        result.clock.requestMidpointWallTimeMs,
    )
    const catalogChanged =
      this.snapshot?.sha256 !== result.snapshot.sha256
    this.snapshot = result.snapshot
    this.lastSuccessAt = result.clock.serverTimeMs
    this.lastWarning = undefined
    if (skew > this.config.maximumClockSkewMs) {
      this.clock = undefined
      this.clearTimers()
      this.destroyWorker()
      this.setState({
        phase: 'clock-invalid',
        positions: [],
        prediction: EMPTY_ORBITAL_PREDICTION,
        snapshot: result.snapshot,
        lastSuccessAt: this.lastSuccessAt,
        message:
          'Device time differs too much from the application host to model orbital positions safely.',
      })
      return
    }

    this.clock = {
      serverTimeMs: result.clock.serverTimeMs,
      wallTimeMs: result.clock.responseWallTimeMs,
      performanceTimeMs: result.clock.responsePerformanceTimeMs,
    }
    if (
      this.snapshotAge(result.clock.serverTimeMs) >
      this.config.expireAfterMs
    ) {
      this.clearTimers()
      this.destroyWorker()
      this.setState({
        phase: 'unavailable',
        positions: [],
        prediction: EMPTY_ORBITAL_PREDICTION,
        snapshot: result.snapshot,
        lastSuccessAt: this.lastSuccessAt,
        message: 'The orbital catalog is too old to model safely.',
      })
      this.scheduleRevalidation()
      return
    }

    if (catalogChanged) {
      this.setState({
        phase: hadSnapshot ? 'refreshing' : 'loading',
        positions: [],
        prediction: waitingPrediction(
          'Preparing the refreshed orbital catalog.',
        ),
        snapshot: result.snapshot,
        lastSuccessAt: this.lastSuccessAt,
      })
    }
    this.ensureWorker(catalogChanged || !this.worker)
    if (!catalogChanged && this.workerLoaded) {
      this.updateOperationalPhase()
    }
    this.scheduleRevalidation()
    this.scheduleExpiry()
  }

  private ensureWorker(reload = false) {
    if (!this.active() || !this.snapshot || !this.clock) return
    if (!this.worker) {
      try {
        this.worker = this.workerFactory()
        this.worker.addEventListener('message', this.handleWorkerMessage)
        this.worker.addEventListener('error', this.handleWorkerError)
        this.worker.addEventListener(
          'messageerror',
          this.handleWorkerMessageError,
        )
      } catch (error) {
        this.setState({
          phase: 'unavailable',
          positions: [],
          prediction: EMPTY_ORBITAL_PREDICTION,
          snapshot: this.snapshot,
          lastSuccessAt: this.lastSuccessAt,
          message: errorMessage(error),
        })
        return
      }
      reload = true
    }
    if (!reload && this.workerLoaded) return

    this.workerLoaded = false
    this.positionReady = false
    this.predictionInFlightId = undefined
    this.pendingPrediction = undefined
    this.catalogRevision += 1
    this.positionRequestId += 1
    this.predictionRequestId += 1
    this.clearTimer('positionTimer')
    this.clearTimer('predictionTimer')
    this.worker.postMessage({
      type: 'load-catalog',
      catalogRevision: this.catalogRevision,
      snapshot: this.snapshot,
      limits: {
        maximumElementAgeMs: this.config.maximumElementAgeMs,
        maximumFutureElementMs: this.config.maximumFutureElementMs,
        maximumAltitudeKm: this.config.maximumAltitudeKm,
        predictionHorizonMs: this.config.predictionHorizonMs,
        predictionStepMs: this.config.predictionStepMs,
        maximumDetailedResults: this.config.maximumDetailedResults,
        trackDurationMs: this.config.trackDurationMs,
        maximumTrackPoints: this.config.maximumTrackPoints,
      },
    })
  }

  private readonly handleWorkerMessage = (
    event: MessageEvent<OrbitalWorkerResponse>,
  ) => {
    const message = event.data
    if (
      !this.active() ||
      message.catalogRevision !== this.catalogRevision
    ) {
      return
    }
    if (message.type === 'error') {
      if (
        message.operation === 'positions' &&
        message.requestId !== this.positionRequestId
      ) {
        return
      }
      if (message.operation === 'prediction') {
        if (message.requestId !== this.predictionInFlightId) return
        this.predictionInFlightId = undefined
        if (message.requestId !== this.predictionRequestId) {
          this.postPendingPrediction()
          return
        }
      }
      this.clearTimers()
      this.destroyWorker()
      this.setState({
        phase: 'unavailable',
        positions: [],
        prediction: EMPTY_ORBITAL_PREDICTION,
        snapshot: this.snapshot,
        lastSuccessAt: this.lastSuccessAt,
        message: message.message,
      })
      return
    }
    if (message.type === 'catalog-loaded') {
      this.workerLoaded = true
      this.setState({
        ...this.state,
        message:
          message.acceptedCount === 0
            ? 'No catalog objects can be propagated safely.'
            : undefined,
      })
      this.requestPositions(true)
      this.requestPrediction(true)
      return
    }
    if (
      message.type === 'positions' &&
      message.requestId === this.positionRequestId
    ) {
      this.positionReady = true
      this.setState({
        ...this.state,
        positions: message.positions,
        phase: this.currentPhase(message.positions.length),
        snapshot: this.snapshot,
        lastSuccessAt: this.lastSuccessAt,
      })
      this.schedulePositions()
      return
    }
    if (
      message.type === 'prediction' &&
      message.requestId === this.predictionInFlightId
    ) {
      this.predictionInFlightId = undefined
      if (message.requestId === this.predictionRequestId) {
        this.setState({
          ...this.state,
          prediction: message.prediction,
        })
      }
      if (this.pendingPrediction) {
        this.postPendingPrediction()
      } else {
        this.schedulePrediction()
      }
    }
  }

  private readonly handleWorkerError = (event: ErrorEvent) => {
    event.preventDefault()
    this.failWorker('Orbital propagation worker failed.')
  }

  private readonly handleWorkerMessageError = () => {
    this.failWorker('Orbital propagation worker returned an invalid message.')
  }

  private failWorker(message: string) {
    if (!this.active() || !this.worker) return
    this.clearTimers()
    this.destroyWorker()
    this.setState({
      phase: 'unavailable',
      positions: [],
      prediction: EMPTY_ORBITAL_PREDICTION,
      snapshot: this.snapshot,
      lastSuccessAt: this.lastSuccessAt,
      message,
    })
  }

  private requestPositions(immediate = false) {
    this.clearTimer('positionTimer')
    if (!this.active() || !this.workerLoaded || !this.worker) return
    const modeledFor = this.modeledNow()
    if (modeledFor === undefined) {
      this.reconcile()
      return
    }
    const now = this.runtime.performanceNow()
    const wait =
      immediate || this.lastPositionRequestAt === undefined
        ? 0
        : Math.max(
            0,
            this.lastPositionRequestAt +
              this.config.positionIntervalMs -
              now,
          )
    if (wait > 0) {
      this.positionTimer = this.runtime.setTimeout(() => {
        this.positionTimer = undefined
        this.requestPositions(true)
      }, wait)
      return
    }

    this.lastPositionRequestAt = now
    this.positionRequestId += 1
    this.worker.postMessage({
      type: 'positions',
      catalogRevision: this.catalogRevision,
      requestId: this.positionRequestId,
      modeledFor,
    })
  }

  private schedulePositions() {
    this.clearTimer('positionTimer')
    if (!this.active()) return
    const elapsed =
      this.lastPositionRequestAt === undefined
        ? this.config.positionIntervalMs
        : this.runtime.performanceNow() - this.lastPositionRequestAt
    this.positionTimer = this.runtime.setTimeout(() => {
      this.positionTimer = undefined
      this.requestPositions(true)
    }, Math.max(0, this.config.positionIntervalMs - elapsed))
  }

  private requestPrediction(immediate = false) {
    this.clearTimer('predictionTimer')
    if (!this.active() || !this.workerLoaded || !this.worker) return
    const modeledFor = this.modeledNow()
    if (modeledFor === undefined) {
      this.reconcile()
      return
    }
    const now = this.runtime.performanceNow()
    const wait =
      immediate || this.lastPredictionRequestAt === undefined
        ? 0
        : Math.max(
            0,
            this.lastPredictionRequestAt +
              this.config.predictionRefreshIntervalMs -
              now,
          )
    if (wait > 0) {
      this.predictionTimer = this.runtime.setTimeout(() => {
        this.predictionTimer = undefined
        this.requestPrediction(true)
      }, wait)
      return
    }

    this.lastPredictionRequestAt = now
    this.predictionRequestId += 1
    this.pendingPrediction = {
      type: 'prediction',
      catalogRevision: this.catalogRevision,
      requestId: this.predictionRequestId,
      modeledFor,
      viewport: this.viewport,
      selectedId: this.selectedId,
    }
    this.postPendingPrediction()
  }

  private postPendingPrediction() {
    if (
      !this.active() ||
      !this.workerLoaded ||
      !this.worker ||
      this.predictionInFlightId !== undefined ||
      !this.pendingPrediction
    ) {
      return
    }
    const request = this.pendingPrediction
    this.pendingPrediction = undefined
    this.predictionInFlightId = request.requestId
    this.worker.postMessage(request)
  }

  private schedulePrediction() {
    this.clearTimer('predictionTimer')
    if (!this.active()) return
    const elapsed =
      this.lastPredictionRequestAt === undefined
        ? this.config.predictionRefreshIntervalMs
        : this.runtime.performanceNow() - this.lastPredictionRequestAt
    this.predictionTimer = this.runtime.setTimeout(() => {
      this.predictionTimer = undefined
      this.requestPrediction(true)
    }, Math.max(0, this.config.predictionRefreshIntervalMs - elapsed))
  }

  private setState(state: OrbitalControllerState) {
    this.state = state
    this.onState(state)
  }
}
