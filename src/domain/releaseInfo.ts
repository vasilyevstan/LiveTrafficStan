import packageMetadata from '../../package.json'

export interface ReleaseInfo {
  version: string
  sha: string
  timestamp: string
}

interface ReleaseEnvironment {
  VITE_RELEASE_SHA?: string
  VITE_RELEASE_TIMESTAMP?: string
}

const exactSha = (value: string | undefined) =>
  value?.trim().match(/^[0-9a-f]{40}$/)?.[0]

const exactTimestamp = (value: string | undefined) => {
  if (!value) return undefined
  const timestamp = new Date(value)
  return Number.isFinite(timestamp.getTime())
    ? timestamp.toISOString()
    : undefined
}

export const releaseInfoFromEnvironment = (
  environment: ReleaseEnvironment,
): ReleaseInfo | undefined => {
  const sha = exactSha(environment.VITE_RELEASE_SHA)
  const timestamp = exactTimestamp(environment.VITE_RELEASE_TIMESTAMP)
  return sha && timestamp
    ? {
        version: packageMetadata.version,
        sha,
        timestamp,
      }
    : undefined
}

export const formatReleaseTimestamp = (timestamp: string) =>
  `${timestamp.slice(0, 10)} ${timestamp.slice(11, 16)} UTC`

export const RELEASE_INFO = releaseInfoFromEnvironment({
  VITE_RELEASE_SHA: import.meta.env.VITE_RELEASE_SHA,
  VITE_RELEASE_TIMESTAMP: import.meta.env.VITE_RELEASE_TIMESTAMP,
})
