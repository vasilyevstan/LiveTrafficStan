import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PortDetails } from './PortDetails'

describe('PortDetails', () => {
  it('shows only generalized source facts and explicit non-inference wording', () => {
    const html = renderToStaticMarkup(
      <PortDetails
        port={{
          id: '10',
          name: 'Tallinn',
          rank: 4,
          longitude: 24.69,
          latitude: 59.46,
        }}
        source={{
          name: 'Natural Earth Ports',
          repositoryUrl:
            'https://github.com/nvkelso/natural-earth-vector',
          tag: 'v5.1.2',
          commit: 'a'.repeat(40),
          publishedAt: '2022-05-13T23:22:31Z',
          termsUrl:
            'https://www.naturalearthdata.com/about/terms-of-use/',
          documentationUrl:
            'https://www.naturalearthdata.com/downloads/10m-cultural-vectors/ports/',
          licenseName: 'Public domain',
          outputVersion: 'natural-earth-v5.1.2-v1',
        }}
        onClose={() => undefined}
      />,
    )

    expect(html).toContain('Tallinn')
    expect(html).toContain('incomplete')
    expect(html).toContain('20 miles')
    expect(html).toContain('No facility')
    expect(html).toContain('No facility, operational status, berth, vessel call')
    expect(html).toContain('Public domain')
    expect(html).not.toContain('Country')
    expect(html).not.toContain('Nearby vessel')
  })
})
