import { describe, expect, it, vi } from 'vitest'
import { verifyImmutableStarlinkCatalogHistory } from './starlink-catalog-history.mjs'

const base = 'a'.repeat(40)
const manifest = {
  bootstrapVersion: 'starlink-2026-10-02-v1',
  status: 'published',
}
const gitError = (code) =>
  Object.assign(new Error(`git exited ${code}`), { code })

describe('immutable Starlink catalog history', () => {
  it('allows a genuinely new immutable path', async () => {
    const runGit = vi.fn(async (args) => {
      if (args[0] === 'cat-file' && args[2] === `${base}^{commit}`) {
        return { stdout: '' }
      }
      if (args[0] === 'cat-file') throw gitError(128)
      if (args[0] === 'log') return { stdout: '' }
      throw new Error(`Unexpected git call: ${args.join(' ')}`)
    })

    await expect(
      verifyImmutableStarlinkCatalogHistory({
        base,
        repositoryRoot: '.',
        manifest,
        runGit,
      }),
    ).resolves.toBeUndefined()
  })

  it('rejects changed bytes under a published version', async () => {
    const runGit = vi.fn(async (args) => {
      if (args[0] === 'cat-file') return { stdout: '' }
      if (args[0] === 'show') {
        return { stdout: JSON.stringify(manifest) }
      }
      if (args[0] === 'diff') throw gitError(1)
      throw new Error(`Unexpected git call: ${args.join(' ')}`)
    })

    await expect(
      verifyImmutableStarlinkCatalogHistory({
        base,
        repositoryRoot: '.',
        manifest,
        runGit,
      }),
    ).rejects.toThrow('choose a new bootstrap version')
  })

  it('allows the one pending placeholder to published transition', async () => {
    const runGit = vi.fn(async (args) => {
      if (args[0] === 'cat-file') return { stdout: '' }
      if (args[0] === 'show') {
        return {
          stdout: JSON.stringify({
            ...manifest,
            status: 'pending-source-artifacts',
          }),
        }
      }
      throw new Error(`Unexpected git call: ${args.join(' ')}`)
    })

    await expect(
      verifyImmutableStarlinkCatalogHistory({
        base,
        repositoryRoot: '.',
        manifest,
        runGit,
      }),
    ).resolves.toBeUndefined()
  })

  it('rejects reuse of a prior immutable path', async () => {
    const runGit = vi.fn(async (args) => {
      if (args[0] === 'cat-file' && args[2] === `${base}^{commit}`) {
        return { stdout: '' }
      }
      if (args[0] === 'cat-file') throw gitError(128)
      if (args[0] === 'log') return { stdout: 'deadbeef\n' }
      throw new Error(`Unexpected git call: ${args.join(' ')}`)
    })

    await expect(
      verifyImmutableStarlinkCatalogHistory({
        base,
        repositoryRoot: '.',
        manifest,
        runGit,
      }),
    ).rejects.toThrow('reuses a Starlink catalog path')
  })
})
