import type { TrailPoint } from './traffic'

export interface MarineJourneyHistory {
  readonly mmsi: number
  readonly from: number
  readonly to: number
  readonly retrievedAt: number
  readonly pointCount: number
  readonly segments: readonly (readonly TrailPoint[])[]
  readonly receptionBreaks?: number
  readonly timeGaps: number
  readonly simplified?: boolean
  readonly toleranceMeters?: number
  readonly truncated: boolean
  readonly windowLimited: boolean
  readonly attribution: readonly string[]
}

export interface MarineJourneyPort {
  readonly locode: string
  readonly areaCode?: string
  readonly latitude: number
  readonly longitude: number
}

export interface MarineJourneyPorts {
  readonly departedAt?: number
  readonly arrivedAt?: number
  readonly departure?: MarineJourneyPort
  readonly destination?: MarineJourneyPort
  readonly retrievedAt: number
  readonly limitations: readonly string[]
}
