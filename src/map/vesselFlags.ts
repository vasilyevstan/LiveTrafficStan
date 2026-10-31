/*! Flag artwork: flag-icons, Copyright (c) 2013 Panayiotis Lipiridis.
 * MIT license: /licenses/vessel-flags-MIT.txt
 */
import allocations from '../config/countryAllocations.generated.json'

export const VESSEL_FLAG_ISO2 = new Set(
  [
    ...Object.values(allocations.mids).map((record) => record[1]),
    ...allocations.aircraftRanges.map((record) => record[3]),
  ],
)

export const vesselFlagImageId = (iso2: string | undefined) => {
  if (iso2 === undefined || !VESSEL_FLAG_ISO2.has(iso2)) return undefined
  const id: `vessel-flag-${string}` = `vessel-flag-${iso2}`
  return id
}
