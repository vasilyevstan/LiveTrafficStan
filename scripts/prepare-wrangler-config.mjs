import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const args = new Map()
for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index]
  const value = process.argv[index + 1]
  if (!name?.startsWith('--') || !value) {
    throw new Error(
      'Usage: node scripts/prepare-wrangler-config.mjs ' +
        '--input <path> --output <path> --orbital-enabled <true|false> ' +
        '--starlink-enabled <true|false> ' +
        '[--namespace-id <id>]',
    )
  }
  args.set(name.slice(2), value)
}

const required = (name) => {
  const value = args.get(name)
  if (!value) throw new Error(`Missing --${name}`)
  return value
}

const inputPath = resolve(required('input'))
const outputPath = resolve(required('output'))
const orbitalEnabled = required('orbital-enabled')
if (orbitalEnabled !== 'true' && orbitalEnabled !== 'false') {
  throw new Error('--orbital-enabled must be true or false')
}
const starlinkEnabled = required('starlink-enabled')
if (starlinkEnabled !== 'true' && starlinkEnabled !== 'false') {
  throw new Error('--starlink-enabled must be true or false')
}
if (starlinkEnabled === 'true' && orbitalEnabled !== 'true') {
  throw new Error(
    '--starlink-enabled requires --orbital-enabled true',
  )
}

const config = JSON.parse(await readFile(inputPath, 'utf8'))
const inputDirectory = dirname(inputPath)
config.main = resolve(inputDirectory, config.main)
if (config.assets?.directory) {
  config.assets.directory = resolve(
    inputDirectory,
    config.assets.directory,
  )
}
config.triggers = {
  crons: orbitalEnabled === 'true' ? ['17 */2 * * *'] : [],
}

if (orbitalEnabled === 'true') {
  const namespaceId = required('namespace-id')
  if (!/^[0-9a-f]{32}$/.test(namespaceId)) {
    throw new Error('The orbital KV namespace ID must be 32 lowercase hex')
  }
  config.kv_namespaces = [
    {
      binding: 'ORBITAL_CATALOG',
      id: namespaceId,
    },
  ]
  config.durable_objects = {
    bindings: [
      {
        name: 'ORBITAL_CATALOG_COORDINATOR',
        class_name: 'OrbitalCatalogCoordinator',
      },
    ],
  }
  config.exports = {
    ...config.exports,
    OrbitalCatalogCoordinator: {
      type: 'durable-object',
      storage: 'sqlite',
    },
  }
} else {
  delete config.kv_namespaces
  delete config.durable_objects
  if (config.exports) {
    delete config.exports.OrbitalCatalogCoordinator
  }
}

await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`)
console.log(
  `Prepared ${outputPath} with orbital catalog ${orbitalEnabled} ` +
    `and Starlink catalog ${starlinkEnabled}`,
)
