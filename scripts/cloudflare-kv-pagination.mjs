const pageSize = 1_000
const maximumPages = 1_000

export const listCloudflareKvNamespaces = async (apiUrl, apiRequest) => {
  const namespaces = []

  for (let page = 1; page <= maximumPages; page += 1) {
    const result = await apiRequest(
      `${apiUrl}?page=${page}&per_page=${pageSize}&order=title&direction=asc`,
    )
    if (!Array.isArray(result.result)) {
      throw new Error('Cloudflare KV list result is invalid')
    }

    const resultInfo = result.result_info
    const reportedPage = resultInfo?.page
    const reportedPageSize = resultInfo?.per_page
    const totalCount = resultInfo?.total_count
    if (
      (reportedPage !== undefined &&
        (!Number.isInteger(reportedPage) ||
          reportedPage !== page ||
          reportedPage < 1)) ||
      (reportedPageSize !== undefined &&
        (!Number.isInteger(reportedPageSize) || reportedPageSize < 1)) ||
      (totalCount !== undefined &&
        (!Number.isInteger(totalCount) || totalCount < 0))
    ) {
      throw new Error('Cloudflare KV pagination is invalid')
    }

    namespaces.push(...result.result)

    if (totalCount !== undefined) {
      if (namespaces.length >= totalCount) return namespaces
      if (result.result.length === 0) {
        throw new Error('Cloudflare KV pagination made no progress')
      }
      continue
    }

    const effectivePageSize = reportedPageSize ?? pageSize
    if (result.result.length < effectivePageSize) return namespaces
  }

  throw new Error('Cloudflare KV pagination exceeded the page limit')
}
