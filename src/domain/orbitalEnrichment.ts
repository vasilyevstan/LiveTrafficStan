import orbitalEnrichmentManifestJson from '../config/orbitalEnrichmentManifest.json'
import type {
  ModeledOrbitalPosition,
  OrbitalObjectType,
} from './orbital'

export interface OrbitalEnrichmentPurpose {
  shortLabel: string
  description: string
  sourceName: string
  sourceTitle: string
  sourceUrl: string
  sourcePublishedAt?: string
  sourceRetrievedAt: string
  sourceSha256: string
  identityEvidence: string
}

export interface OrbitalEnrichmentImage {
  kind: 'photograph' | 'illustration'
  alt: string
  identityEvidence: {
    sourceId: string
    sourceTitle: string
    sourcePageUrl: string
    sourceRevisionUrl: string
    sourceRevisionSha256: string
    reviewNote: string
  }
  source: {
    canonicalOriginalUrl: string
    reviewedUrl: string
    reviewedMediaType: 'image/jpeg' | 'image/png'
    reviewedBytes: number
    reviewedWidth: number
    reviewedHeight: number
    reviewedSha256: string
    capturedAt?: string
    sourceRetrievedAt: string
  }
  rights: {
    owner: string
    sourceName: string
    usagePolicyName: string
    usagePolicyUrl: string
    creditLine: string
    publicDomain: boolean
    restrictions: string
  }
  asset: {
    path: string
    mediaType: 'image/jpeg' | 'image/png'
    bytes: number
    width: number
    height: number
    sha256: string
    modificationNotice: string
  }
}

export interface OrbitalEnrichmentRecord {
  noradCatalogId: string
  objectNameAtReview: string
  internationalDesignatorAtReview: string
  catalogTypeAtReview: OrbitalObjectType
  purpose: OrbitalEnrichmentPurpose
  image?: OrbitalEnrichmentImage
}

interface OrbitalEnrichmentManifest {
  schemaVersion: 1
  manifestVersion: string
  reviewedAt: string
  sourcePolicy: {
    name: string
    identityRule: string
    purposeRule: string
    imageRule: string
    takedownProcedure: string
  }
  records: readonly OrbitalEnrichmentRecord[]
}

export interface OrbitalEnrichmentView extends OrbitalEnrichmentRecord {
  identityKey: string
  manifestVersion: string
  reviewedAt: string
}

export const orbitalEnrichmentManifest =
  orbitalEnrichmentManifestJson as OrbitalEnrichmentManifest

export const starlinkConstellationContext =
  orbitalEnrichmentManifestJson.constellationContext.starlink

export const createOrbitalEnrichmentIndex = (
  records: readonly OrbitalEnrichmentRecord[],
) => {
  const index = new Map(
    records.map((record) => [record.noradCatalogId, record]),
  )
  if (index.size !== records.length) {
    throw new Error(
      'Orbital enrichment manifest contains duplicate NORAD IDs',
    )
  }
  return index
}

const enrichmentByNoradId = createOrbitalEnrichmentIndex(
  orbitalEnrichmentManifest.records,
)

const featuredMapLabelByNoradId = new Map<string, string>([
  ['20580', 'HUBBLE'],
  ['25544', 'ISS'],
])

export const orbitalEnrichmentForNoradId = (
  noradCatalogId: string,
) => enrichmentByNoradId.get(noradCatalogId)

export const matchingOrbitalEnrichmentRecord = (
  position: Pick<
    ModeledOrbitalPosition,
    | 'noradCatalogId'
    | 'name'
    | 'internationalDesignator'
    | 'objectType'
  >,
  index: ReadonlyMap<string, OrbitalEnrichmentRecord>,
) => {
  const record = index.get(position.noradCatalogId)
  if (
    !record ||
    record.objectNameAtReview !== position.name ||
    record.internationalDesignatorAtReview !==
      position.internationalDesignator ||
    record.catalogTypeAtReview !== position.objectType
  ) {
    return undefined
  }
  return record
}

export const orbitalEnrichmentForPosition = (
  position: Pick<
    ModeledOrbitalPosition,
    | 'id'
    | 'noradCatalogId'
    | 'name'
    | 'internationalDesignator'
    | 'objectType'
    | 'snapshotSha256'
  >,
): OrbitalEnrichmentView | undefined => {
  const record = matchingOrbitalEnrichmentRecord(
    position,
    enrichmentByNoradId,
  )
  if (!record) return undefined

  return {
    ...record,
    identityKey: [
      position.id,
      position.noradCatalogId,
      position.name,
      position.internationalDesignator,
      position.objectType,
      position.snapshotSha256,
      orbitalEnrichmentManifest.manifestVersion,
    ].join('|'),
    manifestVersion: orbitalEnrichmentManifest.manifestVersion,
    reviewedAt: orbitalEnrichmentManifest.reviewedAt,
  }
}

export const orbitalFeaturedMapLabelForPosition = (
  position: Pick<
    ModeledOrbitalPosition,
    | 'id'
    | 'noradCatalogId'
    | 'name'
    | 'internationalDesignator'
    | 'objectType'
    | 'snapshotSha256'
  >,
) => {
  const enrichment = orbitalEnrichmentForPosition(position)
  return enrichment
    ? featuredMapLabelByNoradId.get(enrichment.noradCatalogId)
    : undefined
}
