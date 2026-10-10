import type { JourneySnapshot } from '../domain/journey'
import type { MapCameraState } from '../domain/mapCamera'

export interface JourneyOverview {
  snapshot: JourneySnapshot
  returnCamera: MapCameraState
  returnLabel: string
  fitPending: boolean
  fitMessage?: string
}

export const resolveJourneyFit = (
  current: JourneyOverview | undefined,
  revision: number,
  message: string,
): JourneyOverview | undefined =>
  current?.snapshot.revision === revision && current.fitPending
    ? { ...current, fitPending: false, fitMessage: message }
    : current

export const manuallyExploreJourney = (
  current: JourneyOverview | undefined,
): JourneyOverview | undefined => current?.fitPending
  ? { ...current, fitPending: false, fitMessage: 'Automatic framing cancelled by map movement. Explore the captured path manually.' }
  : current
