import type { Theme } from '../../app/theme'
import type { OrbitalObjectType } from '../../domain/orbital'
import type { TrainCategory, TrainPosition } from '../../domain/trains'
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
  'train',
  'train-freight',
  'train-flirt',
  'train-pendolino',
  'train-intercity',
  'train-us-push-pull',
  'train-us-emu',
] as const

export type TrafficModelId = (typeof TRAFFIC_MODEL_IDS)[number]
export type TrafficModelKind = 'aircraft' | 'vessel' | 'orbital' | 'train'
export type Rgb = readonly [number, number, number]

const MODEL_IDS: ReadonlySet<string> = new Set(TRAFFIC_MODEL_IDS)

export const isTrafficModelId = (value: unknown): value is TrafficModelId =>
  typeof value === 'string' && MODEL_IDS.has(value)

export const trafficModelKind = (id: TrafficModelId): TrafficModelKind => {
  if (id.startsWith('orbital-')) return 'orbital'
  if (id.startsWith('train')) return 'train'
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
  if (!isTrafficModelId(markerIcon)) return undefined
  const kind = trafficModelKind(markerIcon)
  return kind === 'aircraft' || kind === 'vessel' ? { model: markerIcon } : undefined
}

export const orbitalModelForObject = (
  objectType: OrbitalObjectType,
  starlink: boolean,
): TrafficModelId =>
  starlink && objectType === 'PAY'
    ? 'orbital-starlink-spacecraft'
    : orbitalStyleImageId(objectType)

export const trainModelForCategory = (category: TrainCategory): TrafficModelId =>
  category === 'freight' ? 'train-freight' : 'train'

export type TrainFleetModelId =
  | 'train-flirt'
  | 'train-pendolino'
  | 'train-intercity'
  | 'train-us-push-pull'
  | 'train-us-emu'

const FINTRAFFIC_FLEET = new Map<string, TrainFleetModelId>([
  ['S', 'train-pendolino'],
  ['IC', 'train-intercity'],
  ['PYO', 'train-intercity'],
])

// LIRR car-number ranges from the operator fleet roster.
const LIRR_FLEET: readonly (readonly [number, number, TrainFleetModelId])[] = [
  [400, 423, 'train-us-push-pull'],
  [500, 522, 'train-us-push-pull'],
  [5001, 5017, 'train-us-push-pull'],
  [7001, 7836, 'train-us-emu'],
  [9001, 9202, 'train-us-emu'],
]

const lirrFleetModel = (label: string | undefined): TrainFleetModelId | undefined => {
  if (label === undefined || !/^\d{1,5}$/.test(label)) return undefined
  const number = Number(label)
  return LIRR_FLEET.find(([first, last]) => number >= first && number <= last)?.[2]
}

/**
 * Representative fleet trainset selected only from source-reported fields;
 * unidentified rolling stock keeps the generic category model.
 */
export const trainFleetModel = (
  train: Pick<TrainPosition, 'sourceId' | 'category' | 'trainType' | 'vehicleLabel'>,
): TrainFleetModelId | undefined => {
  if (train.category === 'freight') return undefined
  switch (train.sourceId) {
    case 'elron':
      return 'train-flirt'
    case 'mbta':
      return 'train-us-push-pull'
    case 'lirr':
      return lirrFleetModel(train.vehicleLabel)
    case 'fintraffic':
      return train.trainType === undefined
        ? undefined
        : FINTRAFFIC_FLEET.get(train.trainType)
    default:
      return undefined
  }
}

export const trainModelForTrain = (
  train: Pick<TrainPosition, 'sourceId' | 'category' | 'trainType' | 'vehicleLabel'>,
): TrafficModelId => trainFleetModel(train) ?? trainModelForCategory(train.category)

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

// Lime passenger and orange freight stay clear of the aircraft, vessel,
// orbital, Starlink, and weather hues on both basemaps.
export const TRAIN_MODEL_PALETTE: Readonly<
  Record<Theme, Readonly<Record<'passenger' | 'freight', readonly [string, string]>>>
> = {
  dark: { passenger: ['#a3e635', '#f7fee7'], freight: ['#fb923c', '#fff7ed'] },
  light: { passenger: ['#4d7c0f', '#f7fee7'], freight: ['#c2410c', '#fff7ed'] },
}

export const trainModelColors = (
  theme: Theme,
  category: TrainCategory,
): TrafficModelColors => {
  const [tint, detail] =
    TRAIN_MODEL_PALETTE[theme][category === 'freight' ? 'freight' : 'passenger']
  return colors(tint, detail)
}

// Original, logo-free operator liveries: body tint and stripe detail.
// Light-theme bodies are darkened so white and silver keep basemap contrast.
export const TRAIN_FLEET_LIVERY: Readonly<
  Record<Theme, Readonly<Record<TrainFleetModelId, readonly [string, string]>>>
> = {
  dark: {
    'train-flirt': ['#f26a21', '#6b7280'],
    'train-pendolino': ['#f8fafc', '#16a34a'],
    'train-intercity': ['#f8fafc', '#16a34a'],
    'train-us-push-pull': ['#c9d1d9', '#7c3aed'],
    'train-us-emu': ['#c9d1d9', '#2563eb'],
  },
  light: {
    'train-flirt': ['#ea580c', '#4b5563'],
    'train-pendolino': ['#cbd5e1', '#15803d'],
    'train-intercity': ['#cbd5e1', '#15803d'],
    'train-us-push-pull': ['#a8b2bd', '#6d28d9'],
    'train-us-emu': ['#a8b2bd', '#1d4ed8'],
  },
}

export const trainColorsForTrain = (
  theme: Theme,
  train: Pick<TrainPosition, 'sourceId' | 'category' | 'trainType' | 'vehicleLabel'>,
): TrafficModelColors => {
  const fleet = trainFleetModel(train)
  if (fleet === undefined) return trainModelColors(theme, train.category)
  const [tint, detail] = TRAIN_FLEET_LIVERY[theme][fleet]
  return colors(tint, detail)
}
