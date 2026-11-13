import type { Feature, Point } from 'geojson'
import type {
  CustomLayerInterface,
  CustomRenderMethodInput,
  Map as MapLibreMap,
} from 'maplibre-gl'
import type { Theme } from '../../app/theme'
import { TRAFFIC_MODEL_CONFIG } from '../../config/appConfig'
import type { ModeledOrbitalPosition } from '../../domain/orbital'
import type { DisplayTrafficEntity } from '../../domain/traffic'
import { orbitalSelectionColor } from '../orbitalStyle'
import { trafficSelectionColor } from '../trafficStyle'
import type { VesselFlagImages } from '../vesselFlagImages'
import { buildModelFlagAtlas, MODEL_FLAG_ATLAS_GUTTER, MODEL_FLAG_PIXEL_RATIO, type ModelFlagAtlas } from './modelFlagAtlas'
import {
  createModelGpuResources,
  deleteModelGpuResources,
  ensureModelFlagTexture,
  pointInstanceAttributes,
  restoreModelGlState,
  uploadGroupInstances,
  type ModelGpuResources,
  type ModelGroupBuffers,
  type ModelProgram,
  type ModelUniform,
} from './modelGl'
import { TRAFFIC_MODEL_LAYER_ID } from './modelActivity'
import {
  MODEL_GROUPS,
  modelOverviewStretch,
  orbitalModelInstances,
  packModelInstances,
  trafficModelInstances,
  type ModelDimensionTable,
  type ModelGroup,
  type ModelInstance,
  type PackedModelInstances,
} from './modelInstances'
import {
  modelGroupStats,
  modelPickAnchors,
  modelPickHits,
  referenceNeedsUpdate,
  visibleWorldCopies,
  type ModelGroupStats,
  type ModelPickAnchor,
  type ModelPickHit,
} from './modelLayerGeometry'
import {
  createModelFrame,
  mercatorX,
  mercatorY,
  type MercatorPoint,
  type ModelFrame,
  type ScreenGeometry,
} from './modelProjection'
import type { TrafficModelMesh } from './trafficModelAsset'
import { hexColorBytes, type TrafficModelId } from './trafficModelCatalog'

export { TRAFFIC_MODEL_LAYER_ID }

export type TrafficModelGroup = Extract<ModelGroup, 'aircraft' | 'vessels'>
export type OrbitalModelGroup = Extract<ModelGroup, 'orbital' | 'starlink'>

interface GroupState {
  instances: readonly ModelInstance[]
  overlayColor: readonly [number, number, number]
  active: boolean
  dirty: boolean
  packed?: PackedModelInstances
  stats?: ModelGroupStats
}

interface RenderedGroup {
  instances: readonly ModelInstance[]
  copies: readonly number[]
  anchors?: readonly ModelPickAnchor[]
}

interface RenderedFrame {
  frame: ModelFrame
  groups: Map<ModelGroup, RenderedGroup>
}

const colorFloats = (hex: string) =>
  hexColorBytes(hex).map((channel) => channel / 255) as unknown as readonly [number, number, number]

/**
 * One persistent MapLibre custom layer for every 3D traffic and orbital model.
 * `onAdd` only stores references: MapLibre does not reset GL state after it,
 * so all GL allocation happens lazily inside `render`.
 */
export class TrafficModelLayer implements CustomLayerInterface {
  readonly id = TRAFFIC_MODEL_LAYER_ID
  readonly type = 'custom' as const
  readonly renderingMode = '3d' as const

  private readonly meshes: ReadonlyMap<TrafficModelId, TrafficModelMesh>
  private readonly dimensions: ModelDimensionTable
  private readonly overviewStretch: ReadonlyMap<TrafficModelId, number>
  private readonly onFailure: (error: unknown) => void
  private readonly groups = new Map<ModelGroup, GroupState>()
  private map?: MapLibreMap
  private resources?: ModelGpuResources
  private reference?: MercatorPoint
  private rendered?: RenderedFrame
  private frameRevision = 0
  private failure?: unknown
  private flagAtlas?: ModelFlagAtlas

  constructor(
    meshes: ReadonlyMap<TrafficModelId, TrafficModelMesh>,
    onFailure: (error: unknown) => void,
  ) {
    this.meshes = meshes
    this.onFailure = onFailure
    this.dimensions = new Map(
      [...meshes].map(([id, mesh]) => [
        id,
        {
          lengthMeters: mesh.lengthMeters,
          beamMeters: mesh.beamMeters,
          heightMeters: mesh.heightMeters,
          bounds: mesh.bounds,
        },
      ]),
    )
    this.overviewStretch = new Map(
      [...this.dimensions].map(([id, size]) => [id, modelOverviewStretch(id, size)]),
    )
    for (const group of MODEL_GROUPS) {
      this.groups.set(group, {
        instances: [],
        overlayColor: [1, 1, 1],
        active: false,
        dirty: true,
      })
    }
  }

  get failed() {
    return this.failure !== undefined
  }

  onAdd(map: MapLibreMap) {
    this.map = map
  }

  onRemove(_map: MapLibreMap, gl: WebGL2RenderingContext) {
    if (this.resources) deleteModelGpuResources(gl, this.resources)
    this.resources = undefined
    this.map = undefined
    this.rendered = undefined
    for (const state of this.groups.values()) state.dirty = true
  }

  setTraffic(
    group: TrafficModelGroup,
    entities: readonly DisplayTrafficEntity[],
    features: readonly Feature<Point>[],
    theme: Theme,
  ) {
    this.setInstances(
      group,
      trafficModelInstances(entities, features, theme, this.dimensions, this.flagAtlas?.slots),
      trafficSelectionColor(theme),
    )
  }

  /**
   * Installs the country-flag atlas once. Call before feeding the traffic that
   * references `flagIcon`, so aircraft flags follow the lifted model.
   */
  setFlagImages(images: VesselFlagImages) {
    if (this.flagAtlas) return
    this.flagAtlas = buildModelFlagAtlas(images)
  }

  setOrbital(
    group: OrbitalModelGroup,
    positions: readonly ModeledOrbitalPosition[],
    shownIds: readonly string[],
    selectedId: string | null,
    theme: Theme,
  ) {
    this.setInstances(
      group,
      orbitalModelInstances(
        positions,
        shownIds,
        selectedId,
        theme,
        group === 'starlink',
        this.dimensions,
      ),
      orbitalSelectionColor(theme, group === 'starlink'),
    )
  }

  setInstances(group: ModelGroup, instances: readonly ModelInstance[], overlayHex: string) {
    const state = this.groups.get(group)!
    state.instances = instances
    state.overlayColor = colorFloats(overlayHex)
    state.dirty = true
    this.map?.triggerRepaint()
  }

  setGroupActive(group: ModelGroup, active: boolean) {
    const state = this.groups.get(group)!
    if (state.active === active) return
    state.active = active
    this.map?.triggerRepaint()
  }

  isGroupActive(group: ModelGroup) {
    return !this.failed && this.groups.get(group)!.active
  }

  /** Hits from the last drawn frame, nearest first, for currently active groups. */
  pick(geometry: ScreenGeometry, groups: readonly ModelGroup[] = MODEL_GROUPS): ModelPickHit[] {
    const rendered = this.rendered
    if (!rendered || this.failed) return []
    const hits: ModelPickHit[] = []
    for (const group of groups) {
      const drawn = rendered.groups.get(group)
      if (!drawn || !this.groups.get(group)!.active) continue
      drawn.anchors ??= modelPickAnchors(rendered.frame, drawn.instances, drawn.copies)
      hits.push(...modelPickHits(group, drawn.anchors, geometry))
    }
    return hits.sort((a, b) => a.distance - b.distance)
  }

  render(gl: WebGL2RenderingContext, options: CustomRenderMethodInput) {
    this.rendered = undefined
    const map = this.map
    if (this.failed || !map || gl.isContextLost()) return
    if (![...this.groups.values()].some((state) => state.active && state.instances.length > 0)) {
      return
    }
    let touched = false
    try {
      const frame = this.createFrame(map, options)
      if (!frame) return
      touched = true
      this.resources ??= createModelGpuResources(gl, this.meshes, MODEL_GROUPS)
      this.frameRevision += 1
      const rendered: RenderedFrame = { frame, groups: new Map() }
      const worldCopies = map.getRenderWorldCopies()
      for (const group of MODEL_GROUPS) {
        const state = this.groups.get(group)!
        if (!state.active) continue
        const buffers = this.resources.groups.get(group)!
        if (state.dirty || !state.packed) {
          state.packed = packModelInstances(state.instances, frame.reference)
          state.stats = modelGroupStats(state.packed)
          uploadGroupInstances(gl, buffers, state.packed.data)
          state.dirty = false
        }
        const { packed, stats } = state
        if (!stats || packed.instances.length === 0) continue
        const copies = visibleWorldCopies(frame, stats, worldCopies)
        rendered.groups.set(group, { instances: packed.instances, copies })
        for (const copy of copies) this.drawGroup(gl, frame, group, state, buffers, copy)
      }
      this.rendered = rendered
    } catch (error) {
      this.fail(gl, error)
    } finally {
      if (touched) restoreModelGlState(gl)
    }
  }

  private createFrame(map: MapLibreMap, options: CustomRenderMethodInput) {
    const center = map.getCenter()
    const zoom = map.getZoom()
    const centerPoint = { x: mercatorX(center.lng), y: mercatorY(center.lat) }
    if (referenceNeedsUpdate(this.reference, centerPoint, zoom, TRAFFIC_MODEL_CONFIG)) {
      this.reference = centerPoint
      for (const state of this.groups.values()) state.dirty = true
    }
    const canvas = map.getCanvas()
    const data = options.defaultProjectionData
    return createModelFrame({
      transition: data.projectionTransition,
      mainMatrix: data.mainMatrix,
      fallbackMatrix: data.fallbackMatrix,
      centerLongitude: center.lng,
      centerLatitude: center.lat,
      zoom,
      cssWidth: canvas.clientWidth,
      cssHeight: canvas.clientHeight,
      reference: this.reference!,
    })
  }

  private useProgram(gl: WebGL2RenderingContext, program: ModelProgram, frame: ModelFrame, copy: number) {
    gl.useProgram(program.program)
    const u = program.uniforms
    if (program.frameRevision !== this.frameRevision) {
      program.frameRevision = this.frameRevision
      setMatrix(gl, u.u_mercator, frame.rtcMatrix)
      setMatrix(gl, u.u_globe, frame.globeRtcMatrix)
      if (u.u_globe_origin) gl.uniform3f(u.u_globe_origin, ...frame.globeOrigin)
      if (u.u_transition) gl.uniform1f(u.u_transition, frame.transition)
      if (u.u_k) gl.uniform2f(u.u_k, frame.kMercator, frame.kGlobe)
      if (u.u_center_w) gl.uniform1f(u.u_center_w, frame.centerW)
      if (u.u_camera_globe) gl.uniform3f(u.u_camera_globe, ...frame.cameraGlobe)
      if (u.u_camera) {
        gl.uniform2f(u.u_camera, frame.cameraMercatorZ, frame.cameraGlobeAltitudeMeters)
      }
      if (u.u_context) gl.uniform1f(u.u_context, frame.contextFactor)
      if (u.u_viewport) gl.uniform2f(u.u_viewport, frame.cssWidth, frame.cssHeight)
    }
    if (u.u_world_offset) gl.uniform1f(u.u_world_offset, copy)
    return u
  }

  private drawGroup(
    gl: WebGL2RenderingContext,
    frame: ModelFrame,
    group: ModelGroup,
    state: GroupState,
    buffers: ModelGroupBuffers,
    copy: number,
  ) {
    const { programs, meshRanges } = this.resources!
    const { packed, stats } = state
    if (!packed || !stats) return
    const count = packed.instances.length
    const orbital = group === 'orbital' || group === 'starlink'

    gl.disable(gl.CULL_FACE)
    gl.colorMask(true, true, true, true)
    gl.depthMask(false)
    if (stats.anyDropLine) {
      gl.enable(gl.DEPTH_TEST)
      gl.depthFunc(gl.LEQUAL)
      const u = this.useProgram(gl, programs.line, frame, copy)
      setColor(gl, u, state.overlayColor)
      gl.bindVertexArray(buffers.overlayVao)
      pointInstanceAttributes(gl, buffers.buffer, 0, false)
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count)
    }
    if (stats.anySelected) {
      gl.disable(gl.DEPTH_TEST)
      const u = this.useProgram(gl, programs.ring, frame, copy)
      setColor(gl, u, state.overlayColor)
      if (u.u_ring_lifted_only) gl.uniform1f(u.u_ring_lifted_only, orbital ? 1 : 0)
      gl.bindVertexArray(buffers.overlayVao)
      pointInstanceAttributes(gl, buffers.buffer, 0, false)
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count)
    }

    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    gl.enable(gl.CULL_FACE)
    gl.cullFace(gl.BACK)
    gl.frontFace(frame.frontFaceCcw ? gl.CCW : gl.CW)
    if (frame.transition > 0) {
      gl.enable(gl.POLYGON_OFFSET_FILL)
      gl.polygonOffset(
        0,
        group === 'vessels'
          ? TRAFFIC_MODEL_CONFIG.vesselGlobeDepthOffsetUnits
          : TRAFFIC_MODEL_CONFIG.globeDepthOffsetUnits,
      )
    }
    const u = this.useProgram(gl, programs.model, frame, copy)
    gl.bindVertexArray(buffers.modelVao)
    const variants = stats.airborne ? [0, 1] : [0]
    for (const depthOnly of [true, false]) {
      gl.colorMask(!depthOnly, !depthOnly, !depthOnly, !depthOnly)
      gl.depthMask(depthOnly)
      if (u.u_depth_only) gl.uniform1f(u.u_depth_only, depthOnly ? 1 : 0)
      for (const footprint of variants) {
        if (u.u_footprint) gl.uniform1f(u.u_footprint, footprint)
        for (const run of packed.runs) {
          const range = meshRanges.get(run.model)
          if (!range) continue
          if (u.u_overview_stretch) {
            gl.uniform1f(u.u_overview_stretch, this.overviewStretch.get(run.model) ?? 1)
          }
          pointInstanceAttributes(gl, buffers.buffer, run.first, true)
          gl.drawArraysInstanced(gl.TRIANGLES, range.first, range.count, run.count)
        }
      }
    }
    gl.disable(gl.POLYGON_OFFSET_FILL)

    const atlas = this.flagAtlas
    if (stats.anyFlag && atlas) {
      const texture = ensureModelFlagTexture(gl, this.resources!, atlas)
      gl.disable(gl.DEPTH_TEST)
      gl.disable(gl.CULL_FACE)
      gl.depthMask(false)
      gl.colorMask(true, true, true, true)
      const flagUniforms = this.useProgram(gl, programs.flag, frame, copy)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      if (flagUniforms.u_flag_atlas) gl.uniform1i(flagUniforms.u_flag_atlas, 0)
      if (flagUniforms.u_flag_grid) {
        gl.uniform4f(
          flagUniforms.u_flag_grid,
          atlas.columns,
          atlas.flagWidth,
          atlas.flagHeight,
          MODEL_FLAG_ATLAS_GUTTER,
        )
      }
      if (flagUniforms.u_flag_atlas_size) {
        gl.uniform2f(flagUniforms.u_flag_atlas_size, atlas.width, atlas.height)
      }
      if (flagUniforms.u_flag_size) {
        gl.uniform2f(
          flagUniforms.u_flag_size,
          atlas.flagWidth / MODEL_FLAG_PIXEL_RATIO,
          atlas.flagHeight / MODEL_FLAG_PIXEL_RATIO,
        )
      }
      gl.bindVertexArray(buffers.overlayVao)
      pointInstanceAttributes(gl, buffers.buffer, 0, false)
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count)
      gl.bindTexture(gl.TEXTURE_2D, null)
    }
  }

  private fail(gl: WebGL2RenderingContext, error: unknown) {
    this.failure = error
    this.rendered = undefined
    if (this.resources) deleteModelGpuResources(gl, this.resources)
    this.resources = undefined
    queueMicrotask(() => this.onFailure(error))
  }
}

const setMatrix = (
  gl: WebGL2RenderingContext,
  location: WebGLUniformLocation | undefined,
  matrix: Float32Array,
) => {
  if (location) gl.uniformMatrix4fv(location, false, matrix)
}

const setColor = (
  gl: WebGL2RenderingContext,
  uniforms: Partial<Record<ModelUniform, WebGLUniformLocation>>,
  color: readonly [number, number, number],
) => {
  if (uniforms.u_overlay_color) gl.uniform3f(uniforms.u_overlay_color, ...color)
}
