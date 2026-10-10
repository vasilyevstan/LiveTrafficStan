import { BoundedResponseError, readBoundedBytes } from './boundedResponse.js'

export class BoundedJsonError extends Error {
  constructor() {
    super('Invalid or oversized JSON response')
    this.name = 'BoundedJsonError'
  }
}

export const readBoundedJson = async (
  response: Response,
  maximumBytes: number,
  contentTypes: readonly string[] = ['application/json'],
  expectedSha256?: string,
): Promise<unknown> => {
  let bytes: Uint8Array<ArrayBuffer>
  try {
    bytes = await readBoundedBytes(response, maximumBytes, contentTypes)
  } catch (error) {
    if (error instanceof BoundedResponseError) throw new BoundedJsonError()
    throw error
  }
  if (expectedSha256) {
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    const actual = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')
    if (actual !== expectedSha256) throw new BoundedJsonError()
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes))
  } catch {
    throw new BoundedJsonError()
  }
}
