import { describe, expect, it } from 'vitest'
import {
  formatReleaseTimestamp,
  releaseInfoFromEnvironment,
} from './releaseInfo'

describe('release information', () => {
  it('accepts an exact SHA and normalizes a valid release timestamp', () => {
    expect(
      releaseInfoFromEnvironment({
        VITE_RELEASE_SHA: '20289a98aa41a8bfd700ebf2af9da61373db44e4',
        VITE_RELEASE_TIMESTAMP: '2026-11-14T12:03:49Z',
      }),
    ).toEqual({
      version: '1.6.0',
      sha: '20289a98aa41a8bfd700ebf2af9da61373db44e4',
      timestamp: '2026-11-14T12:03:49.000Z',
    })
  })

  it.each([
    {},
    { VITE_RELEASE_SHA: '20289a9' },
    {
      VITE_RELEASE_SHA: '20289a98aa41a8bfd700ebf2af9da61373db44e4',
    },
    {
      VITE_RELEASE_SHA: '20289A98AA41A8BFD700EBF2AF9DA61373DB44E4',
      VITE_RELEASE_TIMESTAMP: '2026-11-14T12:03:49Z',
    },
    {
      VITE_RELEASE_SHA: '20289a98aa41a8bfd700ebf2af9da61373db44e4',
      VITE_RELEASE_TIMESTAMP: 'not-a-time',
    },
  ])('omits incomplete or invalid release metadata: %j', (environment) => {
    expect(releaseInfoFromEnvironment(environment)).toBeUndefined()
  })

  it('formats the visible timestamp explicitly in UTC', () => {
    expect(formatReleaseTimestamp('2026-11-14T12:03:49.000Z'))
      .toBe('2026-11-14 12:03 UTC')
  })
})
