import { describe, expect, it, vi } from 'vitest'

import { listCloudflareKvNamespaces } from './cloudflare-kv-pagination.mjs'

describe('Cloudflare KV namespace pagination', () => {
  it('accepts an empty account even when the API reports zero total pages', async () => {
    const apiRequest = vi.fn().mockResolvedValue({
      result: [],
      result_info: {
        count: 0,
        page: 1,
        per_page: 1_000,
        total_count: 0,
        total_pages: 0,
      },
    })

    await expect(
      listCloudflareKvNamespaces('https://api.test/namespaces', apiRequest),
    ).resolves.toEqual([])
    expect(apiRequest).toHaveBeenCalledTimes(1)
  })

  it('uses documented total-count pagination until all namespaces arrive', async () => {
    const firstPage = Array.from({ length: 1_000 }, (_, index) => ({
      id: `${index}`.padStart(32, '0'),
      title: `namespace-${index}`,
    }))
    const secondPage = [
      {
        id: 'f'.repeat(32),
        title: 'namespace-1000',
      },
    ]
    const apiRequest = vi
      .fn()
      .mockResolvedValueOnce({
        result: firstPage,
        result_info: {
          page: 1,
          per_page: 1_000,
          total_count: 1_001,
        },
      })
      .mockResolvedValueOnce({
        result: secondPage,
        result_info: {
          page: 2,
          per_page: 1_000,
          total_count: 1_001,
        },
      })

    await expect(
      listCloudflareKvNamespaces('https://api.test/namespaces', apiRequest),
    ).resolves.toHaveLength(1_001)
    expect(apiRequest).toHaveBeenCalledTimes(2)
  })

  it('rejects a documented total count when a later page makes no progress', async () => {
    const apiRequest = vi.fn().mockResolvedValue({
      result: [],
      result_info: {
        page: 1,
        per_page: 1_000,
        total_count: 1,
      },
    })

    await expect(
      listCloudflareKvNamespaces('https://api.test/namespaces', apiRequest),
    ).rejects.toThrow('made no progress')
  })
})
