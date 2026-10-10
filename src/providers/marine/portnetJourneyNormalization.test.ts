import { describe, expect, it } from 'vitest'
import { resolvePortnetCoordinate, selectPortnetJourneyLeg } from './portnetJourneyNormalization'
import { JOURNEY_TEST_MMSI as mmsi, JOURNEY_TEST_NOW as now, portCallsFixture, portCoordinateFixture } from './marineJourneyFixtures'

describe('exact coded Portnet voyage context', () => {
  it('requires a recent actual departure, exact MMSI and compatible reported IMO', () => {
    const fixture = portCallsFixture()
    const leg = selectPortnetJourneyLeg(fixture, { mmsi, imo: 8919805 }, now)
    expect(leg.departedAt).toBe(now - 300_000)
    expect(leg.departure).toEqual({ locode: 'FIHEL', areaCode: 'VUOS' })
    expect(leg.destination?.locode).toBe('FIKTK')
    expect(selectPortnetJourneyLeg(fixture, { mmsi: mmsi + 1, imo: 8919805 }, now).departure).toBeUndefined()
    expect(selectPortnetJourneyLeg(fixture, { mmsi, imo: 9214379 }, now).departure).toBeUndefined()
  })

  it('rejects the demonstrated ancient-actual/far-future-estimate combination', () => {
    const fixture = portCallsFixture()
    const area = fixture.portCalls[0]!.portAreaDetails[0]!
    area.ata = '2015-01-03T07:25Z'
    area.atd = '2015-01-03T15:15Z'
    Object.assign(area, { eta: '2026-11-10T12:00:00Z', etd: '2027-01-19T12:00:00Z' })
    const leg = selectPortnetJourneyLeg(fixture, { mmsi }, now)
    expect(leg.departure).toBeUndefined()
    expect(leg.destination).toBeUndefined()
    expect(leg.limitations.join(' ')).toContain('implausible')
  })

  it('does not treat estimated departure, update time, an ambiguous tie or a later unrelated arrival as a voyage', () => {
    const fixture = portCallsFixture()
    const area = fixture.portCalls[0]!.portAreaDetails[0]!
    Reflect.deleteProperty(area, 'atd')
    Object.assign(area, { etd: new Date(now + 3_600_000).toISOString() })
    expect(selectPortnetJourneyLeg(fixture, { mmsi }, now).departure).toBeUndefined()
    const ambiguous = portCallsFixture()
    ambiguous.portCalls.push({ ...ambiguous.portCalls[0]!, nextPort: 'EETLL' })
    expect(selectPortnetJourneyLeg(ambiguous, { mmsi }, now).departure).toBeUndefined()
    const arrived = portCallsFixture()
    arrived.portCalls.push({
      ...arrived.portCalls[0]!, portToVisit: 'EETLL',
      portAreaDetails: [{ portAreaCode: 'TEST', ata: new Date(now - 60_000).toISOString(), atd: '' }],
    })
    expect(selectPortnetJourneyLeg(arrived, { mmsi }, now).departure).toBeUndefined()
  })

  it('resolves only the exact feature-level area when LOCODE geometry is null', () => {
    const fixture = portCoordinateFixture()
    expect(resolvePortnetCoordinate(fixture, { locode: 'FIHEL', areaCode: 'VUOS' }))
      .toEqual({ locode: 'FIHEL', areaCode: 'VUOS', longitude: 25.19392, latitude: 60.21502 })
    expect(resolvePortnetCoordinate(fixture, { locode: 'FIHEL' })).toBeUndefined()
    expect(resolvePortnetCoordinate(fixture, { locode: 'FIHEL', areaCode: 'OTHER' })).toBeUndefined()
    expect(resolvePortnetCoordinate(fixture, { locode: 'EETLL', areaCode: 'VUOS' })).toBeUndefined()
    fixture.portAreas.features.push({
      ...fixture.portAreas.features[0]!, geometry: { type: 'Point', coordinates: [25.3, 60.3] },
    })
    expect(resolvePortnetCoordinate(fixture, { locode: 'FIHEL', areaCode: 'VUOS' })).toBeUndefined()
  })
})
