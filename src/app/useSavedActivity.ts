import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppConfig } from '../config/appConfig'
import type { OrbitalControllerState } from '../domain/orbital'
import {
  acknowledgeSavedActivity,
  emptySavedActivityState,
  observeSavedActivity,
  type SavedActivityObjectState,
  type SavedActivityObservation,
} from '../domain/savedActivity'
import {
  resolveSavedAircraft,
  resolveSavedOrbital,
  resolveSavedVessel,
} from '../domain/savedObjectResolution'
import { savedObjectKey, type SavedObject } from '../domain/savedObjects'
import type { InViewAvailability } from '../domain/inView'
import type { OrbitalCatalogEntry } from '../domain/catalogDiscovery'
import type {
  DisplayAircraft,
  DisplayVessel,
  ProviderStatus,
} from '../domain/traffic'

interface Options {
  entries: readonly SavedObject[]
  savedReady: boolean
  contextKey: string
  historyActive: boolean
  aircraft: readonly DisplayAircraft[]
  aircraftStatus: ProviderStatus
  aircraftAvailability: InViewAvailability
  vessels: readonly DisplayVessel[]
  vesselStatus: ProviderStatus
  vesselAvailability: InViewAvailability
  orbitalCatalog: readonly OrbitalCatalogEntry[]
  curated: OrbitalControllerState
  starlink: OrbitalControllerState
  config: AppConfig['saved']
  now: number
}

const trafficRevision = (
  status: ProviderStatus,
  entities: readonly (DisplayAircraft | DisplayVessel)[],
) =>
  Math.max(
    status.lastSuccessAt ?? 0,
    status.lastDataAt ?? 0,
    ...entities.map((entity) => entity.receivedAt),
  )

const trafficActivityState = (
  resolution: ReturnType<typeof resolveSavedAircraft>,
  revision: number,
  status: ProviderStatus,
  availability: InViewAvailability,
): SavedActivityObjectState => {
  if (
    revision <= 0 ||
    status.phase !== 'live' ||
    status.paused ||
    status.updating ||
    !availability.available
  ) {
    return { phase: 'suspended' }
  }
  if (resolution.state === 'conflict') {
    return {
      phase: 'conflict',
      revision,
      signature: resolution.conflictSignature ?? resolution.status,
      detail: resolution.detail,
    }
  }
  return {
    phase: resolution.state === 'current' ? 'current' : 'noncurrent',
    revision,
  }
}

const orbitalActive = (state: OrbitalControllerState) =>
  state.phase === 'ready' || state.phase === 'refreshing'

export const useSavedActivity = ({
  entries,
  savedReady,
  contextKey,
  historyActive,
  aircraft,
  aircraftStatus,
  aircraftAvailability,
  vessels,
  vesselStatus,
  vesselAvailability,
  orbitalCatalog,
  curated,
  starlink,
  config,
  now,
}: Options) => {
  const [state, setState] = useState(emptySavedActivityState)
  const observations = useMemo<readonly SavedActivityObservation[]>(() => {
    if (!savedReady || historyActive) {
      return entries.map((entry) => ({
        entry,
        objectKey: savedObjectKey(entry),
        contextKey,
        state: { phase: 'suspended' },
      }))
    }
    const aircraftRevision = trafficRevision(aircraftStatus, aircraft)
    const vesselRevision = trafficRevision(vesselStatus, vessels)
    const orbitalEntries = new Map(
      [...curated.prediction.results, ...starlink.prediction.results]
        .filter(
          (crossing) =>
            !crossing.currentlyInView &&
            crossing.firstCrossingAt !== undefined,
        )
        .map((crossing) => [crossing.noradCatalogId, crossing]),
    )
    const orbitalContext = [
      contextKey,
      curated.prediction.viewportSignature ?? '',
      curated.prediction.filtersSignature ?? '',
      starlink.prediction.viewportSignature ?? '',
      starlink.prediction.filtersSignature ?? '',
    ].join(':')

    return entries.map((entry): SavedActivityObservation => {
      const objectKey = savedObjectKey(entry)
      if (entry.kind === 'aircraft') {
        const resolution = resolveSavedAircraft(
          entry,
          aircraft,
          true,
          aircraftAvailability,
        )
        return {
          entry,
          objectKey,
          contextKey,
          state: trafficActivityState(
            resolution,
            aircraftRevision,
            aircraftStatus,
            aircraftAvailability,
          ),
        }
      }
      if (entry.kind === 'vessel') {
        const resolution = resolveSavedVessel(
          entry,
          vessels,
          true,
          new Set(vessels.map((vessel) => vessel.id)),
          vesselAvailability,
        )
        return {
          entry,
          objectKey,
          contextKey,
          state: trafficActivityState(
            resolution,
            vesselRevision,
            vesselStatus,
            vesselAvailability,
          ),
        }
      }
      if (entry.kind === 'orbital') {
        const resolution = resolveSavedOrbital(
          entry,
          orbitalCatalog,
          curated,
          starlink,
        )
        const sourceState =
          orbitalCatalog.find(
            (candidate) => candidate.record.noradCatalogId === entry.id,
          )?.owner === 'starlink'
            ? starlink
            : curated
        const active = orbitalActive(sourceState)
        const revision = Math.max(
          sourceState.lastSuccessAt ?? 0,
          sourceState.positions.find(
            (position) => position.noradCatalogId === entry.id,
          )?.modeledFor ?? 0,
        )
        const crossing = active ? orbitalEntries.get(entry.id) : undefined
        return {
          entry,
          objectKey,
          contextKey: orbitalContext,
          state:
            !active || revision <= 0
              ? { phase: 'suspended' }
              : resolution.state === 'conflict'
                ? {
                    phase: 'conflict',
                    revision,
                    signature:
                      resolution.conflictSignature ?? resolution.status,
                    detail: resolution.detail,
                  }
                : {
                    phase:
                      resolution.state === 'current'
                        ? 'current'
                        : 'noncurrent',
                    revision,
                  },
          ...(crossing?.firstCrossingAt
            ? {
                crossing: {
                  signature: `${entry.id}:${crossing.firstCrossingAt}`,
                  firstCrossingAt: crossing.firstCrossingAt,
                },
              }
            : {}),
        }
      }
      return {
        entry,
        objectKey,
        contextKey,
        state: { phase: 'suspended' },
      }
    })
  }, [
    aircraft,
    aircraftAvailability,
    aircraftStatus,
    contextKey,
    curated,
    entries,
    historyActive,
    orbitalCatalog,
    savedReady,
    starlink,
    vesselAvailability,
    vesselStatus,
    vessels,
  ])

  useEffect(() => {
    setState((current) =>
      observeSavedActivity(
        current,
        observations,
        now,
        config.maxActivityEntries,
      ),
    )
  }, [config.maxActivityEntries, now, observations])

  const acknowledge = useCallback(() => {
    setState(acknowledgeSavedActivity)
  }, [])

  return {
    records: state.records,
    unreadCount: state.unreadIds.size,
    acknowledge,
  }
}
