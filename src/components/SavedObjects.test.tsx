import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { emptySavedObjectsDocument } from '../domain/savedObjects'
import { SavedObjects } from './SavedObjects'

const baseProps: Parameters<typeof SavedObjects>[0] = {
  entries: [],
  status: { phase: 'ready', document: emptySavedObjectsDocument() },
  query: '',
  aircraft: [],
  vessels: [],
  aircraftVisible: true,
  vesselsVisible: true,
  selectableVesselIds: new Set(),
  aircraftAvailability: { available: true },
  vesselAvailability: { available: true },
  lastObservedAt: () => undefined,
  airports: [],
  airportsReady: false,
  ports: [],
  portsReady: false,
  orbitalCatalog: [],
  curated: {
    phase: 'disabled',
    acceptedCount: 0,
    positions: [],
    prediction: {
      mode: 'invalid',
      results: [],
      totalResults: 0,
      inViewCount: 0,
      futureCrossingCount: 0,
      trackSegments: [],
    },
  },
  starlink: {
    phase: 'disabled',
    acceptedCount: 0,
    positions: [],
    prediction: {
      mode: 'invalid',
      results: [],
      totalResults: 0,
      inViewCount: 0,
      futureCrossingCount: 0,
      trackSegments: [],
    },
  },
  navigationDisabled: false,
  onAircraftSelect: vi.fn(),
  onVesselSelect: vi.fn(),
  onAirportNavigate: vi.fn(() => true),
  onPortNavigate: vi.fn(() => true),
  onOrbitalNavigate: vi.fn(() => true),
  onPrefillFind: vi.fn(),
  onLoadAirports: vi.fn(),
  onLoadPorts: vi.fn(),
  onLoadOrbits: vi.fn(),
  onRemove: vi.fn(() => ({
    ok: true,
    document: emptySavedObjectsDocument(),
    message: 'Removed.',
  })),
  onClear: vi.fn(() => ({
    ok: true,
    document: emptySavedObjectsDocument(),
    message: 'Cleared.',
  })),
  onRestore: vi.fn(() => ({
    ok: true,
    document: emptySavedObjectsDocument(),
    message: 'Restored.',
  })),
}

describe('SavedObjects', () => {
  it('explains the empty local-only state without loading anything', () => {
    const html = renderToStaticMarkup(<SavedObjects {...baseProps} />)
    expect(html).toContain('No saved objects on this browser')
    expect(baseProps.onLoadAirports).not.toHaveBeenCalled()
    expect(baseProps.onLoadPorts).not.toHaveBeenCalled()
    expect(baseProps.onLoadOrbits).not.toHaveBeenCalled()
  })

  it('renders all classes with class-specific truthful semantics', () => {
    const entries = [
      { kind: 'aircraft' as const, id: 'abc123', savedLabel: 'Plane', savedAt: 5 },
      { kind: 'vessel' as const, id: '257000001', savedLabel: 'Ship', savedAt: 4 },
      { kind: 'orbital' as const, id: '25544', savedLabel: 'ISS', savedAt: 3 },
      {
        kind: 'airport' as const,
        id: '3',
        savedLabel: 'Airport',
        savedAt: 2,
        ident: 'TEST',
        sourceVersion: 'v1',
      },
      {
        kind: 'port' as const,
        id: '4',
        savedLabel: 'Port',
        savedAt: 1,
        sourceVersion: 'v1',
      },
    ]
    const html = renderToStaticMarkup(
      <SavedObjects {...baseProps} entries={entries} />,
    )
    expect(html).toContain('Not in current data')
    expect(html).toContain('Catalog unavailable')
    expect(html).toContain('Catalog not loaded')
    expect(html).toContain('Visible to anyone using this browser profile')
    expect(html).not.toContain('last known')
  })

  it('disables catalog activation while discovery is paused', () => {
    const html = renderToStaticMarkup(
      <SavedObjects
        {...baseProps}
        loadsDisabled
        entries={[
          {
            kind: 'airport',
            id: '3',
            savedLabel: 'Airport',
            savedAt: 2,
            ident: 'TEST',
            sourceVersion: 'v1',
          },
          {
            kind: 'orbital',
            id: '25544',
            savedLabel: 'ISS',
            savedAt: 1,
          },
        ]}
      />,
    )
    expect(html).toMatch(/disabled="" aria-label="Load saved Airport"/)
    expect(html).toMatch(/disabled="" aria-label="Enable saved ISS"/)
  })
})
