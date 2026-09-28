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
      "if: steps.target-orbital.outputs.enabled == 'true'",
    )
    expect(workflow).toContain(
      "if: steps.target-orbital.outputs.enabled == 'false'",
    )
    expect(workflow).toContain(
      'prepare-orbital-rollback-config.mjs',
    )
    expect(workflow).toContain(
      '--config "$RUNNER_TEMP/wrangler-rollback.jsonc"',
    )
    expect(workflow).toContain(
      '--message "GitHub compatible rollback to $TARGET_SHA"',
    )
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
    expect(workflow).toContain('npm run build:pwa-retire')
    expect(workflow).toContain(
      'VITE_AIRCRAFT_PHOTO_ENABLED: ${{ inputs.aircraft_photo_enabled }}',
    )
    expect(workflow).toContain('aircraft_delivery:')
    expect(workflow).toContain('          - worker-proxy')
    expect(workflow).toContain('          - oci-private-relay')
    expect(workflow).toContain('          - adsb-lol-direct')
    expect(workflow).toContain(
      'aircraft_endpoint_explicit:',
    )
    expect(workflow).toContain(
      'AIRCRAFT_ENDPOINT_EXPLICIT: ${{ inputs.aircraft_endpoint_explicit }}',
    )
    expect(workflow).toContain(
      'export VITE_AIRCRAFT_ENDPOINT="$AIRCRAFT_ENDPOINT"',
    )
    expect(workflow).toContain(
      'An implicit aircraft endpoint is valid only for worker-proxy targets.',
    )
    expect(workflow).toContain(
      'VITE_FLIGHT_ROUTE_ENABLED: ${{ inputs.flight_route_enabled }}',
    )
    expect(workflow).not.toContain('AVIATIONSTACK')
    expect(workflow).toContain(
      'echo "- Aircraft delivery: \\`${{ inputs.aircraft_delivery }}\\`"',
    )
    expect(workflow).toContain(
      'echo "- Aircraft endpoint explicitly set: \\`${{ inputs.aircraft_endpoint_explicit }}\\`"',
    )
    expect(workflow).not.toContain('orbital_catalog_enabled:')
    expect(workflow).toContain(
      'npx wrangler versions view "$TARGET_VERSION_ID"',
    )
    expect(workflow).toContain(
      'resolve-orbital-version-state.mjs',
    )
    expect(workflow).toContain(
      'cp infra/cloudflare/triggers/orbital-enabled.jsonc "$RUNNER_TEMP/orbital-enabled.jsonc"',
    )
    expect(workflow).toContain(
      'cp infra/cloudflare/triggers/orbital-disabled.jsonc "$RUNNER_TEMP/orbital-disabled.jsonc"',
    )
    expect(workflow).toContain('npx wrangler triggers deploy --config "$config"')
    expect(workflow).not.toContain(
      '"${{ inputs.aircraft_delivery }}"\n          "${{ inputs.orbital_catalog_enabled }}"',
    )
    expect(workflow).toContain(
      '"${{ inputs.aircraft_delivery }}"\n          "${{ steps.target-orbital.outputs.enabled }}"',
    )
    expect(workflow).toContain(
      'echo "- Orbital catalog enabled: \\`${{ steps.target-orbital.outputs.enabled }}\\`"',
    )
  })
})
