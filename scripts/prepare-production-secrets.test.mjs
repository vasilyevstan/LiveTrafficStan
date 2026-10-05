import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const script = resolve(import.meta.dirname, 'prepare-production-secrets.mjs')
describe('atomic production credential preparation', () => {
  it('writes only required server credentials without logging values', () => {
    const directory = mkdtempSync(join(tmpdir(), 'marine-secrets-test-'))
    const output = join(directory, 'secrets.json')
    try {
      const stdout = execFileSync(process.execPath, [script], {
        encoding: 'utf8',
        env: {
          ...process.env,
          SECRETS_FILE: output,
          AIRCRAFT_DELIVERY: 'oci-private-relay',
          AIRCRAFT_RELAY_AUTH_TOKEN: 'test-relay-secret'.repeat(3),
          MARINE_ENABLED: 'true',
          AISSTREAM_API_KEY: 'test-aisstream-secret',
          OPENWATERS_AIS_TOKEN: 'test-openwaters-secret',
          OPENWATERS_AIS_IDENTITY_PRIVATE_KEY: 'must-not-be-deployed',
        },
      })
      expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual({
        AIRCRAFT_RELAY_AUTH_TOKEN: 'test-relay-secret'.repeat(3),
        AISSTREAM_API_KEY: 'test-aisstream-secret',
        OPENWATERS_AIS_TOKEN: 'test-openwaters-secret',
      })
      expect(statSync(output).mode & 0o777).toBe(0o600)
      expect(stdout).not.toContain('test-')
      expect(stdout).not.toContain('must-not-be-deployed')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
