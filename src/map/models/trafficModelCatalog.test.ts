import { describe, expect, it } from 'vitest'
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
  hexColorBytes,
  isTrafficModelId,
  orbitalModelColors,
  orbitalModelForObject,
  trafficModelColors,
  trafficModelForMarkerIcon,
  trafficModelKind,
} from './trafficModelCatalog'

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
    expect([...covered].sort()).toEqual([...TRAFFIC_MODEL_IDS].sort())
    expect(TRAFFIC_MODEL_IDS.map(trafficModelKind)).toEqual([
      ...Array(4).fill('aircraft'),
      ...Array(9).fill('vessel'),
      ...Array(5).fill('orbital'),
    ])
  })

  it('rejects unknown, orbital and unbanded marker identities', () => {
    for (const value of [
      undefined,
      7,
      '',
      'aircraft-',
      'aircraft-higher',
      'vessel-low',
      'orbital-payload',
      'orbital-payload-low',
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
