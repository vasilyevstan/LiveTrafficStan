export class BoundedResponseError extends Error {
  constructor() {
    super('Invalid or oversized response')
    this.name = 'BoundedResponseError'
  }
}

export const readBoundedBytes = async (
  response: Response,
  maximumBytes: number,
  contentTypes: readonly string[],
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> => {
  const contentType = response.headers.get('Content-Type') ?? ''
  const contentLength = Number(response.headers.get('Content-Length'))
  if (
    !contentTypes.includes(contentType.split(';', 1)[0]!.trim().toLowerCase()) ||
    (Number.isFinite(contentLength) && contentLength > maximumBytes) ||
    !response.body
  ) {
    void response.body?.cancel().catch(() => undefined)
    throw new BoundedResponseError()
  }

  const reader = response.body.getReader()
  const abort = () => { void reader.cancel(signal?.reason).catch(() => undefined) }
  signal?.addEventListener('abort', abort, { once: true })
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    if (signal?.aborted) {
      abort()
      throw signal.reason ?? new DOMException('Request canceled', 'AbortError')
    }
    while (true) {
      const { done, value } = await reader.read()
      if (signal?.aborted) throw signal.reason ?? new DOMException('Request canceled', 'AbortError')
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maximumBytes) {
        void reader.cancel().catch(() => undefined)
        throw new BoundedResponseError()
      }
      chunks.push(value)
    }
  } finally {
    signal?.removeEventListener('abort', abort)
    reader.releaseLock()
  }
  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}
