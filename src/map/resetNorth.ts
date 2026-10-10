import type { NorthResetRequest } from '../domain/mapCamera'

export const consumeNorthReset = (
  request: NorthResetRequest | undefined,
  lastRevision: { current: number },
  viewRequestId: number,
  map: {
    stop: () => unknown
    resetNorth: (options: { duration: number }) => unknown
  } | null,
  animation: { durationMs: number; reducedMotion: boolean },
  beforeReset: () => void,
): number | undefined => {
  if (!request || request.revision <= lastRevision.current) return undefined
  lastRevision.current = request.revision
  if (!map || request.viewRequestId !== viewRequestId) return undefined

  beforeReset()
  const duration = animation.reducedMotion ? 0 : animation.durationMs
  map.stop()
  map.resetNorth({ duration })
  return duration
}
