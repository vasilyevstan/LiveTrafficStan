import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const workflow = readFileSync(
  join(repositoryRoot, '.github/workflows/deploy-production.yml'),
  'utf8',
)
const credentialGuard =
  'test "${{ inputs.flight_route_enabled }}" != "true" || test -n "$AVIATIONSTACK_ACCESS_KEY"'

const guardPasses = (enabled, accessKey) => {
  try {
    execFileSync(
      '/bin/sh',
      [
        '-c',
        'test "$FLIGHT_ROUTE_ENABLED" != "true" || test -n "$AVIATIONSTACK_ACCESS_KEY"',
      ],
      {
        env: {
          FLIGHT_ROUTE_ENABLED: enabled,
          AVIATIONSTACK_ACCESS_KEY: accessKey,
        },
        stdio: 'ignore',
      },
    )
    return true
  } catch {
    return false
  }
}

describe('production deployment workflow', () => {
  it('uses a fixed aircraft delivery choice and records it in smoke', () => {
    expect(workflow).toContain('aircraft_delivery:')
    expect(workflow).toContain('          - worker-proxy')
    expect(workflow).toContain('          - adsb-lol-direct')
    expect(workflow).toContain(
      "VITE_AIRCRAFT_ENDPOINT: ${{ inputs.aircraft_delivery == 'adsb-lol-direct' && 'https://api.adsb.lol' || '/api/aircraft' }}",
    )
    expect(workflow).toContain(
      '"${{ inputs.sha }}"\n          "${{ inputs.aircraft_delivery }}"',
    )
    expect(workflow).toContain(
      'echo "- Aircraft delivery: \\`${{ inputs.aircraft_delivery }}\\`"',
    )
  })

  it('keeps the route credential guard in one pre-command', () => {
    expect(workflow).toContain(`            ${credentialGuard}`)
    expect(workflow).not.toContain(
      '            if [[ "${{ inputs.flight_route_enabled }}" == "true" ]]; then',
    )
  })

  it('requires the route credential only when route lookup is enabled', () => {
    expect(guardPasses('false', '')).toBe(true)
    expect(guardPasses('true', '')).toBe(false)
    expect(guardPasses('true', 'configured')).toBe(true)
  })
})
