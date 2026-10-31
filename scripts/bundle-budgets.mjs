import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  brotliCompressSync,
  constants,
  gzipSync,
} from 'node:zlib'

export const BUNDLE_BUDGETS = {
  entry: { gzip: 545 * 1024, brotli: 440 * 1024 },
  vesselFlags: { gzip: 60 * 1024 },
  orbitalUi: { gzip: 12 * 1024 },
  airportDetails: { gzip: 8 * 1024 },
}

export const compressedSize = (bytes) => ({
  raw: bytes.byteLength,
  gzip: gzipSync(bytes, { level: 9 }).byteLength,
  brotli: brotliCompressSync(bytes, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
    },
  }).byteLength,
})

const assertBudget = (label, sizes, budget) => {
  for (const [encoding, maximum] of Object.entries(budget)) {
    if (sizes[encoding] > maximum) {
      throw new Error(
        `${label} ${encoding} size ${sizes[encoding]} exceeds ${maximum}`,
      )
    }
  }
}

const namedAsset = (assetNames, prefix) => {
  const matches = assetNames.filter(
    (name) => name.startsWith(prefix) && name.endsWith('.js'),
  )
  if (matches.length !== 1) {
    throw new Error(
      `Expected one ${prefix} JavaScript asset, found ${matches.length}`,
    )
  }
  return matches[0]
}

export const checkBundleBudgets = async (distDirectory) => {
  const indexHtml = await readFile(join(distDirectory, 'index.html'), 'utf8')
  const entryMatch = indexHtml.match(
    /<script[^>]+src="\/assets\/(index-[^"]+\.js)"/,
  )
  if (!entryMatch) throw new Error('Production entry script was not found')

  const assetDirectory = join(distDirectory, 'assets')
  const assetNames = await readdir(assetDirectory)
  const assets = {
    entry: entryMatch[1],
    vesselFlags: namedAsset(assetNames, 'vesselFlagImages-'),
    orbitalUi: namedAsset(assetNames, 'AdvancedOrbitalUi-'),
    airportDetails: namedAsset(assetNames, 'AirportDetails-'),
  }
  const report = {}

  for (const [label, assetName] of Object.entries(assets)) {
    const sizes = compressedSize(
      await readFile(join(assetDirectory, assetName)),
    )
    assertBudget(label, sizes, BUNDLE_BUDGETS[label])
    report[label] = { assetName, ...sizes }
  }

  return report
}
