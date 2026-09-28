import { appendFile } from 'node:fs/promises'

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
const apiToken = process.env.CLOUDFLARE_API_TOKEN
const outputPath = process.env.GITHUB_OUTPUT
const namespaceTitle = 'livetrafficstan-orbital-catalog'

if (!accountId || !/^[0-9a-f]{32}$/.test(accountId)) {
  throw new Error('CLOUDFLARE_ACCOUNT_ID is missing or invalid')
}
if (!apiToken) throw new Error('CLOUDFLARE_API_TOKEN is missing')
if (!outputPath) throw new Error('GITHUB_OUTPUT is missing')

const apiUrl =
  `https://api.cloudflare.com/client/v4/accounts/${accountId}` +
  '/storage/kv/namespaces'

const apiRequest = async (url, init = {}) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
  const result = await response.json()
  if (
    !response.ok ||
    typeof result !== 'object' ||
    result === null ||
    result.success !== true
  ) {
    throw new Error(
      `Cloudflare KV API request failed with HTTP ${response.status}`,
    )
  }
  return result
}

const namespaces = []
let page = 1
let totalPages = 1
do {
  const result = await apiRequest(
    `${apiUrl}?page=${page}&per_page=100&order=title&direction=asc`,
  )
  if (!Array.isArray(result.result)) {
    throw new Error('Cloudflare KV list result is invalid')
  }
  namespaces.push(...result.result)
  const reportedPages = result.result_info?.total_pages
  if (
    reportedPages !== undefined &&
    (!Number.isInteger(reportedPages) || reportedPages < 1)
  ) {
    throw new Error('Cloudflare KV pagination is invalid')
  }
  totalPages = reportedPages ?? 1
  page += 1
} while (page <= totalPages)

const matches = namespaces.filter(
  (namespace) => namespace?.title === namespaceTitle,
)
if (matches.length > 1) {
  throw new Error('Multiple orbital KV namespaces have the reserved title')
}

let namespaceId = matches[0]?.id
let created = false
if (!namespaceId) {
  const result = await apiRequest(apiUrl, {
    method: 'POST',
    body: JSON.stringify({ title: namespaceTitle }),
  })
  namespaceId = result.result?.id
  created = true
}
if (
  typeof namespaceId !== 'string' ||
  !/^[0-9a-f]{32}$/.test(namespaceId)
) {
  throw new Error('Cloudflare returned an invalid KV namespace ID')
}

await appendFile(outputPath, `namespace-id=${namespaceId}\n`)
await appendFile(outputPath, `created=${created}\n`)
console.log(
  `${created ? 'Created' : 'Reused'} orbital KV namespace ${namespaceId}`,
)
