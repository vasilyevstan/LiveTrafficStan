import { expect, test } from 'vitest'
import {
  BUNDLE_BUDGETS,
  compressedSize,
} from './bundle-budgets.mjs'

test('bundle budgets preserve approved startup boundaries', () => {
  expect(BUNDLE_BUDGETS).toEqual({
    entry: { gzip: 545 * 1024, brotli: 440 * 1024 },
    vesselFlags: { gzip: 60 * 1024 },
    orbitalUi: { gzip: 12 * 1024 },
    airportDetails: { gzip: 8 * 1024 },
  })
})

test('compressed size reports raw, gzip and Brotli bytes', () => {
  const sizes = compressedSize(Buffer.from('repeated '.repeat(1_000)))
  expect(sizes.raw).toBe(9_000)
  expect(sizes.gzip).toBeLessThan(sizes.raw)
  expect(sizes.brotli).toBeLessThan(sizes.raw)
})
