import { useEffect, useMemo, useRef, useState } from 'react'
import type { InViewAvailability } from '../domain/inView'
import type { OrbitalCatalogEntry } from '../domain/catalogDiscovery'
import type { OrbitalControllerState } from '../domain/orbital'
import type { Airport, AirportSource } from '../domain/airports'
import type { Port, PortSource } from '../domain/ports'
import {
  savedObjectContext,
  savedObjectQuery,
  matchesSavedObjectQuery,
  resolveSavedAircraft,
  resolveSavedAirport,
  resolveSavedOrbital,
  resolveSavedPort,
  resolveSavedVessel,
  type SavedObjectResolution,
} from '../domain/savedObjectResolution'
import {
  savedObjectKey,
  type SavedObject,
  type SavedObjectsLoadResult,
  type SavedObjectsMutationResult,
} from '../domain/savedObjects'
import {
  savedActivityLabel,
  type SavedActivityRecord,
} from '../domain/savedActivity'
import { formatAge } from '../domain/format'
import type { DisplayAircraft, DisplayVessel } from '../domain/traffic'
import { ObjectResultButton } from './ObjectResultButton'

interface Props {
  entries: readonly SavedObject[]
  status: SavedObjectsLoadResult
  activity: readonly SavedActivityRecord[]
  activityUnreadCount: number
  active: boolean
  now: number
  onAcknowledgeActivity: () => void
  query: string
  aircraft: readonly DisplayAircraft[]
  vessels: readonly DisplayVessel[]
  aircraftVisible: boolean
  vesselsVisible: boolean
  selectableVesselIds: ReadonlySet<string>
  aircraftAvailability: InViewAvailability
  vesselAvailability: InViewAvailability
  lastObservedAt: (entry: SavedObject) => number | undefined
  airports: readonly Airport[]
  airportsReady: boolean
  airportSource?: AirportSource
  ports: readonly Port[]
  portsReady: boolean
  portSource?: PortSource
  orbitalCatalog: readonly OrbitalCatalogEntry[]
  curated: OrbitalControllerState
  starlink: OrbitalControllerState
  navigationDisabled: boolean
  onAircraftSelect: (id: string, originId: string) => void
  onVesselSelect: (id: string, originId: string) => void
  onAirportNavigate: (id: string, originId: string) => boolean
  onPortNavigate: (id: string, originId: string) => boolean
  onOrbitalNavigate: (id: string, originId: string) => boolean
  onPrefillFind: (query: string) => void
  onLoadAirports: () => void
  onLoadPorts: () => void
  onLoadOrbits: () => void
  loadsDisabled?: boolean
  onRemove: (key: string) => SavedObjectsMutationResult
  onClear: () => SavedObjectsMutationResult
  onRestore: (
    entry: SavedObject,
    expectedClearEpoch: number,
  ) => SavedObjectsMutationResult
}

const classLabel = (entry: SavedObject) => {
  switch (entry.kind) {
    case 'aircraft':
      return 'Aircraft'
    case 'vessel':
      return 'Ship'
    case 'orbital':
      return 'Satellite'
    case 'airport':
      return 'Airport'
    case 'port':
      return 'Port'
  }
}

export function SavedObjects(props: Props) {
  const [message, setMessage] = useState<string>()
  const [clearArmed, setClearArmed] = useState(false)
  const [lastRemoved, setLastRemoved] = useState<{
    entry: SavedObject
    clearEpoch: number
  }>()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const {
    active,
    activityUnreadCount,
    onAcknowledgeActivity,
  } = props
  const entries = useMemo(
    () =>
      props.entries
        .filter((entry) => matchesSavedObjectQuery(entry, props.query))
        .sort(
          (first, second) =>
            second.savedAt - first.savedAt ||
            first.savedLabel.localeCompare(second.savedLabel),
        ),
    [props.entries, props.query],
  )
  const sectionVisible = !props.query || entries.length > 0
  useEffect(() => {
    if (active && sectionVisible && activityUnreadCount > 0) {
      onAcknowledgeActivity()
    }
  }, [
    active,
    activityUnreadCount,
    onAcknowledgeActivity,
    sectionVisible,
  ])
  const restoreLastRemoved = () => {
    if (!lastRemoved) return
    const result = props.onRestore(
      lastRemoved.entry,
      lastRemoved.clearEpoch,
    )
    setMessage(result.ok ? `Restored ${lastRemoved.entry.savedLabel}.` : result.message)
    if (result.ok) setLastRemoved(undefined)
  }
  const feedback = message && (
    <p className="control-note" role="status">
      {message}{' '}
      {lastRemoved && (
        <button
          type="button"
          className="saved-objects__undo"
          onClick={restoreLastRemoved}
        >
          Undo
        </button>
      )}
    </p>
  )
  const resolve = (entry: SavedObject): SavedObjectResolution => {
    switch (entry.kind) {
      case 'aircraft':
        return resolveSavedAircraft(
          entry,
          props.aircraft,
          props.aircraftVisible,
          props.aircraftAvailability,
          props.lastObservedAt(entry),
        )
      case 'vessel':
        return resolveSavedVessel(
          entry,
          props.vessels,
          props.vesselsVisible,
          props.selectableVesselIds,
          props.vesselAvailability,
          props.lastObservedAt(entry),
        )
      case 'orbital':
        return resolveSavedOrbital(
          entry,
          props.orbitalCatalog,
          props.curated,
          props.starlink,
        )
      case 'airport':
        return resolveSavedAirport(
          entry,
          props.airports,
          props.airportsReady,
          props.airportSource?.outputVersion,
        )
      case 'port':
        return resolveSavedPort(
          entry,
          props.ports,
          props.portsReady,
          props.portSource?.outputVersion,
        )
    }
  }
  const act = (
    entry: SavedObject,
    resolution: SavedObjectResolution,
    originId: string,
  ) => {
    if (resolution.targetId) {
      const succeeded =
        entry.kind === 'aircraft'
          ? (props.onAircraftSelect(resolution.targetId, originId), true)
          : entry.kind === 'vessel'
            ? (props.onVesselSelect(resolution.targetId, originId), true)
            : entry.kind === 'orbital'
              ? props.onOrbitalNavigate(resolution.targetId, originId)
              : entry.kind === 'airport'
                ? props.onAirportNavigate(resolution.targetId, originId)
                : props.onPortNavigate(resolution.targetId, originId)
      if (!succeeded) setMessage('That saved object is no longer available. Review its status.')
      return
    }
    if (entry.kind === 'airport' && !props.airportsReady) {
      props.onLoadAirports()
      return
    }
    if (entry.kind === 'port' && !props.portsReady) {
      props.onLoadPorts()
      return
    }
    if (entry.kind === 'orbital' && resolution.state === 'unavailable') {
      props.onLoadOrbits()
      return
    }
    props.onPrefillFind(savedObjectQuery(entry))
  }

  if (
    props.entries.length === 0 &&
    props.status.phase === 'ready'
  ) {
    if (props.query && !message) return null
    return (
      <section className="saved-objects" aria-labelledby="saved-objects-heading">
        <h3 id="saved-objects-heading" ref={headingRef} tabIndex={-1}>
          Saved
        </h3>
        {feedback}
        <p className="control-note">
          No saved objects on this browser. Select an aircraft, ship, satellite,
          airport, or port and use Save in its details.
        </p>
      </section>
    )
  }
  if (entries.length === 0 && props.query) return null

  return (
    <section className="saved-objects" aria-labelledby="saved-objects-heading">
      <div className="saved-objects__heading">
        <h3 id="saved-objects-heading" ref={headingRef} tabIndex={-1}>
          Saved
          {props.activityUnreadCount > 0 && (
            <span
              className="saved-activity__count"
              aria-label={`${props.activityUnreadCount} new Saved ${
                props.activityUnreadCount === 1 ? 'activity' : 'activities'
              } observed in this tab`}
            >
              {props.activityUnreadCount} new
            </span>
          )}
        </h3>
        {!props.query && props.entries.length > 0 && (
          <button
            type="button"
            className="saved-objects__clear"
            onBlur={() => setClearArmed(false)}
            onClick={() => {
              if (!clearArmed) {
                setClearArmed(true)
                setMessage('Activate again to clear saved identities from this browser profile.')
                return
              }
              const result = props.onClear()
              setClearArmed(false)
              setLastRemoved(undefined)
              setMessage(result.message)
              headingRef.current?.focus()
            }}
          >
            {clearArmed ? 'Confirm clear' : 'Clear all'}
          </button>
        )}
      </div>
      {props.status.phase !== 'ready' && (
        <p className="control-note" role="alert">{props.status.message}</p>
      )}
      {feedback}
      <p className="control-note control-note--muted">
        Visible to anyone using this browser profile. Saved membership performs no background lookup.
      </p>
      {props.activity.length > 0 && (
        <section
          className="saved-activity"
          aria-labelledby="saved-activity-heading"
        >
          <h4 id="saved-activity-heading">Saved activity</h4>
          <p className="control-note control-note--muted">
            Observed only while this tab is open. Reloading clears this list.
          </p>
          <ul
            className="object-find-results saved-activity__list"
            aria-label="Saved activity"
          >
            {props.activity.map((activity) => {
              const entry = props.entries.find(
                (candidate) => savedObjectKey(candidate) === activity.objectKey,
              )
              const resolution = entry ? resolve(entry) : undefined
              const canAct = Boolean(
                entry &&
                  resolution?.targetId &&
                  resolution.state === 'current' &&
                  !props.navigationDisabled,
              )
              return (
                <li className="object-find-result" key={activity.id}>
                  <div className="object-find-result__identity">
                    <span className="object-find-result__name">
                      <strong>{activity.savedLabel}</strong>
                    </span>
                    <span className="object-find-result__context">
                      {savedActivityLabel(activity)}
                    </span>
                  </div>
                  {entry && resolution && (
                    <div className="object-find-result__action">
                      <ObjectResultButton
                        prefix="saved-activity-result"
                        disabled={!canAct}
                        aria-label={`View current saved ${activity.savedLabel}`}
                        onSelect={(originId) =>
                          act(entry, resolution, originId)
                        }
                      >
                        View
                      </ObjectResultButton>
                    </div>
                  )}
                  <small className="object-find-result__meta">
                    {activity.detail ? `${activity.detail} · ` : ''}
                    <time dateTime={new Date(activity.createdAt).toISOString()}>
                      {formatAge(activity.createdAt, props.now)}
                    </time>
                  </small>
                </li>
              )
            })}
          </ul>
        </section>
      )}
      <ul className="object-find-results saved-objects__list" aria-label="Saved objects">
        {entries.map((entry) => {
          const resolution = resolve(entry)
          const requiresCatalogLoad =
            entry.kind === 'airport' && !props.airportsReady ||
            entry.kind === 'port' && !props.portsReady ||
            entry.kind === 'orbital' &&
              !resolution.targetId &&
              resolution.state === 'unavailable'
          const canFind =
            !resolution.targetId &&
            (entry.kind === 'aircraft' ||
              entry.kind === 'vessel' ||
              resolution.state === 'missing')
          const canAct =
            requiresCatalogLoad
              ? !props.loadsDisabled
              : !props.navigationDisabled &&
                (Boolean(resolution.targetId) || canFind)
          const actionLabel = resolution.targetId
            ? entry.kind === 'aircraft' || entry.kind === 'vessel'
              ? 'View'
              : 'Go'
            : entry.kind === 'airport'
              ? props.airportsReady ? 'Find' : 'Load'
              : entry.kind === 'port'
                ? props.portsReady ? 'Find' : 'Load'
              : entry.kind === 'orbital'
                ? resolution.state === 'unavailable' ? 'Enable' : 'Find'
                : 'Find'
          return (
            <li className="object-find-result" key={savedObjectKey(entry)}>
              <div className="object-find-result__identity">
                <span className="object-find-result__name">
                  <strong>{entry.savedLabel}</strong>
                </span>
                <span className="object-find-result__context">{savedObjectContext(entry)}</span>
              </div>
              <div className="object-find-result__action saved-objects__actions">
                <ObjectResultButton
                  prefix="object-find-result"
                  disabled={!canAct}
                  aria-label={`${actionLabel} saved ${entry.savedLabel}`}
                  onSelect={(originId) => act(entry, resolution, originId)}
                >
                  {actionLabel}
                </ObjectResultButton>
                <button
                  type="button"
                  aria-label={`Remove ${entry.savedLabel} from Saved`}
                  onClick={(event) => {
                    const row = event.currentTarget.closest('li')
                    const next = row?.nextElementSibling?.querySelector<HTMLElement>('button') ??
                      row?.previousElementSibling?.querySelector<HTMLElement>('button')
                    const result = props.onRemove(savedObjectKey(entry))
                    setMessage(result.ok ? `Removed ${entry.savedLabel}.` : result.message)
                    if (result.ok) {
                      setLastRemoved({
                        entry,
                        clearEpoch: props.status.document.clearEpoch,
                      })
                    } else {
                      setLastRemoved(undefined)
                    }
                    requestAnimationFrame(() => (next ?? headingRef.current)?.focus())
                  }}
                >
                  Remove
                </button>
              </div>
              <small className="object-find-result__meta">
                {classLabel(entry)} · saved locally
              </small>
              <span className="object-find-result__status" role="status">
                <span>{resolution.status}</span>
                {resolution.detail && <small>{resolution.detail}</small>}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
