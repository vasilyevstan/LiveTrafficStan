import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const manifestPath = new URL('../public/manifest.webmanifest', import.meta.url)
const headersPath = new URL('../public/_headers', import.meta.url)

describe('PWA manifest and deployment headers', () => {
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
