import { readFile } from 'node:fs/promises'

export const readBoundedUtf8File = async (
  path,
  maximumBytes,
  description,
) => {
  const bytes = await readFile(path)
  if (bytes.byteLength > maximumBytes) {
    throw new Error(`${description} exceeds ${maximumBytes} bytes`)
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error(`${description} is not valid UTF-8`)
  }
}

export const readBoundedJsonFile = async (
  path,
  maximumBytes,
  description,
) => {
  const text = await readBoundedUtf8File(
    path,
    maximumBytes,
    description,
  )
  try {
    return {
      text,
      value: JSON.parse(text),
    }
  } catch {
    throw new Error(`${description} is not valid JSON`)
  }
}
