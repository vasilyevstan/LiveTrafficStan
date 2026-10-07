import { execFile as execFileCallback } from 'node:child_process'
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import manifest from '../src/config/orbitalEnrichmentManifest.json' with { type: 'json' }

const execFile = promisify(execFileCallback)
const repositoryRoot = path.resolve(import.meta.dirname, '..')
let fixtureRoot

beforeAll(async () => {
  fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'orbital-enrichment-check-'))
  for (const directory of ['scripts', 'src/config', 'public/orbital-data/v2', 'public/orbital-enrichment']) {
    await mkdir(path.join(fixtureRoot, directory), { recursive: true })
  }
  for (const file of ['scripts/check-orbital-enrichment.mjs', 'public/_headers', 'public/orbital-data/v2/visual-catalog.json']) {
    await cp(path.join(repositoryRoot, file), path.join(fixtureRoot, file))
  }
  const assets = `public/orbital-enrichment/${manifest.manifestVersion}`
  await cp(path.join(repositoryRoot, assets), path.join(fixtureRoot, assets), { recursive: true })
})

afterAll(async () => {
  if (fixtureRoot) await rm(fixtureRoot, { recursive: true, force: true })
})

const check = async (mutate = () => undefined) => {
  const candidate = structuredClone(manifest)
  mutate(candidate)
  await writeFile(
    path.join(fixtureRoot, 'src/config/orbitalEnrichmentManifest.json'),
    JSON.stringify(candidate),
  )
  return execFile(process.execPath, ['scripts/check-orbital-enrichment.mjs'], {
    cwd: fixtureRoot,
    env: { ...process.env, ORBITAL_ENRICHMENT_IMMUTABLE_BASE: '0'.repeat(40) },
  })
}

describe('orbital context integrity', () => {
  it('accepts the bounded mixed-source manifest and unchanged NASA images offline', async () => {
    await expect(check()).resolves.toMatchObject({
      stdout: expect.stringContaining('10 records, 2 images, 95457 bytes'),
    })
  })

  it.each([
    ['missing context kind', context => { delete context.kind }, 'context kind'],
    ['unlabeled community facts', context => { context.kind = 'mission-purpose' }, 'must not be labeled'],
    ['missing CC0 license', context => { delete context.sourceLicense }, 'requires Wikidata CC0'],
    ['wrong license', context => { context.sourceLicense = 'Apache-2.0' }, 'requires Wikidata CC0'],
    ['floating revision link', context => { context.sourceUrl = 'https://www.wikidata.org/wiki/Q12753536' }, 'pinned revision URL'],
    ['different revision', context => { context.sourceRevision = '1' }, 'pinned revision URL'],
    ['missing source digest', context => { delete context.sourceSha256 }, 'source digest'],
    ['missing identity evidence', context => { delete context.identityEvidence }, 'identity evidence'],
  ])('rejects %s', async (_label, mutate, message) => {
    await expect(check(candidate => {
      mutate(candidate.records.find(({ noradCatalogId }) => noradCatalogId === '19210').context)
    })).rejects.toThrow(message)
  })

  it('rejects context attached to a conflicting catalog identity', async () => {
    await expect(check(candidate => {
      candidate.records[0].internationalDesignatorAtReview = '1988-050B'
    })).rejects.toThrow('does not match the reviewed visual catalog')
  })

  it('does not silently expand the sixteen-record cap', async () => {
    await expect(check(candidate => {
      candidate.records = Array.from({ length: 17 }, () => candidate.records[0])
    })).rejects.toThrow('1-16 reviewed objects')
  })
})
