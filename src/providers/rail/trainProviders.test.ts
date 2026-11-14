import { describe, expect, it, vi } from 'vitest'
import { TRAIN_CONFIG } from '../../config/appConfig'
import { ProviderError } from '../errors'
import {
  createTrainProviders,
  parseEnturTrains,
  parseFintrafficTrains,
  parseLirrTrains,
  parseMbtaTrains,
  type TrainFetch,
} from './trainProviders'

const retrievedAt = Date.parse('2026-11-14T13:25:00.000Z')
const context = (sourceId: 'fintraffic' | 'entur' | 'mbta' | 'lirr', maximumTrains = 10) => ({
  sourceId,
  retrievedAt,
  futureToleranceMs: 60_000,
  maximumTrains,
})

const fintrafficTrain = (overrides: Record<string, unknown> = {}, location: Record<string, unknown> = {}) => ({
  trainNumber: 5,
  departureDate: '2026-11-14',
  operator: { shortCode: 'vr', name: 'VR-Yhtymä Oyj' },
  trainType: { name: 'IC', trainCategory: { name: 'Long-distance' } },
  commuterLineid: '',
  trainLocations: [{
    timestamp: '2026-11-14T13:24:07.000Z',
    speed: 149,
    location: [28.195612, 61.048172],
    ...location,
  }],
  ...overrides,
})

describe('Fintraffic train parsing', () => {
  it('keeps the source position clock, date-scoped identity, and reported category', () => {
    const trains = parseFintrafficTrains({ data: { currentlyRunningTrains: [
      fintrafficTrain(),
      fintrafficTrain({
        trainNumber: 9671,
        trainType: { name: 'HL', trainCategory: { name: 'Commuter' } },
        commuterLineid: 'R',
      }),
      fintrafficTrain({ trainNumber: 3011, trainType: { name: 'T', trainCategory: { name: 'Cargo' } } }),
      fintrafficTrain({ trainNumber: 77, trainType: { name: 'VET', trainCategory: { name: 'Locomotive' } } }),
    ] } }, context('fintraffic'))

    expect(trains[0]).toEqual({
      id: 'train:fintraffic:2026-11-14:5',
      sourceId: 'fintraffic',
      name: 'IC 5',
      category: 'long-distance',
      longitude: 28.195612,
      latitude: 61.048172,
      observedAt: Date.parse('2026-11-14T13:24:07.000Z'),
      trainNumber: '5',
      operator: 'VR-Yhtymä Oyj',
      speedKph: 149,
    })
    expect(trains.map((train) => train.category)).toEqual([
      'long-distance', 'commuter', 'freight', 'other',
    ])
    expect(trains[1]).toMatchObject({ name: 'HL 9671', line: 'R' })
    expect(trains[0]).not.toHaveProperty('courseDegrees')
  })

  it('drops invalid coordinates, missing clocks, and future clocks; keeps the newest duplicate', () => {
    const trains = parseFintrafficTrains({ data: { currentlyRunningTrains: [
      fintrafficTrain({ trainNumber: 1 }, { location: [0, 0] }),
      fintrafficTrain({ trainNumber: 2 }, { location: [200, 61] }),
      fintrafficTrain({ trainNumber: 3 }, { timestamp: 'not a date' }),
      fintrafficTrain({ trainNumber: 4 }, { timestamp: '2026-11-14T13:26:01.000Z' }),
      fintrafficTrain({ trainNumber: 6, trainLocations: [] }),
      fintrafficTrain({ trainNumber: 7 }, { timestamp: '2026-11-14T13:20:00.000Z' }),
      fintrafficTrain({ trainNumber: 7 }, { timestamp: '2026-11-14T13:21:00.000Z', location: [25, 61] }),
      fintrafficTrain({ trainNumber: 8 }, { speed: 9_000 }),
    ] } }, context('fintraffic'))
    expect(trains.map((train) => train.id)).toEqual([
      'train:fintraffic:2026-11-14:7',
      'train:fintraffic:2026-11-14:8',
    ])
    expect(trains[0]!.longitude).toBe(25)
    expect(trains[1]).not.toHaveProperty('speedKph')
  })

  it('rejects GraphQL errors and oversized train counts instead of returning partial data', () => {
    expect(() => parseFintrafficTrains({ errors: [{ message: 'bad' }] }, context('fintraffic')))
      .toThrow(ProviderError)
    expect(() => parseFintrafficTrains({ data: { currentlyRunningTrains: [
      fintrafficTrain({ trainNumber: 1 }),
      fintrafficTrain({ trainNumber: 2 }),
    ] } }, context('fintraffic', 1))).toThrow('too many trains')
  })
})

describe('Entur train parsing', () => {
  it('uses the reported bearing, never a speed with undocumented units', () => {
    const trains = parseEnturTrains({ data: { vehicles: [{
      vehicleId: '2242-2026-11-14',
      lastUpdated: '2026-11-14T13:16:17.406Z',
      location: { latitude: 59.744842, longitude: 10.344435 },
      speed: 20,
      bearing: 113.29,
      line: { lineName: 'Spikkestad-Oslo S-Lillestrøm', publicCode: 'L1' },
      operator: { name: null },
      destinationName: 'Lillestrøm',
    }, {
      vehicleId: 'missing-location',
      lastUpdated: '2026-11-14T13:16:17.406Z',
    }] } }, context('entur'))
    expect(trains).toEqual([{
      id: 'train:entur:2242-2026-11-14',
      sourceId: 'entur',
      name: 'L1 2242',
      category: 'passenger',
      longitude: 10.344435,
      latitude: 59.744842,
      observedAt: Date.parse('2026-11-14T13:16:17.406Z'),
      trainNumber: '2242',
      line: 'Spikkestad-Oslo S-Lillestrøm',
      destination: 'Lillestrøm',
      courseDegrees: 113.29,
      courseOrigin: 'reported',
    }])
  })
})

describe('MBTA train parsing', () => {
  it('joins route and trip context and converts reported m/s speed', () => {
    const trains = parseMbtaTrains({
      data: [{
        type: 'vehicle',
        id: '1724',
        attributes: {
          bearing: 45,
          label: '1724',
          latitude: 42.535347,
          longitude: -71.160408,
          speed: 26.8,
          updated_at: '2026-11-14T08:24:25-05:00',
        },
        relationships: {
          route: { data: { id: 'CR-Lowell', type: 'route' } },
          trip: { data: { id: 'trip-3501', type: 'trip' } },
        },
      }, {
        type: 'vehicle',
        id: '1814',
        attributes: {
          bearing: null,
          label: '1814',
          latitude: 42.179229,
          longitude: -70.746337,
          speed: null,
          updated_at: '2026-11-14T08:14:03-05:00',
        },
        relationships: {},
      }],
      included: [
        { type: 'route', id: 'CR-Lowell', attributes: { long_name: 'Lowell Line', short_name: '' } },
        { type: 'trip', id: 'trip-3501', attributes: { headsign: 'Lowell', name: '3501' } },
      ],
    }, context('mbta'))
    expect(trains[0]).toMatchObject({
      id: 'train:mbta:1724',
      name: 'Train 3501',
      category: 'commuter',
      line: 'Lowell Line',
      destination: 'Lowell',
      vehicleLabel: '1724',
      speedKph: 96,
      courseDegrees: 45,
      courseOrigin: 'reported',
      observedAt: Date.parse('2026-11-14T13:24:25.000Z'),
    })
    expect(trains[1]).toMatchObject({ id: 'train:mbta:1814', name: 'Train 1814' })
    expect(trains[1]).not.toHaveProperty('courseDegrees')
    expect(trains[1]).not.toHaveProperty('speedKph')
  })
})

describe('LIRR train parsing', () => {
  it('reads the bounded proxy shape and the trip train number', () => {
    expect(parseLirrTrains({
      retrievedAt: '2026-11-14T13:25:00.000Z',
      vehicles: [{
        id: '7756_6412',
        label: '7756',
        tripId: 'GO203_26_6412_2972_METS',
        latitude: 40.82904,
        longitude: -73.6874,
        observedAt: '2026-11-14T13:20:00.000Z',
      }],
    }, context('lirr'))).toEqual([{
      id: 'train:lirr:7756_6412',
      sourceId: 'lirr',
      name: 'Train 6412',
      category: 'commuter',
      longitude: -73.6874,
      latitude: 40.82904,
      observedAt: Date.parse('2026-11-14T13:20:00.000Z'),
      trainNumber: '6412',
      vehicleLabel: '7756',
    }])
  })
})

const jsonResponse = (body: unknown, init: ResponseInit = {}, contentType = 'application/json') =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': contentType, ...init.headers },
  })

describe('train HTTP providers', () => {
  it('sends identified, credential-free requests to fixed endpoints', async () => {
    const fetchImpl = vi.fn<TrainFetch>(async () =>
      jsonResponse({ data: { currentlyRunningTrains: [fintrafficTrain()] } }))
    const providers = createTrainProviders(TRAIN_CONFIG, {
      fetchImpl,
      now: () => retrievedAt,
      origin: 'https://app.example',
    })
    const dataset = await providers.fintraffic.load(new AbortController().signal)
    expect(dataset).toMatchObject({ sourceId: 'fintraffic', retrievedAt })
    expect(dataset.trains).toHaveLength(1)
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(String(url)).toBe(TRAIN_CONFIG.fintraffic.endpoint)
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      headers: {
        'Content-Type': 'application/json',
        'Digitraffic-User': TRAIN_CONFIG.clientName,
      },
    })
    expect(JSON.parse(String(init!.body)).query).toContain('greaterThan: "2026-11-14T13:10:00.000Z"')

    fetchImpl.mockResolvedValueOnce(jsonResponse({ data: { vehicles: [] } }))
    await providers.entur.load(new AbortController().signal)
    expect(fetchImpl.mock.calls[1]![1]).toMatchObject({
      headers: { 'ET-Client-Name': TRAIN_CONFIG.clientName },
    })

    fetchImpl.mockResolvedValueOnce(jsonResponse({ data: [] }, {}, 'application/vnd.api+json'))
    await providers.mbta.load(new AbortController().signal)
    const mbtaUrl = new URL(String(fetchImpl.mock.calls[2]![0]))
    expect(mbtaUrl.origin + mbtaUrl.pathname).toBe(TRAIN_CONFIG.mbta.endpoint)
    expect(mbtaUrl.searchParams.get('filter[route_type]')).toBe('2')

    fetchImpl.mockResolvedValueOnce(jsonResponse({ vehicles: [] }))
    await providers.lirr.load(new AbortController().signal)
    expect(String(fetchImpl.mock.calls[3]![0])).toBe('https://app.example/api/trains/lirr')
  })

  it('reports rate limits with Retry-After and bounds invalid bodies', async () => {
    const providers = createTrainProviders(TRAIN_CONFIG, {
      now: () => retrievedAt,
      fetchImpl: async () => new Response('slow', { status: 429, headers: { 'Retry-After': '20' } }),
    })
    await expect(providers.mbta.load(new AbortController().signal)).rejects.toMatchObject({
      status: 429,
      retryAfterMs: 20_000,
    })

    const oversized = createTrainProviders({ ...TRAIN_CONFIG, maximumBytes: 8 }, {
      fetchImpl: async () => jsonResponse({ data: { vehicles: [] } }),
    })
    await expect(oversized.entur.load(new AbortController().signal))
      .rejects.toThrow('invalid or oversized')

    const html = createTrainProviders(TRAIN_CONFIG, {
      fetchImpl: async () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } }),
    })
    await expect(html.fintraffic.load(new AbortController().signal))
      .rejects.toThrow('invalid or oversized')
  })

  it('aborts promptly and times out stalled requests', async () => {
    const stalled: TrainFetch = (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
    })
    const controller = new AbortController()
    const pending = createTrainProviders(TRAIN_CONFIG, { fetchImpl: stalled }).entur.load(controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })

    vi.useFakeTimers()
    try {
      const timed = createTrainProviders({ ...TRAIN_CONFIG, timeoutMs: 1_000 }, { fetchImpl: stalled })
        .entur.load(new AbortController().signal)
      const assertion = expect(timed).rejects.toThrow('timed out')
      await vi.advanceTimersByTimeAsync(1_000)
      await assertion

      let fintrafficSettled = false
      const slow = createTrainProviders(TRAIN_CONFIG, { fetchImpl: stalled })
        .fintraffic.load(new AbortController().signal)
        .finally(() => { fintrafficSettled = true })
      const slowAssertion = expect(slow).rejects.toThrow('timed out')
      await vi.advanceTimersByTimeAsync(TRAIN_CONFIG.timeoutMs)
      expect(fintrafficSettled).toBe(false)
      await vi.advanceTimersByTimeAsync(
        TRAIN_CONFIG.fintraffic.timeoutMs - TRAIN_CONFIG.timeoutMs,
      )
      await slowAssertion
      expect(TRAIN_CONFIG.fintraffic.timeoutMs).toBeLessThan(TRAIN_CONFIG.pollIntervalMs)
    } finally {
      vi.useRealTimers()
    }
  })
})
