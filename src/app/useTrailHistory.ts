import { useEffect, useMemo, useRef, useState } from 'react'
import type { TrafficEntity } from '../domain/traffic'
import {
  takeNewTrailObservations,
  type TrailHistory,
  type TrailHistoryConfig,
  type TrailObservationHighWater,
  updateTrailHistory,
} from '../traffic/history'

export const useTrailHistory = (
  entities: readonly TrafficEntity[],
  selectedId: string | null,
  now: number,
  config: TrailHistoryConfig,
  resetRevision: number,
) => {
  const [history, setHistory] = useState<TrailHistory>(() => new Map())
  const configRef = useRef(config)
  const observationHighWaterRef = useRef<TrailObservationHighWater>(new Map())
  const resetRevisionRef = useRef(resetRevision)
  const pruneBucket = Math.floor(now / 60_000)

  useEffect(() => {
    configRef.current = config
    setHistory((current) =>
      updateTrailHistory(current, [], Date.now(), config),
    )
  }, [config])

  useEffect(() => {
    const reset = resetRevisionRef.current !== resetRevision
    resetRevisionRef.current = resetRevision
    if (reset) observationHighWaterRef.current.clear()

    const currentConfig = configRef.current
    const unseenEntities = takeNewTrailObservations(
      entities,
      observationHighWaterRef.current,
      currentConfig.maxTotalPoints,
    )
    setHistory((current) => {
      return updateTrailHistory(
        reset ? new Map() : current,
        unseenEntities,
        Date.now(),
        currentConfig,
      )
    })
  }, [entities, resetRevision])

  useEffect(() => {
    setHistory((current) =>
      updateTrailHistory(current, [], Date.now(), configRef.current),
    )
  }, [pruneBucket])

  return useMemo(
    () => (selectedId ? (history.get(selectedId) ?? []) : []),
    [history, selectedId],
  )
}
