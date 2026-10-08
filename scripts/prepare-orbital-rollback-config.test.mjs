import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(import.meta.dirname, '..')

describe('orbital-disabled rollback compatibility', () => {
  it('retains the coordinator namespace without a binding or Cron', () => {
    const directory = mkdtempSync(join(tmpdir(), 'lts-orbital-rollback-'))
    const output = join(directory, 'wrangler.jsonc')
    const wrapper = join(directory, 'worker.ts')

    execFileSync(process.execPath, [
      join(repositoryRoot, 'scripts/prepare-orbital-rollback-config.mjs'),
      '--input',
      join(repositoryRoot, 'wrangler.jsonc'),
      '--output',
      output,
      '--wrapper',
      wrapper,
    ])

    const config = JSON.parse(readFileSync(output, 'utf8'))
    const wrapperSource = readFileSync(wrapper, 'utf8')

    expect(config.main).toBe(wrapper)
    expect(config.assets.directory).toBe(join(repositoryRoot, 'dist'))
    expect(config.kv_namespaces).toBeUndefined()
    expect(config.durable_objects).toBeUndefined()
    expect(config.triggers).toEqual({ crons: [] })
    expect(config.exports.OrbitalCatalogCoordinator).toEqual({
      type: 'durable-object',
      storage: 'sqlite',
    })
    expect(config.exports.AirportBoardCoordinator).toEqual({
      type: 'durable-object', storage: 'sqlite',
    })
    expect(wrapperSource).toContain(
      `import targetWorker from ${JSON.stringify(
        join(repositoryRoot, 'worker/index.ts'),
      )}`,
    )
    expect(wrapperSource).toContain(
      'export class OrbitalCatalogCoordinator',
    )
    expect(wrapperSource).toContain('export default targetWorker')
  })

  it('retains both explicitly enabled supplemental bindings during an orbital-disabled rollback', () => {
    const directory = mkdtempSync(join(tmpdir(), 'lts-airport-rollback-'))
    const output = join(directory, 'wrangler.jsonc')
    const wrapper = join(directory, 'worker.ts')
    execFileSync(process.execPath, [
      join(repositoryRoot, 'scripts/prepare-orbital-rollback-config.mjs'),
      '--input', join(repositoryRoot, 'wrangler.jsonc'),
      '--output', output, '--wrapper', wrapper,
      '--marine-enabled', 'true', '--airport-boards-enabled', 'true',
    ])
    const config = JSON.parse(readFileSync(output, 'utf8'))
    expect(config.durable_objects.bindings).toEqual([
      { name: 'MARINE_TRAFFIC_RELAY', class_name: 'MarineTrafficRelay' },
      { name: 'AIRPORT_BOARD_COORDINATOR', class_name: 'AirportBoardCoordinator' },
    ])
    expect(config.triggers.crons).toEqual([])
    expect(readFileSync(wrapper, 'utf8')).not.toContain('export class AirportBoardCoordinator')
  })
})
