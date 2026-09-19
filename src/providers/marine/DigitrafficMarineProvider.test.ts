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
})
