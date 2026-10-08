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
const marineEnabled = args.get('marine-enabled') ?? 'false'
const airportBoardsEnabled = args.get('airport-boards-enabled') ?? 'false'
if (airportBoardsEnabled !== 'true' && airportBoardsEnabled !== 'false') {
  throw new Error('--airport-boards-enabled must be true or false')
}
if (marineEnabled !== 'true' && marineEnabled !== 'false') {
  throw new Error('--marine-enabled must be true or false')
}
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
const bindings = (config.durable_objects?.bindings ?? []).filter((binding) =>
  binding.name !== 'ORBITAL_CATALOG_COORDINATOR' &&
  binding.name !== 'MARINE_TRAFFIC_RELAY' &&
  binding.name !== 'AIRPORT_BOARD_COORDINATOR',
)

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
  bindings.push({
    name: 'ORBITAL_CATALOG_COORDINATOR',
    class_name: 'OrbitalCatalogCoordinator',
  })
  config.exports = {
    ...config.exports,
    OrbitalCatalogCoordinator: {
      type: 'durable-object',
      storage: 'sqlite',
    },
  }
} else {
  delete config.kv_namespaces
  if (config.exports) {
    delete config.exports.OrbitalCatalogCoordinator
  }
}

if (marineEnabled === 'true') {
  bindings.push({
    name: 'MARINE_TRAFFIC_RELAY',
    class_name: 'MarineTrafficRelay',
  })
}
if (airportBoardsEnabled === 'true') {
  if (config.exports?.AirportBoardCoordinator?.storage !== 'sqlite') {
    throw new Error('This source does not support airport boards')
  }
  bindings.push({
    name: 'AIRPORT_BOARD_COORDINATOR',
    class_name: 'AirportBoardCoordinator',
  })
}
if (bindings.length) config.durable_objects = { ...config.durable_objects, bindings }
else delete config.durable_objects

await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`)
console.log(
  `Prepared ${outputPath} with orbital catalog ${orbitalEnabled} ` +
    `and Starlink catalog ${starlinkEnabled}; marine supplement ${marineEnabled}; airport boards ${airportBoardsEnabled}`,
)
