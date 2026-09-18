import { useEffect, useMemo, useState } from 'react'
import type { AppConfig } from '../config/appConfig'
import type { TrafficEntity } from '../domain/traffic'
import {
  type TrailHistory,
  updateTrailHistory,
} from '../traffic/history'

export const useTrailHistory = (
  entities: readonly TrafficEntity[],
  selectedId: string | null,
  now: number,
  config: AppConfig['trail'],
) => {
  const [history, setHistory] = useState<TrailHistory>(() => new Map())
  const pruneBucket = Math.floor(now / 60_000)

  useEffect(() => {
    setHistory((current) =>
      updateTrailHistory(current, entities, Date.now(), config),
    )
  }, [entities, config])

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
