import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  readRelayConfiguration,
  startRelayServer,
} from './server.mjs'

const servers = []
const directories = []

const startServer = async (fetchImpl) => {
  const directory = await mkdtemp(join(tmpdir(), 'lts-relay-server-'))
  directories.push(directory)

  const server = await startRelayServer(
    {
      authToken: 'test-token-with-sufficient-entropy',
      releaseSha: '0123456789abcdef0123456789abcdef01234567',
      statePath: join(directory, 'state.json'),
      host: '127.0.0.1',
      port: 0,
    },
    { fetchImpl, log: () => {} },
  )
  servers.push(server)

  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('Relay test server did not bind to a TCP port')
  }
  return `http://127.0.0.1:${address.port}`
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()))
          server.closeAllConnections()
        }),
    ),
  )
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
})

describe('relay HTTP server', () => {
  it('accepts only loopback host configuration', () => {
    expect(() =>
      readRelayConfiguration({
        LTS_RELAY_AUTH_TOKEN: 'token',
        LTS_RELAY_HOST: '0.0.0.0',
        LTS_RELAY_RELEASE_SHA:
          '0123456789abcdef0123456789abcdef01234567',
      }),
    ).toThrow('Relay host must be loopback')
  })

  it('serves health and authenticated proxy responses over HTTP', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('{"aircraft":[]}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const origin = await startServer(fetchImpl)

    const health = await fetch(`${origin}/healthz`)
    expect(health.status).toBe(200)
    await expect(health.json()).resolves.toEqual({
      releaseSha: '0123456789abcdef0123456789abcdef01234567',
      status: 'ok',
    })

    const unauthorized = await fetch(
      `${origin}/v2/point/59.437/24.7536/10`,
    )
    expect(unauthorized.status).toBe(401)
    expect(fetchImpl).not.toHaveBeenCalled()

    const proxied = await fetch(`${origin}/v2/point/59.437/24.7536/10`, {
      headers: {
        Authorization: 'Bearer test-token-with-sufficient-entropy',
      },
    })
    expect(proxied.status).toBe(200)
    await expect(proxied.json()).resolves.toEqual({ aircraft: [] })
    expect(fetchImpl).toHaveBeenCalledOnce()
  })
})
