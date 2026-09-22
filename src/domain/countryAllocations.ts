import generatedCountryAllocations from '../config/countryAllocations.generated.json'

export interface CountryAllocation {
  name: string
  iso2: string
}

type AircraftAllocationRange = readonly [
  start: number,
  end: number,
  name: string,
  iso2: string,
]

const validCountryAllocation = (
  name: unknown,
  iso2: unknown,
): CountryAllocation => {
  if (
    typeof name !== 'string' ||
    name.length === 0 ||
    typeof iso2 !== 'string' ||
    !/^[A-Z]{2}$/.test(iso2)
  ) {
    throw new Error('Generated country allocation is invalid')
  }
  return { name, iso2 }
}

const midAllocations = new Map(
  Object.entries(generatedCountryAllocations.mids).map(([mid, record]) => [
    mid,
    validCountryAllocation(record[0], record[1]),
  ]),
)

const aircraftRanges: readonly AircraftAllocationRange[] =
  generatedCountryAllocations.aircraftRanges.map(
    (record): AircraftAllocationRange => {
      const [start, end, name, iso2] = record
      if (
        typeof start !== 'number' ||
        typeof end !== 'number' ||
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        typeof name !== 'string' ||
        typeof iso2 !== 'string'
      ) {
        throw new Error('Generated aircraft allocation range is invalid')
      }
      return [start, end, name, iso2]
    },
  )

export const flagStateForMmsi = (
  mmsi: number,
): CountryAllocation | undefined => {
  if (!Number.isSafeInteger(mmsi)) return undefined
  const digits = String(mmsi)
  if (!/^[2-7][0-9]{8}$/.test(digits)) return undefined
  return midAllocations.get(digits.slice(0, 3))
}

export const countryForAircraftHex = (
  hex: string,
): CountryAllocation | undefined => {
  const normalized = hex.toUpperCase()
  if (!/^[0-9A-F]{6}$/.test(normalized)) return undefined

  const address = Number.parseInt(normalized, 16)
  const range = aircraftRanges.find(
    ([start, end]) => address >= start && address <= end,
  )
  return range === undefined
    ? undefined
    : validCountryAllocation(range[2], range[3])
}

export const formatCountryAllocation = ({
  name,
  iso2,
}: CountryAllocation) => `${name} (${iso2})`
