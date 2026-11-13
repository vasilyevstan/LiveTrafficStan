import { LAYER_ORBITAL_POINTS, LAYER_STARLINK_POINTS } from '../orbitalStyle'
import type { ModelGroup } from './modelInstances'
import type { ModelPickHit } from './modelLayerGeometry'

// Type-only model imports keep the lazy model runtime out of the map entry chunk.

export const TRAFFIC_MODEL_LAYER_ID = 'traffic-models-3d'

export const TRAFFIC_MODEL_GROUPS = ['aircraft', 'vessels'] as const satisfies readonly ModelGroup[]
export const ORBITAL_MODEL_GROUPS = ['orbital', 'starlink'] as const satisfies readonly ModelGroup[]

export type ModelActivity = Readonly<Record<ModelGroup, boolean>>

export const INACTIVE_MODEL_ACTIVITY: ModelActivity = Object.freeze({
  aircraft: false,
  vessels: false,
  orbital: false,
  starlink: false,
})

export interface ModelActivityInput {
  /** Runtime loaded and unfailed, layer installed, and WebGL context alive. */
  available: boolean
  captured: boolean
  zoom: number
  clusteringEnabled: boolean
  clusterMaximumZoom: number
  aircraftVisible: boolean
  vesselsVisible: boolean
  orbitalVisible: boolean
  starlinkVisible: boolean
}

/**
 * Traffic models replace only unclustered flat symbols, matching the integer
 * tile zoom GeoJSON clustering uses; captured views keep the flat path.
 */
export const resolveModelActivity = (input: ModelActivityInput): ModelActivity => {
  if (!input.available || input.captured) return INACTIVE_MODEL_ACTIVITY
  const unclustered =
    !input.clusteringEnabled || Math.floor(input.zoom) > input.clusterMaximumZoom
  return {
    aircraft: input.aircraftVisible && unclustered,
    vessels: input.vesselsVisible && unclustered,
    orbital: input.orbitalVisible,
    starlink: input.starlinkVisible,
  }
}

export const sameModelActivity = (a: ModelActivity, b: ModelActivity) =>
  a.aircraft === b.aircraft &&
  a.vessels === b.vessels &&
  a.orbital === b.orbital &&
  a.starlink === b.starlink

export const activeModelGroups = (
  activity: ModelActivity,
  groups: readonly ModelGroup[],
): ModelGroup[] => groups.filter((group) => activity[group])

/** Model hits as the minimal rendered-feature shape the pick helpers read. */
export const modelPickFeatures = (hits: readonly ModelPickHit[]) =>
  hits.map((hit) => ({ properties: { id: hit.id } as Record<string, unknown> }))

interface FlatPickFeature {
  layer?: { id: string }
  properties: Record<string, unknown> | null
}

/**
 * Zero-opacity orbital icons remain queryable at their ground point. While a
 * group is model-drawn, keep only what is still visible there: featured
 * labels and selection highlights.
 */
export const visibleFlatOrbitalFeatures = <F extends FlatPickFeature>(
  features: readonly F[],
  activity: ModelActivity,
) =>
  features.filter((feature) => {
    const layerId = feature.layer?.id
    if (layerId === LAYER_ORBITAL_POINTS && activity.orbital) {
      return typeof feature.properties?.featuredLabel === 'string'
    }
    return !(layerId === LAYER_STARLINK_POINTS && activity.starlink)
  })
