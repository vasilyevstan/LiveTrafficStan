import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const workflow = readFileSync(
  join(repositoryRoot, '.github/workflows/rollback-production.yml'),
  'utf8',
)

describe('production rollback workflow', () => {
  it('serializes rollback with deployment and verifies current main', () => {
    expect(workflow).toContain('group: production-deployment')
    expect(workflow).toContain(
      'test "$(git rev-parse origin/main)" = "$CURRENT_MAIN_SHA"',
    )
    expect(workflow).toContain(
      'git merge-base --is-ancestor "$TARGET_SHA" "$CURRENT_MAIN_SHA"',
    )
  })

  it('restores only an exact recorded version and reruns current smoke policy', () => {
    expect(workflow).toContain('npx wrangler rollback "$TARGET_VERSION_ID"')
    expect(workflow).toContain('--message "GitHub rollback to $TARGET_SHA"')
    expect(workflow).toContain('--yes')
    expect(workflow).toContain(
      'cp scripts/smoke-production.mjs "$RUNNER_TEMP/smoke-production.mjs"',
    )
    expect(workflow).toContain(
      'cp "$RUNNER_TEMP/smoke-production.mjs" scripts/smoke-production.mjs',
    )
    expect(workflow).toContain(
      '"${{ inputs.deployment_url }}"\n          "${{ inputs.target_sha }}"\n          "${{ inputs.aircraft_delivery }}"',
    )
  })

  it('keeps the target build flags explicit', () => {
    expect(workflow).toContain("if: inputs.artifact == 'application'")
    expect(workflow).toContain("if: inputs.artifact == 'pwa-retirement'")
    expect(workflow).toContain('run: npm run build:pwa-retire')
    expect(workflow).toContain(
      'VITE_AIRCRAFT_PHOTO_ENABLED: ${{ inputs.aircraft_photo_enabled }}',
    )
    expect(workflow).toContain('aircraft_delivery:')
    expect(workflow).toContain('          - worker-proxy')
    expect(workflow).toContain('          - adsb-lol-direct')
    expect(workflow).toContain(
      "VITE_AIRCRAFT_ENDPOINT: ${{ inputs.aircraft_delivery == 'adsb-lol-direct' && 'https://api.adsb.lol' || '/api/aircraft' }}",
    )
    expect(workflow).toContain(
      'VITE_FLIGHT_ROUTE_ENABLED: ${{ inputs.flight_route_enabled }}',
    )
    expect(workflow).toContain(
      '--var AVIATIONSTACK_ENABLED:${{ inputs.flight_route_enabled }}',
    )
    expect(workflow).toContain(
      'echo "- Aircraft delivery: \\`${{ inputs.aircraft_delivery }}\\`"',
    )
  })
})
