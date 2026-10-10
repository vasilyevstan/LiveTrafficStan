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
  const contentType = response.headers.get('Content-Type') ?? ''
  const contentLength = Number(response.headers.get('Content-Length'))
  if (
    !contentTypes.includes(contentType.split(';', 1)[0]!.trim().toLowerCase()) ||
    (Number.isFinite(contentLength) && contentLength > maximumBytes) ||
    !response.body
  ) {
    void response.body?.cancel().catch(() => undefined)
    throw new BoundedJsonError()
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maximumBytes) {
        void reader.cancel().catch(() => undefined)
        throw new BoundedJsonError()
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
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
