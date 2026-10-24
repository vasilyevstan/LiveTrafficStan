import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { prepareObjectSharing } from './prepare-object-sharing.mjs'

const accountId = 'a'.repeat(32)
const database = { name: 'livetrafficstan-object-shares', uuid: '12345678-1234-1234-1234-123456789abc' }
const now = Date.UTC(2026, 9, 23, 12)
const opened = []
afterEach(() => { for (const sqlite of opened.splice(0)) sqlite.close() })
const response = result => Response.json({ success: true, result })

const fixture = ({ exists = true, requests = 2_000, subscriptions = [], malformedMetrics = false, duplicates = false } = {}) => {
  const sqlite = new DatabaseSync(':memory:')
  opened.push(sqlite)
  if (exists) sqlite.exec(readFileSync(new URL('../worker/object-shares.sql', import.meta.url), 'utf8'))
  const fetchImpl = vi.fn(async (url, init) => {
    const path = new URL(url).pathname
    if (path.endsWith('/subscriptions')) return response(subscriptions)
    if (path.endsWith('/graphql')) {
      const account = { storage: [] }
      for (let index = 0; index < 8; index++) {
        account[`workers${index}`] = [{ sum: { requests } }]
        account[`d1day${index}`] = [{ sum: { rowsRead: 0, rowsWritten: 0 } }]
      }
      return Response.json({ data: { viewer: { accounts: [account] } }, errors: null })
    }
    if (path.endsWith('/d1/database') && init.method === 'GET') return response(exists ? duplicates ? [database, database] : [database] : [])
    if (path.endsWith('/d1/database') && init.method === 'POST') {
      expect(JSON.parse(init.body)).toEqual({ name: database.name })
      exists = true
      return response(database)
    }
    if (path.endsWith(`/d1/database/${database.uuid}/query`)) {
      const { batch } = JSON.parse(init.body)
      const results = []
      sqlite.exec('BEGIN IMMEDIATE')
      try {
        for (const statement of batch) {
          const before = sqlite.prepare('SELECT total_changes() AS n').get().n
          let rows = []
          if (statement.sql.startsWith('CREATE TABLE')) sqlite.exec(statement.sql)
          else rows = sqlite.prepare(statement.sql).all(...(statement.params ?? []))
          const changes = sqlite.prepare('SELECT total_changes() AS n').get().n - before
          const size = sqlite.prepare('PRAGMA page_size').get().page_size * sqlite.prepare('PRAGMA page_count').get().page_count
          results.push({
            success: true, results: rows,
            // Simulated metering tests accounting logic, not the production D1 cost claim.
            meta: malformedMetrics ? {} : { rows_read: rows.length + 2, rows_written: changes * 2, size_after: size },
          })
        }
        sqlite.exec('COMMIT')
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
      return response(results)
    }
    throw new Error('Unexpected API operation')
  })
  return {
    sqlite, fetchImpl,
    run: (operation = 'setup') => prepareObjectSharing({ accountId, apiToken: 'fixture-token', operation, now, fetchImpl }),
  }
}

describe('protected fixed object-sharing operations', () => {
  it('does not publish existing object statistics or account usage through the public setup result', async () => {
    const { sqlite, run } = fixture()
    const day = Math.floor(now / 86_400_000)
    sqlite.exec(`INSERT INTO object_share_statistics VALUES (${day}, 'aircraft', 'abcdef', 3, 7);
      INSERT INTO object_share_statistics VALUES (${day - 30}, 'vessel', '230123456', 100, 200);`)
    const result = await run()
    expect(result.created).toBe(false)
    expect(result.capacity).toEqual({
      workersPlan: 'free', checkedDays: 8, featureRequests: 2_100, minimumRequestReserve: 20_000,
    })
    expect(result.qualification).toBeUndefined()
    expect(result).not.toHaveProperty('statistics')
    expect(JSON.stringify(result)).not.toMatch(/abcdef|230123456|rowsRead|rowsWritten|storageBytes|referrer|visitorId/)
    expect(sqlite.prepare('SELECT SUM(created) AS n FROM object_share_statistics').get().n).toBe(103)
  })

  it('checks Free headroom before provisioning and exercises the actual SQL through capped workload and retention', async () => {
    const { sqlite, fetchImpl, run } = fixture({ exists: false })
    const result = await run('setup')
    expect(result).toMatchObject({
      databaseId: database.uuid, created: true,
      capacity: { workersPlan: 'free', featureRequests: 2_100, minimumRequestReserve: 20_000 },
      qualification: { creations: 100, resolutions: 1_000, maximumActiveLinks: 200, retainedStatisticRows: 6_000 },
    })
    expect(result.qualification.rowsRead).toBeLessThan(100_000)
    expect(result.qualification.rowsWritten).toBeLessThan(10_000)
    expect(result.qualification.storageBytes).toBeLessThan(10 * 1_024 ** 2)
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM object_shares').get().n).toBe(0)
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM object_share_statistics').get().n).toBe(0)
    expect(fetchImpl.mock.calls[0][0]).toContain('/subscriptions')
    expect(fetchImpl.mock.calls[1][0]).toContain('/graphql')
    expect(fetchImpl.mock.calls.every(([, init]) => init.redirect === 'error' && init.signal instanceof AbortSignal)).toBe(true)
  })

  it('will not upgrade a paid account or allocate a database when measured reserve is insufficient', async () => {
    for (const options of [
      { subscriptions: [{ state: 'Paid', rate_plan: { id: 'paid', public_name: 'Workers Paid' } }] },
      { requests: 79_000 },
    ]) {
      const { run, fetchImpl } = fixture({ ...options, exists: false })
      await expect(run('setup')).rejects.toThrow(/non-Free|insufficient/)
      expect(fetchImpl.mock.calls.every(([, init]) => init.method === 'GET' || !JSON.parse(init.body).name)).toBe(true)
      expect(fetchImpl.mock.calls.some(([url]) => url.includes('/d1/'))).toBe(false)
    }
  })

  it('rejects the removed public statistics operation before any account access', async () => {
    const { run, fetchImpl } = fixture({ exists: false })
    await expect(run('statistics')).rejects.toThrow('operation or clock is invalid')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects ambiguous resource identity before SQL', async () => {
    const { run, fetchImpl } = fixture({ duplicates: true })
    await expect(run()).rejects.toThrow('Multiple databases')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('fails qualification honestly and removes synthetic rows if D1 metering is absent', async () => {
    const { run, sqlite } = fixture({ exists: false, malformedMetrics: true })
    await expect(run('setup')).rejects.toThrow('complete qualification row/storage metering')
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM object_shares').get().n).toBe(0)
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM object_share_statistics').get().n).toBe(0)
  })

  it('reports permission and transport failures without their private response or automatic retry', async () => {
    for (const fail of [
      () => new Response('private diagnostic with account data', { status: 403 }),
      () => { throw new Error('private diagnostic with account data') },
    ]) {
      const fetchImpl = vi.fn(fail)
      await expect(prepareObjectSharing({ accountId, apiToken: 'fixture-token', operation: 'setup', now, fetchImpl }))
        .rejects.toThrow(/subscription read.*(HTTP 403|transport failed)/)
      expect(fetchImpl).toHaveBeenCalledOnce()
    }
  })

  it('rejects arbitrary operations and credentials before any request', async () => {
    const fetchImpl = vi.fn()
    await expect(prepareObjectSharing({ accountId, apiToken: 'fixture-token', operation: 'arbitrary-sql', now, fetchImpl })).rejects.toThrow()
    await expect(prepareObjectSharing({ accountId: '../other', apiToken: 'fixture-token', operation: 'setup', now, fetchImpl })).rejects.toThrow()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('uses existing main-only serialization and never sends sharing choices into DNS cleanup', () => {
    const workflow = readFileSync(new URL('../.github/workflows/prepare-trackstan-domain.yml', import.meta.url), 'utf8')
    expect(workflow).toContain('group: production-deployment')
    expect(workflow).toContain('name: production')
    expect(workflow).toContain('test "$GITHUB_SHA" = "$EXPECTED_SHA"')
    expect(workflow).toContain('if: inputs.operation == \'domain\'')
    expect(workflow).toContain('object-sharing-setup')
    expect(workflow).not.toContain('object-sharing-statistics')
    expect(workflow).toContain('node scripts/prepare-object-sharing.mjs')
    expect(workflow).not.toContain('upload-artifact')
    expect(workflow).not.toContain('wrangler deploy')
  })
})
