import { readFile } from 'node:fs/promises'

const inputPath = process.argv[2]
if (!inputPath || process.argv.length !== 3) {
  throw new Error(
    'Usage: node scripts/resolve-starlink-version-state.mjs <version.json>',
  )
}

const version = JSON.parse(await readFile(inputPath, 'utf8'))
const bindings = version?.resources?.bindings
if (!Array.isArray(bindings)) {
  throw new Error('Cloudflare version bindings are unavailable')
}

const namedBindings = (name) =>
  bindings.filter((binding) => binding?.name === name)

const readFlag = (name) => {
  const matches = namedBindings(name)
  if (matches.length === 0) return false
  if (matches.length !== 1) {
    throw new Error(`Cloudflare version has duplicate ${name} flags`)
  }
  const flag = matches[0]
  if (
    flag.type !== 'plain_text' ||
    (flag.text !== 'true' && flag.text !== 'false')
  ) {
    throw new Error(`Cloudflare version has an invalid ${name} flag`)
  }
  return flag.text === 'true'
}

const starlinkEnabled = readFlag('STARLINK_CATALOG_ENABLED')
if (starlinkEnabled) {
  if (!readFlag('ORBITAL_CATALOG_ENABLED')) {
    throw new Error(
      'Enabled Starlink catalog lacks the curated orbital flag',
    )
  }
  const kvBindings = namedBindings('ORBITAL_CATALOG')
  const coordinatorBindings = namedBindings(
    'ORBITAL_CATALOG_COORDINATOR',
  )
  if (
    kvBindings.length !== 1 ||
    kvBindings[0]?.type !== 'kv_namespace' ||
    coordinatorBindings.length !== 1 ||
    coordinatorBindings[0]?.type !==
      'durable_object_namespace'
  ) {
    throw new Error(
      'Enabled Starlink catalog lacks shared orbital bindings',
    )
  }
}

console.log(String(starlinkEnabled))
