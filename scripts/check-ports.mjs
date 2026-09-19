import { gzipSync } from 'node:zlib'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sourceSettings from '../src/config/portsSource.json' with {
  type: 'json',
}
import {
  parseProjectedPorts,
  sha256,
} from './ports-projection.mjs'

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const outputDirectory = path.join(
  repositoryRoot,
  'public',
  'ports',
  sourceSettings.projection.outputVersion,
)

const fail = (message) => {
  throw new Error(`Port data integrity check failed: ${message}`)
}

const rootFiles = (await readdir(outputDirectory)).sort()
if (JSON.stringify(rootFiles) !== JSON.stringify(['ports.geojson'])) {
  fail('versioned directory contains unexpected files')
}

const contents = await readFile(path.join(outputDirectory, 'ports.geojson'))
const expected = sourceSettings.projection.expected
if (contents.byteLength !== expected.rawBytes) {
  fail(`raw bytes expected ${expected.rawBytes}, received ${contents.byteLength}`)
}
if (sha256(contents) !== expected.sha256) {
  fail('generated SHA-256 does not match the source manifest')
}
const gzipBytes = gzipSync(contents, { level: 9, mtime: 0 }).byteLength
if (gzipBytes !== expected.gzipBytes) {
  fail(`gzip bytes expected ${expected.gzipBytes}, received ${gzipBytes}`)
}

const ports = parseProjectedPorts(JSON.parse(contents.toString('utf8')))
if (ports.length !== expected.projectedRecords) {
  fail(
    `records expected ${expected.projectedRecords}, received ${ports.length}`,
  )
}

const rankCounts = {}
for (const port of ports) {
  rankCounts[port.rank] = (rankCounts[port.rank] ?? 0) + 1
}
if (JSON.stringify(rankCounts) !== JSON.stringify(expected.rankCounts)) {
  fail('rank distribution does not match the source manifest')
}

console.log(
  `Ports ${sourceSettings.projection.outputVersion}: ${ports.length} points, ${contents.byteLength} raw bytes, ${gzipBytes} gzip-9 bytes`,
)
