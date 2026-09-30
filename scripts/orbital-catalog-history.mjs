import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'

const execFile = promisify(execFileCallback)

const gitObjectExists = async (repositoryRoot, object, runGit) => {
  try {
    await runGit(['cat-file', '-e', object], repositoryRoot)
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 128) {
      return false
    }
    throw error
  }
}

const defaultRunGit = async (args, repositoryRoot) =>
  execFile('git', args, { cwd: repositoryRoot })

export const verifyImmutableOrbitalCatalogHistory = async ({
  base,
  repositoryRoot,
  manifest,
  runGit = defaultRunGit,
}) => {
  if (base === undefined || /^0{40}$/.test(base)) return
  if (!/^[0-9a-f]{40}$/.test(base)) {
    throw new Error(
      'ORBITAL_CATALOG_IMMUTABLE_BASE must be a full lowercase commit SHA',
    )
  }
  if (
    !(await gitObjectExists(
      repositoryRoot,
      `${base}^{commit}`,
      runGit,
    ))
  ) {
    throw new Error('immutable comparison base is unavailable')
  }

  const manifestPath = 'src/config/orbitalCatalogSource.json'
  const versionPath = `public/orbital-data/${manifest.bootstrapVersion}`
  if (
    await gitObjectExists(
      repositoryRoot,
      `${base}:${manifestPath}`,
      runGit,
    )
  ) {
    const { stdout } = await runGit(
      ['show', `${base}:${manifestPath}`],
      repositoryRoot,
    )
    const previousManifest = JSON.parse(stdout)
    if (
      previousManifest.bootstrapVersion === manifest.bootstrapVersion
    ) {
      try {
        await runGit(
          [
            'diff',
            '--quiet',
            base,
            '--',
            manifestPath,
            versionPath,
          ],
          repositoryRoot,
        )
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          error.code === 1
        ) {
          throw new Error(
            'published orbital catalog version changed; choose a new bootstrap version',
          )
        }
        throw error
      }
      return
    }
  }

  const { stdout } = await runGit(
    ['log', '-1', '--format=%H', base, '--', versionPath],
    repositoryRoot,
  )
  if (stdout.trim() !== '') {
    throw new Error(
      'bootstrap version reuses an orbital catalog path from repository history',
    )
  }
}
