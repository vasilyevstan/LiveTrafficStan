import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppConfig } from '../../config/appConfig'
import type { TrafficQuery } from '../types'
import { DigitrafficMarineProvider } from './DigitrafficMarineProvider'

const query = (
  latitude: number,
  longitude: number,
): TrafficQuery => ({
  center: { latitude, longitude, label: 'Area' },
  radiusKm: 20,
})

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('DigitrafficMarineProvider query updates', () => {
  it('reuses MQTT and gates query-triggered REST snapshots', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
    })
    const fetchMock = vi.fn((input: string | URL | Request) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            String(input).endsWith('/api/ais/v1/vessels')
              ? []
              : { features: [] },
          ),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const config = createAppConfig({}).marine
    const provider = new DigitrafficMarineProvider({
      config,
      query: query(59.437, 24.754),
      callbacks: {
        onSnapshot: vi.fn(),
        onStatus: vi.fn(),
      },
    })
    const internals = provider as unknown as {
      connectMqtt: () => Promise<void>
      refreshMetadata: () => Promise<void>
    }
    const connectMqtt = vi
      .spyOn(internals, 'connectMqtt')
      .mockResolvedValue()
    vi.spyOn(internals, 'refreshMetadata').mockResolvedValue()

    provider.start()
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(connectMqtt).toHaveBeenCalledTimes(1)

    provider.updateQuery(query(59.5, 24.8))
    provider.updateQuery(query(59.6, 24.9))
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(connectMqtt).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(config.queryRestRefreshIntervalMs)
    provider.updateQuery(query(59.7, 25))
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(connectMqtt).toHaveBeenCalledTimes(1)
    provider.stop()
  })

  it('preserves REST, metadata, and MQTT gates across pause and resume', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
    })
    const fetchMock = vi.fn((input: string | URL | Request) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            String(input).endsWith('/api/ais/v1/vessels')
              ? []
              : { features: [] },
          ),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const config = createAppConfig({}).marine
    const provider = new DigitrafficMarineProvider({
      config,
      query: query(59.437, 24.754),
      callbacks: {
        onSnapshot: vi.fn(),
        onStatus: vi.fn(),
      },
    })
    const internals = provider as unknown as {
      openMqttClient: (generation: number) => Promise<void>
    }
    const openMqttClient = vi
      .spyOn(internals, 'openMqttClient')
      .mockResolvedValue()

    provider.start()
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(openMqttClient).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(5_000)
    provider.setPaused(true)
    provider.setPaused(false)
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(openMqttClient).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(9_999)
    expect(openMqttClient).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(openMqttClient).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(
      config.queryRestRefreshIntervalMs - 15_000,
    )
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(openMqttClient).toHaveBeenCalledTimes(2)
    provider.stop()
  })

  it('does not publish late REST work after a pause', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
    })
    const responses: Array<(response: Response) => void> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            responses.push(resolve)
          }),
      ),
    )

    const onSnapshot = vi.fn()
    const onStatus = vi.fn()
    const provider = new DigitrafficMarineProvider({
      config: createAppConfig({}).marine,
      query: query(59.437, 24.754),
      callbacks: { onSnapshot, onStatus },
    })
    const internals = provider as unknown as {
      openMqttClient: (generation: number) => Promise<void>
    }
    vi.spyOn(internals, 'openMqttClient').mockResolvedValue()

    provider.start()
    await flush()
    expect(responses).toHaveLength(2)
    expect(onSnapshot).toHaveBeenCalledTimes(1)

    provider.setPaused(true)
    for (const resolve of responses) {
      resolve(
        new Response(JSON.stringify({ features: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }
    await flush()

    expect(onSnapshot).toHaveBeenCalledTimes(1)
    expect(onStatus.mock.calls.at(-1)?.[0]).toMatchObject({ paused: true })
    provider.stop()
  })

  it('keeps a resumed stream connecting until MQTT succeeds again', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_800_000_000_000)
    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
    })
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL | Request) =>
        Promise.resolve(
          new Response(
            JSON.stringify(
              String(input).endsWith('/api/ais/v1/vessels')
                ? []
                : { features: [] },
            ),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
        ),
      ),
    )

    const onStatus = vi.fn()
    const provider = new DigitrafficMarineProvider({
      config: createAppConfig({}).marine,
      query: query(59.437, 24.754),
      callbacks: {
        onSnapshot: vi.fn(),
        onStatus,
      },
    })
    const internals = provider as unknown as {
      openMqttClient: (generation: number) => Promise<void>
      noteLiveSuccess: () => void
      noteRestSuccess: () => void
    }
    vi.spyOn(internals, 'openMqttClient').mockResolvedValue()

    provider.start()
    await flush()
    internals.noteLiveSuccess()
    expect(onStatus.mock.calls.at(-1)?.[0]).toMatchObject({
      phase: 'live',
      paused: false,
    })

    provider.setPaused(true)
    provider.setPaused(false)
    await flush()
    internals.noteRestSuccess()

    expect(onStatus.mock.calls.at(-1)?.[0]).toMatchObject({
      phase: 'loading',
      paused: false,
      updating: false,
    })

    internals.noteLiveSuccess()
    expect(onStatus.mock.calls.at(-1)?.[0]).toMatchObject({
      phase: 'live',
      paused: false,
    })
    provider.stop()
  })

  it('measures the existing MQTT path without starting another connection', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_800_000_000_000)
    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
    })
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL | Request) =>
        Promise.resolve(
          new Response(
            JSON.stringify(
              String(input).endsWith('/api/ais/v1/vessels')
                ? []
                : { features: [] },
            ),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
        ),
      ),
    )

    const onDiagnostics = vi.fn()
    const provider = new DigitrafficMarineProvider({
      config: createAppConfig({}).marine,
      query: query(59.437, 24.754),
      callbacks: {
        onSnapshot: vi.fn(),
        onStatus: vi.fn(),
      },
      diagnostics: {
        sampleIntervalMs: 0,
        onSnapshot: onDiagnostics,
      },
    })
    const internals = provider as unknown as {
      openMqttClient: (generation: number) => Promise<void>
      handleMqttMessage: (topic: string, payload: Uint8Array) => void
    }
    const openMqttClient = vi
      .spyOn(internals, 'openMqttClient')
      .mockResolvedValue()
    const encode = (value: unknown) =>
      new TextEncoder().encode(JSON.stringify(value))
    const payloads = [
      encode({
        timestamp: 1_800_000_000_000,
        name: 'ÅLAND 🚢',
        refA: 60,
        refB: 20,
      }),
      encode({
        time: 1_800_000_000,
        lat: 59.44,
        lon: 24.75,
        sog: 10,
      }),
      encode({
        time: 1_800_000_001,
        lat: 59.45,
        lon: 24.76,
        sog: 11,
      }),
      new TextEncoder().encode('{'),
      encode({ updated: 1_800_000_001 }),
    ]

    provider.start()
    await flush()
    expect(openMqttClient).toHaveBeenCalledTimes(1)

    internals.handleMqttMessage(
      'vessels-v2/230123456/metadata',
      payloads[0]!,
    )
    internals.handleMqttMessage(
      'vessels-v2/230123456/location',
      payloads[1]!,
    )
    internals.handleMqttMessage(
      'vessels-v2/230123456/location',
      payloads[2]!,
    )
    internals.handleMqttMessage(
      'vessels-v2/230123456/location',
      payloads[3]!,
    )
    internals.handleMqttMessage('vessels-v2/status', payloads[4]!)

    await vi.advanceTimersByTimeAsync(1_000)

    const snapshot = onDiagnostics.mock.calls.at(-1)?.[0]
    expect(snapshot).toMatchObject({
      messages: {
        total: 5,
        accepted: 4,
        invalid: 1,
        payloadBytes: payloads.reduce(
          (total, payload) => total + payload.byteLength,
          0,
        ),
        byKind: {
          location: 3,
          metadata: 1,
          status: 1,
          other: 0,
        },
      },
      batching: {
        scheduledFlushes: 1,
        messagesProcessedByFlush: 3,
        maxMessagesPerFlush: 3,
      },
      cache: {
        locations: 1,
        maxLocations: 1,
        metadata: 1,
        maxMetadata: 1,
      },
    })
    expect(openMqttClient).toHaveBeenCalledTimes(1)

    provider.stop()
    const callsAfterStop = onDiagnostics.mock.calls.length
    provider.stop()
    internals.handleMqttMessage(
      'vessels-v2/230123456/location',
      payloads[1]!,
    )
    expect(onDiagnostics).toHaveBeenCalledTimes(callsAfterStop)
  })
})
