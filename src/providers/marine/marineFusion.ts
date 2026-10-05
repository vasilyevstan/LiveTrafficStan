import type { Vessel } from '../../domain/traffic.js'
import { compatibleVesselIdentity } from '../../domain/vesselIdentity.js'
import {
  DIGITRAFFIC_MARINE_CAPABILITIES,
  DIGITRAFFIC_PROVIDER_NAME,
} from './digitrafficCapabilities.js'
import { vesselMarkerScale, type normalizeAisVesselMetadata } from './digitrafficNormalization.js'
import {
  AISSTREAM_PROVIDER_NAME,
  OPENWATERS_PROVIDER_NAME,
} from './marineSourceNormalization.js'

const priority = (provider: string) =>
  provider === DIGITRAFFIC_PROVIDER_NAME ? 3
    : provider === OPENWATERS_PROVIDER_NAME ? 2
      : provider === AISSTREAM_PROVIDER_NAME ? 1 : 0

type MetadataContext = ReturnType<typeof normalizeAisVesselMetadata> &
  Pick<Vessel, 'id' | 'mmsi' | 'provider' | 'attribution' | 'receivedAt'>

const credit = (vessel: Pick<Vessel, 'provider' | 'attribution'>) => vessel.attribution ??
  (vessel.provider === DIGITRAFFIC_PROVIDER_NAME
    ? DIGITRAFFIC_MARINE_CAPABILITIES.license.attribution
    : vessel.provider)

const metadataFields = [
  'name', 'callSign', 'imo', 'lengthMeters', 'widthMeters',
  'draughtMeters', 'destination', 'eta',
] as const

export const mergeMarineVessels = (first: Vessel, second: Vessel): Vessel => {
  if (first.id !== second.id || first.mmsi !== second.mmsi) {
    throw new Error('Cannot combine different vessel identities')
  }
  const preferFirst = first.position.observedAt > second.position.observedAt ||
    (first.position.observedAt === second.position.observedAt &&
      priority(first.provider) > priority(second.provider))
  const current = preferFirst ? first : second
  const other = preferFirst ? second : first
  if (current.provider === other.provider) return current
  return enrichMarineVesselMetadata(current, other)
}

export const enrichMarineVesselMetadata = (
  current: Vessel,
  other: MetadataContext,
): Vessel => {
  if (current.id !== other.id || current.mmsi !== other.mmsi) {
    throw new Error('Cannot combine different vessel identities')
  }
  if (!compatibleVesselIdentity(current, other)) return current

  const result: Vessel = { ...current }
  let enriched = false
  const fill = <Key extends typeof metadataFields[number]>(
    field: Key,
    value: Vessel[Key],
  ) => {
    if (result[field] === undefined && value !== undefined) {
      result[field] = value
      enriched = true
    }
  }
  for (const field of metadataFields) fill(field, other[field])
  if (result.vesselType === undefined && other.vesselType !== undefined) {
    result.vesselType = other.vesselType
    result.vesselCategory = other.vesselCategory
    result.markerIcon = other.markerIcon
    enriched = true
  }
  if (!enriched) return current
  result.markerScale = vesselMarkerScale(result.lengthMeters)
  result.metadataObservedAt = undefined
  result.receivedAt = Math.max(current.receivedAt, other.receivedAt)
  result.attribution = [...new Set([credit(current), credit(other)])].join(' | ')
  return result
}
