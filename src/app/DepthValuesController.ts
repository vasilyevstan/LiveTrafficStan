import { BATHYMETRY_CONFIG } from '../config/appConfig'
import type { DepthCandidate, DepthSample, DepthValueSource, DepthValuesState } from '../domain/bathymetry'
import { fetchDepthValue } from '../providers/bathymetry/depthValues'
import { ProviderError } from '../providers/errors'

type FetchDepth = typeof fetchDepthValue

export class DepthValuesController {
  private state: DepthValuesState = { phase: 'zoom-in', source: 'gebco', samples: [] }
  private cache = new Map<string, { depth: number | null; expiresAt: number }>()
  private retryAt = new Map<DepthValueSource, number>()
  private revision = 0
  private signature = ''
  private controller = new AbortController()
  private queue: DepthCandidate[] = []
  private active = new Map<symbol, number>()
  private samples = new Map<string, DepthSample>()
  private failure: string | undefined
  private timeout: ReturnType<typeof setTimeout> | undefined
  private disposed = false
  private readonly onChange: (state: DepthValuesState) => void
  private readonly fetchValue: FetchDepth

  constructor(
    onChange: (state: DepthValuesState) => void,
    fetchValue: FetchDepth = fetchDepthValue,
  ) {
    this.onChange = onChange
    this.fetchValue = fetchValue
  }

  getState() { return this.state }

  pause(
    phase: 'paused' | 'zoom-in' | 'unavailable' = 'paused',
    message?: string,
    source = this.state.source,
  ) {
    this.cancel()
    this.signature = ''
    this.samples.clear()
    this.publish({ phase, source, samples: [], message })
  }

  load(source: DepthValueSource, candidates: readonly DepthCandidate[]) {
    if (this.disposed) return
    const points = [...new Map(candidates.slice(0, BATHYMETRY_CONFIG.maximumLabels).map(point => [point.id, point])).values()]
    const signature = `${source}|${points.map(point => point.id).join('|')}`
    if (signature === this.signature) return
    this.cancel()
    this.signature = signature
    this.controller = new AbortController()
    this.samples.clear()
    this.failure = undefined
    for (const point of points) {
      const key = `${source}:${point.id}`
      const cached = this.cache.get(key)
      if (cached && cached.expiresAt > Date.now()) {
        this.cache.delete(key)
        this.cache.set(key, cached)
        if (cached.depth !== null) this.samples.set(point.id, { ...point, depthMeters: cached.depth })
      } else {
        this.cache.delete(key)
        this.queue.push(point)
      }
    }
    this.publish({ phase: 'loading', source, samples: [...this.samples.values()] })
    if (this.queue.length > 0 && (this.retryAt.get(source) ?? 0) > Date.now()) {
      this.queue = []
      this.failure = 'Depth numbers are rate limited. Retry later by moving the view or switching DEPTHS off and on.'
      this.finish()
      return
    }
    if (this.queue.length === 0) {
      this.finish()
      return
    }
    const revision = this.revision
    this.timeout = setTimeout(() => {
      if (revision !== this.revision || this.disposed) return
      this.queue = []
      this.failure = 'Depth numbers timed out. Move the view or switch DEPTHS off and on to retry.'
      this.controller.abort()
      this.finish()
    }, BATHYMETRY_CONFIG.requestTimeoutMs)
    this.pump()
  }

  dispose() {
    this.disposed = true
    this.cancel()
    this.cache.clear()
  }

  private cancel() {
    this.revision += 1
    this.controller.abort()
    this.queue = []
    clearTimeout(this.timeout)
    this.timeout = undefined
  }

  private publish(state: DepthValuesState) {
    if (state.phase === this.state.phase && state.source === this.state.source &&
        state.message === this.state.message && state.samples.length === this.state.samples.length &&
        state.samples.every((sample, index) => sample.id === this.state.samples[index].id &&
          sample.depthMeters === this.state.samples[index].depthMeters)) return
    this.state = state
    if (!this.disposed) this.onChange(state)
  }

  private pump() {
    if (this.disposed || this.controller.signal.aborted) return
    while (this.active.size < BATHYMETRY_CONFIG.maximumConcurrentValues && this.queue.length) {
      const point = this.queue.shift()!
      const source = this.state.source
      const revision = this.revision
      const signal = this.controller.signal
      const token = Symbol()
      this.active.set(token, revision)
      void this.fetchValue(source, point, signal).then(depth => {
        if (this.disposed || signal.aborted || revision !== this.revision) return
        this.cache.set(`${source}:${point.id}`, { depth, expiresAt: Date.now() + BATHYMETRY_CONFIG.valueCacheMs })
        while (this.cache.size > BATHYMETRY_CONFIG.valueCacheEntries) {
          this.cache.delete(this.cache.keys().next().value!)
        }
        if (depth !== null) this.samples.set(point.id, { ...point, depthMeters: depth })
      }).catch((error: unknown) => {
        if (this.disposed || signal.aborted || revision !== this.revision) return
        this.failure = 'Some depth numbers are unavailable. Move the view or switch DEPTHS off and on to retry.'
        if (error instanceof ProviderError && error.status === 429) {
          this.retryAt.set(source, Date.now() + (error.retryAfterMs ?? BATHYMETRY_CONFIG.rateLimitFallbackMs))
          this.failure = 'Depth numbers are rate limited. Retry later by moving the view or switching DEPTHS off and on.'
          this.queue = []
          this.controller.abort()
          this.finish()
        }
      }).finally(() => {
        this.active.delete(token)
        if (this.disposed) return
        this.pump()
      })
    }
    if (this.queue.length === 0 && ![...this.active.values()].includes(this.revision)) this.finish()
  }

  private finish() {
    clearTimeout(this.timeout)
    this.timeout = undefined
    const samples = [...this.samples.values()]
    this.publish({
      phase: this.failure ? samples.length ? 'partial' : 'unavailable' : samples.length ? 'ready' : 'empty',
      source: this.state.source, samples, message: this.failure,
    })
  }
}
