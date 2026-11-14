import { describe, expect, it } from 'vitest'
import type { TrainCategory } from '../../domain/trains'
import { TRAFFIC_STYLE_IMAGE_IDS } from '../../domain/trafficPresentation'
import { aircraftAltitudeColors, trafficIconTreatment } from '../icons'
import {
  ORBITAL_STYLE_IMAGE_IDS,
  STARLINK_STYLE_IMAGE_ID,
  orbitalIconTreatment,
  starlinkIconTreatment,
} from '../orbitalIcons'
import {
  TRAFFIC_MODEL_IDS,
  featuredOrbitalModel,
  hexColorBytes,
  isTrafficModelId,
  orbitalModelColors,
  orbitalModelForObject,
  trafficModelColors,
  trafficModelForMarkerIcon,
  trafficModelKind,
  trainModelColors,
  trainModelForCategory,
} from './trafficModelCatalog'

const TRAIN_CATEGORIES = [
  'long-distance',
  'commuter',
  'passenger',
  'freight',
  'other',
] as const satisfies readonly TrainCategory[]

describe('traffic model catalog', () => {
  it('covers every flat traffic and orbital image with a model', () => {
    const covered = new Set<string>()
    for (const imageId of TRAFFIC_STYLE_IMAGE_IDS) {
      const image = trafficModelForMarkerIcon(imageId)
      expect(image, imageId).toBeDefined()
      expect(
        image!.band === undefined ? image!.model : `${image!.model}-${image!.band}`,
      ).toBe(imageId)
      if (imageId.startsWith('vessel')) expect(image!.band).toBeUndefined()
      covered.add(image!.model)
    }
    for (const imageId of [...ORBITAL_STYLE_IMAGE_IDS, STARLINK_STYLE_IMAGE_ID]) {
      expect(isTrafficModelId(imageId), imageId).toBe(true)
      covered.add(imageId)
    }
    for (const label of ['ISS', 'HUBBLE']) covered.add(featuredOrbitalModel(label)!)
    for (const category of TRAIN_CATEGORIES) covered.add(trainModelForCategory(category))
    expect([...covered].sort()).toEqual([...TRAFFIC_MODEL_IDS].sort())
    expect(TRAFFIC_MODEL_IDS.map(trafficModelKind)).toEqual([
      ...Array(4).fill('aircraft'),
      ...Array(9).fill('vessel'),
      ...Array(7).fill('orbital'),
      ...Array(2).fill('train'),
    ])
  })

  it('rejects unknown, orbital, train and unbanded marker identities', () => {
    for (const value of [
      undefined,
      7,
      '',
      'aircraft-',
      'aircraft-higher',
      'vessel-low',
      'orbital-payload',
      'orbital-payload-low',
      'train',
      'train-freight',
      'train-low',
      'train-freight-cruise',
      'cluster',
    ]) {
      expect(trafficModelForMarkerIcon(value), String(value)).toBeUndefined()
    }
  })

  it('selects the Starlink spacecraft only for Starlink payloads', () => {
    expect(orbitalModelForObject('PAY', true)).toBe(STARLINK_STYLE_IMAGE_ID)
    expect(orbitalModelForObject('PAY', false)).toBe('orbital-payload')
    expect(orbitalModelForObject('R/B', true)).toBe('orbital-rocket-body')
    expect(orbitalModelForObject('DEB', true)).toBe('orbital-debris')
    expect(orbitalModelForObject('UNK', false)).toBe('orbital-unknown')
  })

  it('maps only the featured ISS and Hubble labels to dedicated models', () => {
    expect(featuredOrbitalModel('ISS')).toBe('orbital-iss')
    expect(featuredOrbitalModel('HUBBLE')).toBe('orbital-hubble')
    for (const label of [undefined, '', 'iss', 'TIANGONG', 'HST']) {
      expect(featuredOrbitalModel(label), String(label)).toBeUndefined()
    }
    for (const marker of ['orbital-iss', 'orbital-hubble']) {
      expect(trafficModelForMarkerIcon(marker), marker).toBeUndefined()
    }
  })

  it('gives freight trains their own model and every other category the passenger model', () => {
    expect(
      Object.fromEntries(TRAIN_CATEGORIES.map((category) => [category, trainModelForCategory(category)])),
    ).toEqual({
      'long-distance': 'train',
      commuter: 'train',
      passenger: 'train',
      freight: 'train-freight',
      other: 'train',
    })
  })

  it('colours passenger and freight trains distinctly on both basemaps', () => {
    expect(trainModelColors('dark', 'commuter')).toEqual({
      tint: hexColorBytes('#a3e635'),
      detail: hexColorBytes('#f7fee7'),
    })
    expect(trainModelColors('dark', 'freight')).toEqual({
      tint: hexColorBytes('#fb923c'),
      detail: hexColorBytes('#fff7ed'),
    })
    expect(trainModelColors('light', 'long-distance')).toEqual({
      tint: hexColorBytes('#4d7c0f'),
      detail: hexColorBytes('#f7fee7'),
    })
    expect(trainModelColors('light', 'freight')).toEqual({
      tint: hexColorBytes('#c2410c'),
      detail: hexColorBytes('#fff7ed'),
    })
    for (const theme of ['dark', 'light'] as const) {
      for (const category of TRAIN_CATEGORIES) {
        expect(trainModelColors(theme, category)).toEqual(
          trainModelColors(theme, category === 'freight' ? 'freight' : 'passenger'),
        )
      }
      const traffic = trafficIconTreatment(theme)
      const used = [traffic.aircraftFill, traffic.vesselFill].map(hexColorBytes)
      expect(used).not.toContainEqual(trainModelColors(theme, 'passenger').tint)
      expect(used).not.toContainEqual(trainModelColors(theme, 'freight').tint)
    }
  })

  it('reuses the flat marker palettes for both themes', () => {
    expect(hexColorBytes('#0f2938')).toEqual([15, 41, 56])
    expect(() => hexColorBytes('rgba(0, 0, 0, 1)')).toThrow(/colour/)
    for (const theme of ['dark', 'light'] as const) {
      const treatment = trafficIconTreatment(theme)
      expect(trafficModelColors(theme, { model: 'vessel-tanker' })).toEqual({
        tint: hexColorBytes(treatment.vesselFill),
        detail: hexColorBytes(treatment.vesselDetail),
      })
      expect(trafficModelColors(theme, { model: 'helicopter' })).toEqual({
        tint: hexColorBytes(treatment.aircraftFill),
        detail: hexColorBytes(treatment.aircraftDetail),
      })
      const cruise = aircraftAltitudeColors(theme, 'cruise')
      expect(
        trafficModelColors(theme, { model: 'aircraft-heavy', band: 'cruise' }),
      ).toEqual({
        tint: hexColorBytes(cruise.fill),
        detail: hexColorBytes(cruise.detail),
      })
      const debris = orbitalIconTreatment(theme, 'DEB')
      expect(orbitalModelColors(theme, 'DEB', true)).toEqual({
        tint: hexColorBytes(debris.fill),
        detail: hexColorBytes(debris.detail),
      })
      const starlink = starlinkIconTreatment(theme)
      expect(orbitalModelColors(theme, 'PAY', true)).toEqual({
        tint: hexColorBytes(starlink.fill),
        detail: hexColorBytes(starlink.detail),
      })
    }
  })
})
