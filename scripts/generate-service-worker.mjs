import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  assertShellBudget,
  collectShellEntries,
  renderRetirementServiceWorker,
  renderServiceWorker,
  shellVersion,
  verifyShellFiles,
} from './pwa-shell.mjs'

const distDirectory = resolve('dist')
const retirement = process.argv.includes('--retire')

await mkdir(distDirectory, { recursive: true })

if (retirement) {
  await writeFile(
    resolve(distDirectory, 'sw.js'),
    renderRetirementServiceWorker(),
  )
} else {
  const entries = await collectShellEntries(distDirectory)
  await verifyShellFiles(entries)
  const bytes = assertShellBudget(entries)
  const version = shellVersion(entries)
  await writeFile(
    resolve(distDirectory, 'sw.js'),
    renderServiceWorker({
      version,
      urls: entries.map((entry) => entry.url),
    }),
  )
  console.log(
    `Generated shell ${version}: ${entries.length} URLs, ${bytes} bytes`,
  )
}
