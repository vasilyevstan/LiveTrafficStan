import { appendFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const domain = 'trackstan.xyz'
const idPattern = /^[0-9a-f]{32}$/
const maximumBytes = 128 * 1024
const maximumSites = 100

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
  fetchImpl = fetch,
}) => {
  if (!idPattern.test(accountId ?? '')) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID is missing or invalid')
  }
  if (typeof apiToken !== 'string' || !/^[\x21-\x7e]{1,512}$/.test(apiToken)) {
    throw new Error('CLOUDFLARE_API_TOKEN is missing or invalid')
  }
  const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/rum/site_info`
  const deadline = AbortSignal.timeout(45_000)
  const request = async (url, method = 'GET', body) => {
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
      throw new Error(`Cloudflare analytics ${method} transport failed; inspect site state before retrying`)
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error(
        `Cloudflare analytics ${method} failed with HTTP ${response.status}; ` +
        `Account Settings ${method === 'GET' ? 'Read' : 'Write'} is required. No automatic retry.`,
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
    if (payload?.success !== true) {
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
  if (created) {
    site = validateSite((await request(base, 'POST', { host: domain, auto_install: false })).result)
  } else {
    site = validateSite(matches[0])
    if (site.auto_install) {
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
  if (site.auto_install !== false) {
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
  return { domain, siteId: site.site_tag, siteToken: site.site_token, autoInstall: false, created, updated }
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
  const result = await prepareTrackstanAnalytics({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
  })
  console.log(JSON.stringify(result))
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `## ${domain} Web Analytics\n\n` +
    `${result.created ? 'Created' : result.updated ? 'Updated' : 'Reused'} exact site ` +
    `\`${result.siteId}\` with automatic injection disabled.\n\n` +
    `Public manual-installation token: \`${result.siteToken}\`.\n\n` +
    'This public token is intended for website source, not account administration. ' +
    'Manual embedding controls collection; the client must use spa:false and no geographic exclusion. ' +
    'No DNS, Worker, billing, credential or unrelated site changes. ' +
    'This is site setup, not an application deployment or evidence of received visitor statistics.\n',
  )
}
