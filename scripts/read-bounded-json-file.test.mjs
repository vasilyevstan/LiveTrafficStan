import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readBoundedJsonFile } from './read-bounded-json-file.mjs'

const temporaryFile = (name, contents) => {
  const directory = mkdtempSync(join(tmpdir(), 'lts-orbital-json-'))
  const path = join(directory, name)
  writeFileSync(path, contents)
  return path
}

describe('bounded orbital JSON files', () => {
  it('decodes valid bounded UTF-8 JSON', async () => {
    const path = temporaryFile('valid.json', '{"ok":true}\n')

    await expect(
      readBoundedJsonFile(path, 32, 'fixture'),
    ).resolves.toEqual({
      text: '{"ok":true}\n',
      value: { ok: true },
    })
  })

  it('rejects raw bytes over the limit before parsing', async () => {
    const path = temporaryFile('large.json', '{"padding":"123456"}')

    await expect(
      readBoundedJsonFile(path, 8, 'fixture'),
    ).rejects.toThrow('exceeds 8 bytes')
  })

  it('rejects malformed UTF-8 instead of replacing bytes', async () => {
    const path = temporaryFile(
      'invalid.json',
      Buffer.from([0x7b, 0x22, 0xc3, 0x28, 0x22, 0x7d]),
    )

    await expect(
      readBoundedJsonFile(path, 32, 'fixture'),
    ).rejects.toThrow('not valid UTF-8')
  })
})
