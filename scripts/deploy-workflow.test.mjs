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
const secretsScript = readFileSync(
  join(repositoryRoot, 'scripts/prepare-production-secrets.mjs'),
  'utf8',
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
    expect(workflow).toContain('Prepare production secrets file')
    expect(secretsScript).toContain(
      'secrets.AIRCRAFT_RELAY_AUTH_TOKEN = token',
    )
    expect(workflow).toContain(
      "format('--secrets-file {0}/wrangler-production-secrets.json', runner.temp)",
    )
    expect(workflow).toContain('Remove production secrets file')
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

  it('retains the marine state identity without enabling its binding by default', () => {
    expect(wrangler.durable_objects).toBeUndefined()
    expect(wrangler.exports).toEqual({
      FlightRouteQuota: {
        type: 'durable-object',
        state: 'deleted',
      },
      MarineTrafficRelay: {
        type: 'durable-object',
        storage: 'sqlite',
      },
      AirportBoardCoordinator: {
        type: 'durable-object',
        storage: 'sqlite',
      },
    })
  })

  it('keeps marine credentials server-side and includes them in the atomic deployment', () => {
    expect(workflow).toContain('marine_supplement_enabled:')
    expect(workflow).toContain('VITE_MARINE_SUPPLEMENT_ENABLED: ${{ inputs.marine_supplement_enabled }}')
    expect(workflow).toContain('--marine-enabled "$MARINE_ENABLED"')
    expect(workflow).toContain('--var MARINE_SUPPLEMENT_ENABLED:${{ inputs.marine_supplement_enabled }}')
    expect(workflow).toContain('node scripts/prepare-production-secrets.mjs')
    expect(secretsScript).toContain("['AISSTREAM_API_KEY', 'OPENWATERS_AIS_TOKEN']")
    expect(secretsScript).toContain('JSON.stringify(secrets)')
    expect(workflow).not.toContain('VITE_AISSTREAM_API_KEY')
    expect(workflow).not.toContain('VITE_OPENWATERS_AIS_TOKEN')
    expect(workflow).not.toContain('OPENWATERS_AIS_IDENTITY_PRIVATE_KEY')
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

  it('gates airport boards and deploys the private key atomically without exposing it to the client', () => {
    expect(workflow).toContain('airport_boards_enabled:')
    expect(workflow).toContain('VITE_AIRPORT_BOARDS_ENABLED: ${{ inputs.airport_boards_enabled }}')
    expect(workflow).toContain('--airport-boards-enabled "$AIRPORT_BOARDS_ENABLED"')
    expect(workflow).toContain('--var AIRPORT_BOARDS_ENABLED:${{ inputs.airport_boards_enabled }}')
    expect(workflow).toContain('AERODATABOX_RAPIDAPI_KEY: ${{ secrets.AERODATABOX_RAPIDAPI_KEY }}')
    expect(secretsScript).toContain('secrets.AERODATABOX_RAPIDAPI_KEY = key')
    expect(workflow).not.toContain('VITE_AERODATABOX')
    expect(workflow).not.toContain('wrangler secret put')
    expect(workflow).toContain('"${{ inputs.starlink_catalog_enabled }}"\n          "${{ inputs.airport_boards_enabled }}"')
  })
})
