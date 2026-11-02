import type { TrafficQuery } from '../providers/types'

export const marineTrafficPause = (
  query: TrafficQuery | null,
  hidden: boolean,
  online: boolean,
  intentionallyPaused: boolean,
) => ({
  networkPaused: hidden || !online || intentionallyPaused,
  viewportPaused: query === null,
})
