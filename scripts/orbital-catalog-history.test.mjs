import { describe, expect, it, vi } from 'vitest'
import { verifyImmutableOrbitalCatalogHistory } from './orbital-catalog-history.mjs'

const base = 'a'.repeat(40)
const manifest = {
  bootstrapVersion: 'curated-2026-09-30-v1',
}

const gitError = (code) =>
  Object.assign(new Error(`git exited ${code}`), { code })

describe('immutable orbital catalog history', () => {
  it('allows a genuinely new version path', async () => {
    const runGit = vi.fn(async (args) => {
      if (args[0] === 'cat-file' && args[2] === `${base}^{commit}`) {
        return { stdout: '' }
      }
      if (
        args[0] === 'cat-file' &&
        args[2] ===
          `${base}:src/config/orbitalCatalogSource.json`
      ) {
        throw gitError(128)
      }
      if (args[0] === 'log') return { stdout: '' }
      throw new Error(`Unexpected git call: ${args.join(' ')}`)
    })

    await expect(
      verifyImmutableOrbitalCatalogHistory({
        base,
        repositoryRoot: '.',
        manifest,
        runGit,
      }),
    ).resolves.toBeUndefined()
  })

  it('rejects changed bytes under an already published version', async () => {
    const runGit = vi.fn(async (args) => {
      if (args[0] === 'cat-file') return { stdout: '' }
      if (args[0] === 'show') {
        return { stdout: JSON.stringify(manifest) }
      }
      if (args[0] === 'diff') throw gitError(1)
      throw new Error(`Unexpected git call: ${args.join(' ')}`)
    })

    await expect(
      verifyImmutableOrbitalCatalogHistory({
        base,
        repositoryRoot: '.',
        manifest,
        runGit,
      }),
    ).rejects.toThrow('choose a new bootstrap version')
  })

  it('allows unchanged bytes under the same published version', async () => {
    const runGit = vi.fn(async (args) => {
      if (args[0] === 'cat-file') return { stdout: '' }
      if (args[0] === 'show') {
        return { stdout: JSON.stringify(manifest) }
      }
      if (args[0] === 'diff') return { stdout: '' }
      throw new Error(`Unexpected git call: ${args.join(' ')}`)
    })

    await expect(
      verifyImmutableOrbitalCatalogHistory({
        base,
        repositoryRoot: '.',
        manifest,
        runGit,
      }),
    ).resolves.toBeUndefined()
  })

  it('rejects reuse of any prior immutable path', async () => {
    const runGit = vi.fn(async (args) => {
      if (args[0] === 'cat-file' && args[2] === `${base}^{commit}`) {
        return { stdout: '' }
      }
      if (args[0] === 'cat-file') throw gitError(128)
      if (args[0] === 'log') return { stdout: 'deadbeef\n' }
      throw new Error(`Unexpected git call: ${args.join(' ')}`)
    })

    await expect(
      verifyImmutableOrbitalCatalogHistory({
        base,
        repositoryRoot: '.',
        manifest,
        runGit,
      }),
    ).rejects.toThrow('reuses an orbital catalog path')
  })
})
