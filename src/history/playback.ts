import type { TrafficEntity, TrailPoint } from '../domain/traffic'
import {
  historicalEntityKey,
  historicalObservationKey,
  historicalObservationToEntity,
  type HistoricalObservation,
} from './observations'

export const PLAYBACK_SPEEDS = [0.5, 1, 2, 4] as const
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number]

export interface PlaybackRange {
  oldest: number
  newest: number
}

export type PlaybackState =
  | { mode: 'live' }
  | {
      mode: 'history-paused'
      cursor: number
      range: PlaybackRange
      speed: PlaybackSpeed
    }
  | {
      mode: 'history-playing'
      cursor: number
      range: PlaybackRange
      speed: PlaybackSpeed
    }

export type PlaybackAction =
  | { type: 'enter'; range: PlaybackRange }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'scrub'; cursor: number }
  | { type: 'set-speed'; speed: PlaybackSpeed }
  | { type: 'tick'; elapsedMs: number }
  | { type: 'return-live' }

export const initialPlaybackState: PlaybackState = { mode: 'live' }

const clampCursor = (cursor: number, range: PlaybackRange) =>
  Math.min(range.newest, Math.max(range.oldest, cursor))

export const playbackReducer = (
  state: PlaybackState,
  action: PlaybackAction,
): PlaybackState => {
  switch (action.type) {
    case 'enter':
      return {
        mode: 'history-paused',
        cursor: action.range.newest,
        range: action.range,
        speed: 1,
      }
    case 'return-live':
      return initialPlaybackState
    case 'play':
      return state.mode === 'live'
        ? state
        : { ...state, mode: 'history-playing' }
    case 'pause':
      return state.mode === 'history-playing'
        ? { ...state, mode: 'history-paused' }
        : state
    case 'scrub':
      return state.mode === 'live'
        ? state
        : {
            ...state,
            mode: 'history-paused',
            cursor: clampCursor(action.cursor, state.range),
          }
    case 'set-speed':
      return state.mode === 'live'
        ? state
        : { ...state, speed: action.speed }
    case 'tick': {
      if (state.mode !== 'history-playing') return state
      const cursor = clampCursor(
        state.cursor + action.elapsedMs * state.speed,
        state.range,
      )
      return cursor >= state.range.newest
        ? { ...state, mode: 'history-paused', cursor }
        : { ...state, cursor }
    }
  }
}

export const mergeHistoricalObservations = (
  durable: readonly HistoricalObservation[],
  session: readonly HistoricalObservation[],
) => {
  const merged = new Map<string, HistoricalObservation>()
  for (const observation of session) {
    merged.set(historicalObservationKey(observation), observation)
  }
  for (const observation of durable) {
    merged.set(historicalObservationKey(observation), observation)
  }
  return [...merged.values()].sort(
    (first, second) =>
      first.observedAt - second.observedAt ||
      first.receivedAt - second.receivedAt ||
      first.entityId.localeCompare(second.entityId),
  )
}

export const boundHistoricalObservations = (
  observations: readonly HistoricalObservation[],
  retentionMs: number,
  maxRecords: number,
  maxLogicalBytes: number,
  now: number,
) => {
  const deduplicated = new Map<string, HistoricalObservation>()
  for (const observation of observations) {
    deduplicated.set(historicalObservationKey(observation), observation)
  }
  const records = [...deduplicated.values()].sort(
    (first, second) =>
      first.receivedAt - second.receivedAt ||
      first.observedAt - second.observedAt ||
      first.entityId.localeCompare(second.entityId),
  )
  let logicalBytes = records.reduce(
    (total, observation) => total + observation.logicalBytes,
    0,
  )
  const cutoff = now - retentionMs
  let removeCount = 0
  while (removeCount < records.length) {
    const observation = records[removeCount]
    const overTime = observation.receivedAt < cutoff
    const overCount = records.length - removeCount > maxRecords
    const overBytes = logicalBytes > maxLogicalBytes
    if (!overTime && !overCount && !overBytes) break
    logicalBytes -= observation.logicalBytes
    removeCount += 1
  }
  return records.slice(removeCount)
}

export type ObservationIndex = ReadonlyMap<
  string,
  readonly HistoricalObservation[]
>

export const createObservationIndex = (
  observations: readonly HistoricalObservation[],
): ObservationIndex => {
  const index = new Map<string, HistoricalObservation[]>()
  for (const observation of observations) {
    const key = historicalEntityKey(observation)
    const records = index.get(key) ?? []
    records.push(observation)
    index.set(key, records)
  }
  for (const records of index.values()) {
    records.sort(
      (first, second) =>
        first.observedAt - second.observedAt ||
        first.receivedAt - second.receivedAt,
    )
  }
  return index
}

const observationAtOrBefore = (
  records: readonly HistoricalObservation[],
  cursor: number,
) => {
  let low = 0
  let high = records.length - 1
  let match: HistoricalObservation | undefined

  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const candidate = records[middle]
    if (candidate.observedAt <= cursor) {
      match = candidate
      low = middle + 1
    } else {
      high = middle - 1
    }
  }

  return match
}

export const historicalSnapshot = (
  index: ObservationIndex,
  cursor: number,
) => historicalSnapshotFromIndexes([index], cursor)

export const historicalSnapshotFromIndexes = (
  indexes: readonly ObservationIndex[],
  cursor: number,
): TrafficEntity[] => {
  const observations = new Map<string, HistoricalObservation>()
  for (const index of indexes) {
    for (const [key, records] of index) {
      const candidate = observationAtOrBefore(records, cursor)
      if (!candidate) continue
      const current = observations.get(key)
      if (
        !current ||
        candidate.observedAt >= current.observedAt
      ) {
        observations.set(key, candidate)
      }
    }
  }
  return [...observations.values()].map((observation) =>
    historicalObservationToEntity(observation, cursor),
  )
}

export const historicalRange = (
  observations: readonly HistoricalObservation[],
): PlaybackRange | undefined => {
  if (observations.length === 0) return undefined
  let oldest = observations[0].observedAt
  let newest = observations[0].observedAt
  for (const observation of observations.slice(1)) {
    oldest = Math.min(oldest, observation.observedAt)
    newest = Math.max(newest, observation.observedAt)
  }
  return { oldest, newest }
}

export const historicalTrailSegments = (
  index: ObservationIndex,
  selectedId: string | null,
  cursor: number,
  durationMs: number,
  gapThresholds: Readonly<Record<'aircraft' | 'vessel', number>>,
) =>
  historicalTrailSegmentsFromIndexes(
    [index],
    selectedId,
    cursor,
    durationMs,
    gapThresholds,
  )

export const historicalTrailSegmentsFromIndexes = (
  indexes: readonly ObservationIndex[],
  selectedId: string | null,
  cursor: number,
  durationMs: number,
  gapThresholds: Readonly<Record<'aircraft' | 'vessel', number>>,
) => {
  if (!selectedId) return [] as readonly (readonly TrailPoint[])[]
  const matching = indexes.flatMap((index) => {
    const entry = [...index.entries()].find(([, records]) =>
      records.some((record) => record.entityId === selectedId),
    )
    return entry ? [...entry[1]] : []
  })
  if (matching.length === 0) {
    return [] as readonly (readonly TrailPoint[])[]
  }

  const cutoff = cursor - durationMs
  const records = mergeHistoricalObservations([], matching).filter(
    (record) =>
      record.observedAt >= cutoff && record.observedAt <= cursor,
  )
  const segments: TrailPoint[][] = []
  let current: TrailPoint[] = []
  let previous: HistoricalObservation | undefined

  for (const record of records) {
    const gapThreshold = gapThresholds[record.kind]
    if (
      previous &&
      (record.sessionId !== previous.sessionId ||
        record.segmentId !== previous.segmentId ||
        record.observedAt - previous.observedAt > gapThreshold)
    ) {
      if (current.length > 0) segments.push(current)
      current = []
    }
    current.push({
      observedAt: record.observedAt,
      latitude: record.latitude,
      longitude: record.longitude,
    })
    previous = record
  }
  if (current.length > 0) segments.push(current)
  return segments
}
