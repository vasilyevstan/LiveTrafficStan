import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readBoundedJson } from './boundedJson'

describe('shared bounded JSON reader', () => {
  it('retains application/json as the default and requires explicit GeoJSON support', async () => {
    const response = () => new Response('{}', { headers: { 'Content-Type': 'application/geo+json' } })
    await expect(readBoundedJson(response(), 100)).rejects.toThrow()
    await expect(readBoundedJson(response(), 100, ['application/geo+json'])).resolves.toEqual({})
    await expect(readBoundedJson(new Response('{}', { headers: { 'Content-Type': 'Application/JSON; charset=utf-8' } }), 100)).resolves.toEqual({})
    await expect(readBoundedJson(new Response('{}', { headers: { 'Content-Type': 'application/json-other' } }), 100)).rejects.toThrow()
  })

  it('verifies exact source bytes before parsing when an immutable asset supplies a checksum', async () => {
    const raw = '{ "test": true }\n'
    const sha = createHash('sha256').update(raw).digest('hex')
    const response = (text = raw) => new Response(text, { headers: { 'Content-Type': 'application/json' } })
    await expect(readBoundedJson(response(), 100, ['application/json'], sha)).resolves.toEqual({ test: true })
    await expect(readBoundedJson(response(raw.trim()), 100, ['application/json'], sha)).rejects.toThrow()
    await expect(readBoundedJson(response(), 4)).rejects.toThrow()
  })
})
