import type { TrafficQuery } from '../providers/types'

export const shouldPauseTraffic = (
  query: TrafficQuery | null,
  hidden: boolean,
  online: boolean,
) => !online || hidden || query === null
