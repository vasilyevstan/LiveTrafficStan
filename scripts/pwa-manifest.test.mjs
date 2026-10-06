import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const manifestPath = new URL('../public/manifest.webmanifest', import.meta.url)
const headersPath = new URL('../public/_headers', import.meta.url)

describe('PWA manifest and deployment headers', () => {
  it('uses TrackStan consistently without changing the installed application identity', async () => {
    const [manifestSource, html, app, favicon] = await Promise.all([
      readFile(manifestPath, 'utf8'),
      readFile(new URL('../index.html', import.meta.url), 'utf8'),
      readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8'),
    ])
    const manifest = JSON.parse(manifestSource)
    expect(manifest.name).toBe('TrackStan')
    expect(manifest.short_name).toBe('TrackStan')
    expect(manifest.description).toBe(
      'TrackStan maps live aircraft and ships with best-effort coverage, plus modeled orbital objects and private local playback.',
    )
    expect(html).toContain('<title>TrackStan</title>')
    expect(html).toContain('name="application-name" content="TrackStan"')
    expect(html).toContain('name="apple-mobile-web-app-title" content="TrackStan"')
    expect(html).toContain(`content="${manifest.description}"`)
    expect(html).toContain('href="/manifest.webmanifest"')
    expect(html).toContain('href="/favicon.svg"')
    expect(html).toContain('href="/icons/livetrafficstan-192-v1.png"')
    expect(html).toContain("'livetrafficstan.preferences.v1'")
    expect(html).toContain("'livetrafficstan.theme'")
    expect(app).toContain('<h1>TrackStan</h1>')
    expect(app).not.toContain('<h1>LiveTrafficStan</h1>')
    expect(app).toContain('className="radar-mark" aria-hidden="true"')
    expect(favicon).toContain('<title>TrackStan</title>')
  })

  it('uses root-only install scope and complete maskable icons', async () => {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    expect(manifest).toMatchObject({
      id: '/',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#dce8ec',
      theme_color: '#dce8ec',
    })
    expect(manifest.icons).toEqual([
      {
        src: '/icons/livetrafficstan-192-v1.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any maskable',
      },
      {
        src: '/icons/livetrafficstan-512-v1.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ])

    for (const size of [192, 512]) {
      const bytes = await readFile(
        new URL(
          `../public/icons/livetrafficstan-${size}-v1.png`,
          import.meta.url,
        ),
      )
      expect(bytes.subarray(1, 4).toString()).toBe('PNG')
      expect(bytes.readUInt32BE(16)).toBe(size)
      expect(bytes.readUInt32BE(20)).toBe(size)
    }
  })

  it('revalidates mutable shell entry points and isolates immutable icons', async () => {
    const headers = await readFile(headersPath, 'utf8')
    expect(headers).toContain(
      "connect-src 'self' https://tiles.openfreemap.org https://photon.komoot.io https://meri.digitraffic.fi wss://meri.digitraffic.fi https://api.adsb.lol https://vrs-standing-data.adsb.lol https://api.planespotters.net",
    )
    expect(headers).toContain(
      "img-src 'self' data: blob: https://cdn.planespotters.net https://t.plnspttrs.net https://thumb.wikimedia.org https://upload.wikimedia.org",
    )
    expect(headers).not.toContain('*.planespotters.net')
    expect(headers).not.toContain('*.plnspttrs.net')
    expect(headers).not.toContain('*.wikimedia.org')
    expect(headers.split('; img-src')[0]).not.toContain('https://openwaters.io')
    expect(headers).toMatch(
      /\/sw\.js[\s\S]*must-revalidate[\s\S]*Service-Worker-Allowed: \//,
    )
    expect(headers).toMatch(
      /\/manifest\.webmanifest[\s\S]*must-revalidate[\s\S]*application\/manifest\+json/,
    )
    expect(headers).toMatch(
      /\/icons\/\*[\s\S]*max-age=31536000, immutable/,
    )
  })
})
