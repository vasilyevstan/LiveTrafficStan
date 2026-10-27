import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ObjectShareControl } from './ObjectShareControl'
import { SharedObjectDetails } from './SharedObjectDetails'
import { OBJECT_SHARE_CONFIG as config } from '../config/objectShareConfig'
import type { ObjectShareContext } from '../domain/objectShare'

const now = Date.UTC(2026, 9, 23, 12)
const context: ObjectShareContext = {
  version: 1, kind: 'orbital', identifier: '12345', owner: 'curated', objectType: 'R/B',
  label: 'PUBLIC <OBJECT>', source: 'Space-Track.org / USSPACECOM', internationalDesignator: '2026-001A',
  snapshot: { sha256: 'a'.repeat(64), retrievedAt: now - 10_000, elementEpoch: now - 60_000 },
  position: { latitude: 1, longitude: 2, at: now },
}

describe('subordinate sharing controls and dated context', () => {
  it('does not capture or request anything while merely rendering the sender action', () => {
    const capture = vi.fn(() => context)
    const html = renderToStaticMarkup(<ObjectShareControl theme="dark" identityKey="private-key" capture={capture} now={now} />)
    expect(html).toContain('Share object')
    expect(html).toContain('24 hours')
    expect(html).not.toContain('private-key')
    expect(capture).not.toHaveBeenCalled()
  })

  it('uses the normal single inspector, opaque headings and truthful model/source clocks', () => {
    const html = renderToStaticMarkup(<SharedObjectDetails receipt={{
      token: 'Ab9_-1234567', context, createdAt: now, expiresAt: now + config.lifetimeMs, serverNow: now,
    }} message="ORBITS is off. No catalog is loaded." onClose={() => undefined} />)
    expect(html.match(/<aside/g)).toHaveLength(1)
    expect(html).toContain('PUBLIC &lt;OBJECT&gt;')
    expect(html).toContain('Shared object')
    expect(html).toContain('Shared SATCAT type')
    expect(html).toContain('R/B')
    expect(html).toContain('Element epoch')
    expect(html).toContain('sender-supplied')
    expect(html).toContain('not live or an optical view')
    expect(html).toContain('Close shared object')
    expect(html).not.toContain('Ab9_-1234567')
    expect(html).not.toMatch(/id="[^"]*12345/)
    expect(html).not.toContain('View from here')
  })
})
