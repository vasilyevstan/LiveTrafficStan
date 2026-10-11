import { appendFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const domain = 'trackstan.xyz'
const idPattern = /^[0-9a-f]{32}$/
const maximumBytes = 128 * 1024
const maximumSites = 100
const graphqlUrl = 'https://api.cloudflare.com/client/v4/graphql'

const matchesDomain = (site) =>
  site?.ruleset?.zone_name === domain ||
  (Array.isArray(site?.rules) && site.rules.some((rule) => rule?.host === domain))

const validateSite = (site) => {
  if (
    !matchesDomain(site) ||
    !idPattern.test(site.site_tag ?? '') ||
    !idPattern.test(site.site_token ?? '') ||
    typeof site.auto_install !== 'boolean' ||
    (site.ruleset?.zone_name && site.ruleset.zone_name !== domain) ||
    (Array.isArray(site.rules) && site.rules.some((rule) => rule?.host && rule.host !== domain))
  ) {
    throw new Error('Cloudflare returned an incompatible or ambiguous TrackStan analytics site')
  }
  return site
}

export const prepareTrackstanAnalytics = async ({
  accountId,
  apiToken,
  readOnly = false,
  verifyStatistics = false,
  now = Date.now(),
  fetchImpl = fetch,
}) => {
  if (typeof readOnly !== 'boolean') throw new Error('Analytics read-only mode must be an explicit boolean')
  if (typeof verifyStatistics !== 'boolean' || (verifyStatistics && !readOnly)) {
    throw new Error('Statistics verification requires explicit read-only mode')
  }
  if (!Number.isSafeInteger(now) || now < 86_400_000 || now > 8_640_000_000_000_000) {
    throw new Error('Analytics verification time is invalid')
  }
  if (!idPattern.test(accountId ?? '')) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID is missing or invalid')
  }
  if (typeof apiToken !== 'string' || !/^[\x21-\x7e]{1,512}$/.test(apiToken)) {
    throw new Error('CLOUDFLARE_API_TOKEN is missing or invalid')
  }
  const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/rum/site_info`
  const deadline = AbortSignal.timeout(45_000)
  const request = async (url, method = 'GET', body) => {
    const statistics = url === graphqlUrl
    const operation = statistics ? 'statistics read' : method
    let response
    try {
      response = await fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${apiToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.any([deadline, AbortSignal.timeout(10_000)]),
      })
    } catch {
      throw new Error(`Cloudflare analytics ${operation} transport failed; inspect site state before retrying`)
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error(
        `Cloudflare analytics ${operation} failed with HTTP ${response.status}; ` +
        `${statistics ? 'Account Analytics Read' : `Account Settings ${method === 'GET' ? 'Read' : 'Write'}`} is required. No automatic retry.`,
      )
    }
    if (!response.body) throw new Error('Cloudflare analytics returned no response body')
    const chunks = []
    let bytes = 0
    for await (const chunk of response.body) {
      bytes += chunk.byteLength
      if (bytes > maximumBytes) throw new Error('Cloudflare analytics response exceeded its byte limit')
      chunks.push(chunk)
    }
    let payload
    try {
      payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))
    } catch {
      throw new Error('Cloudflare analytics returned malformed JSON')
    }
    if (statistics) {
      if (payload?.errors != null && (!Array.isArray(payload.errors) || payload.errors.length > 0)) {
        const messages = Array.isArray(payload.errors)
          ? payload.errors.map((error) => typeof error?.message === 'string' ? error.message : '').join(' ')
          : ''
        const reason = /permission|not authorized|forbidden|access denied/i.test(messages)
          ? 'permission denied; Account Analytics Read is required'
          : /unknown (field|argument|type)|cannot query field/i.test(messages)
            ? 'schema rejected the fixed query'
            : 'query rejected'
        throw new Error(`Cloudflare analytics statistics ${reason}; no counts verified. No automatic retry.`)
      }
      if (!payload?.data) throw new Error('Cloudflare analytics statistics returned no data')
    } else if (payload?.success !== true) {
      throw new Error('Cloudflare rejected the analytics operation; inspect site state before retrying')
    }
    return payload
  }

  const list = async () => {
    const sites = []
    for (let page = 1; page <= maximumSites / 10; page += 1) {
      const url = new URL(`${base}/list`)
      url.searchParams.set('page', String(page))
      url.searchParams.set('per_page', '10')
      const payload = await request(url)
      const total = payload.result_info?.total_count
      if (
        !Array.isArray(payload.result) ||
        payload.result.length > 10 ||
        !Number.isInteger(total) ||
        total < sites.length + payload.result.length ||
        total > maximumSites ||
        (payload.result_info.page !== undefined && payload.result_info.page !== page) ||
        (payload.result_info.count !== undefined && payload.result_info.count !== payload.result.length)
      ) {
        throw new Error('Cloudflare analytics discovery is malformed or incomplete')
      }
      sites.push(...payload.result)
      if (sites.length === total) {
        if (new Set(sites.map((site) => site?.site_tag)).size !== sites.length) {
          throw new Error('Cloudflare analytics discovery contains duplicate sites')
        }
        return sites
      }
      if (payload.result.length !== 10) {
        throw new Error('Cloudflare analytics discovery is incomplete')
      }
    }
    throw new Error('Cloudflare analytics discovery exceeded its site limit')
  }

  const matches = (await list()).filter(matchesDomain)
  if (matches.length > 1) throw new Error('Multiple TrackStan analytics sites exist; no site changed')
  let site
  const created = matches.length === 0
  let updated = false
  if (created && readOnly) {
    throw new Error('No exact TrackStan analytics site exists; read-only mode cannot create one')
  }
  if (created) {
    site = validateSite((await request(base, 'POST', { host: domain, auto_install: false })).result)
  } else {
    site = validateSite(matches[0])
    if (site.auto_install && !readOnly) {
      const originalId = site.site_tag
      const originalToken = site.site_token
      site = validateSite((await request(`${base}/${originalId}`, 'PUT', {
        host: domain, auto_install: false, lite: false,
      })).result)
      if (site.site_tag !== originalId || site.site_token !== originalToken) {
        throw new Error('Cloudflare analytics identity changed during setup; inspect before retrying')
      }
      updated = true
    }
  }
  if (!readOnly && site.auto_install !== false) {
    throw new Error('Cloudflare did not confirm manual analytics installation; inspect before retrying')
  }
  if (created || updated) {
    const confirmed = (await list()).filter(matchesDomain)
    if (
      confirmed.length !== 1 ||
      confirmed[0].site_tag !== site.site_tag ||
      confirmed[0].site_token !== site.site_token ||
      confirmed[0].auto_install !== false
    ) {
      throw new Error('Cloudflare analytics setup was not confirmed by a fresh read; inspect before retrying')
    }
    validateSite(confirmed[0])
  }
  const result = {
    domain, siteId: site.site_tag, siteToken: site.site_token,
    autoInstall: site.auto_install, created, updated, readOnly,
  }
  if (verifyStatistics) {
    const from = new Date(now - 86_400_000).toISOString()
    const to = new Date(now).toISOString()
    const payload = await request(graphqlUrl, 'POST', {
      query: `query TrackstanVisitorCounts {
        viewer { accounts(filter: {accountTag: "${accountId}"}) {
          rumPageloadEventsAdaptiveGroups(limit: 1, filter: {
            siteTag: "${site.site_tag}", requestHost: "${domain}",
            datetime_geq: "${from}", datetime_lt: "${to}"
          }) { count sum { visits } avg { sampleInterval } dimensions { requestHost } }
        } }
      }`,
    })
    const accounts = payload.data.viewer?.accounts
    const groups = accounts?.[0]?.rumPageloadEventsAdaptiveGroups
    if (!Array.isArray(accounts) || accounts.length !== 1 || !Array.isArray(groups) || groups.length > 1) {
      throw new Error('Cloudflare analytics statistics returned incompatible account or aggregate data')
    }
    const group = groups[0]
    if (group && (
      group.dimensions?.requestHost !== domain ||
      !Number.isSafeInteger(group.count) || group.count < 0 ||
      !Number.isSafeInteger(group.sum?.visits) || group.sum.visits < 0 || group.sum.visits > group.count ||
      !Number.isFinite(group.avg?.sampleInterval) || group.avg.sampleInterval < 1
    )) {
      throw new Error('Cloudflare analytics statistics returned invalid exact-host counts')
    }
    result.statistics = {
      from, to,
      pageViews: group ? group.count : 0,
      visits: group ? group.sum.visits : 0,
      sampleInterval: group ? group.avg.sampleInterval : null,
    }
  }
  return result
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (
    process.env.GITHUB_REF !== 'refs/heads/main' ||
    !/^[0-9a-f]{40}$/.test(process.env.EXPECTED_SHA ?? '') ||
    process.env.GITHUB_SHA !== process.env.EXPECTED_SHA ||
    !process.env.GITHUB_STEP_SUMMARY
  ) {
    throw new Error('Analytics setup requires the protected exact-main workflow')
  }
  const readOnly = process.env.ANALYTICS_READ_ONLY ?? 'false'
  const verifyStatistics = process.env.ANALYTICS_VERIFY_STATISTICS ?? 'false'
  if (![readOnly, verifyStatistics].every((value) => ['true', 'false'].includes(value))) {
    throw new Error('Analytics mode flags must be true or false')
  }
  const result = await prepareTrackstanAnalytics({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    readOnly: readOnly === 'true',
    verifyStatistics: verifyStatistics === 'true',
  })
  console.log(JSON.stringify(result))
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `## ${domain} Web Analytics\n\n` +
    `${result.readOnly ? 'Read' : result.created ? 'Created' : result.updated ? 'Updated' : 'Reused'} exact site ` +
    `\`${result.siteId}\`; account automatic injection is ${result.autoInstall ? 'enabled' : 'disabled'}.\n\n` +
    `Public manual-installation token: \`${result.siteToken}\`.\n\n` +
    'This public token is intended for website source, not account administration. ' +
    'Manual embedding requires automatic injection to be disabled or prevented by the documented no-transform header. ' +
    'The client must use spa:false and no geographic exclusion. ' +
    'No DNS, Worker, billing, credential or unrelated site changes. ' +
    'Site discovery alone is not application deployment or evidence of received visitor statistics.\n',
  )
  if (result.statistics) {
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `\n### Exact-host dashboard-backed counts\n\n` +
      `UTC window: \`${result.statistics.from}\` to \`${result.statistics.to}\` (exclusive).\n\n` +
      `${result.statistics.pageViews} page views; ${result.statistics.visits} visits; ` +
      `average sampling interval: ${result.statistics.sampleInterval ?? 'no data'}.\n\n` +
      'One bounded, read-only RUM aggregate query for the verified site and exact hostname. ' +
      'Visits are not unique people. Zero counts do not prove ingestion; no raw pages, referrers or visitor records are exported.\n',
    )
  }
}
