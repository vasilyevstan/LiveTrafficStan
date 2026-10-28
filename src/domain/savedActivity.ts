import type { SavedObject, SavedObjectKind } from './savedObjects'

export type SavedActivityKind =
  | 'received'
  | 'received-again'
  | 'identity-conflict'
  | 'modeled-crossing'

export interface SavedActivityRecord {
  id: string
  objectKey: string
  objectKind: SavedObjectKind
  savedLabel: string
  kind: SavedActivityKind
  createdAt: number
  signature: string
  detail?: string
}

export type SavedActivityObjectState =
  | {
      phase: 'suspended'
    }
  | {
      phase: 'current' | 'noncurrent'
      revision: number
    }
  | {
      phase: 'conflict'
      revision: number
      signature: string
      detail?: string
    }

export interface SavedActivityObservation {
  entry: SavedObject
  objectKey: string
  contextKey: string
  state: SavedActivityObjectState
  crossing?: {
    signature: string
    firstCrossingAt: number
  }
}

interface SavedActivityTracker {
  contextKey: string
  phase: SavedActivityObjectState['phase']
  revision?: number
  seenCurrent: boolean
  conflictSignature?: string
  crossingSignature?: string
}

export interface SavedActivityState {
  records: readonly SavedActivityRecord[]
  unreadIds: ReadonlySet<string>
  trackers: ReadonlyMap<string, SavedActivityTracker>
  nextId: number
}

export const emptySavedActivityState = (): SavedActivityState => ({
  records: [],
  unreadIds: new Set(),
  trackers: new Map(),
  nextId: 1,
})

const activityMessage = (
  kind: SavedActivityKind,
  state: SavedActivityObjectState,
) => {
  switch (kind) {
    case 'received':
      return undefined
    case 'received-again':
      return undefined
    case 'identity-conflict':
      return state.phase === 'conflict' ? state.detail : undefined
    case 'modeled-crossing':
      return undefined
  }
}

const addRecord = (
  state: SavedActivityState,
  observation: SavedActivityObservation,
  kind: SavedActivityKind,
  signature: string,
  createdAt: number,
  maximumRecords: number,
) => {
  const id = `saved-activity-${state.nextId}`
  const record: SavedActivityRecord = {
    id,
    objectKey: observation.objectKey,
    objectKind: observation.entry.kind,
    savedLabel: observation.entry.savedLabel,
    kind,
    createdAt,
    signature,
    ...(activityMessage(kind, observation.state)
      ? { detail: activityMessage(kind, observation.state) }
      : {}),
  }
  const records = [record, ...state.records].slice(0, maximumRecords)
  const retainedIds = new Set(records.map((candidate) => candidate.id))
  return {
    ...state,
    records,
    unreadIds: new Set(
      [...state.unreadIds, id].filter((candidate) => retainedIds.has(candidate)),
    ),
    nextId: state.nextId + 1,
  }
}

const sameTracker = (
  first: SavedActivityTracker | undefined,
  second: SavedActivityTracker,
) =>
  first?.contextKey === second.contextKey &&
  first.phase === second.phase &&
  first.revision === second.revision &&
  first.seenCurrent === second.seenCurrent &&
  first.conflictSignature === second.conflictSignature &&
  first.crossingSignature === second.crossingSignature

export const observeSavedActivity = (
  state: SavedActivityState,
  observations: readonly SavedActivityObservation[],
  createdAt: number,
  maximumRecords: number,
): SavedActivityState => {
  const activeKeys = new Set(observations.map(({ objectKey }) => objectKey))
  const trackers = new Map(
    [...state.trackers].filter(([key]) => activeKeys.has(key)),
  )
  const records = state.records.filter(({ objectKey }) =>
    activeKeys.has(objectKey),
  )
  const unreadIds = new Set(
    [...state.unreadIds].filter((id) =>
      records.some((record) => record.id === id),
    ),
  )
  let changed =
    trackers.size !== state.trackers.size ||
    records.length !== state.records.length ||
    unreadIds.size !== state.unreadIds.size
  let next: SavedActivityState = {
    ...state,
    records,
    unreadIds,
    trackers,
  }

  for (const observation of observations) {
    const prior = trackers.get(observation.objectKey)
    const contextChanged = prior?.contextKey !== observation.contextKey
    const current = observation.state
    const tracker: SavedActivityTracker = {
      contextKey: observation.contextKey,
      phase: current.phase,
      ...(current.phase === 'suspended'
        ? {}
        : { revision: current.revision }),
      seenCurrent:
        contextChanged
          ? current.phase === 'current'
          : Boolean(prior?.seenCurrent || current.phase === 'current'),
      ...(current.phase === 'conflict'
        ? { conflictSignature: current.signature }
        : {}),
      ...(observation.crossing
        ? { crossingSignature: observation.crossing.signature }
        : prior?.crossingSignature
          ? { crossingSignature: prior.crossingSignature }
          : {}),
    }

    if (!prior || contextChanged || current.phase === 'suspended') {
      if (!sameTracker(prior, tracker)) changed = true
      trackers.set(observation.objectKey, tracker)
      continue
    }

    if (
      (observation.entry.kind === 'aircraft' ||
        observation.entry.kind === 'vessel') &&
      current.phase === 'current' &&
      prior.phase === 'noncurrent' &&
      prior.revision !== current.revision
    ) {
      const kind = prior.seenCurrent ? 'received-again' : 'received'
      next = addRecord(
        next,
        observation,
        kind,
        `${kind}:${current.revision}`,
        createdAt,
        maximumRecords,
      )
      changed = true
    }

    if (
      current.phase === 'conflict' &&
      prior.conflictSignature !== current.signature
    ) {
      next = addRecord(
        next,
        observation,
        'identity-conflict',
        `identity-conflict:${current.signature}`,
        createdAt,
        maximumRecords,
      )
      changed = true
    }

    if (
      observation.crossing &&
      prior.crossingSignature !== observation.crossing.signature
    ) {
      next = addRecord(
        next,
        observation,
        'modeled-crossing',
        `modeled-crossing:${observation.crossing.signature}`,
        createdAt,
        maximumRecords,
      )
      changed = true
    }

    if (!sameTracker(prior, tracker)) changed = true
    trackers.set(observation.objectKey, tracker)
  }

  return changed ? { ...next, trackers } : state
}

export const acknowledgeSavedActivity = (
  state: SavedActivityState,
): SavedActivityState =>
  state.unreadIds.size === 0
    ? state
    : {
        ...state,
        unreadIds: new Set(),
      }

export const savedActivityLabel = (record: SavedActivityRecord) => {
  switch (record.kind) {
    case 'received':
      return 'Received in current map data'
    case 'received-again':
      return 'Received again in current map data'
    case 'identity-conflict':
      return 'Reported identity changed'
    case 'modeled-crossing':
      return 'Upcoming modeled crossing of the current map area'
  }
}
