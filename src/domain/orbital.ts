export type OrbitalObjectType = 'PAY' | 'R/B' | 'DEB' | 'UNK'

export interface OrbitalObject {
  noradCatalogId: string
  name: string
  internationalDesignator: string
  objectType: OrbitalObjectType
  epoch: string
  meanMotion: number
  eccentricity: number
  inclination: number
  rightAscensionOfAscendingNode: number
  argumentOfPericenter: number
  meanAnomaly: number
  ephemerisType: number
  classificationType: string
  elementSetNumber: number
  revolutionAtEpoch: number
  bstar: number
  meanMotionDot: number
  meanMotionDdot: number
}

export interface OrbitalCatalogSnapshot {
  schemaVersion: number
  sourceContractVersion: number
  group: string
  gpSourceUrl: string
  satcatSourceUrl: string
  retrievedAt: string
  recordCount: number
  sha256: string
  records: readonly OrbitalObject[]
}

export interface ModeledOrbitalPosition {
  id: string
  noradCatalogId: string
  name: string
  internationalDesignator: string
  objectType: OrbitalObjectType
  elementEpoch: number
  snapshotRetrievedAt: number
  snapshotSha256: string
  modeledFor: number
  latitude: number
  longitude: number
  altitudeKm: number
  velocityKmPerSecond: number
}

export interface OrbitalCrossing {
  id: string
  noradCatalogId: string
  name: string
  objectType: OrbitalObjectType
  currentlyInView: boolean
  firstCrossingAt?: number
}

export interface OrbitalTrackPoint {
  modeledFor: number
  latitude: number
  longitude: number
}

export interface OrbitalTrackSegment {
  points: readonly OrbitalTrackPoint[]
}

export interface OrbitalPrediction {
  mode: 'local' | 'world' | 'invalid'
  results: readonly OrbitalCrossing[]
  totalResults: number
  inViewCount: number
  futureCrossingCount: number
  trackSegments: readonly OrbitalTrackSegment[]
  message?: string
}

export type OrbitalControllerPhase =
  | 'disabled'
  | 'loading'
  | 'ready'
  | 'refreshing'
  | 'stale'
  | 'unavailable'
  | 'offline'
  | 'clock-invalid'
  | 'paused-hidden'
  | 'paused-history'
  | 'empty'

export interface OrbitalControllerState {
  phase: OrbitalControllerPhase
  positions: readonly ModeledOrbitalPosition[]
  prediction: OrbitalPrediction
  snapshot?: OrbitalCatalogSnapshot
  lastSuccessAt?: number
  message?: string
}

export const EMPTY_ORBITAL_PREDICTION: OrbitalPrediction = {
  mode: 'invalid',
  results: [],
  totalResults: 0,
  inViewCount: 0,
  futureCrossingCount: 0,
  trackSegments: [],
}

export const orbitalFeatureId = (noradCatalogId: string) =>
  `orbital:${noradCatalogId}`

export const orbitalObjectTypeLabel = (type: OrbitalObjectType) => {
  switch (type) {
    case 'PAY':
      return 'Payload'
    case 'R/B':
      return 'Rocket body'
    case 'DEB':
      return 'Debris'
    case 'UNK':
      return 'Unknown catalog type'
  }
}

export const parseOrbitalTimestamp = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)) {
    return undefined
  }
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : undefined
}

export const orbitalSnapshotDigestInput = (
  snapshot: Omit<OrbitalCatalogSnapshot, 'sha256'>,
) => ({
  schemaVersion: snapshot.schemaVersion,
  sourceContractVersion: snapshot.sourceContractVersion,
  group: snapshot.group,
  gpSourceUrl: snapshot.gpSourceUrl,
  satcatSourceUrl: snapshot.satcatSourceUrl,
  retrievedAt: snapshot.retrievedAt,
  recordCount: snapshot.recordCount,
  records: snapshot.records.map((record) => ({
    noradCatalogId: record.noradCatalogId,
    name: record.name,
    internationalDesignator: record.internationalDesignator,
    objectType: record.objectType,
    epoch: record.epoch,
    meanMotion: record.meanMotion,
    eccentricity: record.eccentricity,
    inclination: record.inclination,
    rightAscensionOfAscendingNode:
      record.rightAscensionOfAscendingNode,
    argumentOfPericenter: record.argumentOfPericenter,
    meanAnomaly: record.meanAnomaly,
    ephemerisType: record.ephemerisType,
    classificationType: record.classificationType,
    elementSetNumber: record.elementSetNumber,
    revolutionAtEpoch: record.revolutionAtEpoch,
    bstar: record.bstar,
    meanMotionDot: record.meanMotionDot,
    meanMotionDdot: record.meanMotionDdot,
  })),
})
