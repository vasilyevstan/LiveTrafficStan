import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MARINE_STREAM_CONFIG } from '../../config/marineStreamConfig'
import type { ProviderStatus, Vessel } from '../../domain/traffic'
import { normalizeAisVessel } from './digitrafficNormalization'
import { MarineStreamProvider, type MarineBrowserSocket } from './MarineStreamProvider'

class Socket extends EventTarget implements MarineBrowserSocket {
  sent: unknown[] = []
  closed = false
  send(value: string) { this.sent.push(JSON.parse(value)) }
  close() { this.closed = true; this.dispatchEvent(new Event('close')) }
  open() { this.dispatchEvent(new Event('open')) }
  receive(value: unknown) {
    this.dispatchEvent(Object.assign(new Event('message'), { data: JSON.stringify(value) }))
  }
}
const now = Date.parse('2026-10-05T12:00:00Z')
const query = {
  center: { latitude: 59.437, longitude: 24.754, label: 'Private Home label' },
  radiusKm: 20,
}
const vessel = normalizeAisVessel(
  { mmsi: 230123456, latitude: 59.44, longitude: 24.75, observedAt: now },
  { mmsi: 230123456, name: 'EXAMPLE', shipType: 37, lengthMeters: 9 },
  now, 'AISStream', 'AISStream',
)
const snapshot = (revision = 1, sequence = 1) => ({
  version: 1, type: 'snapshot', revision, sequence, vessels: [vessel],
  sources: [
    { source: 'aisstream', phase: 'live', paused: false, lastSuccessAt: now },
    { source: 'openwaters', phase: 'live', paused: false, lastSuccessAt: now },
  ],
})

const setup = () => {
  const sockets: Socket[] = []
  const connect = vi.fn(() => {
    const socket = new Socket()
    sockets.push(socket)
    return socket
  })
  const callbacks = {
    onSnapshot: vi.fn<(vessels: Vessel[]) => void>(),
    onStatus: vi.fn<(status: ProviderStatus) => void>(),
  }
  const provider = new MarineStreamProvider({ query, callbacks, connect })
  return { provider, sockets, connect, callbacks }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  vi.stubGlobal('window', {
    location: { href: 'https://app.example/?private-search=hidden' },
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('same-origin marine stream lifecycle', () => {
  it('sends only the rounded view, accepts normalized data and acknowledges delivery', async () => {
    const { provider, connect, sockets, callbacks } = setup()
    provider.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(connect).toHaveBeenCalledWith('wss://app.example/api/marine/stream')
    sockets[0].open()
    expect(sockets[0].sent[0]).toEqual({
      version: 1, type: 'view', revision: 1,
      center: { latitude: 59.437, longitude: 24.754 }, radiusKm: 20,
    })
    sockets[0].receive(snapshot())
    expect(callbacks.onSnapshot).toHaveBeenLastCalledWith([vessel])
    expect(sockets[0].sent.at(-1)).toEqual({ version: 1, type: 'ack', sequence: 1 })
    expect(callbacks.onStatus).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'live' }))
    provider.stop()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('coalesces camera changes without reconnecting and fences obsolete revisions', async () => {
    const { provider, sockets, connect, callbacks } = setup()
    provider.start()
    await vi.advanceTimersByTimeAsync(0)
    sockets[0].open()
    provider.updateQuery({ ...query, radiusKm: 25 })
    provider.updateQuery({ ...query, radiusKm: 30 })
    callbacks.onSnapshot.mockClear()
    sockets[0].receive(snapshot(1, 1))
    expect(callbacks.onSnapshot).not.toHaveBeenCalled()
    expect(sockets[0].sent.at(-1)).toEqual({ version: 1, type: 'ack', sequence: 1 })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(connect).toHaveBeenCalledTimes(1)
    expect(sockets[0].sent.at(-1)).toMatchObject({ type: 'view', revision: 3, radiusKm: 30 })
    sockets[0].receive(snapshot(3, 2))
    expect(callbacks.onSnapshot).toHaveBeenCalledWith([vessel])
    provider.stop()
  })

  it('preserves retry deadlines across pause and rejects old-socket callbacks', async () => {
    const { provider, sockets, connect, callbacks } = setup()
    provider.start()
    await vi.advanceTimersByTimeAsync(0)
    sockets[0].open()
    sockets[0].receive({
      version: 1, type: 'retry', retryAt: now + 300_000, error: 'Capacity exhausted',
    })
    provider.setPaused(true)
    provider.setPaused(false)
    callbacks.onSnapshot.mockClear()
    sockets[0].receive(snapshot())
    expect(callbacks.onSnapshot).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(299_999)
    expect(connect).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(connect).toHaveBeenCalledTimes(2)
    provider.stop()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('retains unexpired observations and metadata through an empty cold relay reconnect', async () => {
    const { provider, sockets, callbacks } = setup()
    provider.start()
    await vi.advanceTimersByTimeAsync(0)
    sockets[0].open()
    sockets[0].receive(snapshot())
    sockets[0].close()
    await vi.advanceTimersByTimeAsync(15_000)
    sockets[1].open()
    sockets[1].receive({
      ...snapshot(2, 1),
      vessels: [],
      sources: [
        { source: 'aisstream', phase: 'loading', paused: false },
        { source: 'openwaters', phase: 'loading', paused: false },
      ],
    })
    expect(callbacks.onSnapshot).toHaveBeenLastCalledWith([vessel])
    const positionOnly = normalizeAisVessel(
      { mmsi: vessel.mmsi, latitude: 59.441, longitude: 24.75, observedAt: now + 15_000 },
      undefined, now + 15_000, 'AISStream', 'AISStream',
    )
    sockets[1].receive({ ...snapshot(2, 2), vessels: [positionOnly] })
    expect(callbacks.onSnapshot).toHaveBeenLastCalledWith([
      expect.objectContaining({
        name: 'EXAMPLE', lengthMeters: 9, vesselType: 'Pleasure craft',
        position: positionOnly.position,
      }),
    ])
    await vi.advanceTimersByTimeAsync(600_001)
    sockets[1].receive({ ...snapshot(2, 3), vessels: [] })
    expect(callbacks.onSnapshot).toHaveBeenLastCalledWith([])
    provider.stop()
  })

  it('does not retain observations outside a newly requested view', async () => {
    const { provider, sockets, callbacks } = setup()
    provider.start()
    await vi.advanceTimersByTimeAsync(0)
    sockets[0].open()
    sockets[0].receive(snapshot())
    provider.updateQuery({
      ...query, center: { latitude: 54.8, longitude: 13, label: 'New view' },
    })
    await vi.advanceTimersByTimeAsync(1_000)
    sockets[0].receive({ ...snapshot(2, 2), vessels: [] })
    expect(callbacks.onSnapshot).toHaveBeenLastCalledWith([])
    provider.stop()
  })

  it('does not extend borrowed metadata across repeated reconnects', async () => {
    const { provider, sockets, callbacks } = setup()
    provider.start()
    await vi.advanceTimersByTimeAsync(0)
    sockets[0].open()
    sockets[0].receive(snapshot())
    for (let index = 1; index <= 2; index += 1) {
      sockets[index - 1].close()
      await vi.advanceTimersByTimeAsync(15_000)
      sockets[index].open()
      sockets[index].receive({
        ...snapshot(index + 1, 1),
        vessels: [normalizeAisVessel(
          { mmsi: vessel.mmsi, latitude: 59.44, longitude: 24.75, observedAt: Date.now() },
          undefined, Date.now(), 'AISStream', 'AISStream',
        )],
      })
      expect(callbacks.onSnapshot.mock.lastCall?.[0][0].lengthMeters).toBe(9)
    }
    vi.setSystemTime(now + 600_001)
    sockets[2].receive({
      ...snapshot(3, 2),
      vessels: [normalizeAisVessel(
        { mmsi: vessel.mmsi, latitude: 59.44, longitude: 24.75, observedAt: Date.now() },
        undefined, Date.now(), 'AISStream', 'AISStream',
      )],
    })
    expect(callbacks.onSnapshot.mock.lastCall?.[0][0].lengthMeters).toBeUndefined()
    expect(callbacks.onSnapshot.mock.lastCall?.[0][0].vesselType).toBeUndefined()
    provider.stop()
  })

  it('bounds combined retained and newly received observations to the record limit', async () => {
    const { provider, sockets, callbacks } = setup()
    provider.start()
    await vi.advanceTimersByTimeAsync(0)
    sockets[0].open()
    sockets[0].receive(snapshot())
    sockets[0].close()
    await vi.advanceTimersByTimeAsync(15_000)
    sockets[1].open()
    const vessels = Array.from({ length: MARINE_STREAM_CONFIG.maximumRecords }, (_, index) => {
      const mmsi = vessel.mmsi + index + 1
      return { ...vessel, id: `vessel:${mmsi}`, mmsi }
    })
    sockets[1].receive({ ...snapshot(2, 1), vessels })
    expect(callbacks.onSnapshot.mock.lastCall?.[0]).toHaveLength(MARINE_STREAM_CONFIG.maximumRecords)
    expect(callbacks.onSnapshot.mock.lastCall?.[0].some((value) => value.id === vessel.id)).toBe(false)
    provider.stop()
  })

  it('does not open a connection while initially paused', async () => {
    const { provider, connect } = setup()
    provider.start(true)
    provider.updateQuery({ ...query, radiusKm: 30 })
    await vi.advanceTimersByTimeAsync(30_000)
    expect(connect).not.toHaveBeenCalled()
    provider.stop()
  })

  it('rejects malformed or replayed frames rather than replacing current observations', async () => {
    const { provider, sockets, callbacks } = setup()
    provider.start()
    await vi.advanceTimersByTimeAsync(0)
    sockets[0].open()
    sockets[0].receive(snapshot(1, 2))
    callbacks.onSnapshot.mockClear()
    sockets[0].receive(snapshot(1, 1))
    expect(callbacks.onSnapshot).not.toHaveBeenCalled()
    sockets[0].receive({ ...snapshot(1, 3), vessels: [{ ...vessel, mmsi: 230123457 }] })
    expect(sockets[0].closed).toBe(true)
    expect(callbacks.onStatus).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'error' }))
    provider.stop()
  })
})
