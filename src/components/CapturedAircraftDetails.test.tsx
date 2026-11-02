import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CapturedAircraftView } from '../domain/aircraftView'
import { CapturedAircraftDetails } from './CapturedAircraftDetails'
import { MobileInspectorContext } from './mobileWorkspace'

const view: CapturedAircraftView = {
  revision: 1,
  viewRequestId: 2,
  position: {
    id: 'aircraft:test',
    name: 'TEST123',
    latitude: 59,
    longitude: 24,
    altitudeKm: 3,
    observedAt: 3_000,
  },
}

describe('CapturedAircraftDetails', () => {
  it('keeps icon-only playback and Return actions in the header', () => {
    const html = renderToStaticMarkup(
      <CapturedAircraftDetails
        view={view}
        ready
        playing
        latestObservedAt={3_000}
        holding={false}
        online
        units="metric"
        onReturn={() => undefined}
        onTogglePlaying={() => undefined}
      />,
    )
    const bodyAt = html.indexOf('class="details-panel__body"')
    expect(html).toContain('details-panel--compact-actions')
    expect(html.slice(0, bodyAt)).toContain('aria-label="Pause aircraft view"')
    expect(html.slice(0, bodyAt)).toContain('aria-label="Return to map"')
    expect(html.slice(0, bodyAt)).not.toContain('>Pause</button>')
    expect(html.slice(0, bodyAt)).not.toContain('>Return</button>')
  })

  it('keeps playback and Return available when the mobile body is collapsed', () => {
    const html = renderToStaticMarkup(
      <MobileInspectorContext value={{
        mobile: true,
        compact: true,
        identity: 'capture:1',
        returnToTask: false,
        onExpand: () => undefined,
        onCollapse: () => undefined,
      }}>
        <CapturedAircraftDetails
          view={view}
          ready={false}
          playing={false}
          latestObservedAt={3_000}
          holding={false}
          online
          units="metric"
          onReturn={() => undefined}
          onTogglePlaying={() => undefined}
        />
      </MobileInspectorContext>,
    )
    const bodyAt = html.indexOf('class="details-panel__body"')
    expect(html.slice(0, bodyAt)).toMatch(/aria-label="Play aircraft view"[^>]*disabled=""/)
    expect(html.slice(0, bodyAt)).toContain('aria-label="Return to map"')
    expect(html.slice(bodyAt)).toContain('hidden=""')
  })
})
