import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '../src/providers/errors.js'
import type { Vessel } from '../src/domain/traffic.js'
import { normalizeAisVessel } from '../src/providers/marine/digitrafficNormalization.js'
import { MarineStreamProvider } from '../src/providers/marine/MarineStreamProvider.js'
import { parseMarineStreamSnapshot } from '../src/providers/marine/marineStreamProtocol.js'
import type { MarineStreamSource } from '../src/providers/marine/marineSourceNormalization.js'
import {
  MarineStreamHub,
  type MarineRetryState,
  type MarineRuntimeState,
  type MarineSocket,
  type MarineUpstreamSocket,
} from './marineStreamHub.js'

class Socket extends EventTarget implements MarineUpstreamSocket {
  binaryType = 'arraybuffer'
  readonly sent: Record<string, unknown>[] = []
  readonly close = vi.fn(() => this.dispatchEvent(new Event('close')))
  readonly accept = vi.fn()
  acknowledge = false
  send(value: string) {
    const parsed = JSON.parse(value)
    this.sent.push(parsed)
    if (this.acknowledge && parsed.type === 'snapshot') {
      queueMicrotask(() => this.receive({ version: 1, type: 'ack', sequence: parsed.sequence }))
    }
  }
  receive(value: unknown) {
    this.dispatchEvent(Object.assign(new Event('message'), { data: JSON.stringify(value) }))
  }
}

class State implements MarineRuntimeState {
  used = 0
  maximum = Infinity
  retries = new Map<MarineStreamSource, MarineRetryState>()
  consume(messages: number) {
    if (this.used + messages > this.maximum) return false
    this.used += messages
    return true
  }
  readRetry(source: MarineStreamSource) {
    return { ...(this.retries.get(source) ?? { notBefore: 0, failures: 0 }) }
  }
  writeRetry(source: MarineStreamSource, retry: MarineRetryState) {
    this.retries.set(source, { ...retry })
  }
}

const now = Date.parse('2026-10-05T12:00:00Z')
const view = (revision = 1, longitude = 24.754) => ({
  version: 1, type: 'view', revision,
  center: { latitude: 59.437, longitude }, radiusKm: 20,
})
const position = (time = now) => ({
  MessageType: 'StandardClassBPositionReport',
  Message: {
    StandardClassBPositionReport: {
      MessageID: 18, UserID: 230123456, Valid: true,
      Latitude: 59.44, Longitude: 24.75, Sog: 0, Cog: 360, TrueHeading: 511,
    },
  },
  MetaData: { MMSI: 230123456, ShipName: 'EXAMPLE', time_utc: new Date(time).toISOString() },
})

const setup = () => {
  const state = new State()
  const upstreams = { aisstream: new Socket(), openwaters: new Socket() }
  const connect = vi.fn(async (source: MarineStreamSource) => upstreams[source])
  const metadata = vi.fn().mockResolvedValue({
    type: 'FeatureCollection', features: [], attribution: {},
  })
  const hub = new MarineStreamHub({
    state, connect, metadata, aisstreamKey: 'test-aisstream-key',
    openWatersToken: 'test-openwaters-token',
  })
  const client = new Socket()
  client.acknowledge = true
  hub.addClient(client)
  client.receive(view())
  const ready = async () => {
    await vi.advanceTimersByTimeAsync(0)
    upstreams.aisstream.receive({
      MessageType: 'SubscriptionConfirmation', Message: { CompressionEnabled: true },
    })
    upstreams.openwaters.receive({ type: 'welcome', role: 'personal', limits: { area: 400 } })
    await vi.advanceTimersByTimeAsync(0)
  }
  return { state, upstreams, connect, metadata, hub, client, ready }
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  vi.spyOn(Math, 'random').mockReturnValue(0)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('shared marine subscriptions', () => {
  it('does not revive retained browser metadata after a newer native unavailable report', async () => {
    vi.stubGlobal('window', { location: { href: 'https://app.example/' } })
    const { hub, client, upstreams, ready } = setup()
    await ready()
    const staticReport = (available: boolean) => ({
      MessageType: 'ShipStaticData',
      Message: { ShipStaticData: {
        MessageID: 5, UserID: 230123456, Valid: true, Name: 'EXAMPLE',
        Type: available ? 37 : 0,
        Dimension: available ? { A: 6, B: 3, C: 2, D: 1 } : { A: 0, B: 0, C: 0, D: 0 },
      } },
      MetaData: { MMSI: 230123456, time_utc: new Date(Date.now()).toISOString() },
    })
    const relaySnapshot = () => {
      const frame = parseMarineStreamSnapshot(client.sent.at(-1))
      if (!frame) throw new Error('Expected a complete relay snapshot')
      return frame
    }
    upstreams.aisstream.receive(position())
    upstreams.aisstream.receive(staticReport(true))
    await vi.advanceTimersByTimeAsync(1_000)
    const original = relaySnapshot()
    expect(original.vessels[0]).toMatchObject({
      lengthMeters: 9, vesselType: 'Pleasure craft', metadataObservedAt: now,
    })
    const sockets: Socket[] = []
    const onSnapshot = vi.fn<(vessels: Vessel[]) => void>()
    const browser = new MarineStreamProvider({
      query: { center: { ...view().center, label: 'View' }, radiusKm: 20 },
      callbacks: { onSnapshot, onStatus: vi.fn() },
      connect: () => {
        const socket = new Socket()
        sockets.push(socket)
        return socket
      },
    })
    const positionOnly = () => normalizeAisVessel(
      { mmsi: 230123456, latitude: 59.44, longitude: 24.75, observedAt: Date.now() },
      undefined, Date.now(), 'AISStream', 'AISStream',
    )
    browser.start()
    await vi.advanceTimersByTimeAsync(0)
    sockets[0].dispatchEvent(new Event('open'))
    sockets[0].receive({ ...original, revision: 1, sequence: 1 })
    sockets[0].close()
    await vi.advanceTimersByTimeAsync(15_000)
    sockets[1].dispatchEvent(new Event('open'))
    sockets[1].receive({ ...original, revision: 2, sequence: 1, vessels: [positionOnly()] })
    expect(onSnapshot.mock.lastCall?.[0][0]).toMatchObject({
      lengthMeters: 9, vesselType: 'Pleasure craft',
    })

    upstreams.aisstream.receive(position(Date.now()))
    upstreams.aisstream.receive(staticReport(false))
    await vi.advanceTimersByTimeAsync(1_000)
    const unavailable = relaySnapshot()
    expect(unavailable.vessels[0].metadataObservedAt).toBe(now + 16_000)
    expect(unavailable.vessels[0].lengthMeters).toBeUndefined()
    expect(unavailable.vessels[0].vesselType).toBeUndefined()
    sockets[1].receive({ ...unavailable, revision: 2, sequence: 2 })
    expect(onSnapshot.mock.lastCall?.[0][0].lengthMeters).toBeUndefined()
    expect(onSnapshot.mock.lastCall?.[0][0].vesselType).toBeUndefined()
    expect(onSnapshot.mock.lastCall?.[0][0].metadataObservedAt).toBe(now + 16_000)

    sockets[1].close()
    await vi.advanceTimersByTimeAsync(15_000)
    sockets[2].dispatchEvent(new Event('open'))
    sockets[2].receive({ ...unavailable, revision: 3, sequence: 1, vessels: [positionOnly()] })
    expect(onSnapshot.mock.lastCall?.[0][0].lengthMeters).toBeUndefined()
    expect(onSnapshot.mock.lastCall?.[0][0].vesselType).toBeUndefined()
    browser.stop()
    hub.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps one connection per provider and never replaces another viewer interest', async () => {
    const { hub, client, upstreams, connect, ready } = setup()
    await ready()
    const other = new Socket()
    other.acknowledge = true
    hub.addClient(other)
    other.receive(view(1, 25.754))
    await vi.advanceTimersByTimeAsync(1_000)
    expect(connect).toHaveBeenCalledTimes(2)
    expect(upstreams.aisstream.sent.at(-1)?.BoundingBoxes).toHaveLength(2)
    expect(upstreams.openwaters.sent.at(-1)?.bbox).toHaveLength(2)
    expect(JSON.stringify(client.sent)).not.toContain('test-aisstream-key')
    expect(JSON.stringify(client.sent)).not.toContain('test-openwaters-token')
    hub.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('enriches a current observation without manufacturing a position from REST', async () => {
    const { hub, client, upstreams, metadata, ready } = setup()
    metadata.mockResolvedValue({
      type: 'FeatureCollection', attribution: { aishub: 'Open Waters AIS. AISHub' },
      features: [{
        id: 230123456, geometry: { type: 'Point', coordinates: [24.75, 59.44] },
        properties: {
          mmsi: 230123456, kind: 'vessel', source: 'aishub',
          name: 'EXAMPLE', type: 37, length: 9, beam: 3,
          seen: new Date(now).toISOString(),
        },
      }],
    })
    await ready()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(client.sent.at(-1)?.vessels).toEqual([])
    upstreams.aisstream.receive(position())
    await vi.advanceTimersByTimeAsync(1_000)
    expect(client.sent.at(-1)?.vessels).toEqual([
      expect.objectContaining({
        provider: 'AISStream', vesselType: 'Pleasure craft', lengthMeters: 9,
        position: { latitude: 59.44, longitude: 24.75, observedAt: now },
      }),
    ])
    hub.dispose()
  })

  it('bounds client queues and closes only a client that does not acknowledge', async () => {
    const { hub, client, ready } = setup()
    await ready()
    const slow = new Socket()
    hub.addClient(slow)
    slow.receive(view())
    await vi.advanceTimersByTimeAsync(9_000)
    expect(slow.sent).toHaveLength(1)
    expect(slow.close).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(slow.close).toHaveBeenCalled()
    expect(client.close).not.toHaveBeenCalled()
    expect(hub.clientCount).toBe(1)
    hub.dispose()
  })

  it('does not shorten provider Retry-After when the view changes', async () => {
    const { hub, client, metadata, ready } = setup()
    metadata.mockRejectedValue(new ProviderError('limited', 429, 120_000))
    await ready()
    expect(metadata).toHaveBeenCalledTimes(1)
    client.receive(view(2, 25.754))
    await vi.advanceTimersByTimeAsync(119_999)
    expect(metadata).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(metadata).toHaveBeenCalledTimes(2)
    hub.dispose()
  })

  it('communicates the free-budget pause instead of reconnecting or spending the reserve', async () => {
    const { hub, client, upstreams, state, ready } = setup()
    await ready()
    state.maximum = state.used
    upstreams.aisstream.receive(position())
    expect(client.sent.at(-1)).toMatchObject({
      type: 'retry', retryAt: Date.parse('2026-10-06T00:00:00Z'),
    })
    expect(hub.clientCount).toBe(0)
    expect(upstreams.aisstream.close).toHaveBeenCalled()
    expect(upstreams.openwaters.close).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('closes an obsolete late handshake without accepting its data', async () => {
    const state = new State()
    let resolve: ((socket: MarineUpstreamSocket) => void) | undefined
    const late = new Promise<MarineUpstreamSocket>((done) => { resolve = done })
    const hub = new MarineStreamHub({
      state, aisstreamKey: 'test', connect: () => late,
      metadata: async () => ({ type: 'FeatureCollection', features: [] }),
    })
    const client: MarineSocket = new Socket()
    hub.addClient(client)
    if (client instanceof Socket) client.receive(view())
    await vi.advanceTimersByTimeAsync(0)
    hub.dispose()
    const socket = new Socket()
    resolve!(socket)
    await vi.advanceTimersByTimeAsync(0)
    expect(socket.close).toHaveBeenCalled()
    expect(socket.sent).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })
})
