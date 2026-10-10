import { describe, expect, it } from 'vitest'
import { manuallyExploreJourney, resolveJourneyFit, type JourneyOverview } from './journeyOverview'

const overview: JourneyOverview = {
  snapshot: {
    revision: 3, identity: 'A', title: 'A', kind: 'aircraft', capturedAt: 1,
    position: { latitude: 1, longitude: 2, observedAt: 1 },
    segments: [], endpoints: [], limitations: [], sources: [],
  },
  returnCamera: { latitude: 1, longitude: 2, zoom: 9, bearing: 20, pitch: 10 },
  returnLabel: 'Previous view',
  fitPending: true,
}

describe('captured overview ownership', () => {
  it('accepts only the current revision, including A-to-B-to-A and cleared selection', () => {
    expect(resolveJourneyFit(overview, 1, 'old A')).toBe(overview)
    expect(resolveJourneyFit(overview, 2, 'old B')).toBe(overview)
    expect(resolveJourneyFit(undefined, 3, 'late')).toBeUndefined()
    const current = resolveJourneyFit(overview, 3, 'framed')!
    expect(current.fitPending).toBe(false)
    expect(current.snapshot).toBe(overview.snapshot)
    expect(current.returnCamera).toBe(overview.returnCamera)
    expect(resolveJourneyFit(current, 3, 'duplicate')).toBe(current)
  })

  it('manual movement cancels pending framing without deleting or mutating the snapshot', () => {
    const manual = manuallyExploreJourney(overview)!
    expect(manual.fitPending).toBe(false)
    expect(manual.snapshot).toBe(overview.snapshot)
    expect(overview.fitPending).toBe(true)
    expect(resolveJourneyFit(manual, 3, 'obsolete framing')).toBe(manual)
    expect(manuallyExploreJourney(manual)).toBe(manual)
  })
})
