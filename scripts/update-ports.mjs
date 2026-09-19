import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sourceSettings from '../src/config/portsSource.json' with {
  type: 'json',
}
import {
  buildPortsProjection,
  verifySha256,
} from './ports-projection.mjs'

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const portsRoot = path.join(repositoryRoot, 'public', 'ports')
const outputDirectory = path.join(
  portsRoot,
  sourceSettings.projection.outputVersion,
)
const outputPath = path.join(outputDirectory, 'ports.geojson')

const fetchBytes = async (url, maximumBytes) => {
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'LiveTrafficStan ports maintainer (+https://github.com/vasilyevstan/LiveTrafficStan)',
    },
  })
  if (!response.ok) {
    throw new Error(`Natural Earth ports returned HTTP ${response.status}`)
  }
  const contentLength = Number(response.headers.get('Content-Length'))
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new Error(`Natural Earth ports exceeded ${maximumBytes} bytes`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.byteLength > maximumBytes) {
    throw new Error(`Natural Earth ports exceeded ${maximumBytes} bytes`)
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
        `Port projection ${prefix}${name} mismatch; expected ${expectedValue}, received ${actualValue}`,
      )
    }
  }
}

const sourceBytes = await fetchBytes(
  sourceSettings.source.sourceUrl,
  1 * 1_024 * 1_024,
)
verifySha256(
  sourceBytes,
  sourceSettings.source.sourceSha256,
  'Natural Earth ports source',
)
const projection = buildPortsProjection(
  JSON.parse(sourceBytes.toString('utf8')),
)
assertExpected(
  projection.counts,
  sourceSettings.projection.expected,
)

const resolvedPortsRoot = path.resolve(portsRoot)
const resolvedOutputDirectory = path.resolve(outputDirectory)
if (
  path.dirname(resolvedOutputDirectory) !== resolvedPortsRoot ||
  path.basename(resolvedOutputDirectory) !==
    sourceSettings.projection.outputVersion
) {
  throw new Error('Refusing to write an unsafe ports output path')
}

let existing
try {
  existing = await readFile(outputPath)
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}
if (existing && !existing.equals(projection.contents)) {
  throw new Error(
    'Configured immutable ports version has different bytes; choose a new outputVersion',
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
