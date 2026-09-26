import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const directory = dirname(fileURLToPath(import.meta.url))
const deployScript = readFileSync(
  join(directory, 'deploy-release.sh'),
  'utf8',
)
const cloudflaredScript = readFileSync(
  join(directory, 'install-cloudflared.sh'),
  'utf8',
)
const relayUnit = readFileSync(
  join(directory, 'livetrafficstan-aircraft-relay.service'),
  'utf8',
)
const cloudflaredUnit = readFileSync(
  join(directory, 'livetrafficstan-cloudflared.service'),
  'utf8',
)
const bootstrapWorkflow = readFileSync(
  join(directory, '../../../.github/workflows/bootstrap-aircraft-relay.yml'),
  'utf8',
)

describe('OCI relay deployment', () => {
  it('pins and verifies runtime and release artifacts', () => {
    expect(deployScript).toContain("readonly NODE_VERSION='24.13.1'")
    expect(deployScript).toContain(
      "readonly NODE_SHA256='30215f90ea3cd04dfbc06e762c021393fa173a1d392974298bbc871a8e461089'",
    )
    expect(deployScript).toContain('sha256sum -c -')
    expect(deployScript).toContain(
      'https://raw.githubusercontent.com/vasilyevstan/LiveTrafficStan',
    )
    expect(deployScript).toContain("curl -fsS --max-time 3")
    expect(deployScript).toContain('rollback "$previous_target"')
    expect(deployScript).toContain(
      'sha256sum -c -\nelse\n  install -d -o root -g root',
    )
  })

  it('keeps relay secrets and state outside immutable releases', () => {
    expect(deployScript).toContain(
      "readonly ENV_FILE='/etc/livetrafficstan-aircraft-relay.env'",
    )
    expect(relayUnit).toContain(
      'EnvironmentFile=/etc/livetrafficstan-aircraft-relay.env',
    )
    expect(relayUnit).toContain(
      'StateDirectory=livetrafficstan-aircraft-relay',
    )
    expect(relayUnit).toContain('ProtectSystem=strict')
    expect(relayUnit).toContain('RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6')
  })

  it('pins cloudflared and reads its token from a protected file', () => {
    expect(cloudflaredScript).toContain(
      "readonly CLOUDFLARED_VERSION='2026.9.3'",
    )
    expect(cloudflaredScript).toContain(
      "readonly CLOUDFLARED_SHA256='58b3221b6a22d23825cb5a0b347600db39e24e5a5e97afa6e0ae67c34ef235ef'",
    )
    expect(cloudflaredUnit).toContain('--protocol quic')
    expect(cloudflaredUnit).toContain('--edge-ip-version 6')
    expect(cloudflaredUnit).toContain(
      '--token-file /etc/livetrafficstan-cloudflared-token',
    )
    expect(cloudflaredUnit).not.toContain('http://')
    expect(cloudflaredUnit).not.toContain('https://')
  })

  it('bootstraps one fail-closed Tunnel and VPC Service', () => {
    expect(bootstrapWorkflow).toContain('environment:')
    expect(bootstrapWorkflow).toContain('name: production')
    expect(bootstrapWorkflow).toContain('cancel-in-progress: false')
    expect(bootstrapWorkflow).toContain(
      'GET "cfd_tunnel?name=$TUNNEL_NAME&is_deleted=false"',
    )
    expect(bootstrapWorkflow).toContain(
      "api_request POST 'connectivity/directory/services'",
    )
    expect(bootstrapWorkflow).toContain('ipv4: "127.0.0.1"')
    expect(bootstrapWorkflow).toContain('http_port: 8788')
    expect(bootstrapWorkflow).toContain('rsa_padding_mode:oaep')
    expect(bootstrapWorkflow).toContain('retention-days: 1')
    expect(bootstrapWorkflow).not.toContain('tunnel_token" >>')
  })
})
