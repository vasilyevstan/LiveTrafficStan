import { readFile } from 'node:fs/promises'

const inputPath = process.argv[2]
if (!inputPath || process.argv.length !== 3) {
  throw new Error(
    'Usage: node scripts/resolve-orbital-version-state.mjs <version.json>',
  )
}

const version = JSON.parse(await readFile(inputPath, 'utf8'))
const bindings = version?.resources?.bindings
if (!Array.isArray(bindings)) {
  throw new Error('Cloudflare version bindings are unavailable')
}

const namedBindings = (name) =>
  bindings.filter((binding) => binding?.name === name)

const flagBindings = namedBindings('ORBITAL_CATALOG_ENABLED')
if (flagBindings.length === 0) {
  console.log('false')
} else {
  if (flagBindings.length !== 1) {
    throw new Error('Cloudflare version has duplicate orbital flags')
  }
  const flag = flagBindings[0]
  if (
    flag.type !== 'plain_text' ||
    (flag.text !== 'true' && flag.text !== 'false')
  ) {
    throw new Error('Cloudflare version has an invalid orbital flag')
  }

  if (flag.text === 'true') {
    const kvBindings = namedBindings('ORBITAL_CATALOG')
    const coordinatorBindings = namedBindings(
      'ORBITAL_CATALOG_COORDINATOR',
    )
    if (
      kvBindings.length !== 1 ||
      kvBindings[0]?.type !== 'kv_namespace' ||
      coordinatorBindings.length !== 1 ||
      coordinatorBindings[0]?.type !== 'durable_object_namespace'
    ) {
      throw new Error(
        'Enabled Cloudflare version lacks exact orbital bindings',
      )
    }
  }

  console.log(flag.text)
}
