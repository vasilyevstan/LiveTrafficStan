import { describe, expect, it, vi } from 'vitest'
import type { MarineJourneyHistory } from '../domain/marineJourney'
import type { Vessel } from '../domain/traffic'
import { ProviderError } from '../providers/errors'
import { parseMarineJourneyHistory } from '../providers/marine/marineJourneyNormalization'
import { JOURNEY_TEST_MMSI as mmsi, JOURNEY_TEST_NOW as now, marineHistoryFixture } from '../providers/marine/marineJourneyFixtures'
import { MarineJourneyCapture } from './MarineJourneyCapture'

const vessel: Vessel = {
  id: `vessel:${mmsi}`, kind: 'vessel', mmsi, imo: 8919805, provider: 'Test AIS',
  vesselCategory: 'cargo', navigationCategory: 'underway', markerIcon: 'vessel-cargo', markerScale: 1,
  position: { longitude: 24.7, latitude: 59.6, observedAt: now }, receivedAt: now,
}
const history = () => parseMarineJourneyHistory(marineHistoryFixture(), mmsi, now - 86_400_000, now, now)
const trail = [{ ...vessel.position, longitude: 24.69, observedAt: now - 30_000 }]

describe('captured marine journey lifecycle', () => {
  it('captures once without moving with later live updates or copying imported history into local observations', async () => {
    let complete!: (value: MarineJourneyHistory) => void
    const lookup = vi.fn(() => new Promise<MarineJourneyHistory>(resolve => { complete = resolve }))
    const controller = new MarineJourneyCapture({ lookup })
    const live = { ...vessel, position: { ...vessel.position } }
    const localTrail = trail.map(point => ({ ...point }))
    const pending = controller.request(live, localTrail, 1, now, true)
    expect(controller.pending).toBe(true)
    live.position.longitude = 0
    localTrail[0]!.longitude = 0
    complete(history())
    const capture = await pending
    expect(capture?.kind).toBe('available')
    if (capture?.kind !== 'available') return
    expect(capture.snapshot.position.longitude).toBe(24.7)
    expect(capture.snapshot.segments).toHaveLength(2)
    expect(capture.snapshot.segments.every(segment => segment.certainty === 'observed')).toBe(true)
    expect(capture.snapshot.endpoints.map(point => point.role)).toEqual(['captured'])
    expect(localTrail).toHaveLength(1)
    expect(controller.pending).toBe(false)
  })

  it('fences cancelled and A-B-A results even when a provider ignores abort', async () => {
    const pending: { complete: (history: MarineJourneyHistory) => void; signal: AbortSignal }[] = []
    const lookup = vi.fn((_mmsi: number, _time: number, signal: AbortSignal) =>
      new Promise<MarineJourneyHistory>(complete => pending.push({ complete, signal })))
    const controller = new MarineJourneyCapture({ lookup })
    const a = controller.request(vessel, trail, 1, now, true)
    const b = controller.request({ ...vessel, id: `vessel:${mmsi + 1}`, mmsi: mmsi + 1 }, trail, 2, now, true)
    const latest = controller.request(vessel, trail, 3, now, true)
    expect(pending.slice(0, 2).every(request => request.signal.aborted)).toBe(true)
    pending[0]!.complete(history())
    pending[1]!.complete(history())
    expect(await a).toBeUndefined()
    expect(await b).toBeUndefined()
    controller.cancel()
    pending[2]!.complete(history())
    expect(await latest).toBeUndefined()
    expect(controller.pending).toBe(false)
  })

  it('retains useful session observations with an explicit error or offline qualification', async () => {
    const lookup = vi.fn().mockRejectedValue(new ProviderError('Ship history is temporarily rate-limited.'))
    const controller = new MarineJourneyCapture({ lookup })
    const failed = await controller.request(vessel, trail, 1, now, true)
    if (failed?.kind !== 'available') throw new Error('Expected useful local observations')
    expect(failed.snapshot.limitations.join(' ')).toContain('rate-limited')
    expect(failed.snapshot.segments[0]!.source).toBe(vessel.provider)
    const offline = await controller.request(vessel, trail, 2, now, false)
    if (offline?.kind !== 'available') throw new Error('Expected offline local observations')
    expect(offline.snapshot.limitations.join(' ')).toContain('Offline')
    expect(lookup).toHaveBeenCalledTimes(1)
  })

  it('requests the shared network only for verified endpoints and preserves unknown sections on failure', async () => {
    const route = vi.fn().mockResolvedValue({ kind: 'unavailable', message: 'Disconnected network' })
    const lookup = vi.fn().mockResolvedValue(history())
    const noEndpoints = new MarineJourneyCapture({ lookup }, {
      lookup: vi.fn().mockResolvedValue({ retrievedAt: now, limitations: ['Unknown voyage timing'] }),
    }, { route })
    await noEndpoints.request(vessel, trail, 1, now, true)
    expect(route).not.toHaveBeenCalled()
    const withEndpoints = new MarineJourneyCapture({ lookup }, {
      lookup: vi.fn().mockResolvedValue({
        retrievedAt: now, departedAt: now - 200_000,
        departure: { locode: 'FIHEL', longitude: 24.6, latitude: 59.5 },
        destination: { locode: 'FIKTK', longitude: 25.4, latitude: 60.2 },
        limitations: [],
      }),
    }, { route })
    const result = await withEndpoints.request(vessel, trail, 2, now, true)
    if (result?.kind !== 'available') throw new Error('Expected the received partial journey')
    expect(route).toHaveBeenCalledTimes(2)
    expect(result.snapshot.segments.every(segment => segment.certainty === 'observed')).toBe(true)
    expect(result.snapshot.limitations.filter(message => message === 'Disconnected network')).toHaveLength(1)
    expect(result.snapshot.endpoints.map(point => point.role)).toEqual(['departure', 'destination', 'captured'])
  })

  it('does not automatically retry a failed network asset for the second phase', async () => {
    const route = vi.fn().mockRejectedValue(new ProviderError('Network asset failed validation'))
    const controller = new MarineJourneyCapture({ lookup: vi.fn().mockResolvedValue(history()) }, {
      lookup: vi.fn().mockResolvedValue({
        retrievedAt: now, departedAt: now - 200_000,
        departure: { locode: 'FIHEL', longitude: 24.6, latitude: 59.5 },
        destination: { locode: 'FIKTK', longitude: 25.4, latitude: 60.2 },
        limitations: [],
      }),
    }, { route })
    const result = await controller.request(vessel, trail, 1, now, true)
    expect(route).toHaveBeenCalledTimes(1)
    if (result?.kind !== 'available') throw new Error('Expected received partial history')
    expect(result.snapshot.limitations).toContain('Network asset failed validation')
    await controller.request(vessel, trail, 2, now, true)
    expect(route).toHaveBeenCalledTimes(2)
  })
})
