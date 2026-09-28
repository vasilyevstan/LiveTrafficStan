import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  ORBITAL_MAX_UPSTREAM_BYTES,
  createOrbitalCatalogSnapshot,
  serializeOrbitalCatalogSnapshot,
} from '../worker/orbitalCatalog.ts'
import { readBoundedJsonFile } from './read-bounded-json-file.mjs'

const options = new Map()
for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index]
  const value = process.argv[index + 1]
  if (!name?.startsWith('--') || !value) {
    throw new Error(
      'Usage: node scripts/update-orbital-catalog.mjs ' +
        '--gp <path> --satcat <path> --retrieved-at <iso> --output <path>',
    )
  }
  options.set(name.slice(2), value)
}

const required = (name) => {
  const value = options.get(name)
  if (!value) throw new Error(`Missing --${name}`)
  return value
}

const gpPath = resolve(required('gp'))
const satcatPath = resolve(required('satcat'))
const outputPath = resolve(required('output'))
const retrievedAt = required('retrieved-at')

const { value: gp } = await readBoundedJsonFile(
  gpPath,
  ORBITAL_MAX_UPSTREAM_BYTES,
  'GP source',
)
const { value: satcat } = await readBoundedJsonFile(
  satcatPath,
  ORBITAL_MAX_UPSTREAM_BYTES,
  'SATCAT source',
)
const snapshot = await createOrbitalCatalogSnapshot(
  gp,
  satcat,
  retrievedAt,
)

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, serializeOrbitalCatalogSnapshot(snapshot))

console.log(
  `Wrote ${snapshot.recordCount} orbital records to ${outputPath} ` +
    `(${snapshot.sha256})`,
)
