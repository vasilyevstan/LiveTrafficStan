import { describe, expect, it } from 'vitest'
import type { ModeledOrbitalPosition } from '../domain/orbital'
import {
  createOrbitalTooltipElement,
  orbitalTooltipSummary,
} from './orbitalTooltip'

class FakeElement {
  readonly children: FakeElement[] = []
  readonly dataset: Record<string, string> = {}
  className = ''
  textContent = ''
  href = ''
  target = ''
  rel = ''
  title = ''
  src = ''
  width = 0
  height = 0
  alt = ''
  loading = ''
  decoding = ''
  referrerPolicy = ''

  append(...children: FakeElement[]) {
    this.children.push(...children)
  }
}

const fakeDocument = {
  createElement: () => new FakeElement(),
} as unknown as Document

const position: ModeledOrbitalPosition = {
  id: 'orbital:999999',
  noradCatalogId: '999999',
  name: '<img src=x onerror=alert(1)>',
  internationalDesignator: '2099-001A',
  objectType: 'UNK',
  sourceGroups: ['science'],
  displayOrder: 4_000_999_999,
  elementEpoch: 1,
  snapshotRetrievedAt: 2,
  snapshotSha256: 'a'.repeat(64),
  modeledFor: 3,
  latitude: 10,
  longitude: 20,
  altitudeKm: 600,
  velocityKmPerSecond: 7.6,
}

describe('orbital tooltip', () => {
  it('shows exact catalog context and a truthful enrichment fallback', () => {
    expect(orbitalTooltipSummary(position)).toEqual({
      title: '<img src=x onerror=alert(1)>',
      details: [
        'Unknown catalog type · NORAD 999999',
        'Purpose: unavailable for this exact NORAD ID',
        'Modeled position · not live telemetry',
      ],
    })
  })

  it('builds plain DOM text without an image request for an unreviewed object', () => {
    const root = createOrbitalTooltipElement(
      position,
      fakeDocument,
      new Map([
        ['/orbital-enrichment/test.jpg', 'blob:https://example.test/test'],
      ]),
    ) as unknown as FakeElement

    expect(root.dataset.orbitalId).toBe('orbital:999999')
    expect(root.children[0]).toMatchObject({
      className: 'traffic-tooltip__title',
      textContent: '<img src=x onerror=alert(1)>',
    })
    expect(
      root.children.some(
        (child) => child.className === 'traffic-tooltip__photo-link',
      ),
    ).toBe(false)
  })

  it('shows reviewed purpose immediately but gates the bundled image until selection loaded it', () => {
    const hubble: ModeledOrbitalPosition = {
      ...position,
      id: 'orbital:20580',
      noradCatalogId: '20580',
      name: 'HST',
      internationalDesignator: '1990-037B',
      objectType: 'PAY',
    }
    expect(orbitalTooltipSummary(hubble).details).toContain(
      'Purpose: Space-based astronomical observatory',
    )

    const beforeLoad = createOrbitalTooltipElement(
      hubble,
      fakeDocument,
    ) as unknown as FakeElement
    const afterLoad = createOrbitalTooltipElement(
      hubble,
      fakeDocument,
      new Map([
        [
          '/orbital-enrichment/2026-09-29-v1/norad-20580.jpg',
          'blob:https://example.test/hubble',
        ],
      ]),
    ) as unknown as FakeElement

    expect(
      beforeLoad.children.some(
        (child) => child.className === 'traffic-tooltip__photo-link',
      ),
    ).toBe(false)
    const link = afterLoad.children.find(
      (child) => child.className === 'traffic-tooltip__photo-link',
    )
    expect(link).toMatchObject({
      href: 'https://images.nasa.gov/details/s125e011615',
      target: '_blank',
      rel: 'noreferrer noopener',
    })
    expect(link?.children[0]).toMatchObject({
      src: 'blob:https://example.test/hubble',
      width: 437,
      height: 640,
      alt: expect.stringContaining('Hubble Space Telescope'),
    })
    expect(link?.children[1]).toMatchObject({
      textContent: 'Photo: NASA',
    })
  })

  it('uses sample wording without curated enrichment for Starlink', () => {
    const starlink: ModeledOrbitalPosition = {
      ...position,
      id: 'orbital:starlink:20580',
      owner: 'starlink',
      noradCatalogId: '20580',
      name: 'STARLINK SAMPLE 20580',
      objectType: 'PAY',
      sourceGroups: ['starlink'],
    }

    expect(orbitalTooltipSummary(starlink)).toEqual({
      title: 'STARLINK SAMPLE 20580',
      details: [
        'Payload · NORAD 20580',
        'Starlink sample',
        'Modeled position · not live telemetry',
      ],
    })

    const root = createOrbitalTooltipElement(
      starlink,
      fakeDocument,
      new Map([
        [
          '/orbital-enrichment/2026-09-29-v1/norad-20580.jpg',
          'blob:https://example.test/hubble',
        ],
      ]),
    ) as unknown as FakeElement

    expect(
      root.children.some(
        (child) =>
          child.textContent.includes('Purpose:') ||
          child.className === 'traffic-tooltip__photo-link',
      ),
    ).toBe(false)
    expect(root.children.map(({ textContent }) => textContent)).toContain(
      'Starlink sample',
    )
  })
})
