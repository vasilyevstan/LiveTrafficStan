import { afterEach, describe, expect, it, vi } from 'vitest'
import worker, { type WorkerEnv } from './index.js'

const releaseSha = '0123456789abcdef0123456789abcdef01234567'

describe('Cloudflare worker routing', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('routes API requests through the proxy and marks the release', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('{"now":1800000000000,"ac":[]}', {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    const assetsFetch = vi.fn(async () => new Response('asset'))
    const env: WorkerEnv = {
      ASSETS: { fetch: assetsFetch },
      RELEASE_SHA: releaseSha,
    }

    const response = await worker.fetch(
      new Request(
        'https://app.example/api/aircraft/v2/point/59.437/24.7536/11',
      ),
      env,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-livetrafficstan-release')).toBe(releaseSha)
    expect(assetsFetch).not.toHaveBeenCalled()
  })

  it('rejects the API root without consulting Static Assets', async () => {
    const assetsFetch = vi.fn()

    const response = await worker.fetch(
      new Request('https://app.example/api'),
      { ASSETS: { fetch: assetsFetch } },
    )

    expect(response.status).toBe(404)
    expect(assetsFetch).not.toHaveBeenCalled()
  })

  it('does not expose an invalid release value', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')))
    const response = await worker.fetch(
      new Request(
        'https://app.example/api/aircraft/v2/point/59.437/24.7536/11',
      ),
      {
        ASSETS: { fetch: vi.fn() },
        RELEASE_SHA: 'development',
      },
    )

    expect(response.headers.has('x-livetrafficstan-release')).toBe(false)
  })

  it('serves non-API requests through the static asset binding', async () => {
    const assetsFetch = vi.fn(async () => new Response('not found', {
      status: 404,
    }))
    const request = new Request('https://app.example/assets/missing.js')

    const response = await worker.fetch(request, {
      ASSETS: { fetch: assetsFetch },
    })

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('not found')
    expect(assetsFetch).toHaveBeenCalledWith(request)
  })
})
