import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ORBITAL_CATALOG_KEY,
  ORBITAL_CATALOG_SCHEMA_VERSION,
  ORBITAL_CATALOG_V1_KEY,
  ORBITAL_SOURCE_CONTRACT_VERSION,
} from '../worker/orbitalCatalog.ts'
import {
  ORBITAL_COORDINATOR_OBJECT_NAME,
  ORBITAL_COORDINATOR_STATE_CONTRACT_VERSION,
  ORBITAL_COORDINATOR_STATE_SCHEMA_VERSION,
} from '../worker/orbitalCatalogCoordinator.ts'

const repositoryRoot = resolve(import.meta.dirname, '..')
const script = join(
  repositoryRoot,
  'scripts/prepare-wrangler-config.mjs',
)
const input = join(repositoryRoot, 'wrangler.jsonc')

const prepare = (enabled) => {
  const directory = mkdtempSync(join(tmpdir(), 'lts-orbital-config-'))
  const output = join(directory, 'wrangler.jsonc')
  const args = [
    script,
    '--input',
    input,
    '--output',
    output,
    '--orbital-enabled',
    String(enabled),
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
  it('adds exact KV, coordinator, and Cron resources when enabled', () => {
    const config = prepare(true)

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
  })

  it('removes the binding and all Cron triggers when disabled', () => {
    const config = prepare(false)

    expect(config.kv_namespaces).toBeUndefined()
    expect(config.durable_objects).toBeUndefined()
    expect(config.exports.OrbitalCatalogCoordinator).toBeUndefined()
    expect(config.triggers).toEqual({ crons: [] })
  })

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

  it('separates catalog v2 storage without resetting coordinator identity', () => {
    expect(ORBITAL_CATALOG_SCHEMA_VERSION).toBe(2)
    expect(ORBITAL_SOURCE_CONTRACT_VERSION).toBe(2)
    expect(ORBITAL_CATALOG_KEY).toBe(
      'orbital:catalog:v2:curated-v1',
    )
    expect(ORBITAL_CATALOG_V1_KEY).toBe('orbital:catalog:v1')
    expect(ORBITAL_COORDINATOR_OBJECT_NAME).toBe(
      'celestrak-visual-refresh-v2',
    )
    expect(ORBITAL_COORDINATOR_STATE_SCHEMA_VERSION).toBe(1)
    expect(ORBITAL_COORDINATOR_STATE_CONTRACT_VERSION).toBe(1)
  })
})
