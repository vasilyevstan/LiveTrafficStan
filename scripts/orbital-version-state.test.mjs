import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const script = resolve(
  import.meta.dirname,
  'resolve-orbital-version-state.mjs',
)

const resolveState = (bindings) => {
  const directory = mkdtempSync(join(tmpdir(), 'lts-orbital-version-'))
  const input = join(directory, 'version.json')
  writeFileSync(
    input,
    JSON.stringify({ resources: { bindings } }),
  )
  return execFileSync(process.execPath, [script, input], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

describe('orbital Cloudflare version state', () => {
  it('treats a pre-orbital version as disabled', () => {
    expect(resolveState([])).toBe('false')
  })

  it('requires the exact enabled runtime bindings', () => {
    expect(
      resolveState([
        {
          name: 'ORBITAL_CATALOG_ENABLED',
          type: 'plain_text',
          text: 'true',
        },
        {
          name: 'ORBITAL_CATALOG',
          type: 'kv_namespace',
          namespace_id: 'catalog',
        },
        {
          name: 'ORBITAL_CATALOG_COORDINATOR',
          type: 'durable_object_namespace',
          namespace_id: 'coordinator',
        },
      ]),
    ).toBe('true')
  })

  it('rejects an enabled version without its coordinator', () => {
    expect(() =>
      resolveState([
        {
          name: 'ORBITAL_CATALOG_ENABLED',
          type: 'plain_text',
          text: 'true',
        },
        {
          name: 'ORBITAL_CATALOG',
          type: 'kv_namespace',
        },
      ]),
    ).toThrow()
  })
})
