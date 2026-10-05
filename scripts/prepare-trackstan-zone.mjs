import { appendFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const domain = 'trackstan.xyz'
const apiOrigin = 'https://api.cloudflare.com/client/v4/zones'
const maximumBytes = 128 * 1024

const validateZone = (zone, accountId) => {
  if (
    zone?.name !== domain ||
    zone.account?.id !== accountId ||
    zone.type !== 'full' ||
    !/^[0-9a-f]{32}$/.test(zone.id ?? '') ||
    !['pending', 'active', 'initializing'].includes(zone.status) ||
    (zone.paused !== undefined && zone.paused !== false)
  ) {
    throw new Error('Cloudflare returned an incompatible or unowned zone')
  }
  if (zone.plan?.legacy_id && zone.plan.legacy_id !== 'free') {
    throw new Error('The zone is not on the expected Free plan; no plan changes made')
  }
  if (
    !Array.isArray(zone.name_servers) ||
    zone.name_servers.length !== 2 ||
    new Set(zone.name_servers).size !== 2 ||
    zone.name_servers.some(
      (name) =>
        typeof name !== 'string' ||
        !/^[a-z0-9-]{1,63}\.ns\.cloudflare\.com$/.test(name),
    )
  ) {
    throw new Error('Cloudflare has not returned two valid assigned nameservers')
  }
  return {
    domain,
    status: zone.status,
    nameservers: zone.name_servers,
  }
}

export const prepareTrackstanZone = async ({
  accountId,
  apiToken,
  fetchImpl = fetch,
}) => {
  if (!/^[0-9a-f]{32}$/.test(accountId ?? '')) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID is missing or invalid')
  }
  if (typeof apiToken !== 'string' || !/^[\x21-\x7e]{1,512}$/.test(apiToken)) {
    throw new Error('CLOUDFLARE_API_TOKEN is missing or invalid')
  }

  const request = async (url, method = 'GET', body) => {
    const response = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error(
        `Cloudflare zone ${method} failed with HTTP ${response.status}; ` +
          'zone read access is required, and creation needs Zone Zone Edit or Zone DNS Edit. No automatic retry.',
      )
    }
    const chunks = []
    let bytes = 0
    if (!response.body) throw new Error('Cloudflare returned no response body')
    for await (const chunk of response.body) {
      bytes += chunk.byteLength
      if (bytes > maximumBytes) {
        throw new Error('Cloudflare zone response exceeded its byte limit')
      }
      chunks.push(chunk)
    }
    let payload
    try {
      payload = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
      )
    } catch {
      throw new Error('Cloudflare zone API returned malformed JSON')
    }
    if (payload?.success !== true) {
      throw new Error('Cloudflare rejected the zone operation; no automatic retry')
    }
    return payload
  }

  const query = new URL(apiOrigin)
  query.searchParams.set('name', domain)
  query.searchParams.set('account.id', accountId)
  query.searchParams.set('per_page', '5')
  const listed = await request(query)
  if (
    !Array.isArray(listed.result) ||
    listed.result.length > 1 ||
    listed.result_info?.total_count !== listed.result.length
  ) {
    throw new Error('Cloudflare zone lookup is ambiguous or incomplete')
  }
  if (listed.result.length === 1) {
    return { ...validateZone(listed.result[0], accountId), created: false }
  }
  const created = await request(apiOrigin, 'POST', {
    account: { id: accountId },
    name: domain,
    type: 'full',
  })
  return { ...validateZone(created.result, accountId), created: true }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (
    process.env.GITHUB_REF !== 'refs/heads/main' ||
    !/^[0-9a-f]{40}$/.test(process.env.EXPECTED_SHA ?? '') ||
    process.env.GITHUB_SHA !== process.env.EXPECTED_SHA ||
    !process.env.GITHUB_STEP_SUMMARY
  ) {
    throw new Error('Zone preparation requires the protected exact-main workflow')
  }
  const result = await prepareTrackstanZone({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
  })
  console.log(JSON.stringify(result))
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `## ${domain}\n\nZone status: ${result.status}. ` +
      `${result.created ? 'Created' : 'Reused'} the full zone; no DNS records, registrar, billing, Worker or credentials changed.\n\n` +
      `Assigned nameservers:\n\n${result.nameservers.map((name) => `- \`${name}\``).join('\n')}\n\n` +
      'Verify existing DNS records before changing GoDaddy delegation. This is not domain activation or an application deployment.\n',
  )
}
