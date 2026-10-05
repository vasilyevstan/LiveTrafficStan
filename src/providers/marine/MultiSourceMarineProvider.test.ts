import { afterEach, describe, expect, it, vi } from 'vitest'
import { APP_CONFIG } from '../../config/appConfig'
import type { ProviderStatus, Vessel } from '../../domain/traffic'
import type { TrafficQuery } from '../types'
import type { DigitrafficOptions } from './DigitrafficMarineProvider'
import { normalizeAisVessel, normalizeDigitrafficVessel } from './digitrafficNormalization'
import { MultiSourceMarineProvider } from './MultiSourceMarineProvider'

class Controller {
  readonly options: DigitrafficOptions
  readonly start = vi.fn()
  readonly stop = vi.fn()
  readonly setPaused = vi.fn()
  readonly updateQuery = vi.fn((_query: TrafficQuery) => {})
  constructor(options: DigitrafficOptions) { this.options = options }
  snapshot(vessels: Vessel[]) { this.options.callbacks.onSnapshot(vessels) }
  status(status: ProviderStatus) { this.options.callbacks.onStatus(status) }
}
const now = Date.parse('2026-10-05T12:00:00Z')
const query = { center: { latitude: 59.437, longitude: 24.754, label: 'View' }, radiusKm: 20 }
const location = { mmsi: 230123456, latitude: 59.44, longitude: 24.75, observedAt: now - 10_000 }
const baseline = normalizeDigitrafficVessel(
  location, { mmsi: location.mmsi, timestamp: now - 20_000, name: 'EXAMPLE', shipType: 37, referencePointA: 6, referencePointB: 3 },
  now,
)
const recent = normalizeAisVessel(
  { ...location, observedAt: now }, { mmsi: location.mmsi, name: 'EXAMPLE' },
  now, 'AISStream', 'AISStream',
)
const setup = () => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  const controllers: Controller[] = []
  const create = (options: DigitrafficOptions) => {
    const controller = new Controller(options)
    controllers.push(controller)
    return controller
  }
  const callbacks = { onSnapshot: vi.fn(), onStatus: vi.fn() }
  const provider = new MultiSourceMarineProvider(
    { query, config: APP_CONFIG.marine, callbacks },
    { digitraffic: create, supplement: create },
  )
  provider.start()
  return { provider, callbacks, controllers }
}
afterEach(() => vi.useRealTimers())

describe('multi-source marine controller', () => {
  it('adds coverage, keeps existing context, and emits one vessel per MMSI', () => {
    const { provider, controllers, callbacks } = setup()
    controllers[0].snapshot([baseline])
    controllers[1].snapshot([recent, { ...recent, id: 'vessel:230123457', mmsi: 230123457 }])
    const result: Vessel[] = callbacks.onSnapshot.mock.calls.at(-1)![0]
    expect(result).toHaveLength(2)
    expect(result.find((vessel) => vessel.mmsi === location.mmsi)).toMatchObject({
      provider: 'AISStream', lengthMeters: 9, vesselType: 'Pleasure craft',
      position: recent.position,
    })
    provider.stop()
  })

  it('keeps operation truthful and independent when a supplemental feed fails', () => {
    const { provider, controllers, callbacks } = setup()
    controllers[0].snapshot([baseline])
    controllers[0].status({ phase: 'live', paused: false, lastSuccessAt: now })
    controllers[1].status({ phase: 'error', paused: false, error: 'Supplement unavailable' })
    expect(callbacks.onStatus).toHaveBeenLastCalledWith(expect.objectContaining({
      phase: 'live', paused: false, error: 'Supplement unavailable',
    }))
    expect(callbacks.onSnapshot).toHaveBeenLastCalledWith([baseline])
    provider.stop()
  })

  it('does not move an observed vessel backwards when its newest feed disappears', () => {
    const { provider, controllers, callbacks } = setup()
    controllers[1].snapshot([recent])
    controllers[0].snapshot([baseline])
    controllers[1].snapshot([])
    expect(callbacks.onSnapshot.mock.calls.at(-1)![0][0].position.observedAt).toBe(now)
    provider.stop()
  })

  it('reuses controllers for query and pause changes, and fences late callbacks after stop', () => {
    const { provider, controllers, callbacks } = setup()
    provider.updateQuery({ ...query, radiusKm: 25 })
    provider.setPaused(true)
    provider.setPaused(false)
    for (const controller of controllers) {
      expect(controller.start).toHaveBeenCalledTimes(1)
      expect(controller.updateQuery).toHaveBeenCalledTimes(1)
      expect(controller.setPaused.mock.calls).toEqual([[true], [false]])
    }
    provider.stop()
    callbacks.onSnapshot.mockClear()
    controllers[0].snapshot([baseline])
    controllers[1].snapshot([recent])
    expect(callbacks.onSnapshot).not.toHaveBeenCalled()
  })
})
