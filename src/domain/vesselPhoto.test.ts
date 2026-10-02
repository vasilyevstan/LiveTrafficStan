import { describe, expect, it } from 'vitest'
import {
  isValidImo,
  vesselReferencePhotoForSelection,
  vesselReferencePhotoSelection,
} from './vesselPhoto'

describe('vessel reference photos', () => {
  it('validates the IMO check digit', () => {
    expect(isValidImo('9214379')).toBe(true)
    expect(isValidImo('9281281')).toBe(true)
    expect(isValidImo('9214378')).toBe(false)
    expect(isValidImo('123456')).toBe(false)
  })

  it('matches only an exact valid AIS-reported IMO', () => {
    const photo = vesselReferencePhotoForSelection({
      id: 'vessel:230628000',
      imo: 9214379,
    })

    expect(photo).toMatchObject({
      imo: '9214379',
      vesselNameAtReview: 'Finlandia',
      manifestVersion: '2026-10-02-v1',
      identityKey:
        'vessel:230628000|9214379|2026-10-02-v1',
      asset: {
        path: '/vessel-photos/2026-10-02-v1/imo-9214379.jpg',
      },
    })
    expect(
      vesselReferencePhotoForSelection({
        id: 'vessel:230628000',
        imo: 9214378,
      }),
    ).toBeUndefined()
    expect(
      vesselReferencePhotoForSelection({
        id: 'vessel:230628000',
        imo: 8917601,
      }),
    ).toBeUndefined()
    expect(
      vesselReferencePhotoForSelection({
        id: 'vessel:230628000',
      }),
    ).toBeUndefined()
  })

  it('distinguishes invalid identity from missing manifest coverage', () => {
    expect(
      vesselReferencePhotoSelection({
        id: 'vessel:unmatched',
        imo: 8917601,
      }),
    ).toEqual({ kind: 'unmatched', imo: '8917601' })
    expect(
      vesselReferencePhotoSelection({
        id: 'vessel:invalid',
        imo: 8917602,
      }),
    ).toEqual({ kind: 'invalid-imo' })
    expect(
      vesselReferencePhotoSelection({
        id: 'vessel:missing',
      }),
    ).toEqual({ kind: 'invalid-imo' })
  })

  it.each([
    [9237589, 'Romantika'],
    [5352886, 'Tarmo'],
    [9387085, 'MSC Magnifica'],
  ])('includes the reviewed IMO %i for %s', (imo, vesselName) => {
    expect(
      vesselReferencePhotoForSelection({
        id: `vessel:${imo}`,
        imo,
      }),
    ).toMatchObject({
      vesselNameAtReview: vesselName,
      asset: {
        path: `/vessel-photos/2026-10-02-v1/imo-${imo}.jpg`,
      },
    })
  })

  it('tags the derived photo with the selected entity identity', () => {
    const first = vesselReferencePhotoForSelection({
      id: 'vessel:one',
      imo: 9773064,
    })
    const second = vesselReferencePhotoForSelection({
      id: 'vessel:two',
      imo: 9773064,
    })
    const firstAgain = vesselReferencePhotoForSelection({
      id: 'vessel:one',
      imo: 9773064,
    })

    expect(first?.identityKey).not.toBe(second?.identityKey)
    expect(firstAgain?.identityKey).toBe(first?.identityKey)
  })
})
