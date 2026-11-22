import { parseMarineMmsi } from '../providers/marine/marineSourceNormalization.js'
import type { DiscoveryMatch } from './objectDiscovery.js'

export type LocatedReportKind = 'aircraft' | 'vessel'
export type LocatedReportOutcome = 'selected' | 'hidden' | 'not-live' | 'interrupted'

export interface LocatedReportTarget {
  liveId: string
  name: string
  reportedAt: number
  originId: string
  onOutcome: (outcome: LocatedReportOutcome) => void
}

export interface LocatedReportMarker {
  liveId: string
  kind: LocatedReportKind
  name: string
  latitude: number
  longitude: number
  reportedAt: number
}

export interface PendingLocatedReport {
  liveId: string
  kind: LocatedReportKind
  revision: number
  deadline: number
  originId: string
  onOutcome: (outcome: LocatedReportOutcome) => void
}

export interface LocatedReportInputs {
  now: number
  current: boolean
  paused: boolean
  interrupted: boolean
  assessment: 'pending' | 'eligible' | 'ineligible'
  live: boolean
  selectable: boolean
}

export type LocatedReportDecision = 'wait' | 'cancel' | 'select' | Exclude<LocatedReportOutcome, 'selected'>

export const locatedReportLiveId = (
  match: Pick<DiscoveryMatch, 'objectClass' | 'identifiers'>,
): string | undefined => {
  if (match.objectClass === 'ships') {
    const mmsi = parseMarineMmsi(match.identifiers.mmsi)
    return mmsi === undefined ? undefined : `vessel:${mmsi}`
  }
  const hex = match.identifiers.icao24?.toLowerCase()
  return hex && /^[0-9a-f]{6}$/.test(hex) ? `aircraft:${hex}` : undefined
}

// A superseded intent, HISTORY, or a captured view ends the wait silently; hidden or offline
// pages stop provider delivery, so they never support a "not received live" claim.
export const evaluateLocatedReport = (
  pending: Pick<PendingLocatedReport, 'deadline'>,
  inputs: LocatedReportInputs,
): LocatedReportDecision => {
  if (!inputs.current || inputs.paused) return 'cancel'
  if (inputs.interrupted) return 'interrupted'
  if (inputs.assessment === 'eligible' && inputs.live) return inputs.selectable ? 'select' : 'hidden'
  if (inputs.now < pending.deadline) return 'wait'
  return inputs.assessment === 'eligible' ? 'not-live' : 'interrupted'
}

export const locatedReportMessage = (outcome: LocatedReportOutcome, kind: LocatedReportKind) => {
  if (outcome === 'selected') return undefined
  if (outcome === 'hidden') {
    return `Received live here, but hidden by ${kind === 'aircraft' ? 'AIRCRAFT' : 'SHIPS'} or map filters.`
  }
  if (outcome === 'not-live') return 'Not received live in this view. Its dated last report was marked on the map.'
  return 'Live check stopped before traffic was confirmed. Its dated last report was marked on the map.'
}
