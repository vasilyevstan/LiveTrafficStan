import { useEffect, useMemo, useRef, useState } from 'react'
import type { TrafficEntity } from '../domain/traffic'
import {
  compatibleVesselIdentity,
  vesselIdentity,
  type VesselIdentity,
} from '../domain/vesselIdentity'
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
  const vesselIdentitiesRef = useRef(new Map<string, VesselIdentity>())
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
    if (reset) {
      observationHighWaterRef.current.clear()
      vesselIdentitiesRef.current.clear()
    }

    const currentConfig = configRef.current
    const changedIdentities = new Set<string>()
    for (const entity of entities) {
      if (entity.kind !== 'vessel') continue
      const previous = vesselIdentitiesRef.current.get(entity.id)
      const identity = vesselIdentity(entity)
      if (previous && previous.provider !== identity.provider &&
        !compatibleVesselIdentity(previous, identity)) {
        changedIdentities.add(entity.id)
      }
      vesselIdentitiesRef.current.delete(entity.id)
      vesselIdentitiesRef.current.set(entity.id, identity)
    }
    while (vesselIdentitiesRef.current.size > currentConfig.maxTotalPoints) {
      const oldest = vesselIdentitiesRef.current.keys().next().value
      if (oldest === undefined) break
      vesselIdentitiesRef.current.delete(oldest)
    }
    const unseenEntities = takeNewTrailObservations(
      entities,
      observationHighWaterRef.current,
      currentConfig.maxTotalPoints,
    )
    setHistory((current) => {
      let previous = current
      if (changedIdentities.size) {
        const retained = new Map(current)
        for (const id of changedIdentities) retained.delete(id)
        previous = retained
      }
      return updateTrailHistory(
        reset ? new Map() : previous,
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
