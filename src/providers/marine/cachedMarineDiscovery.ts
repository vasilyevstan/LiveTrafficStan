import { DISCOVERY_CONFIG } from '../../config/discoveryConfig'
import type { DiscoveryMatch, DiscoveryResponse } from '../../domain/objectDiscovery'
import { matchesVesselIdentitySearch, normalizeVesselSearchQuery } from '../../domain/vesselFilters'
import type { MarineMetadataRecord } from './digitrafficNormalization'
import { hasControlCharacters } from '../guards'

export const discoverDigitrafficMetadata = (
  records: Iterable<MarineMetadataRecord>,
  query: string,
  now: number,
): DiscoveryResponse => {
  const normalized = normalizeVesselSearchQuery(query)
  const matches: DiscoveryMatch[] = []
  let rejectedRecords = 0
  let scanned = 0
  if ([...normalized].length < 2) {
    return { objectClass: 'ships', retrievedAt: now, matches, truncated: false, rejectedRecords }
  }
  for (const record of records) {
    if (scanned++ >= DISCOVERY_CONFIG.cachedMarineMaximumScannedRecords) break
    if (now - record.timestamp > DISCOVERY_CONFIG.cachedMarineMetadataMaximumAgeMs) continue
    if (!Number.isSafeInteger(record.mmsi) || record.mmsi <= 0 || record.mmsi > 999_999_999 ||
      !Number.isFinite(record.timestamp) || record.timestamp <= 0 ||
      record.timestamp > now + DISCOVERY_CONFIG.futureToleranceMs ||
      [record.name, record.callSign].some((value) => value !== undefined &&
        ([...value].length > DISCOVERY_CONFIG.maximumTextLength || hasControlCharacters(value)))) {
      rejectedRecords += 1
      continue
    }
    if (!matchesVesselIdentitySearch(record, normalized)) continue
    const mmsi = String(record.mmsi).padStart(9, '0')
    matches.push({
      objectClass: 'ships', key: `digitraffic-cache:${mmsi}`, name: record.name,
      identifiers: {
        mmsi, callsign: record.callSign,
        imo: record.imo !== undefined && Number.isSafeInteger(record.imo) &&
          record.imo > 0 && record.imo <= 9_999_999 ? String(record.imo) : undefined,
      },
      source: { name: 'Digitraffic', code: 'digitraffic', credit: 'Fintraffic / digitraffic.fi · CC BY 4.0' },
      metadataReportedAt: record.timestamp, location: null,
    })
  }
  matches.sort((a, b) => (b.metadataReportedAt ?? 0) - (a.metadataReportedAt ?? 0) || a.key.localeCompare(b.key))
  return {
    objectClass: 'ships', retrievedAt: now,
    matches: matches.slice(0, DISCOVERY_CONFIG.maximumResults),
    truncated: scanned > DISCOVERY_CONFIG.cachedMarineMaximumScannedRecords || matches.length > DISCOVERY_CONFIG.maximumResults,
    rejectedRecords,
  }
}
