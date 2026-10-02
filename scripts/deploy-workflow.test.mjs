import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const workflow = readFileSync(
  join(repositoryRoot, '.github/workflows/deploy-production.yml'),
  'utf8',
)
const wrangler = JSON.parse(
  readFileSync(join(repositoryRoot, 'wrangler.jsonc'), 'utf8'),
)

describe('production deployment workflow', () => {
  it('uses a fixed aircraft delivery choice and records it in smoke', () => {
    expect(workflow).toContain('aircraft_delivery:')
    expect(workflow).toContain('          - worker-proxy')
    expect(workflow).toContain('          - oci-private-relay')
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
    expect(workflow).not.toContain('npx wrangler secret put')
    expect(workflow).toContain('Prepare private relay secrets file')
    expect(workflow).toContain(
      'JSON.stringify({ AIRCRAFT_RELAY_AUTH_TOKEN: token })',
    )
    expect(workflow).toContain(
      "format('--secrets-file {0}/wrangler-production-secrets.json', runner.temp)",
    )
    expect(workflow).toContain('Remove private relay secrets file')
    expect(workflow).toContain('run: rm -f "$SECRETS_FILE"')
    expect(workflow).toContain(
      '--var AIRCRAFT_DELIVERY:${{ inputs.aircraft_delivery }}',
    )
    expect(wrangler.vpc_services).toEqual([
      {
        binding: 'AIRCRAFT_RELAY',
        service_id: '01a0df44-6600-79a2-a14f-88b6606869fb',
      },
    ])
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

  it('keeps only the deleted route quota export in the base config', () => {
    expect(wrangler.durable_objects).toBeUndefined()
    expect(wrangler.exports).toEqual({
      FlightRouteQuota: {
        type: 'durable-object',
        state: 'deleted',
      },
    })
  })

  it('gates the orbital catalog behind coordinated scheduled storage', () => {
    expect(workflow).toContain('orbital_catalog_enabled:')
    expect(workflow).toContain('npm run check:orbital-catalog')
    expect(workflow).toContain('node scripts/resolve-orbital-kv.mjs')
    expect(workflow).toContain(
      'node scripts/prepare-wrangler-config.mjs',
    )
    expect(workflow).toContain(
      '--config ${{ runner.temp }}/wrangler-production.jsonc',
    )
    expect(workflow).toContain(
      '--var ORBITAL_CATALOG_ENABLED:${{ inputs.orbital_catalog_enabled }}',
    )
    expect(workflow).toContain(
      '"${{ inputs.aircraft_delivery }}"\n          "${{ inputs.orbital_catalog_enabled }}"',
    )
    expect(workflow).toContain(
      'echo "- Orbital catalog enabled: \\`${{ inputs.orbital_catalog_enabled }}\\`"',
    )
    expect(workflow).toContain(
      'echo "- Orbital coordinator enabled: \\`${{ inputs.orbital_catalog_enabled }}\\`"',
    )
    expect(workflow).toContain('starlink_catalog_enabled:')
    expect(workflow).toContain(
      'The Starlink catalog requires the curated orbital catalog.',
    )
    expect(workflow).toContain(
      'npm run check:starlink-catalog -- --require-bootstrap',
    )
    expect(workflow).toContain(
      '--starlink-enabled "$STARLINK_ENABLED"',
    )
    expect(workflow).toContain(
      '--var "STARLINK_CATALOG_ENABLED:$STARLINK_ENABLED"',
    )
    expect(workflow).toContain(
      '--var STARLINK_CATALOG_ENABLED:${{ inputs.starlink_catalog_enabled }}',
    )
    expect(workflow).toContain(
      '"${{ inputs.orbital_catalog_enabled }}"\n          "${{ inputs.starlink_catalog_enabled }}"',
    )
    expect(workflow).toContain(
      'echo "- Starlink catalog enabled: \\`${{ inputs.starlink_catalog_enabled }}\\`"',
    )
  })
})
