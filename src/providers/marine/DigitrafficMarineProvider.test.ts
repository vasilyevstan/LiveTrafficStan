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
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ features: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
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
})
