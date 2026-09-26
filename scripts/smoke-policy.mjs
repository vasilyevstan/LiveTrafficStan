import { readFile } from 'node:fs/promises'

export const DEPLOYMENT_PROPAGATION_RETRY_DELAYS_MS = [
  0,
  1_000,
  2_000,
  4_000,
  8_000,
  15_000,
  30_000,
]

export const isRetryableStaticAssetStatus = (status) =>
  status === 404 || status >= 500

export const hasOneYearImmutableCacheControl = (value) => {
  if (typeof value !== 'string') return false

  const directives = value
    .toLowerCase()
    .split(',')
    .map((directive) => directive.trim())
    .filter(Boolean)
  const contradictory = new Set([
    'private',
    'no-cache',
    'no-store',
    'must-revalidate',
    'proxy-revalidate',
  ])
  const maxAges = directives.filter((directive) =>
    directive.startsWith('max-age='),
  )
  const sharedMaxAges = directives.filter((directive) =>
    directive.startsWith('s-maxage='),
  )

  return (
    directives.includes('public') &&
    directives.includes('immutable') &&
    !directives.some((directive) => contradictory.has(directive)) &&
    maxAges.length === 1 &&
    maxAges[0] === 'max-age=31536000' &&
    sharedMaxAges.every(
      (directive) => directive === 's-maxage=31536000',
    )
  )
}

export const readOptionalJson = async (file) => {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return undefined
    }
    throw error
  }
}

export const classifyAircraftProxyStatus = (status) => {
  if (status === 200) return 'available'
  if (status === 429) return 'provider-throttled'
  return 'failure'
}
