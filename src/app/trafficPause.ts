import type { TrafficQuery } from '../providers/types'

export const shouldPauseTraffic = (
  query: TrafficQuery | null,
  hidden: boolean,
  online: boolean,
  intentionallyPaused = false,
) => !online || hidden || query === null || intentionallyPaused
