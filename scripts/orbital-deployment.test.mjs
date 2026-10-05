import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  mkdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  ORBITAL_CATALOG_KEY,
  ORBITAL_CATALOG_PUBLICATION_VERSION,
  ORBITAL_CATALOG_SCHEMA_VERSION,
  ORBITAL_CATALOG_V1_BOOTSTRAP_PATH,
  ORBITAL_CATALOG_V1_KEY,
  ORBITAL_CATALOG_V1_ROLLBACK_BOOTSTRAP_PATH,
  ORBITAL_CATALOG_V2_ACCEPT,
  ORBITAL_SOURCE_CONTRACT_VERSION,
} from '../worker/orbitalCatalog.ts'
import {
  ORBITAL_COORDINATOR_OBJECT_NAME,
  ORBITAL_COORDINATOR_STATE_CONTRACT_VERSION,
  ORBITAL_COORDINATOR_STATE_SCHEMA_VERSION,
  STARLINK_COORDINATOR_STATE_CONTRACT_VERSION,
  STARLINK_COORDINATOR_STATE_SCHEMA_VERSION,
} from '../worker/orbitalCatalogCoordinator.ts'
import { STARLINK_CATALOG_KEY } from '../worker/starlinkCatalog.ts'

const repositoryRoot = resolve(import.meta.dirname, '..')
const script = join(
  repositoryRoot,
  'scripts/prepare-wrangler-config.mjs',
)
const input = join(repositoryRoot, 'wrangler.jsonc')
const orbitalWorkerSource = readFileSync(
  join(repositoryRoot, 'worker/orbitalCatalog.ts'),
  'utf8',
)
const workRoot = join(
  repositoryRoot,
  '.test-work',
  'orbital-deployment',
)

const prepare = (enabled, starlinkEnabled = false, marineEnabled = false) => {
  const directory = join(workRoot, randomUUID())
  mkdirSync(directory, { recursive: true })
  const output = join(directory, 'wrangler.jsonc')
  const args = [
    script,
    '--input',
    input,
    '--output',
    output,
    '--orbital-enabled',
    String(enabled),
    '--starlink-enabled',
    String(starlinkEnabled),
    '--marine-enabled',
    String(marineEnabled),
  ]
  if (enabled) {
    args.push(
      '--namespace-id',
      '0123456789abcdef0123456789abcdef',
    )
  }
  execFileSync(process.execPath, args)
  return JSON.parse(readFileSync(output, 'utf8'))
}

describe('orbital Cloudflare deployment configuration', () => {
  afterAll(() => {
    rmSync(workRoot, { recursive: true, force: true })
    try {
      rmdirSync(join(repositoryRoot, '.test-work'))
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !('code' in error) ||
        (error.code !== 'ENOENT' && error.code !== 'ENOTEMPTY')
      ) {
        throw error
      }
    }
  })

  it('adds exact KV, coordinator, and Cron resources when enabled', () => {
    const config = prepare(true, true)

    expect(config.main).toBe(join(repositoryRoot, 'worker/index.ts'))
    expect(config.assets.directory).toBe(join(repositoryRoot, 'dist'))
    expect(config.kv_namespaces).toEqual([
      {
        binding: 'ORBITAL_CATALOG',
        id: '0123456789abcdef0123456789abcdef',
      },
    ])
    expect(config.durable_objects).toEqual({
      bindings: [
        {
          name: 'ORBITAL_CATALOG_COORDINATOR',
          class_name: 'OrbitalCatalogCoordinator',
        },
      ],
    })
    expect(config.exports.OrbitalCatalogCoordinator).toEqual({
      type: 'durable-object',
      storage: 'sqlite',
    })
    expect(config.triggers).toEqual({
      crons: ['17 */2 * * *'],
    })
    expect(config.kv_namespaces).toHaveLength(1)
    expect(config.durable_objects.bindings).toHaveLength(1)
  })

  it('removes the binding and all Cron triggers when disabled', () => {
    const config = prepare(false, false)

    expect(config.kv_namespaces).toBeUndefined()
    expect(config.durable_objects).toBeUndefined()
    expect(config.exports.OrbitalCatalogCoordinator).toBeUndefined()
    expect(config.triggers).toEqual({ crons: [] })
  })

  it('rejects Starlink without the curated orbital deployment', () => {
    expect(() => prepare(false, true)).toThrow()
  })

  it.each([
    [false, false, false],
    [false, false, true],
    [true, false, false],
    [true, false, true],
    [true, true, false],
    [true, true, true],
  ])(
    'preserves both origins and independent orbital=%s, Starlink=%s, marine=%s bindings',
    (orbital, starlink, marine) => {
      const config = prepare(orbital, starlink, marine)
      expect(config.name).toBe('livetrafficstan')
      expect(config.workers_dev).toBe(true)
      expect(config.preview_urls).toBe(false)
      expect(config.routes).toEqual([
        { pattern: 'trackstan.xyz', custom_domain: true },
      ])
      const names = (config.durable_objects?.bindings ?? []).map((binding) => binding.name)
      expect(names.includes('ORBITAL_CATALOG_COORDINATOR')).toBe(orbital)
      expect(names.includes('MARINE_TRAFFIC_RELAY')).toBe(marine)
      expect(config.exports.MarineTrafficRelay).toEqual({
        type: 'durable-object', storage: 'sqlite',
      })
      expect(config.triggers.crons).toEqual(orbital ? ['17 */2 * * *'] : [])
    },
  )

  it('keeps explicit rollback trigger configs symmetric', () => {
    const enabled = JSON.parse(
      readFileSync(
        join(
          repositoryRoot,
          'infra/cloudflare/triggers/orbital-enabled.jsonc',
        ),
        'utf8',
      ),
    )
    const disabled = JSON.parse(
      readFileSync(
        join(
          repositoryRoot,
          'infra/cloudflare/triggers/orbital-disabled.jsonc',
        ),
        'utf8',
      ),
    )

    expect(enabled.name).toBe('livetrafficstan')
    expect(enabled.triggers.crons).toEqual(['17 */2 * * *'])
    expect(disabled.name).toBe('livetrafficstan')
    expect(disabled.triggers.crons).toEqual([])
  })

  it('publishes one internal compatibility bundle without resetting coordinator identity', () => {
    expect(ORBITAL_CATALOG_SCHEMA_VERSION).toBe(2)
    expect(ORBITAL_SOURCE_CONTRACT_VERSION).toBe(2)
    expect(ORBITAL_CATALOG_PUBLICATION_VERSION).toBe(1)
    expect(ORBITAL_CATALOG_KEY).toBe(
      'orbital:catalog:v2:curated-v1',
    )
    expect(ORBITAL_CATALOG_V1_KEY).toBe('orbital:catalog:v1')
    expect(ORBITAL_CATALOG_V1_ROLLBACK_BOOTSTRAP_PATH).toBe(
      '/orbital-data/v1/visual-catalog.json',
    )
    expect(ORBITAL_CATALOG_V1_BOOTSTRAP_PATH).toBe(
      '/orbital-data/v2/visual-catalog.json',
    )
    expect(ORBITAL_CATALOG_V2_ACCEPT).toBe(
      'application/vnd.livetrafficstan.orbital-catalog+json;version=2',
    )
    expect(STARLINK_CATALOG_KEY).toBe(
      'orbital:catalog:v1:starlink-sample-v1',
    )
    expect(ORBITAL_COORDINATOR_OBJECT_NAME).toBe(
      'celestrak-visual-refresh-v2',
    )
    expect(ORBITAL_COORDINATOR_STATE_SCHEMA_VERSION).toBe(1)
    expect(ORBITAL_COORDINATOR_STATE_CONTRACT_VERSION).toBe(1)
    expect(STARLINK_COORDINATOR_STATE_SCHEMA_VERSION).toBe(1)
    expect(STARLINK_COORDINATOR_STATE_CONTRACT_VERSION).toBe(1)
    expect(
      orbitalWorkerSource.match(/store\.put\(/g),
    ).toHaveLength(1)
    expect(orbitalWorkerSource).toContain(
      'serializeOrbitalCatalogPublication(publication)',
    )
    expect(orbitalWorkerSource).not.toMatch(
      /store\.put\(\s*ORBITAL_CATALOG_V1_KEY/,
    )
  })
})
