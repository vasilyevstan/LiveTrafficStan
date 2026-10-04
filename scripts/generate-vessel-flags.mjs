import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const [svgDirectory, outputPath, debugPort = '9365'] = process.argv.slice(2)
assert(svgDirectory && outputPath, 'Usage: node scripts/generate-vessel-flags.mjs <pinned flags/4x3 directory> <output JSON> [loopback CDP port]')
assert(/^[0-9]{4,5}$/.test(debugPort), 'A loopback Chrome debugging port is required')
const allocations = JSON.parse(await readFile('src/config/countryAllocations.generated.json', 'utf8'))
const countries = [...new Set(Object.values(allocations.mids).map((record) => record[1]))].sort()
const artwork = []
const sourceHash = createHash('sha256')
let sourceBytes = 0
for (const iso of countries) {
  assert(/^[A-Z]{2}$/.test(iso), 'Invalid allocation ISO code')
  const svg = await readFile(path.join(svgDirectory, `${iso.toLowerCase()}.svg`), 'utf8')
  assert(!/<(?:script|foreignObject)\b|<!DOCTYPE|\son[a-z]+\s*=|\b(?:href|xlink:href)\s*=\s*["'](?!#)|url\(\s*["']?(?!#)[a-z][a-z0-9+.-]*:/i.test(svg), `External or executable SVG content: ${iso}`)
  sourceBytes += Buffer.byteLength(svg)
  sourceHash.update(`${iso}\n`).update(svg)
  artwork.push([iso, `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`])
}
assert(sourceBytes <= 2 * 1024 * 1024, 'The fixed artwork set exceeds two MiB')
const license = await readFile(path.resolve(svgDirectory, '../../LICENSE'))
const digest = (value) => createHash('sha256').update(value).digest('hex')
const endpoint = `http://127.0.0.1:${debugPort}`
const versionResponse = await fetch(`${endpoint}/json/version`)
assert(versionResponse.ok, 'Chrome version endpoint failed')
const version = await versionResponse.json()
const targetResponse = await fetch(`${endpoint}/json/new?about:blank`, { method: 'PUT' })
assert(targetResponse.ok, 'Chrome target creation failed')
const target = await targetResponse.json()
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})
const pending = new Map()
const requests = []
let nextId = 0
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data)
  if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url)
  const entry = pending.get(message.id)
  if (!entry) return
  pending.delete(message.id)
  clearTimeout(entry.timer)
  if (message.error) entry.reject(new Error(message.error.message))
  else entry.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId
  const timer = setTimeout(() => {
    pending.delete(id)
    reject(new Error(`Chrome command timed out: ${method}`))
  }, 30_000)
  pending.set(id, { resolve, reject, timer })
  socket.send(JSON.stringify({ id, method, params }))
})
try {
  await send('Network.enable')
  await send('Network.setBlockedURLs', { urls: ['http://*', 'https://*', 'ws://*', 'wss://*'] })
  const width = 28
  const height = 22
  const result = await send('Runtime.evaluate', {
    expression: `(async () => {
      const flags = {};
      for (const [iso, url] of ${JSON.stringify(artwork)}) {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = ${width};
        canvas.height = ${height};
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas2D is unavailable');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, ${width}, ${height});
        context.fillStyle = '#0f2938';
        context.fillRect(1, 1, ${width - 2}, ${height - 2});
        context.fillStyle = '#ffffff';
        context.fillRect(2, 2, ${width - 4}, ${height - 4});
        context.drawImage(image, 2, 2, ${width - 4}, ${height - 4});
        flags[iso] = btoa(String.fromCharCode(...context.getImageData(0, 0, ${width}, ${height}).data));
      }
      return flags;
    })()`,
    awaitPromise: true,
    returnByValue: true,
  })
  assert(!result.exceptionDetails, result.exceptionDetails?.exception?.description)
  assert(!requests.some((url) => /^(https?|wss?):/.test(url)), 'Rasterization attempted a network request')
  const flags = result.result.value
  assert.deepEqual(Object.keys(flags), countries)
  for (const pixels of Object.values(flags)) {
    assert.equal(Buffer.from(pixels, 'base64').byteLength, width * height * 4)
  }
  const asset = {
    source: {
      repository: 'https://github.com/lipis/flag-icons',
      commit: '086f7e97d657358203916dbe84f61c2bccaa81eb',
      directory: 'flags/4x3',
      license: 'MIT',
      licenseSha256: digest(license),
      sourceSha256: sourceHash.digest('hex'),
      sourceBytes,
      rasterizer: `${version.Browser}, Canvas2D`,
    },
    width,
    height,
    pixelRatio: 2,
    sha256: digest(JSON.stringify(flags)),
    flags,
  }
  const serialized = `${JSON.stringify(asset)}\n`
  await writeFile(outputPath, serialized)
  console.log(JSON.stringify({ outputPath, countries: countries.length, width, height, bytes: Buffer.byteLength(serialized), sha256: asset.sha256 }))
} finally {
  socket.close()
  const response = await fetch(`${endpoint}/json/close/${target.id}`)
  assert(response.ok, 'Failed to close the owned rasterization target')
}
