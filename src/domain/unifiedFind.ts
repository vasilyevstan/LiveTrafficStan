import type { LookupRequest } from './objectDiscovery'

export const findLookupRequests = (value: string): readonly LookupRequest[] => {
  const query = value.trim()
  if (!query) return []
  const explicit = /^(icao24|icao|hex|reg|registration|callsign|mmsi):\s*(.+)$/i.exec(query)
  if (explicit) {
    const by = explicit[1]!.toLowerCase()
    const identifier = explicit[2]!
    return by === 'mmsi'
      ? [{ objectClass: 'ships', by: 'mmsi', query: identifier }]
      : [{ objectClass: 'aircraft', by: by === 'reg' || by === 'registration' ? 'reg' :
        by === 'callsign' ? 'callsign' : 'hex', query: identifier }]
  }
  if (/^\d{9}$/.test(query)) return [{ objectClass: 'ships', by: 'mmsi', query }]
  const requests: LookupRequest[] = []
  if ([...query].length >= 2) requests.push({ objectClass: 'ships', by: 'name', query })
  if (/^[a-f\d]{6}$/i.test(query)) {
    requests.push({ objectClass: 'aircraft', by: 'hex', query })
  } else if (/^[a-z\d][a-z\d-]{0,15}$/i.test(query) && (query.includes('-') || /^n\d/i.test(query))) {
    requests.push({ objectClass: 'aircraft', by: 'reg', query })
  } else if (/^[a-z\d]{1,8}$/i.test(query)) {
    requests.push({ objectClass: 'aircraft', by: 'callsign', query })
  }
  return requests
}

const normalized = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')

export const rankFindResults = <T extends { label: string; identities: readonly string[] }>(
  results: readonly T[],
  query: string,
): T[] => {
  const search = normalized(query)
  const score = (result: T) => {
    const values = [result.label, ...result.identities].map(normalized)
    return values.includes(search) ? 0 : values.some((value) => value.startsWith(search)) ? 1 : 2
  }
  return results.map((result, index) => ({ result, index, score: score(result) }))
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map(({ result }) => result)
}
