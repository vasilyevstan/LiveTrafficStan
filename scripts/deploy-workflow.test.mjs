import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const workflow = readFileSync(
  join(repositoryRoot, '.github/workflows/deploy-production.yml'),
  'utf8',
)
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

  it('keeps plausible-route activation build-only and credential-free', () => {
    expect(workflow).toContain(
      'description: Enable direct ADSB.lol plausible-route lookup',
    )
    expect(workflow).toContain(
      'VITE_FLIGHT_ROUTE_ENABLED: ${{ inputs.flight_route_enabled }}',
    )
    expect(workflow).not.toContain('AVIATIONSTACK')
    expect(workflow).not.toContain('FLIGHT_ROUTE_QUOTA')
  })
})
