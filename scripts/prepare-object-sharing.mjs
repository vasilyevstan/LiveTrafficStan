import { appendFile, readFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { OBJECT_SHARE_CONFIG as config } from '../src/config/objectShareConfig.ts'
import { OBJECT_SHARE_SQL as sql } from '../worker/objectShareSql.ts'

const databaseName = 'livetrafficstan-object-shares'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const dayMs = 86_400_000
const maximumBytes = 256 * 1_024
const statisticsQueries = (first, last) => [
  { sql: `SELECT day, SUM(created) AS created, SUM(resolved) AS resolved
      FROM object_share_statistics WHERE day >= ? AND day <= ? GROUP BY day ORDER BY day DESC LIMIT 30`,
    params: [String(first), String(last)] },
  { sql: `SELECT kind, identifier, SUM(created) AS created, SUM(resolved) AS resolved
      FROM object_share_statistics WHERE day >= ? AND day <= ? GROUP BY kind, identifier
      ORDER BY created DESC, resolved DESC, kind, identifier LIMIT 10`,
    params: [String(first), String(last)] },
]

export const prepareObjectSharing = async ({
  accountId, apiToken, operation, now = Date.now(), fetchImpl = fetch,
}) => {
  if (!/^[0-9a-f]{32}$/.test(accountId ?? '') || typeof apiToken !== 'string' || !/^[\x21-\x7e]{1,512}$/.test(apiToken)) {
    throw new Error('Protected Cloudflare account credentials are missing or invalid')
  }
  if (operation !== 'setup' || !Number.isSafeInteger(now) || now < 32 * dayMs) {
    throw new Error('Object sharing operation or clock is invalid')
  }
  const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}`
  const deadline = AbortSignal.timeout(180_000)
  const request = async (url, label, body) => {
    let response
    try {
      response = await fetchImpl(url, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error', signal: AbortSignal.any([deadline, AbortSignal.timeout(15_000)]),
      })
    } catch {
      throw new Error(`Cloudflare sharing ${label} transport failed. No automatic retry.`)
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error(`Cloudflare sharing ${label} failed with HTTP ${response.status}. No permissions changed or automatic retry.`)
    }
    if (!response.body) throw new Error(`Cloudflare sharing ${label} returned no body`)
    const chunks = []
    let length = 0
    for await (const chunk of response.body) {
      length += chunk.byteLength
      if (length > maximumBytes) throw new Error(`Cloudflare sharing ${label} response exceeded its byte limit`)
      chunks.push(chunk)
    }
    let payload
    try {
      payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))
    } catch {
      throw new Error(`Cloudflare sharing ${label} returned malformed JSON`)
    }
    if (url.endsWith('/graphql')) {
      if (payload.errors != null && (!Array.isArray(payload.errors) || payload.errors.length)) {
        throw new Error('Cloudflare sharing account analytics rejected the fixed query; no capacity verified')
      }
      if (!payload.data) throw new Error('Cloudflare sharing account analytics returned no data')
    } else if (payload.success !== true) {
      throw new Error(`Cloudflare sharing ${label} was rejected; inspect resource state before retrying`)
    }
    return payload
  }

  let capacity
  if (operation === 'setup') {
    const subscriptions = await request(`${base}/subscriptions`, 'subscription read (Billing Read required)')
    if (!Array.isArray(subscriptions.result) || subscriptions.result.length > 100 ||
      subscriptions.result_info?.total_count > subscriptions.result.length) {
      throw new Error('Account subscriptions are incomplete; no Free-plan assertion or resource write')
    }
    for (const subscription of subscriptions.result) {
      const plan = subscription?.rate_plan
      if (!plan || typeof plan.public_name !== 'string') {
        throw new Error('Account subscription cannot be classified; no Free-plan assertion or resource write')
      }
      const workerPlan = /workers/i.test(`${plan.public_name} ${plan.scope ?? ''} ${plan.id ?? ''} ${(plan.sets ?? []).join(' ')}`)
      if (workerPlan && subscription.state !== 'Expired' && plan.id !== 'free' && !/^workers free$/i.test(plan.public_name)) {
        throw new Error('The account has a non-Free or ambiguous Workers subscription; no plan changed or resource write')
      }
    }
    const today = Math.floor(now / dayMs)
    const dates = Array.from({ length: 8 }, (_, offset) => new Date((today - offset) * dayMs).toISOString().slice(0, 10))
    const daily = dates.map((date, index) => `
      workers${index}: workersInvocationsAdaptive(limit: 1, filter: {
        datetime_geq: "${date}T00:00:00.000Z", datetime_lt: "${new Date((today - index + 1) * dayMs).toISOString()}"
      }) { sum { requests } }
      d1day${index}: d1AnalyticsAdaptiveGroups(limit: 1, filter: { date_geq: "${date}", date_leq: "${date}" }) {
        sum { rowsRead rowsWritten }
      }`).join('\n')
    const analytics = await request('https://api.cloudflare.com/client/v4/graphql', 'account analytics read (Account Analytics Read required)', {
      query: `query TrackstanSharingCapacity {
        viewer { accounts(filter: { accountTag: "${accountId}" }) {
          ${daily}
          storage: d1StorageAdaptiveGroups(limit: 101, filter: { date_geq: "${dates[7]}", date_leq: "${dates[0]}" }) {
            max { databaseSizeBytes } dimensions { databaseId }
          }
        } }
      }`,
    })
    const accounts = analytics.data.viewer?.accounts
    if (!Array.isArray(accounts) || accounts.length !== 1) throw new Error('Sharing capacity returned an incompatible account')
    const account = accounts[0]
    const number = value => {
      if (!Number.isFinite(value) || value < 0) throw new Error('Sharing capacity returned invalid usage')
      return value
    }
    const aggregate = (groups, field) => {
      if (!Array.isArray(groups) || groups.length > 1) throw new Error('Sharing capacity aggregate is incomplete')
      return groups.length ? number(groups[0]?.sum?.[field]) : 0
    }
    const days = dates.map((date, index) => ({
      date, partial: index === 0,
      requests: aggregate(account[`workers${index}`], 'requests'),
      rowsRead: aggregate(account[`d1day${index}`], 'rowsRead'),
      rowsWritten: aggregate(account[`d1day${index}`], 'rowsWritten'),
    }))
    if (!Array.isArray(account.storage) || account.storage.length > 100 ||
      new Set(account.storage.map(group => group.dimensions?.databaseId)).size !== account.storage.length) {
      throw new Error('Sharing capacity returned incomplete storage data')
    }
    const storageBytes = account.storage.reduce((sum, group) => sum + number(group.max?.databaseSizeBytes), 0)
    const featureRequests = config.dailyCreations + 2 * config.dailyResolutions
    if (Math.max(...days.map(day => day.requests)) + featureRequests > 80_000 ||
      Math.max(...days.map(day => day.rowsRead)) + 100_000 > 4_500_000 ||
      Math.max(...days.map(day => day.rowsWritten)) + 10_000 > 90_000 ||
      days[0].rowsWritten + 40_000 > 90_000 || storageBytes + 10 * 1_024 ** 2 > 4 * 1_024 ** 3) {
      throw new Error('Recent account usage leaves insufficient documented Free reserve for sharing and one-time qualification; no resource write')
    }
    capacity = { workersPlan: 'free', checkedDays: days.length, featureRequests, minimumRequestReserve: 20_000 }
  }

  const databases = []
  for (let page = 1; page <= 10; page++) {
    const payload = await request(`${base}/d1/database?page=${page}&per_page=10`, 'database discovery (D1 Read required)')
    if (!Array.isArray(payload.result) || payload.result.length > 10 ||
      payload.result_info?.total_count > 100) throw new Error('D1 discovery is incomplete or exceeds its database bound')
    databases.push(...payload.result)
    if (payload.result.length < 10 || payload.result_info?.total_count === databases.length) break
    if (page === 10) throw new Error('D1 discovery exceeded its database bound')
  }
  const matches = databases.filter(database => database?.name === databaseName)
  if (matches.length > 1) throw new Error('Multiple databases have the reserved object-sharing name; nothing adopted')
  const created = matches.length === 0
  if (created && databases.length >= 10) throw new Error('No Free D1 database slot remains; no resource created')
  const database = created
    ? (await request(`${base}/d1/database`, 'database creation (D1 Write required)', { name: databaseName })).result
    : matches[0]
  if (database?.name !== databaseName || !uuid.test(database?.uuid ?? '')) throw new Error('D1 returned an incompatible database identity')
  const queryUrl = `${base}/d1/database/${database.uuid}/query`
  const query = async (batch, exactCount = true) => {
    const result = (await request(queryUrl, 'fixed SQL', { batch })).result
    if (!Array.isArray(result) || result.length === 0 || exactCount && result.length !== batch.length ||
      result.some(item => item?.success !== true || !Array.isArray(item.results))) {
      throw new Error('Object-sharing SQL returned an incomplete or failed batch')
    }
    return result
  }
  let qualification
  if (operation === 'setup') {
    const schema = await readFile(new URL('../worker/object-shares.sql', import.meta.url), 'utf8')
    await query([{ sql: schema }], false)
    const existing = await query([{
      sql: `SELECT (SELECT COUNT(*) FROM object_shares WHERE created_day NOT IN (0, 1)) +
        (SELECT COUNT(*) FROM object_share_statistics WHERE day > 1) AS count`,
    }])
    if (existing[0].results[0]?.count === 0) qualification = await qualifyObjectSharing(query, now)
  }
  return {
    databaseId: database.uuid, databaseName, created, capacity, qualification,
  }
}

const qualifyObjectSharing = async (query, now) => {
  const daily = { rowsRead: 0, rowsWritten: 0 }
  let storageBytes = 0
  const meter = results => {
    for (const result of results) {
      const meta = result.meta
      if (!Number.isSafeInteger(meta?.rows_read) || !Number.isSafeInteger(meta?.rows_written) ||
        meta.rows_read < 0 || meta.rows_written < 0 || !Number.isSafeInteger(meta.size_after) || meta.size_after < 0) {
        throw new Error('D1 did not return complete qualification row/storage metering')
      }
      daily.rowsRead += meta.rows_read
      daily.rowsWritten += meta.rows_written
      storageBytes = Math.max(storageBytes, meta.size_after)
    }
  }
  const tokens = Array.from({ length: config.dailyCreations }, () => randomBytes(9).toString('base64url'))
  const previousTokens = Array.from({ length: config.dailyCreations }, () => randomBytes(9).toString('base64url'))
  const create = (token, index, day, at) => {
    const identifier = (index + 0x1000).toString(16).padStart(6, '0')
    const context = JSON.stringify({
      version: 1, kind: 'aircraft', identifier, label: 'SYNTHETIC QUALIFICATION', source: 'ADSB.lol',
    }).padEnd(config.maximumRecordBytes, ' ')
    return [
      { sql: sql.startDay, params: [String(day)] },
      { sql: sql.create, params: [token, 'aircraft', identifier, context, String(at), String(at + config.lifetimeMs), String(day), String(day), String(config.dailyCreations)] },
      { sql: sql.dayCounts, params: [String(day)] },
    ]
  }
  const chunks = async (statements, metered = true) => {
    for (let index = 0; index < statements.length; index += 30) {
      const results = await query(statements.slice(index, index + 30))
      if (metered) meter(results)
    }
  }
  // Ancient, already-expired fixtures never enter the retained report or a usable public link.
  try {
    await chunks(previousTokens.flatMap((token, index) => create(token, index + tokens.length, 0, dayMs / 2)), false)
    await chunks(tokens.flatMap((token, index) => create(token, index, 1, dayMs)))
    const active = [...tokens, ...previousTokens]
    await chunks(Array.from({ length: config.dailyResolutions }, (_, index) => [
      { sql: sql.startDay, params: ['1'] },
      { sql: sql.resolve, params: ['1', active[index % active.length], String(dayMs + 1), '1', String(config.dailyResolutions)] },
      { sql: sql.expiry, params: [active[index % active.length]] },
    ]).flat())
    const counts = await query([{ sql: sql.dayCounts, params: ['1'] }])
    if (counts[0].results[0]?.created !== config.dailyCreations || counts[0].results[0]?.resolved !== config.dailyResolutions) {
      throw new Error('Remote D1 admission/counters did not match the bounded qualification')
    }
    meter(await query([
      { sql: sql.cleanupLinks, params: [String(now), String(config.cleanupBatchSize)] },
      { sql: sql.cleanupStatistics, params: ['2', String(config.cleanupBatchSize)] },
      { sql: sql.cleanupDays, params: ['2'] },
    ]))
    const retained = await query([{
      sql: `WITH RECURSIVE fixture(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM fixture WHERE n < 5999)
        INSERT INTO object_share_statistics(day, kind, identifier, created)
        SELECT -1 - CAST(n / 200 AS INTEGER), 'vessel', CAST(230000000 + n AS TEXT), 1 FROM fixture`,
    }])
    storageBytes = Math.max(storageBytes, retained[0].meta?.size_after ?? Infinity)
    meter(await query(statisticsQueries(-30, -1)))
    meter(await query([{ sql: sql.cleanupStatistics, params: ['0', String(config.cleanupBatchSize)] }]))
    if (daily.rowsRead >= 100_000 || daily.rowsWritten >= 10_000 || storageBytes >= 10 * 1_024 ** 2) {
      throw new Error('Measured object-sharing D1 workload exceeded its approved budget')
    }
    return {
      ...daily, storageBytes, creations: tokens.length, resolutions: config.dailyResolutions,
      maximumActiveLinks: active.length, retainedStatisticRows: 6_000,
    }
  } finally {
    await query([
      { sql: 'DELETE FROM object_shares WHERE created_day IN (0, 1)' },
      { sql: 'DELETE FROM object_share_statistics WHERE day <= 1' },
      { sql: sql.cleanupDays, params: ['2'] },
    ])
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (process.env.GITHUB_REF !== 'refs/heads/main' || !/^[0-9a-f]{40}$/.test(process.env.EXPECTED_SHA ?? '') ||
    process.env.GITHUB_SHA !== process.env.EXPECTED_SHA || !process.env.GITHUB_STEP_SUMMARY) {
    throw new Error('Object-sharing operations require the protected exact-main workflow')
  }
  const result = await prepareObjectSharing({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID, apiToken: process.env.CLOUDFLARE_API_TOKEN,
    operation: process.env.OBJECT_SHARE_OPERATION,
  })
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `database-id=${result.databaseId}\n`)
  await appendFile(process.env.GITHUB_STEP_SUMMARY, [
    '### TrackStan object sharing', '',
    `Database: \`${result.databaseName}\` / \`${result.databaseId}\`; created: ${result.created}.`,
    'No plan, permissions, DNS, provider state or application deployment changed.',
    'Sharing statistics and account usage remain private. This public summary contains only setup checks and synthetic qualification measurements.',
    'View the fixed daily/top-object queries in the existing authenticated Cloudflare D1 console, not GitHub Actions.',
    result.capacity ? 'Free-plan check: no active non-Free Workers subscription. Adaptive account estimates include seven complete UTC days and the partial current day; they are not a live billing balance or a bound on abuse/new map users.' : '',
    '```json', JSON.stringify({
      capacity: result.capacity, qualification: result.qualification,
    }, null, 2), '```', '',
  ].join('\n'))
  console.log(`Object sharing ${process.env.OBJECT_SHARE_OPERATION} completed for database ${result.databaseId}`)
}
