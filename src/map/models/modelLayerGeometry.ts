import type { ModelGroup, ModelInstance, PackedModelInstances } from './modelInstances'
import {
  MODEL_FLAG_DROP_LINE,
  MODEL_FLAG_SELECTED,
  mercatorUnitsPerMeter,
  mercatorX,
  mercatorY,
  modelHitDistance,
  projectModelInstance,
  transformVec4,
  wrapMercatorOffset,
  type MercatorPoint,
  type ModelAnchor,
  type ModelFrame,
  type ScreenGeometry,
} from './modelProjection'

/** Extra screen margin, in CSS pixels, for icon-floor sizes, rings, and lines. */
export const WORLD_COPY_MARGIN_PX = 256
export const MAXIMUM_WORLD_COPY = 3
export const MERCATOR_TILE_SIZE = 512

export interface ModelGroupStats {
  airborne: boolean
  anyDropLine: boolean
  anySelected: boolean
  anyFlag: boolean
  /** Reference-relative Mercator bounds, padded by the largest model extent. */
  minX: number
  maxX: number
  minY: number
  maxY: number
  maxZ: number
}

export const modelGroupStats = (packed: PackedModelInstances): ModelGroupStats => {
  const stats: ModelGroupStats = {
    airborne: false,
    anyDropLine: false,
    anySelected: false,
    anyFlag: false,
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    maxZ: 0,
  }
  for (const instance of packed.instances) {
    const mpm = mercatorUnitsPerMeter(instance.latitude)
    const x = wrapMercatorOffset(mercatorX(instance.longitude) - packed.reference.x)
    const y = mercatorY(instance.latitude) - packed.reference.y
    const pad = instance.extentMeters * mpm
    stats.minX = Math.min(stats.minX, x - pad)
    stats.maxX = Math.max(stats.maxX, x + pad)
    stats.minY = Math.min(stats.minY, y - pad)
    stats.maxY = Math.max(stats.maxY, y + pad)
    stats.maxZ = Math.max(stats.maxZ, (Math.max(0, instance.altitudeMeters) + instance.extentMeters) * mpm)
    if (instance.altitudeMeters > 0) stats.airborne = true
    if (instance.flags & MODEL_FLAG_DROP_LINE) stats.anyDropLine = true
    if (instance.flags & MODEL_FLAG_SELECTED) stats.anySelected = true
    if ((instance.flagSlot ?? 0) > 0) stats.anyFlag = true
  }
  return stats
}

/**
 * Whether the camera centre drifted far enough to lose float32 offset precision.
 * MapLibre may report an unwrapped centre, so whole-world jumps also re-anchor.
 */
export const referenceNeedsUpdate = (
  reference: MercatorPoint | undefined,
  center: MercatorPoint,
  zoom: number,
  limits: { maximumReferenceDriftWorlds: number; maximumReferenceDriftPx: number },
) => {
  if (!reference) return true
  const drift = Math.max(Math.abs(center.x - reference.x), Math.abs(center.y - reference.y))
  return (
    !(drift <= limits.maximumReferenceDriftWorlds) ||
    !(drift * MERCATOR_TILE_SIZE * 2 ** zoom <= limits.maximumReferenceDriftPx)
  )
}

/** Conservative clip-space test: hidden only when all corners leave one plane. */
export const worldCopyVisible = (frame: ModelFrame, stats: ModelGroupStats, copy: number) => {
  if (!(stats.minX <= stats.maxX)) return false
  const marginX = 1 + (2 * WORLD_COPY_MARGIN_PX) / frame.cssWidth
  const marginY = 1 + (2 * WORLD_COPY_MARGIN_PX) / frame.cssHeight
  let left = true
  let right = true
  let bottom = true
  let top = true
  let behind = true
  for (const x of [stats.minX + copy, stats.maxX + copy]) {
    for (const y of [stats.minY, stats.maxY]) {
      for (const z of [0, stats.maxZ]) {
        const [cx, cy, , cw] = transformVec4(frame.rtcMatrix, x, y, z, 1)
        if (cx >= -cw * marginX) left = false
        if (cx <= cw * marginX) right = false
        if (cy >= -cw * marginY) bottom = false
        if (cy <= cw * marginY) top = false
        if (cw > 0) behind = false
      }
    }
  }
  return !(left || right || bottom || top || behind)
}

/** Copy 0 always draws; Mercator world copies draw only when they can be visible. */
export const visibleWorldCopies = (
  frame: ModelFrame,
  stats: ModelGroupStats,
  renderWorldCopies: boolean,
) => {
  const copies = [0]
  if (frame.transition > 0 || !renderWorldCopies) return copies
  for (let distance = 1; distance <= MAXIMUM_WORLD_COPY; distance += 1) {
    for (const copy of [-distance, distance]) {
      if (worldCopyVisible(frame, stats, copy)) copies.push(copy)
    }
  }
  return copies
}

export interface ModelPickAnchor {
  id: string
  anchor: ModelAnchor
}

export const modelPickAnchors = (
  frame: ModelFrame,
  instances: readonly ModelInstance[],
  copies: readonly number[],
): ModelPickAnchor[] => {
  const anchors: ModelPickAnchor[] = []
  for (const copy of copies) {
    const shifted: ModelFrame =
      copy === 0
        ? frame
        : { ...frame, reference: { x: frame.reference.x + copy, y: frame.reference.y } }
    for (const instance of instances) {
      const anchor = projectModelInstance(shifted, instance)
      if (anchor) anchors.push({ id: instance.id, anchor })
    }
  }
  return anchors
}

export interface ModelPickHit {
  group: ModelGroup
  id: string
  distance: number
}

/**
 * Nearest hit per object, ordered by screen distance from the query. Co-located
 * objects tie exactly; the larger drawn model encloses the others and wins,
 * such as the ISS over its docked modules and visiting vehicles.
 */
export const modelPickHits = (
  group: ModelGroup,
  anchors: readonly ModelPickAnchor[],
  geometry: ScreenGeometry,
): ModelPickHit[] => {
  const nearest = new Map<string, { distance: number; radiusPx: number }>()
  for (const { id, anchor } of anchors) {
    const distance = modelHitDistance(anchor, geometry)
    if (distance === undefined) continue
    const previous = nearest.get(id)
    if (previous === undefined || distance < previous.distance) {
      nearest.set(id, { distance, radiusPx: anchor.radiusPx })
    }
  }
  return [...nearest]
    .sort(([, a], [, b]) => a.distance - b.distance || b.radiusPx - a.radiusPx)
    .map(([id, { distance }]) => ({ group, id, distance }))
}
