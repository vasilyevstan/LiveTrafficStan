import type { Vessel } from './traffic.js'

export type VesselIdentity = Pick<Vessel,
  'provider' | 'name' | 'callSign' | 'imo' | 'vesselType' |
  'lengthMeters' | 'widthMeters'
>

const fields = [
  'name', 'callSign', 'imo', 'vesselType', 'lengthMeters', 'widthMeters',
] as const

export const vesselIdentity = (vessel: Vessel): VesselIdentity => ({
  provider: vessel.provider,
  name: vessel.name,
  callSign: vessel.callSign,
  imo: vessel.imo,
  vesselType: vessel.vesselType,
  lengthMeters: vessel.lengthMeters,
  widthMeters: vessel.widthMeters,
})

export const compatibleVesselIdentity = (
  first: VesselIdentity,
  second: VesselIdentity,
) => {
  const normalized = (value: string | number) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value
  return fields.every((field) => {
    const a = first[field], b = second[field]
    return a === undefined || b === undefined || normalized(a) === normalized(b)
  })
}
