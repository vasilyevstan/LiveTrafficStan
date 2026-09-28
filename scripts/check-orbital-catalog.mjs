import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  ORBITAL_MAX_SNAPSHOT_BYTES,
  ORBITAL_BOOTSTRAP_PATH,
  serializeOrbitalCatalogSnapshot,
  validateOrbitalCatalogSnapshot,
} from '../worker/orbitalCatalog.ts'
import { readBoundedJsonFile } from './read-bounded-json-file.mjs'

const catalogPath = resolve('public', ORBITAL_BOOTSTRAP_PATH.slice(1))
const { text, value } = await readBoundedJsonFile(
  catalogPath,
  ORBITAL_MAX_SNAPSHOT_BYTES,
  'Orbital bootstrap',
)
const snapshot = await validateOrbitalCatalogSnapshot(value)
if (text !== serializeOrbitalCatalogSnapshot(snapshot)) {
  throw new Error('Orbital bootstrap is not canonical serialized JSON')
}
const notice = await readFile(
  resolve(dirname(catalogPath), 'NOTICE.txt'),
  'utf8',
)
for (const required of [
  snapshot.gpSourceUrl,
  snapshot.satcatSourceUrl,
  snapshot.retrievedAt,
  'CelesTrak GP/OMM and SATCAT',
  'not live telemetry',
]) {
  if (!notice.includes(required)) {
    throw new Error(`Orbital catalog notice is missing: ${required}`)
  }
}

console.log(
  `Validated ${snapshot.recordCount} orbital records ` +
    `(${snapshot.sha256}, retrieved ${snapshot.retrievedAt})`,
)
