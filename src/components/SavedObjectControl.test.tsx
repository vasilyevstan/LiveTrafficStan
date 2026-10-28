import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { emptySavedObjectsDocument } from '../domain/savedObjects'
import { SavedObjectControl } from './SavedObjectControl'

const entry = {
  kind: 'aircraft' as const,
  id: 'abc123',
  savedLabel: 'TEST123',
  savedAt: 1,
}

describe('SavedObjectControl', () => {
  it('exposes an explicit pressed Save state without coordinates', () => {
    const html = renderToStaticMarkup(
      <SavedObjectControl
        entry={entry}
        saved
        onSave={() => ({
          ok: true,
          document: emptySavedObjectsDocument(),
          message: 'Saved.',
        })}
        onRemove={() => ({
          ok: true,
          document: emptySavedObjectsDocument(),
          message: 'Removed.',
        })}
      />,
    )
    expect(html).toContain('aria-label="Remove TEST123 from Saved"')
    expect(html).toContain('aria-pressed="true"')
    expect(html).not.toContain('latitude')
  })
})

