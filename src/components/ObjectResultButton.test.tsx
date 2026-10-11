import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ObjectResultButton } from './ObjectResultButton'

describe('opaque object-result focus identities', () => {
  it('keeps native labels, selection and unavailable semantics without putting object identity in DOM IDs', () => {
    const html = renderToStaticMarkup(<>
      <ObjectResultButton prefix="in-view-aircraft-result" onSelect={() => undefined} aria-pressed title="Aircraft ABC123">
        Aircraft ABC123
      </ObjectResultButton>
      <ObjectResultButton prefix="in-view-aircraft-result" onSelect={() => undefined} disabled>
        Another aircraft
      </ObjectResultButton>
    </>)
    const ids = [...html.matchAll(/id="([^"]+)"/g)].map(match => match[1])
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    expect(ids.every(id => id.startsWith('in-view-aircraft-result-'))).toBe(true)
    expect(ids.join(' ')).not.toContain('ABC123')
    expect(html).toContain('Aircraft ABC123')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('disabled=""')
    expect(html.match(/type="button"/g)).toHaveLength(2)
  })
})
