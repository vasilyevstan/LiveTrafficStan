import { describe, expect, it } from 'vitest'
import { evaluateLocatedReport, locatedReportLiveId, locatedReportMessage, type LocatedReportInputs } from './locatedReport'

const inputs = (overrides: Partial<LocatedReportInputs> = {}): LocatedReportInputs => ({
  now: 1_000, current: true, paused: false, interrupted: false,
  assessment: 'eligible', live: false, selectable: false, ...overrides,
})

describe('located last-report identity', () => {
  it('derives exact live ids from a supported MMSI or ICAO24 only', () => {
    expect(locatedReportLiveId({ objectClass: 'ships', identifiers: { mmsi: '276143000' } })).toBe('vessel:276143000')
    expect(locatedReportLiveId({ objectClass: 'aircraft', identifiers: { icao24: '4CA8F1' } })).toBe('aircraft:4ca8f1')
    for (const mmsi of [undefined, '', '027614300', '27614300', '2761430000', '27614300a', ' 276143000']) {
      expect(locatedReportLiveId({ objectClass: 'ships', identifiers: { mmsi } })).toBeUndefined()
    }
    for (const icao24 of [undefined, '', '4ca8f', '4ca8f12', '~4ca8f1', '4ca8g1', ' 4ca8f1']) {
      expect(locatedReportLiveId({ objectClass: 'aircraft', identifiers: { icao24 } })).toBeUndefined()
    }
    expect(locatedReportLiveId({ objectClass: 'aircraft', identifiers: { mmsi: '276143000' } })).toBeUndefined()
    expect(locatedReportLiveId({ objectClass: 'ships', identifiers: { icao24: '4ca8f1' } })).toBeUndefined()
  })
})

describe('located last-report live selection', () => {
  const pending = { deadline: 2_000 }

  it('selects a live, selectable object in the eligible located view', () => {
    expect(evaluateLocatedReport(pending, inputs({ live: true, selectable: true }))).toBe('select')
    expect(evaluateLocatedReport(pending, inputs({ live: true, selectable: true, now: 5_000 }))).toBe('select')
  })

  it('reports a live object that layer or filters hide instead of selecting it', () => {
    expect(evaluateLocatedReport(pending, inputs({ live: true }))).toBe('hidden')
  })

  it('waits until the deadline before claiming the object was not received live', () => {
    expect(evaluateLocatedReport(pending, inputs())).toBe('wait')
    expect(evaluateLocatedReport(pending, inputs({ now: 1_999 }))).toBe('wait')
    expect(evaluateLocatedReport(pending, inputs({ now: 2_000 }))).toBe('not-live')
  })

  it('never selects or claims absence before the located viewport is assessed eligible', () => {
    expect(evaluateLocatedReport(pending, inputs({ assessment: 'pending', live: true, selectable: true }))).toBe('wait')
    expect(evaluateLocatedReport(pending, inputs({ assessment: 'ineligible', live: true, selectable: true }))).toBe('wait')
    expect(evaluateLocatedReport(pending, inputs({ assessment: 'pending', now: 2_000 }))).toBe('interrupted')
    expect(evaluateLocatedReport(pending, inputs({ assessment: 'ineligible', now: 2_000 }))).toBe('interrupted')
  })

  it('cancels silently for superseded intent, HISTORY, or captured view', () => {
    expect(evaluateLocatedReport(pending, inputs({ current: false, live: true, selectable: true }))).toBe('cancel')
    expect(evaluateLocatedReport(pending, inputs({ paused: true, live: true, selectable: true }))).toBe('cancel')
    expect(evaluateLocatedReport(pending, inputs({ current: false, now: 5_000 }))).toBe('cancel')
  })

  it('stops without an absence claim while hidden or offline', () => {
    expect(evaluateLocatedReport(pending, inputs({ interrupted: true, live: true, selectable: true }))).toBe('interrupted')
    expect(evaluateLocatedReport(pending, inputs({ interrupted: true, now: 5_000 }))).toBe('interrupted')
  })

  it('words every outcome truthfully', () => {
    expect(locatedReportMessage('selected', 'vessel')).toBeUndefined()
    expect(locatedReportMessage('hidden', 'vessel')).toContain('SHIPS')
    expect(locatedReportMessage('hidden', 'aircraft')).toContain('AIRCRAFT')
    expect(locatedReportMessage('not-live', 'aircraft')).toBe(
      'Not received live in this view. Its dated last report was marked on the map.')
    expect(locatedReportMessage('interrupted', 'vessel')).not.toContain('Not received')
  })
})
