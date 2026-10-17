import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const script = resolve(import.meta.dirname, 'prepare-production-secrets.mjs')
describe('atomic production credential preparation', () => {
  it('selects native GP credentials atomically only for the enabled chosen source and never prints them', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orbital-secrets-test-'))
    const output = join(directory, 'secrets.json')
    const env = {
      ...process.env, SECRETS_FILE: output,
      AIRCRAFT_DELIVERY: 'worker-proxy', MARINE_ENABLED: 'false', AIRPORT_BOARDS_ENABLED: 'false',
      ORBITAL_ENABLED: 'true', ORBITAL_SOURCE: 'space-track',
      SPACE_TRACK_USERNAME: 'test-protected-user', SPACE_TRACK_PASSWORD: 'test-protected-password',
    }
    try {
      const stdout = execFileSync(process.execPath, [script], { env, encoding: 'utf8' })
      expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual({
        SPACE_TRACK_USERNAME: env.SPACE_TRACK_USERNAME,
        SPACE_TRACK_PASSWORD: env.SPACE_TRACK_PASSWORD,
      })
      expect(statSync(output).mode & 0o777).toBe(0o600)
      expect(stdout).not.toContain('test-protected')
      rmSync(output)
      for (const name of ['SPACE_TRACK_USERNAME', 'SPACE_TRACK_PASSWORD']) {
        expect(() => execFileSync(process.execPath, [script], {
          env: { ...env, [name]: '' }, stdio: 'pipe',
        })).toThrow()
      }
      execFileSync(process.execPath, [script], {
        env: {
          ...env, ORBITAL_ENABLED: 'false', AIRCRAFT_DELIVERY: 'oci-private-relay',
          AIRCRAFT_RELAY_AUTH_TOKEN: 'test-relay-secret'.repeat(3),
        },
      })
      const disabled = JSON.parse(readFileSync(output, 'utf8'))
      expect(disabled).not.toHaveProperty('SPACE_TRACK_USERNAME')
      expect(disabled).not.toHaveProperty('SPACE_TRACK_PASSWORD')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
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
          AIRPORT_BOARDS_ENABLED: 'true',
          AERODATABOX_RAPIDAPI_KEY: 'test-airport-board-secret',
        },
      })
      expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual({
        AIRCRAFT_RELAY_AUTH_TOKEN: 'test-relay-secret'.repeat(3),
        AISSTREAM_API_KEY: 'test-aisstream-secret',
        OPENWATERS_AIS_TOKEN: 'test-openwaters-secret',
        AERODATABOX_RAPIDAPI_KEY: 'test-airport-board-secret',
      })

      expect(statSync(output).mode & 0o777).toBe(0o600)
      expect(stdout).not.toContain('test-')
      expect(stdout).not.toContain('must-not-be-deployed')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('omits the board credential when disabled and refuses missing or malformed enabled credentials', () => {
    const directory = mkdtempSync(join(tmpdir(), 'airport-secrets-test-'))
    const output = join(directory, 'secrets.json')
    try {
      execFileSync(process.execPath, [script], {
        env: {
          ...process.env, SECRETS_FILE: output, AIRCRAFT_DELIVERY: 'oci-private-relay',
          AIRCRAFT_RELAY_AUTH_TOKEN: 'test-relay-secret'.repeat(3),
          MARINE_ENABLED: 'false', AIRPORT_BOARDS_ENABLED: 'false',
          AERODATABOX_RAPIDAPI_KEY: 'must-not-be-deployed',
        },
      })
      expect(JSON.parse(readFileSync(output, 'utf8'))).not.toHaveProperty('AERODATABOX_RAPIDAPI_KEY')
      rmSync(output)
      for (const key of ['', 'invalid\nkey']) {
        expect(() => execFileSync(process.execPath, [script], {
          stdio: 'pipe',
          env: {
            ...process.env, SECRETS_FILE: output, AIRCRAFT_DELIVERY: 'worker-proxy',
            MARINE_ENABLED: 'false', AIRPORT_BOARDS_ENABLED: 'true', AERODATABOX_RAPIDAPI_KEY: key,
          },
        })).toThrow()
      }
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
