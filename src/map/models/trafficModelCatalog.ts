import type { Theme } from '../../app/theme'
import type { OrbitalObjectType } from '../../domain/orbital'
import {
  AIRCRAFT_ALTITUDE_BANDS,
  type AircraftAltitudeBand,
} from '../../domain/trafficPresentation'
import { aircraftAltitudeColors, trafficIconTreatment } from '../icons'
import {
  orbitalIconTreatment,
  orbitalStyleImageId,
  starlinkIconTreatment,
} from '../orbitalIcons'

export const TRAFFIC_MODEL_SET = 'traffic-models-v1'

export const TRAFFIC_MODEL_IDS = [
  'aircraft',
  'aircraft-light',
  'aircraft-heavy',
  'helicopter',
  'vessel',
  'vessel-cargo',
  'vessel-tanker',
  'vessel-passenger',
  'vessel-fishing',
  'vessel-tug',
  'vessel-sailing',
  'vessel-pleasure',
  'vessel-highspeed',
  'orbital-payload',
  'orbital-rocket-body',
  'orbital-debris',
  'orbital-unknown',
  'orbital-starlink-spacecraft',
  'orbital-iss',
  'orbital-hubble',
] as const

export type TrafficModelId = (typeof TRAFFIC_MODEL_IDS)[number]
export type TrafficModelKind = 'aircraft' | 'vessel' | 'orbital'
export type Rgb = readonly [number, number, number]

const MODEL_IDS: ReadonlySet<string> = new Set(TRAFFIC_MODEL_IDS)

export const isTrafficModelId = (value: unknown): value is TrafficModelId =>
  typeof value === 'string' && MODEL_IDS.has(value)

export const trafficModelKind = (id: TrafficModelId): TrafficModelKind => {
  if (id.startsWith('orbital-')) return 'orbital'
  return id.startsWith('vessel') ? 'vessel' : 'aircraft'
}

export interface TrafficModelImage {
  model: TrafficModelId
  band?: AircraftAltitudeBand
}

/** Resolves a flat traffic marker image, including altitude-band variants. */
export const trafficModelForMarkerIcon = (
  markerIcon: unknown,
): TrafficModelImage | undefined => {
  if (typeof markerIcon !== 'string') return undefined
  for (const band of AIRCRAFT_ALTITUDE_BANDS) {
    const suffix = `-${band}`
    if (!markerIcon.endsWith(suffix)) continue
    const model = markerIcon.slice(0, -suffix.length)
    if (isTrafficModelId(model) && trafficModelKind(model) === 'aircraft') {
      return { model, band }
    }
  }
  return isTrafficModelId(markerIcon) &&
    trafficModelKind(markerIcon) !== 'orbital'
    ? { model: markerIcon }
    : undefined
}

export const orbitalModelForObject = (
  objectType: OrbitalObjectType,
  starlink: boolean,
): TrafficModelId =>
  starlink && objectType === 'PAY'
    ? 'orbital-starlink-spacecraft'
    : orbitalStyleImageId(objectType)

const FEATURED_ORBITAL_MODELS = new Map<string, TrafficModelId>([
  ['ISS', 'orbital-iss'],
  ['HUBBLE', 'orbital-hubble'],
])

/** Dedicated model for a featured map label from the exact reviewed identity. */
export const featuredOrbitalModel = (
  featuredLabel: string | undefined,
): TrafficModelId | undefined =>
  featuredLabel === undefined
    ? undefined
    : FEATURED_ORBITAL_MODELS.get(featuredLabel)

const HEX_COLOR = /^#([0-9a-f]{6})$/i

export const hexColorBytes = (hex: string): Rgb => {
  const match = HEX_COLOR.exec(hex)
  if (!match) throw new Error(`Unsupported model colour ${hex}`)
  const value = Number.parseInt(match[1], 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

export interface TrafficModelColors {
  tint: Rgb
  detail: Rgb
}

const colors = (tint: string, detail: string): TrafficModelColors => ({
  tint: hexColorBytes(tint),
  detail: hexColorBytes(detail),
})

/** Uses the flat-icon palettes so 3D models keep the same visual meaning. */
export const trafficModelColors = (
  theme: Theme,
  image: TrafficModelImage,
): TrafficModelColors => {
  if (trafficModelKind(image.model) === 'vessel') {
    const treatment = trafficIconTreatment(theme)
    return colors(treatment.vesselFill, treatment.vesselDetail)
  }
  if (image.band === undefined) {
    const treatment = trafficIconTreatment(theme)
    return colors(treatment.aircraftFill, treatment.aircraftDetail)
  }
  const band = aircraftAltitudeColors(theme, image.band)
  return colors(band.fill, band.detail)
}

export const orbitalModelColors = (
  theme: Theme,
  objectType: OrbitalObjectType,
  starlink: boolean,
): TrafficModelColors => {
  const treatment =
    starlink && objectType === 'PAY'
      ? starlinkIconTreatment(theme)
      : orbitalIconTreatment(theme, objectType)
  return colors(treatment.fill, treatment.detail)
}
