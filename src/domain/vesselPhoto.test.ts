import { describe, expect, it } from 'vitest'
import {
  isValidImo,
  vesselReferencePhotoForSelection,
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
      manifestVersion: '2026-09-26-v1',
      identityKey:
        'vessel:230628000|9214379|2026-09-26-v1',
      asset: {
        path: '/vessel-photos/2026-09-26-v1/imo-9214379.jpg',
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
