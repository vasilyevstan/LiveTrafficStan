import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  mkdirSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import {
  afterAll,
  afterEach,
  describe,
  expect,
  it,
} from 'vitest'

const repositoryRoot = resolve(import.meta.dirname, '..')
const script = resolve(
  import.meta.dirname,
  'resolve-starlink-version-state.mjs',
)
const workRoot = join(
  repositoryRoot,
  '.test-work',
  'starlink-version-state',
)
const createdDirectories = []

const resolveState = (bindings) => {
  const directory = join(workRoot, randomUUID())
  createdDirectories.push(directory)
  mkdirSync(directory, { recursive: true })
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

describe('Starlink Cloudflare version state', () => {
  afterEach(() => {
    for (const directory of createdDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true })
    }
  })
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

  it('treats a pre-Starlink version as disabled', () => {
    expect(resolveState([])).toBe('false')
  })

  it('accepts the shared enabled orbital resources', () => {
    expect(
      resolveState([
        {
          name: 'ORBITAL_CATALOG_ENABLED',
          type: 'plain_text',
          text: 'true',
        },
        {
          name: 'STARLINK_CATALOG_ENABLED',
          type: 'plain_text',
          text: 'true',
        },
        {
          name: 'ORBITAL_CATALOG',
          type: 'kv_namespace',
        },
        {
          name: 'ORBITAL_CATALOG_COORDINATOR',
          type: 'durable_object_namespace',
        },
      ]),
    ).toBe('true')
  })

  it('rejects Starlink without the curated flag or shared coordinator', () => {
    expect(() =>
      resolveState([
        {
          name: 'STARLINK_CATALOG_ENABLED',
          type: 'plain_text',
          text: 'true',
        },
      ]),
    ).toThrow()
    expect(() =>
      resolveState([
        {
          name: 'ORBITAL_CATALOG_ENABLED',
          type: 'plain_text',
          text: 'true',
        },
        {
          name: 'STARLINK_CATALOG_ENABLED',
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
