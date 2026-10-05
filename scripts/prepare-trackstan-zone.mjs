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
  removeParkingRecords = false,
  fetchImpl = fetch,
}) => {
  if (typeof removeParkingRecords !== 'boolean') {
    throw new Error('Parking-record removal must be an explicit boolean')
  }
  if (!/^[0-9a-f]{32}$/.test(accountId ?? '')) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID is missing or invalid')
  }
  if (typeof apiToken !== 'string' || !/^[\x21-\x7e]{1,512}$/.test(apiToken)) {
    throw new Error('CLOUDFLARE_API_TOKEN is missing or invalid')
  }

  const request = async (url, method = 'GET', body, resource = 'zone') => {
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
        `Cloudflare ${resource} ${method} failed with HTTP ${response.status}; ` +
          (resource === 'DNS'
            ? 'DNS Read/Edit access to trackstan.xyz is required. '
            : 'zone read access is required, and creation needs Zone Zone Edit or Zone DNS Edit. ') +
          'No automatic retry.',
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
    const zone = listed.result[0]
    const result = { ...validateZone(zone, accountId), created: false }
    if (removeParkingRecords) {
      if (zone.status !== 'active') {
        throw new Error('Parking cleanup requires an existing active owned zone')
      }
      const recordsUrl = new URL(`${apiOrigin}/${zone.id}/dns_records`)
      recordsUrl.searchParams.set('name', domain)
      recordsUrl.searchParams.set('per_page', '100')
      const readRecords = async () => {
        const payload = await request(recordsUrl, 'GET', undefined, 'DNS')
        const records = payload.result
        if (
          !Array.isArray(records) ||
          records.length > 100 ||
          payload.result_info?.total_count !== records.length ||
          records.some((record) =>
            record?.name !== domain ||
            !/^[0-9a-f]{32}$/.test(record.id ?? '') ||
            typeof record.type !== 'string' ||
            typeof record.content !== 'string',
          ) ||
          new Set(records.map((record) => record.id)).size !== records.length
        ) {
          throw new Error('Cloudflare apex DNS lookup is malformed or incomplete')
        }
        return records
      }
      const records = await readRecords()
      const addressTypes = new Set(['A', 'AAAA', 'CNAME'])
      const parkingAddresses = new Set(['3.33.130.190', '15.197.148.33'])
      const addresses = records.filter((record) => addressTypes.has(record.type))
      if (
        addresses.length > 2 ||
        addresses.some((record) =>
          record.type !== 'A' || !parkingAddresses.has(record.content),
        )
      ) {
        throw new Error('Unexpected apex address record; no DNS records changed')
      }
      const untouched = records.filter((record) => !addressTypes.has(record.type))
      for (const record of addresses) {
        const deleted = await request(
          `${apiOrigin}/${zone.id}/dns_records/${record.id}`,
          'DELETE',
          undefined,
          'DNS',
        )
        if (deleted.result?.id !== record.id) {
          throw new Error('DNS deletion was not confirmed; inspect before retrying')
        }
      }
      const remaining = addresses.length ? await readRecords() : records
      const recordState = (items) => JSON.stringify(items.map(
        ({ id, name, type, content }) => [id, name, type, content],
      ).sort(([left], [right]) => left.localeCompare(right)))
      if (recordState(remaining) !== recordState(untouched)) {
        throw new Error('Parking cleanup state changed or was not confirmed; inspect before retrying')
      }
      result.removedParkingRecords = addresses.length
    }
    return result
  }
  if (removeParkingRecords) {
    throw new Error('Parking cleanup requires an existing active owned zone')
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
  const removeParkingRecords = process.env.REMOVE_PARKING_RECORDS ?? 'false'
  if (!['true', 'false'].includes(removeParkingRecords)) {
    throw new Error('REMOVE_PARKING_RECORDS must be true or false')
  }
  const result = await prepareTrackstanZone({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    removeParkingRecords: removeParkingRecords === 'true',
  })
  console.log(JSON.stringify(result))
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `## ${domain}\n\nZone status: ${result.status}. ` +
      `${result.created ? 'Created' : 'Reused'} the full zone. ` +
      (result.removedParkingRecords === undefined
        ? 'No DNS records changed. '
        : `Removed ${result.removedParkingRecords} verified apex parking A records; other records preserved. `) +
      'No registrar, billing, Worker or credentials changed.\n\n' +
      `Assigned nameservers:\n\n${result.nameservers.map((name) => `- \`${name}\``).join('\n')}\n\n` +
      'Verify existing DNS records before changing GoDaddy delegation. This is not domain activation or an application deployment.\n',
  )
}
