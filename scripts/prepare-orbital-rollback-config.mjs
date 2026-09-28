import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const args = new Map()
for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index]
  const value = process.argv[index + 1]
  if (!name?.startsWith('--') || !value) {
    throw new Error(
      'Usage: node scripts/prepare-orbital-rollback-config.mjs ' +
        '--input <path> --output <path> --wrapper <path>',
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
const wrapperPath = resolve(required('wrapper'))
const config = JSON.parse(await readFile(inputPath, 'utf8'))
const inputDirectory = dirname(inputPath)
const targetMain = resolve(inputDirectory, config.main)

await writeFile(
  wrapperPath,
  [
    `import targetWorker from ${JSON.stringify(targetMain)}`,
    '',
    'export class OrbitalCatalogCoordinator {',
    '  async fetch() {',
    "    return new Response('Orbital coordinator unavailable during rollback', {",
    '      status: 503,',
    "      headers: { 'Cache-Control': 'no-store' },",
    '    })',
    '  }',
    '}',
    '',
    'export default targetWorker',
    '',
  ].join('\n'),
)

config.main = wrapperPath
if (config.assets?.directory) {
  config.assets.directory = resolve(
    inputDirectory,
    config.assets.directory,
  )
}
config.triggers = { crons: [] }
delete config.kv_namespaces
delete config.durable_objects
config.exports = {
  ...config.exports,
  OrbitalCatalogCoordinator: {
    type: 'durable-object',
    storage: 'sqlite',
  },
}

await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`)
console.log(`Prepared orbital-compatible rollback config ${outputPath}`)
