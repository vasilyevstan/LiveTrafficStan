import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export const MARINE_LAND_SOURCE = {
  url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/f1890d9f152c896d250a77557a5751a93d494776/geojson/ne_10m_land.geojson',
  sha256: '1ac90796408bc6ad6911d69448485d3c4dbf2190370080368a09976e1c9f7416',
  networkSha256: '994ad0a77fc64626121f679bba43c991c7658e60f6bcd6ca68867f8d479aff9e',
}

const coordinate = point => Array.isArray(point) && point.length === 2 &&
  point.every(Number.isFinite) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90
const side = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
const overlaps = (a, b, c, d) => Math.max(Math.min(a, b), Math.min(c, d)) <= Math.min(Math.max(a, b), Math.max(c, d))
const intersects = (a, b, c, d) =>
  overlaps(a[0], b[0], c[0], d[0]) && overlaps(a[1], b[1], c[1], d[1]) &&
  side(a, b, c) * side(a, b, d) <= 0 && side(c, d, a) * side(c, d, b) <= 0
const mercator = ([x, latitude]) => [x, Math.log(Math.tan(Math.PI / 4 +
  Math.max(-85.05112878, Math.min(85.05112878, latitude)) * Math.PI / 360)) * 180 / Math.PI]

export const makeLandCrossingPredicate = land => {
  if (land?.type !== 'FeatureCollection' || !Array.isArray(land.features)) throw new Error('Invalid land collection')
  const cells = new Map()
  const rows = new Map()
  let polygonId = 0
  let edgeCount = 0
  const append = (map, key, edge) => {
    const entries = map.get(key)
    if (entries) entries.push(edge)
    else map.set(key, [edge])
  }
  for (const feature of land.features) {
    const geometry = feature.geometry
    const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates]
      : geometry?.type === 'MultiPolygon' ? geometry.coordinates : undefined
    if (!Array.isArray(polygons)) throw new Error('Invalid land polygons')
    for (const polygon of polygons) {
      const id = polygonId++
      for (const ring of polygon) {
        if (!Array.isArray(ring) || ring.length < 4 || ring.some(point => !coordinate(point)) ||
            JSON.stringify(ring[0]) !== JSON.stringify(ring.at(-1))) throw new Error('Invalid closed land ring')
        for (let i = 1; i < ring.length; i++) {
          const a = mercator(ring[i - 1])
          const b = mercator(ring[i])
          if (++edgeCount > 600_000) throw new Error('Land edge bound exceeded')
          const edge = { a, b, id }
          for (let y = Math.floor(Math.min(a[1], b[1])); y <= Math.floor(Math.max(a[1], b[1])); y++) {
            append(rows, y, edge)
            for (let x = Math.floor(Math.min(a[0], b[0])); x <= Math.floor(Math.max(a[0], b[0])); x++) append(cells, `${x}:${y}`, edge)
          }
        }
      }
    }
  }
  const inside = point => {
    const polygons = new Set()
    for (const { a, b, id } of rows.get(Math.floor(point[1])) ?? []) {
      if ((a[1] > point[1]) !== (b[1] > point[1]) &&
          point[0] < a[0] + (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1])) {
        if (polygons.has(id)) polygons.delete(id)
        else polygons.add(id)
      }
    }
    return polygons.size > 0
  }
  const segmentCrosses = (a, b) => {
    if (inside(a) || inside(b)) return true
    const checked = new Set()
    for (let y = Math.floor(Math.min(a[1], b[1])); y <= Math.floor(Math.max(a[1], b[1])); y++) {
      for (let x = Math.floor(Math.min(a[0], b[0])); x <= Math.floor(Math.max(a[0], b[0])); x++) {
        for (const edge of cells.get(`${x}:${y}`) ?? []) {
          if (checked.has(edge)) continue
          checked.add(edge)
          if (intersects(a, b, edge.a, edge.b)) return true
        }
      }
    }
    return false
  }
  return (from, to) => {
    if (!coordinate(from) || !coordinate(to)) throw new Error('Invalid network coordinate')
    const a = mercator(from)
    const b = mercator(to)
    if (Math.abs(a[0] - b[0]) <= 180) return segmentCrosses(a, b)
    const unwrapped = b[0] + (b[0] > a[0] ? -360 : 360)
    const seam = unwrapped > 180 ? 180 : -180
    const y = a[1] + (b[1] - a[1]) * (seam - a[0]) / (unwrapped - a[0])
    return segmentCrosses(a, [seam, y]) || segmentCrosses([-seam, y], b)
  }
}

export const filterMarineNetworkLand = (network, crossesLand) => {
  if (network?.type !== 'FeatureCollection' || !Array.isArray(network.features)) throw new Error('Invalid network collection')
  const features = []
  let excludedEdges = 0
  let retainedEdges = 0
  for (const feature of network.features) {
    if (feature.geometry?.type !== 'LineString' || !Array.isArray(feature.geometry.coordinates)) throw new Error('Invalid network line')
    let current = []
    const finish = () => {
      if (current.length > 1) features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: current } })
      current = []
    }
    for (let i = 1; i < feature.geometry.coordinates.length; i++) {
      const from = feature.geometry.coordinates[i - 1]
      const to = feature.geometry.coordinates[i]
      if (crossesLand(from, to)) { excludedEdges++; finish() }
      else {
        retainedEdges++
        if (current.length === 0) current.push(from)
        current.push(to)
      }
    }
    finish()
  }
  return { network: { type: 'FeatureCollection', features }, excludedEdges, retainedEdges }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [landPath, outputPath] = process.argv.slice(2)
  if (!landPath || outputPath !== 'public/marine-routes/searoute-4fc696c5/water-network.json') {
    throw new Error('Usage: node scripts/marine-route-land-filter.mjs <pinned-land-file> public/marine-routes/searoute-4fc696c5/water-network.json')
  }
  const [land, network] = await Promise.all([
    readFile(landPath), readFile('public/marine-routes/searoute-4fc696c5/network.json'),
  ])
  const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
  if (land.length > 11_000_000 || sha256(land) !== MARINE_LAND_SOURCE.sha256 ||
      sha256(network) !== MARINE_LAND_SOURCE.networkSha256) throw new Error('Pinned source checksum mismatch')
  const result = filterMarineNetworkLand(JSON.parse(network), makeLandCrossingPredicate(JSON.parse(land)))
  const bytes = JSON.stringify(result.network) + '\n'
  try {
    const existing = await readFile(outputPath, 'utf8')
    if (existing !== bytes) throw new Error('Immutable projection differs; choose a new output version before writing')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  await writeFile(outputPath, bytes)
  console.log(JSON.stringify({
    excludedEdges: result.excludedEdges, retainedEdges: result.retainedEdges,
    features: result.network.features.length, bytes: Buffer.byteLength(bytes), sha256: sha256(bytes),
    source: MARINE_LAND_SOURCE,
  }, null, 2))
}
