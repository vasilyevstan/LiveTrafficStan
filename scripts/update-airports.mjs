import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sourceSettings from '../src/config/airportsSource.json' with {
  type: 'json',
}
import {
  buildAirportsProjection,
  verifySha256,
} from './airports-projection.mjs'

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const airportsRoot = path.join(repositoryRoot, 'public', 'airports')
const outputDirectory = path.join(
  airportsRoot,
  sourceSettings.projection.outputVersion,
)
const outputPath = path.join(outputDirectory, 'airports.geojson')

const fetchBytes = async (url, maximumBytes) => {
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'LiveTrafficStan airports maintainer (+https://github.com/vasilyevstan/LiveTrafficStan)',
    },
  })
  if (!response.ok) {
    throw new Error(`OurAirports data returned HTTP ${response.status}`)
  }
  const contentLength = Number(response.headers.get('Content-Length'))
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new Error(`OurAirports data exceeded ${maximumBytes} bytes`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.byteLength > maximumBytes) {
    throw new Error(`OurAirports data exceeded ${maximumBytes} bytes`)
  }
  return bytes
}

const assertExpected = (actual, expected, prefix = '') => {
  for (const [name, expectedValue] of Object.entries(expected)) {
    const actualValue = actual[name]
    if (
      typeof expectedValue === 'object' &&
      expectedValue !== null
    ) {
      assertExpected(actualValue, expectedValue, `${prefix}${name}.`)
    } else if (actualValue !== expectedValue) {
      throw new Error(
        `Airport projection ${prefix}${name} mismatch; expected ${expectedValue}, received ${actualValue}`,
      )
    }
  }
}

const sourceBytes = await fetchBytes(
  sourceSettings.source.sourceUrl,
  16 * 1_024 * 1_024,
)
if (sourceBytes.byteLength !== sourceSettings.source.sourceBytes) {
  throw new Error(
    `OurAirports source bytes mismatch; expected ${sourceSettings.source.sourceBytes}, received ${sourceBytes.byteLength}`,
  )
}
verifySha256(
  sourceBytes,
  sourceSettings.source.sourceSha256,
  'OurAirports source',
)
const projection = buildAirportsProjection(sourceBytes.toString('utf8'))
assertExpected(projection.counts, sourceSettings.projection.expected)

const resolvedAirportsRoot = path.resolve(airportsRoot)
const resolvedOutputDirectory = path.resolve(outputDirectory)
if (
  path.dirname(resolvedOutputDirectory) !== resolvedAirportsRoot ||
  path.basename(resolvedOutputDirectory) !==
    sourceSettings.projection.outputVersion
) {
  throw new Error('Refusing to write an unsafe airports output path')
}

let existing
try {
  existing = await readFile(outputPath)
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}
if (existing && !existing.equals(projection.contents)) {
  throw new Error(
    'Configured immutable airports version has different bytes; choose a new outputVersion',
  )
}

await mkdir(resolvedOutputDirectory, { recursive: true })
await writeFile(outputPath, projection.contents)

console.log(
  JSON.stringify(
    {
      output: path.relative(repositoryRoot, outputPath),
      ...projection.counts,
    },
    null,
    2,
  ),
)
