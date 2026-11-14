import { useEffect, useMemo, useRef, useState } from 'react'
import { TRAIN_CONFIG } from '../config/appConfig'
import type { TrainSourceId } from '../domain/trains'
import { TRAIN_SOURCE_IDS, viewportIntersectsTrainAreas } from '../domain/trains'
import type { TrafficViewport } from '../domain/viewport'
import { createTrainProviders } from '../providers/rail/trainProviders'
import { TRAIN_SOURCES } from '../providers/rail/trainSources'
import {
  TrainController,
  initialTrainSourceStatuses,
  type TrainSourceStatuses,
} from './TrainController'

export const activeTrainSources = (viewport: TrafficViewport | null) =>
  new Set<TrainSourceId>(
    viewport
      ? TRAIN_SOURCE_IDS.filter((sourceId) =>
          viewportIntersectsTrainAreas(viewport, TRAIN_SOURCES[sourceId].areas))
      : [],
  )

const shouldPauseTrains = (enabled: boolean, intentionallyPaused: boolean) =>
  !enabled ||
  intentionallyPaused ||
  (typeof document !== 'undefined' && document.hidden) ||
  (typeof navigator !== 'undefined' && !navigator.onLine)

/**
 * One train controller per mount. Layer visibility, HISTORY, page visibility,
 * connectivity, and coverage only pause or resume sources; they never
 * recreate schedulers or reset cadence and `Retry-After` boundaries.
 */
export const useTrains = (
  viewport: TrafficViewport | null,
  enabled: boolean,
  intentionallyPaused: boolean,
) => {
  const [statuses, setStatuses] = useState<TrainSourceStatuses>(initialTrainSourceStatuses)
  const controllerRef = useRef<TrainController | undefined>(undefined)
  const pauseInputsRef = useRef({ enabled, intentionallyPaused })
  const activeSources = useMemo(() => activeTrainSources(viewport), [viewport])
  const activeSourcesRef = useRef(activeSources)

  useEffect(() => {
    pauseInputsRef.current = { enabled, intentionallyPaused }
    controllerRef.current?.setPaused(shouldPauseTrains(enabled, intentionallyPaused))
  }, [enabled, intentionallyPaused])

  useEffect(() => {
    activeSourcesRef.current = activeSources
    controllerRef.current?.setActiveSources(activeSources)
  }, [activeSources])

  useEffect(() => {
    let disposed = false
    const controller = new TrainController({
      providers: createTrainProviders(TRAIN_CONFIG),
      pollIntervalMs: TRAIN_CONFIG.pollIntervalMs,
      rateLimitBackoffMaxMs: TRAIN_CONFIG.rateLimitBackoffMaxMs,
      course: TRAIN_CONFIG.course,
      onChange: (next) => {
        if (!disposed) setStatuses(next)
      },
    })
    controllerRef.current = controller
    const currentPause = () => shouldPauseTrains(
      pauseInputsRef.current.enabled,
      pauseInputsRef.current.intentionallyPaused,
    )
    controller.start(currentPause(), activeSourcesRef.current)
    const handlePauseInputs = () => controller.setPaused(currentPause())
    document.addEventListener('visibilitychange', handlePauseInputs)
    window.addEventListener('online', handlePauseInputs)
    window.addEventListener('offline', handlePauseInputs)
    return () => {
      disposed = true
      controller.stop()
      if (controllerRef.current === controller) controllerRef.current = undefined
      document.removeEventListener('visibilitychange', handlePauseInputs)
      window.removeEventListener('online', handlePauseInputs)
      window.removeEventListener('offline', handlePauseInputs)
    }
  }, [])

  return statuses
}
