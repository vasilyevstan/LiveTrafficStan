export class ProviderError extends Error {
  readonly status?: number
  readonly retryAfterMs?: number

  constructor(message: string, status?: number, retryAfterMs?: number) {
    super(message)
    this.name = 'ProviderError'
    this.status = status
    this.retryAfterMs = retryAfterMs
  }
}

export const parseRetryAfterMs = (
  value: string | null,
  now = Date.now(),
) => {
  if (!value) return undefined

  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000

  const retryAt = Date.parse(value)
  if (!Number.isFinite(retryAt)) return undefined
  return Math.max(0, retryAt - now)
}

export const responseError = async (
  providerName: string,
  response: Response,
) => {
  const body = (await response.text()).trim().slice(0, 180)
  const detail = body ? `: ${body}` : ''
  return new ProviderError(
    `${providerName} returned HTTP ${response.status}${detail}`,
    response.status,
    parseRetryAfterMs(response.headers.get('retry-after')),
  )
}

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unknown provider error'
