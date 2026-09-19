import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '../errors'
import {
  AwcMetarProvider,
  type AwcMetarProviderConfig,
} from './awcMetarProvider'

const config: AwcMetarProviderConfig = {
  endpointBaseUrl: '/api/weather/metar',
  timeoutMs: 8_000,
  maximumBytes: 256 * 1_024,
  maximumStations: 50,
  futureToleranceMs: 10 * 60_000,
  sourceName: 'NOAA/NWS Aviation Weather Center',
  sourceApiUrl: 'https://aviationweather.gov/api/data/metar',
  sourceDocumentationUrl: 'https://aviationweather.gov/data/api/',
  sourceTermsUrl: 'https://www.weather.gov/disclaimer',
  sourceLicenseName: 'U.S. public domain unless marked otherwise',
}

const report = (
  stationId: string,
  overrides: Record<string, unknown> = {},
) => ({
  icaoId: stationId,
  obsTime: 1_800_000_000,
  temp: 14,
  dewp: 12,
  wdir: 220,
  wspd: 11,
  wgst: null,
  visib: '6+',
  altim: 1005,
  metarType: 'METAR',
  rawOb: `METAR ${stationId} 190720Z 22011KT 9999`,
  lat: 59.413,
  lon: 24.801,
  name: `${stationId} Airport`,
  fltCat: 'VFR',
  ...overrides,
})

const provider = (
  fetchImpl: typeof fetch,
  now = 1_800_000_100_000,
) =>
  new AwcMetarProvider(config, {
    fetchImpl,
    origin: 'https://app.example',
    now: () => now,
  })

describe('AWC METAR provider', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('requests canonical station IDs and normalizes documented field types', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify([
          report('EETN', {
            wdir: 'VRB',
            fltCat: null,
            metarType: 'SPECI',
          }),
          report('EFHK', {
            obsTime: 1_799_999_900,
            visib: 10,
            fltCat: 'MVFR',
          }),
        ]),
        {
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )

    const dataset = await provider(fetchImpl).load(
      ['EETN', 'EFHK'],
      new AbortController().signal,
    )

    expect(fetchImpl).toHaveBeenCalledWith(
      new URL('https://app.example/api/weather/metar?ids=EETN%2CEFHK'),
      expect.objectContaining({
        method: 'GET',
        credentials: 'omit',
        redirect: 'error',
        headers: { Accept: 'application/json' },
      }),
    )
    expect(dataset.observations).toEqual([
      expect.objectContaining({
        stationId: 'EETN',
        id: 'weather:EETN',
        observedAt: 1_800_000_000_000,
        reportType: 'SPECI',
        flightCategory: 'UNKNOWN',
        windDirection: 'VRB',
        visibility: '6+',
      }),
      expect.objectContaining({
        stationId: 'EFHK',
        flightCategory: 'MVFR',
        visibility: 10,
      }),
    ])
  })

  it('treats 204 and an empty JSON array as successful empty results', async () => {
    await expect(
      provider(async () => new Response(null, { status: 204 })).load(
        ['EETN'],
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ observations: [] })

    await expect(
      provider(async () => new Response('[]')).load(
        ['EETN'],
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ observations: [] })
  })

  it('rejects empty, partial, and cross-origin successful responses', async () => {
    await expect(
      provider(async () => new Response('')).load(
        ['EETN'],
        new AbortController().signal,
      ),
    ).rejects.toThrow('empty HTTP 200 body')

    await expect(
      provider(async () =>
        new Response(JSON.stringify([report('EETN')]), {
          status: 206,
        }),
      ).load(['EETN'], new AbortController().signal),
    ).rejects.toMatchObject({ status: 206 })

    const fetchImpl = vi.fn()
    await expect(
      new AwcMetarProvider(
        {
          ...config,
          endpointBaseUrl: 'https://collector.example/metar',
        },
        {
          fetchImpl,
          origin: 'https://app.example',
        },
      ).load(['EETN'], new AbortController().signal),
    ).rejects.toThrow('must remain same-origin')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('keeps the newest valid report and rejects unrequested stations', async () => {
    const dataset = await provider(async () =>
      new Response(
        JSON.stringify([
          report('EETN', { obsTime: 1_799_999_900 }),
          report('EETN', {
            obsTime: 1_800_000_000,
            rawOb: 'METAR EETN NEWER',
          }),
        ]),
      ),
    ).load(['EETN'], new AbortController().signal)
    expect(dataset.observations).toHaveLength(1)
    expect(dataset.observations[0]?.rawObservation).toBe('METAR EETN NEWER')

    await expect(
      provider(async () =>
        new Response(JSON.stringify([report('EFHK')])),
      ).load(['EETN'], new AbortController().signal),
    ).rejects.toThrow('unrequested station EFHK')
  })

  it('rejects noncanonical input, malformed nonempty data, and oversized responses', async () => {
    const fetchImpl = vi.fn()
    const instance = provider(fetchImpl)
    await expect(
      instance.load(['EFHK', 'EETN'], new AbortController().signal),
    ).rejects.toThrow('station IDs are invalid')
    expect(fetchImpl).not.toHaveBeenCalled()

    await expect(
      provider(async () => new Response('[{"bad":true}]')).load(
        ['EETN'],
        new AbortController().signal,
      ),
    ).rejects.toThrow('no valid observations')

    await expect(
      new AwcMetarProvider(
        { ...config, maximumBytes: 8 },
        {
          fetchImpl: async () => new Response('123456789'),
          origin: 'https://app.example',
        },
      ).load(['EETN'], new AbortController().signal),
    ).rejects.toThrow('oversized response')
  })

  it('ignores unsupported report types and future reports', async () => {
    await expect(
      provider(async () =>
        new Response(
          JSON.stringify([
            report('EETN', { metarType: 'SYNOP' }),
            report('EETN', { obsTime: 1_800_001_000 }),
          ]),
        ),
      ).load(['EETN'], new AbortController().signal),
    ).rejects.toThrow('no valid observations')
  })

  it('preserves HTTP status and Retry-After guidance', async () => {
    const error = await provider(async () =>
      new Response('slow down', {
        status: 429,
        headers: { 'Retry-After': '30' },
      }),
    )
      .load(['EETN'], new AbortController().signal)
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ProviderError)
    expect(error).toMatchObject({ status: 429, retryAfterMs: 30_000 })
  })

  it('times out, propagates cancellation, and does not start aborted work', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true },
          )
        }),
    )
    const instance = new AwcMetarProvider(
      { ...config, timeoutMs: 100 },
      {
        fetchImpl,
        origin: 'https://app.example',
      },
    )
    const pending = instance.load(
      ['EETN'],
      new AbortController().signal,
    )
    const timeoutExpectation = expect(pending).rejects.toThrow(
      'timed out after 100 ms',
    )
    await vi.advanceTimersByTimeAsync(100)
    await timeoutExpectation

    const controller = new AbortController()
    const canceled = instance.load(['EETN'], controller.signal)
    controller.abort()
    await expect(canceled).rejects.toMatchObject({ name: 'AbortError' })

    const alreadyCanceled = new AbortController()
    alreadyCanceled.abort()
    const callsBefore = fetchImpl.mock.calls.length
    await expect(
      instance.load(['EETN'], alreadyCanceled.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchImpl).toHaveBeenCalledTimes(callsBefore)
  })
})
