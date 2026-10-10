import { captureMarineJourney, marineJourneyReceivedSegments, type JourneyCapture, type JourneyCoordinate, type JourneySegment } from '../domain/journey'
import { JOURNEY_CONFIG } from '../config/appConfig'
import type { TrailPoint, Vessel } from '../domain/traffic'
import type { MarineJourneyProvider } from '../providers/marine/marineJourneyProvider'
import type { PortnetJourneyProvider } from '../providers/marine/portnetJourneyProvider'
import type { MarineRouteProvider } from '../providers/marine/marineRouteNetwork'
import { ProviderError } from '../providers/errors'

export const marineJourneyIdentity = (vessel: Pick<Vessel, 'id' | 'imo'>) =>
  `${vessel.id}|${vessel.imo ?? ''}`

export class MarineJourneyCapture {
  private requestController?: AbortController
  private identity?: string
  private readonly provider: MarineJourneyProvider
  private readonly ports?: PortnetJourneyProvider
  private readonly routes?: MarineRouteProvider

  constructor(provider: MarineJourneyProvider, ports?: PortnetJourneyProvider, routes?: MarineRouteProvider) {
    this.provider = provider
    this.ports = ports
    this.routes = routes
  }

  get pending() { return this.requestController !== undefined }
  get pendingIdentity() { return this.identity }

  cancel() {
    this.requestController?.abort()
    this.requestController = undefined
    this.identity = undefined
  }

  async request(
    vessel: Vessel,
    trail: readonly TrailPoint[],
    revision: number,
    capturedAt: number,
    online: boolean,
  ): Promise<JourneyCapture | undefined> {
    this.cancel()
    const captured = { ...vessel, position: { ...vessel.position } }
    const received = trail.slice(-JOURNEY_CONFIG.maximumObservedPoints).map(point => ({ ...point }))
    if (!online) return captureMarineJourney(captured, received, undefined, 'Offline: imported ship history was not requested.', revision, capturedAt)
    const controller = new AbortController()
    this.requestController = controller
    this.identity = marineJourneyIdentity(captured)
    try {
      const [historyResult, portsResult] = await Promise.allSettled([
        this.provider.lookup(captured.mmsi, captured.position.observedAt, controller.signal),
        this.ports?.lookup(captured, controller.signal),
      ])
      if (controller.signal.aborted || this.requestController !== controller) return undefined
      const history = historyResult.status === 'fulfilled' ? historyResult.value : undefined
      const historyMessage = historyResult.status === 'rejected'
        ? historyResult.reason instanceof ProviderError ? historyResult.reason.message : 'Imported ship history is unavailable.'
        : undefined
      const ports = portsResult.status === 'fulfilled' ? portsResult.value : undefined
      const routeMessages: string[] = portsResult.status === 'rejected'
        ? [portsResult.reason instanceof ProviderError ? portsResult.reason.message : 'Voyage endpoints are unavailable.']
        : []
      const estimates: JourneySegment[] = []
      let networkFailed = false
      const estimate = async (from: JourneyCoordinate, to: JourneyCoordinate, phase: JourneySegment['phase']) => {
        if (!this.routes || networkFailed || controller.signal.aborted) return
        try {
          const route = await this.routes.route(from, to, controller.signal)
          if (route.kind === 'unavailable') { routeMessages.push(route.message); return }
          estimates.push({ phase, certainty: 'estimated', points: route.points, source: 'Searoute / Eurostat / ORNL shipping network' })
          routeMessages.push(`${phase === 'past' ? 'Past' : 'Remaining'} network section leaves endpoint gaps of ${route.fromGapKm.toFixed(1)} km and ${route.toGapKm.toFixed(1)} km. These gaps are not connected across land.`);
        } catch (error) {
          networkFailed = true
          if (!controller.signal.aborted) routeMessages.push(error instanceof ProviderError
            ? error.message : 'The shipping-network illustration is unavailable.')
        }
      }
      if (ports?.departure && ports.departedAt !== undefined) {
        const first = marineJourneyReceivedSegments(captured, received, history, ports.departedAt)[0]?.points[0]
        await estimate(ports.departure, first ?? captured.position, 'past')
      }
      if (ports?.destination && ports.arrivedAt === undefined) {
        await estimate(captured.position, ports.destination, 'remaining')
      }
      if (controller.signal.aborted || this.requestController !== controller) return undefined
      return captureMarineJourney(captured, received, history, historyMessage, revision, capturedAt, ports, estimates, routeMessages)
    } catch (error) {
      if (controller.signal.aborted || this.requestController !== controller) return undefined
      return captureMarineJourney(
        captured, received, undefined,
        error instanceof ProviderError ? error.message : 'Imported ship history is unavailable.',
        revision, capturedAt,
      )
    } finally {
      if (this.requestController === controller) {
        this.requestController = undefined
        this.identity = undefined
      }
    }
  }
}
