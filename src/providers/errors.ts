export class ProviderError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ProviderError'
    this.status = status
  }
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
  )
}

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unknown provider error'
