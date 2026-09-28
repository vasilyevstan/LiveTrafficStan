import {
  degreesLat,
  degreesLong,
  eciToGeodetic,
  gstime,
  json2satrec,
  propagate,
  SatRecError,
  type OMMJsonObject,
  type SatRec,
} from './satelliteJs'
import {
  orbitalFeatureId,
  parseOrbitalTimestamp,
  type ModeledOrbitalPosition,
  type OrbitalCatalogSnapshot,
  type OrbitalCrossing,
  type OrbitalObject,
  type OrbitalPrediction,
  type OrbitalTrackSegment,
} from '../domain/orbital'
import {
  normalizeOrbitalLongitude,
  orbitalPointInPolygon,
  orbitalSegmentEntryFraction,
  unwrapOrbitalLongitude,
  type OrbitalViewport,
} from '../domain/orbitalViewport'
import type { OrbitalPropagationLimits } from './orbitalProtocol'

interface PreparedOrbitalObject {
  object: OrbitalObject
  satrec: SatRec
  epoch: number
}

export interface PreparedOrbitalCatalog {
  snapshot: OrbitalCatalogSnapshot
  objects: readonly PreparedOrbitalObject[]
  limits: OrbitalPropagationLimits
}

const toOmm = (object: OrbitalObject): OMMJsonObject => ({
  OBJECT_NAME: object.name,
  OBJECT_ID: object.internationalDesignator,
  EPOCH: object.epoch,
  MEAN_MOTION: object.meanMotion,
  ECCENTRICITY: object.eccentricity,
  INCLINATION: object.inclination,
  RA_OF_ASC_NODE: object.rightAscensionOfAscendingNode,
  ARG_OF_PERICENTER: object.argumentOfPericenter,
  MEAN_ANOMALY: object.meanAnomaly,
  EPHEMERIS_TYPE: 0,
  CLASSIFICATION_TYPE:
    object.classificationType === 'C' ? 'C' : 'U',
  NORAD_CAT_ID: object.noradCatalogId,
  ELEMENT_SET_NO: object.elementSetNumber,
  REV_AT_EPOCH: object.revolutionAtEpoch,
  BSTAR: object.bstar,
  MEAN_MOTION_DOT: object.meanMotionDot,
  MEAN_MOTION_DDOT: object.meanMotionDdot,
})

export const prepareOrbitalCatalog = (
  snapshot: OrbitalCatalogSnapshot,
  limits: OrbitalPropagationLimits,
): PreparedOrbitalCatalog => ({
  snapshot,
  limits,
  objects: snapshot.records.flatMap((object) => {
    const epoch = parseOrbitalTimestamp(object.epoch)
    if (epoch === undefined) return []
    try {
      const satrec = json2satrec(toOmm(object))
      return satrec.error === SatRecError.None
        ? [{ object, satrec, epoch }]
        : []
    } catch {
      return []
    }
  }),
})

const validElementAge = (
  prepared: PreparedOrbitalObject,
  modeledFor: number,
  limits: OrbitalPropagationLimits,
) => {
  const age = modeledFor - prepared.epoch
  return (
    age <= limits.maximumElementAgeMs &&
    age >= -limits.maximumFutureElementMs
  )
}

const modelPosition = (
  prepared: PreparedOrbitalObject,
  catalog: PreparedOrbitalCatalog,
  modeledFor: number,
): ModeledOrbitalPosition | undefined => {
  if (!validElementAge(prepared, modeledFor, catalog.limits)) {
    return undefined
  }

  const date = new Date(modeledFor)
  const result = propagate(prepared.satrec, date, {
    communityDecayCheckEnabled: true,
  })
  if (
    !result ||
    prepared.satrec.error !== SatRecError.None
  ) {
    return undefined
  }

  const geodetic = eciToGeodetic(result.position, gstime(date))
  const latitude = degreesLat(geodetic.latitude)
  const longitude = normalizeOrbitalLongitude(
    degreesLong(geodetic.longitude),
  )
  const altitudeKm = geodetic.height
  const velocityKmPerSecond = Math.hypot(
    result.velocity.x,
    result.velocity.y,
    result.velocity.z,
  )
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(altitudeKm) ||
    !Number.isFinite(velocityKmPerSecond) ||
    latitude < -90 ||
    latitude > 90 ||
    altitudeKm < 0 ||
    altitudeKm > catalog.limits.maximumAltitudeKm ||
    velocityKmPerSecond <= 0 ||
    velocityKmPerSecond > 20
  ) {
    return undefined
  }

  return {
    id: orbitalFeatureId(prepared.object.noradCatalogId),
    noradCatalogId: prepared.object.noradCatalogId,
    name: prepared.object.name,
    internationalDesignator: prepared.object.internationalDesignator,
    objectType: prepared.object.objectType,
    elementEpoch: prepared.epoch,
    snapshotRetrievedAt:
      parseOrbitalTimestamp(catalog.snapshot.retrievedAt) ?? 0,
    snapshotSha256: catalog.snapshot.sha256,
    modeledFor,
    latitude,
    longitude,
    altitudeKm,
    velocityKmPerSecond,
  }
}

export const modelOrbitalPositions = (
  catalog: PreparedOrbitalCatalog,
  modeledFor: number,
) =>
  catalog.objects.flatMap((prepared) => {
    const position = modelPosition(prepared, catalog, modeledFor)
    return position ? [position] : []
  })

const trackSegments = (
  catalog: PreparedOrbitalCatalog,
  prepared: PreparedOrbitalObject | undefined,
  modeledFor: number,
  crossingAt: number | undefined,
) => {
  if (!prepared) return []
  const start =
    crossingAt === undefined
      ? modeledFor
      : crossingAt - catalog.limits.trackDurationMs / 2
  const configuredPoints =
    Math.floor(
      catalog.limits.trackDurationMs /
        catalog.limits.predictionStepMs,
    ) + 1
  const pointCount = Math.min(
    configuredPoints,
    catalog.limits.maximumTrackPoints,
  )
  const segments: OrbitalTrackSegment[] = []
  let current: NonNullable<OrbitalTrackSegment['points']>[number][] = []

  const commit = () => {
    if (current.length >= 2) segments.push({ points: current })
    current = []
  }

  for (let index = 0; index < pointCount; index += 1) {
    const pointTime =
      start + index * catalog.limits.predictionStepMs
    const position = modelPosition(prepared, catalog, pointTime)
    if (!position) {
      commit()
      continue
    }
    const previous = current.at(-1)
    if (
      previous &&
      Math.abs(position.longitude - previous.longitude) > 180
    ) {
      commit()
    }
    current.push({
      modeledFor: pointTime,
      latitude: position.latitude,
      longitude: position.longitude,
    })
  }
  commit()
  return segments
}

const crossingSort = (
  first: OrbitalCrossing,
  second: OrbitalCrossing,
) => {
  if (first.currentlyInView !== second.currentlyInView) {
    return first.currentlyInView ? -1 : 1
  }
  const firstTime = first.firstCrossingAt ?? Number.MAX_SAFE_INTEGER
  const secondTime = second.firstCrossingAt ?? Number.MAX_SAFE_INTEGER
  return (
    firstTime - secondTime ||
    first.name.localeCompare(second.name) ||
    first.noradCatalogId.localeCompare(second.noradCatalogId)
  )
}

const crossingForObject = (
  catalog: PreparedOrbitalCatalog,
  prepared: PreparedOrbitalObject,
  modeledFor: number,
  viewport: Extract<OrbitalViewport, { kind: 'local' }>,
) => {
  let previousPosition = modelPosition(prepared, catalog, modeledFor)
  let previousTime = modeledFor
  if (previousPosition) {
    const longitude = unwrapOrbitalLongitude(
      previousPosition.longitude,
      viewport.center.longitude,
    )
    if (
      orbitalPointInPolygon(
        previousPosition.latitude,
        longitude,
        viewport.polygon,
      )
    ) {
      return {
        id: previousPosition.id,
        noradCatalogId: prepared.object.noradCatalogId,
        name: prepared.object.name,
        objectType: prepared.object.objectType,
        currentlyInView: true,
        firstCrossingAt: modeledFor,
      } satisfies OrbitalCrossing
    }
    previousPosition = { ...previousPosition, longitude }
  }

  const end =
    modeledFor + catalog.limits.predictionHorizonMs
  for (
    let sampleTime = modeledFor + catalog.limits.predictionStepMs;
    sampleTime <= end;
    sampleTime += catalog.limits.predictionStepMs
  ) {
    const nextPosition = modelPosition(prepared, catalog, sampleTime)
    if (!nextPosition) {
      previousPosition = undefined
      previousTime = sampleTime
      continue
    }
    const next = {
      ...nextPosition,
      longitude: unwrapOrbitalLongitude(
        nextPosition.longitude,
        viewport.center.longitude,
      ),
    }
    if (previousPosition) {
      const fraction = orbitalSegmentEntryFraction(
        previousPosition,
        next,
        viewport.polygon,
      )
      if (fraction !== undefined) {
        return {
          id: next.id,
          noradCatalogId: prepared.object.noradCatalogId,
          name: prepared.object.name,
          objectType: prepared.object.objectType,
          currentlyInView: false,
          firstCrossingAt:
            previousTime + (sampleTime - previousTime) * fraction,
        } satisfies OrbitalCrossing
      }
    } else if (
      orbitalPointInPolygon(
        next.latitude,
        next.longitude,
        viewport.polygon,
      )
    ) {
      return {
        id: next.id,
        noradCatalogId: prepared.object.noradCatalogId,
        name: prepared.object.name,
        objectType: prepared.object.objectType,
        currentlyInView: false,
        firstCrossingAt: sampleTime,
      } satisfies OrbitalCrossing
    }
    previousPosition = next
    previousTime = sampleTime
  }
  return undefined
}

export const predictOrbitalView = (
  catalog: PreparedOrbitalCatalog,
  modeledFor: number,
  viewport: OrbitalViewport,
  selectedId: string | null,
): OrbitalPrediction => {
  const selected = catalog.objects.find(
    ({ object }) => orbitalFeatureId(object.noradCatalogId) === selectedId,
  )

  if (viewport.kind === 'invalid') {
    return {
      mode: 'invalid',
      results: [],
      totalResults: 0,
      inViewCount: 0,
      futureCrossingCount: 0,
      trackSegments: trackSegments(
        catalog,
        selected,
        modeledFor,
        undefined,
      ),
      message: viewport.message,
    }
  }

  if (viewport.kind === 'world') {
    const current = modelOrbitalPositions(catalog, modeledFor)
      .map(
        (position): OrbitalCrossing => ({
          id: position.id,
          noradCatalogId: position.noradCatalogId,
          name: position.name,
          objectType: position.objectType,
          currentlyInView: true,
          firstCrossingAt: modeledFor,
        }),
      )
      .sort(crossingSort)
    return {
      mode: 'world',
      results: current.slice(0, catalog.limits.maximumDetailedResults),
      totalResults: current.length,
      inViewCount: current.length,
      futureCrossingCount: 0,
      trackSegments: trackSegments(
        catalog,
        selected,
        modeledFor,
        undefined,
      ),
      message:
        'The whole world is visible, so upcoming crossing order is not meaningful.',
    }
  }

  const crossings = catalog.objects
    .flatMap((prepared) => {
      const crossing = crossingForObject(
        catalog,
        prepared,
        modeledFor,
        viewport,
      )
      return crossing ? [crossing] : []
    })
    .sort(crossingSort)
  const selectedCrossing = crossings.find(
    ({ id }) => id === selectedId,
  )
  const inViewCount = crossings.filter(
    ({ currentlyInView }) => currentlyInView,
  ).length

  return {
    mode: 'local',
    results: crossings.slice(
      0,
      catalog.limits.maximumDetailedResults,
    ),
    totalResults: crossings.length,
    inViewCount,
    futureCrossingCount: crossings.length - inViewCount,
    trackSegments: trackSegments(
      catalog,
      selected,
      modeledFor,
      selectedCrossing?.firstCrossingAt,
    ),
  }
}
