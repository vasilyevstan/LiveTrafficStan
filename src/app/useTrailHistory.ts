import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppConfig } from '../config/appConfig'
import type { TrafficEntity } from '../domain/traffic'
import {
  type TrailHistory,
  updateTrailHistory,
  updateTrailHistoryAfterNavigation,
} from '../traffic/history'

export const useTrailHistory = (
  entities: readonly TrafficEntity[],
  selectedId: string | null,
  now: number,
  config: AppConfig['trail'],
  resetRevision: number,
) => {
  const [history, setHistory] = useState<TrailHistory>(() => new Map())
  const resetRevisionRef = useRef(resetRevision)
  const pruneBucket = Math.floor(now / 60_000)

  useEffect(() => {
    setHistory((current) => {
      const reset = resetRevisionRef.current !== resetRevision
      resetRevisionRef.current = resetRevision
      return updateTrailHistoryAfterNavigation(
        current,
        entities,
        Date.now(),
        config,
        reset,
      )
    })
  }, [entities, config, resetRevision])

  useEffect(() => {
    setHistory((current) =>
      updateTrailHistory(current, [], Date.now(), config),
    )
  }, [pruneBucket, config])

  return useMemo(
    () => (selectedId ? (history.get(selectedId) ?? []) : []),
    [history, selectedId],
  )
}
