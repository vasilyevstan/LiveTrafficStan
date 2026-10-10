import { APP_CONFIG, JOURNEY_CONFIG } from '../config/appConfig'
import {
  flightRouteIdentity,
  flightRouteIdentityKey,
  flightRouteLegIndices,
  type FlightRouteViewState,
} from './flightRoute'
import { distanceKm, isValidCoordinate } from './geo'
import type { MarineJourneyHistory, MarineJourneyPorts } from './marineJourney'
import type { Aircraft, GeoPosition, TrafficEntity, TrailPoint, Vessel } from './traffic'

export type JourneyCoordinate = Readonly<Pick<GeoPosition, 'latitude' | 'longitude'> & {
  observedAt?: number
}>

export interface JourneySegment {
  readonly phase: 'past' | 'remaining'
  readonly certainty: 'observed' | 'estimated'
  readonly points: readonly JourneyCoordinate[]
  readonly source: string
}

export interface JourneyEndpoint extends JourneyCoordinate {
  readonly label: string
  readonly role: 'departure' | 'stop' | 'destination' | 'captured'
}

export interface JourneySnapshot {
  readonly revision: number
  readonly identity: string
  readonly kind: TrafficEntity['kind']
  readonly title: string
  readonly capturedAt: number
  readonly position: Readonly<GeoPosition>
  readonly segments: readonly JourneySegment[]
  readonly endpoints: readonly JourneyEndpoint[]
  readonly limitations: readonly string[]
  readonly sources: readonly { readonly name: string; readonly url?: string; readonly retrievedAt?: number }[]
}

export type JourneyCapture =
  | { kind: 'available'; snapshot: JourneySnapshot }
  | { kind: 'unavailable'; message: string }

const coordinate = (point: JourneyCoordinate): JourneyCoordinate =>
  Object.freeze({ latitude: point.latitude, longitude: point.longitude })

export const geodesicJourneyArc = (
  from: JourneyCoordinate,
  to: JourneyCoordinate,
): readonly JourneyCoordinate[] | undefined => {
  if (![from, to].every(p => isValidCoordinate(p.latitude, p.longitude))) return undefined
  const angle = distanceKm(from, to) / 6_371
  if (angle >= Math.PI - 0.001) return undefined
  if (angle < 1e-10) return [coordinate(from), coordinate(to)]
  const count = Math.min(
    JOURNEY_CONFIG.maximumArcPoints - 1,
    Math.max(1, Math.ceil(angle * 180 / Math.PI / JOURNEY_CONFIG.arcStepDegrees)),
  )
  const vector = (p: JourneyCoordinate) => {
    const lat = p.latitude * Math.PI / 180
    const lon = p.longitude * Math.PI / 180
    return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)]
  }
  const a = vector(from)
  const b = vector(to)
  return Array.from({ length: count + 1 }, (_, index) => {
    if (index === 0) return coordinate(from)
    if (index === count) return coordinate(to)
    const ratio = index / count
    const first = Math.sin((1 - ratio) * angle) / Math.sin(angle)
    const second = Math.sin(ratio * angle) / Math.sin(angle)
    const [x, y, z] = a.map((value, i) => first * value + second * b[i]!)
    return coordinate({
      latitude: Math.atan2(z!, Math.hypot(x!, y!)) * 180 / Math.PI,
      longitude: Math.atan2(y!, x!) * 180 / Math.PI,
    })
  })
}

export const observedJourneySegments = (
  trail: readonly TrailPoint[],
  position: GeoPosition,
  maximumGapMs: number,
): readonly (readonly TrailPoint[])[] => {
  const segments: TrailPoint[][] = []
  let current: TrailPoint[] = []
  for (const point of [...trail.slice(-JOURNEY_CONFIG.maximumObservedPoints + 1), position]) {
    if (!isValidCoordinate(point.latitude, point.longitude) ||
        !Number.isFinite(point.observedAt) || point.observedAt > position.observedAt) {
      if (current.length > 1) segments.push(current)
      current = []
      continue
    }
    const previous = current.at(-1)
    if (previous && point.observedAt === previous.observedAt) continue
    if (previous && (point.observedAt < previous.observedAt ||
        point.observedAt - previous.observedAt > maximumGapMs)) {
      if (current.length > 1) segments.push(current)
      current = []
    }
    current.push(Object.freeze({ ...point }))
  }
  if (current.length > 1) segments.push(current)
  return segments.map(segment => Object.freeze(segment))
}

const observed = (entity: TrafficEntity, trail: readonly TrailPoint[]) =>
  observedJourneySegments(
    trail, entity.position,
    entity.kind === 'aircraft'
      ? APP_CONFIG.history.aircraftTrailGapMs
      : APP_CONFIG.history.vesselTrailGapMs,
  ).map(points => ({
    phase: 'past', certainty: 'observed', points, source: entity.provider,
  }) satisfies JourneySegment)

const freezeSnapshot = (
  entity: TrafficEntity,
  revision: number,
  capturedAt: number,
  segments: readonly JourneySegment[],
  endpoints: readonly JourneyEndpoint[],
  limitations: readonly string[],
  sources: JourneySnapshot['sources'],
): JourneyCapture => {
  if (!isValidCoordinate(entity.position.latitude, entity.position.longitude) ||
      !Number.isFinite(entity.position.observedAt) ||
      !Number.isFinite(capturedAt)) {
    return { kind: 'unavailable', message: 'The reported position or observation time is invalid.' }
  }
  if (segments.length === 0) {
    return { kind: 'unavailable', message: 'No usable route section or received track is available yet.' }
  }
  if (segments.reduce((total, segment) => total + segment.points.length, 0) >
      JOURNEY_CONFIG.maximumGeometryPoints) {
    return { kind: 'unavailable', message: 'This journey exceeds the bounded overview size.' }
  }
  return {
    kind: 'available',
    snapshot: Object.freeze({
      revision,
      identity: entity.kind === 'aircraft'
        ? `${entity.id}|${entity.callsign ?? ''}|${entity.registration ?? ''}`
        : `${entity.id}|${entity.imo ?? ''}`,
      kind: entity.kind,
      title: entity.kind === 'aircraft'
        ? entity.callsign ?? entity.registration ?? entity.hex
        : entity.name ?? `MMSI ${entity.mmsi}`,
      capturedAt,
      position: Object.freeze({ ...entity.position }),
      segments: Object.freeze(segments.map(segment => Object.freeze({
        ...segment, points: Object.freeze(segment.points.map(point => Object.freeze({
          ...coordinate(point),
          ...(segment.certainty === 'observed' ? { observedAt: point.observedAt } : {}),
        }))),
      }))),
      endpoints: Object.freeze([
        ...endpoints.map(endpoint => Object.freeze({ ...endpoint })),
        Object.freeze({ ...coordinate(entity.position), label: 'Captured position', role: 'captured' as const }),
      ]),
      limitations: Object.freeze([...new Set(limitations)]),
      sources: Object.freeze(sources.map(source => Object.freeze({ ...source }))),
    }),
  }
}

export const captureObservedJourney = (
  entity: TrafficEntity,
  trail: readonly TrailPoint[],
  revision: number,
  capturedAt: number,
): JourneyCapture => freezeSnapshot(
  entity, revision, capturedAt, observed(entity, trail), [],
  [
    'Departure and destination locations are unknown.',
    'Only positions received in this session are shown. Gaps remain gaps; the first point is not a departure.',
  ],
  [{ name: entity.provider }],
)

export const marineJourneyReceivedSegments = (
  vessel: Vessel,
  trail: readonly TrailPoint[],
  history: MarineJourneyHistory | undefined,
  departedAt?: number,
): JourneySegment[] => {
  const imported = history?.mmsi === vessel.mmsi
    ? history.segments.map(points => points.filter(point => departedAt === undefined || point.observedAt >= departedAt))
      .filter(points => points.length > 1)
    : []
  return imported.length > 0
    ? imported.map(points => ({ phase: 'past', certainty: 'observed', points, source: 'Open Waters AIS' }))
    : observed(vessel, trail.filter(point => departedAt === undefined || point.observedAt >= departedAt))
}

export const captureMarineJourney = (
  vessel: Vessel,
  trail: readonly TrailPoint[],
  history: MarineJourneyHistory | undefined,
  historyMessage: string | undefined,
  revision: number,
  capturedAt: number,
  ports?: MarineJourneyPorts,
  estimates: readonly JourneySegment[] = [],
  routeMessages: readonly string[] = [],
): JourneyCapture => {
  const received = marineJourneyReceivedSegments(vessel, trail, history, ports?.departedAt)
  const imported = received.some(segment => segment.source === 'Open Waters AIS')
  const segments: JourneySegment[] = [...received, ...estimates]
  const endpoints: JourneyEndpoint[] = []
  if (ports?.departure) endpoints.push({ ...ports.departure, label: `Reported departure: ${ports.departure.locode}`, role: 'departure' })
  if (ports?.destination) endpoints.push({ ...ports.destination, label: `Reported next port: ${ports.destination.locode}`, role: 'destination' })
  const limitations = [
    'The first received point is not a departure. Gaps to the captured position remain open.',
    ...(!ports?.departure || !ports.destination ? ['Some departure or destination coordinates are unknown.'] : []),
    ...(estimates.length === 0 ? ['No water-following estimate is available. No straight-line ship route is substituted.'] : []),
    ...routeMessages,
  ]
  const sources: { name: string; url?: string; retrievedAt?: number }[] = []
  if (ports) {
    limitations.push(...ports.limitations)
    if (ports.departedAt !== undefined) limitations.push('Received positions before the reported actual departure are excluded from this overview.')
    if (ports.arrivedAt !== undefined) limitations.push('The next port already reports an actual arrival; no remaining journey is estimated.')
    sources.push({ name: 'Fintraffic / Digitraffic Portnet (CC BY 4.0)', url: 'https://www.digitraffic.fi/en/marine-traffic/', retrievedAt: ports.retrievedAt })
  }
  if (estimates.length > 0) {
    limitations.push('Dashed ship sections follow a coarse shipping network, not an actual or predicted voyage. Shore and port connections, canal access and navigability are not established.')
    sources.push({ name: 'Searoute / Eurostat / ORNL network (MPL-2.0 notice and source)', url: '/marine-routes/searoute-4fc696c5/NOTICE' })
  }
  if (history) {
    limitations.push('Requested up to 24 hours and 1,000 received positions, ending at the captured report time; not a complete voyage.')
    if (history.windowLimited) limitations.push('The provider returned only part of the requested time window.')
    if (history.simplified) limitations.push(history.toleranceMeters !== undefined
      ? `The provider simplified the recorded shape with a ${history.toleranceMeters} m tolerance.`
      : 'The provider simplified the recorded shape without a reported tolerance.')
    if (history.truncated) limitations.push('The provider truncated this history. Earlier positions or sections may be missing; no additional pages were requested.')
    if (history.receptionBreaks === undefined) limitations.push('The provider did not supply reception-break metadata; uninterrupted reception is not established.')
    else if (history.receptionBreaks > 0) limitations.push('Provider-reported reception gaps are left open.')
    if (history.timeGaps > 0) limitations.push('Long intervals between recorded positions are also left open; these can include collapsed stationary reports, not only reception outages.')
    if (!imported) limitations.push(history.pointCount === 0
      ? 'The history request succeeded with no positions in this window; only any usable session track is shown.'
      : 'The returned positions do not form a usable continuous section; only any usable session track is shown.')
    sources.push({ name: 'Open Waters AIS', url: 'https://openwaters.io/api/ais/', retrievedAt: history.retrievedAt })
    sources.push(...history.attribution.map(name => ({ name })))
  }
  if (historyMessage) limitations.push(historyMessage)
  if (!imported) {
    limitations.push('Only positions already received in this session can be shown.')
    sources.push({ name: vessel.attribution ?? vessel.provider })
  }
  const result = freezeSnapshot(vessel, revision, capturedAt, segments, endpoints, limitations, sources)
  return result.kind === 'unavailable' && historyMessage
    ? { kind: 'unavailable', message: `${historyMessage} ${result.message}` }
    : result
}

export const captureAircraftJourney = (
  aircraft: Aircraft,
  routeState: FlightRouteViewState,
  trail: readonly TrailPoint[],
  revision: number,
  capturedAt: number,
): JourneyCapture => {
  const identity = flightRouteIdentity(aircraft)
  if (!identity || routeState.phase !== 'available' ||
      routeState.identityKey !== flightRouteIdentityKey(identity) ||
      routeState.route.flightIcao !== identity.callsign) {
    return captureObservedJourney(aircraft, trail, revision, capturedAt)
  }
  const route = routeState.route
  const legs = flightRouteLegIndices(route.airports, aircraft.position)
  const segments: JourneySegment[] = [...observed(aircraft, trail)]
  const limitations = [
    'Standing-data estimate, not a filed or flown route; the itinerary may be wrong.',
    'Solid lines join received positions. Dashed sections are estimates; reception gaps are not filled.',
  ]
  const endpoints: JourneyEndpoint[] = route.airports.map((airport, index) => ({
    ...coordinate(airport),
    label: `${index === 0 ? 'Plausible departure' : index === route.airports.length - 1 ? 'Plausible destination' : 'Standing stop'}: ${airport.code ?? airport.icao}`,
    role: index === 0 ? 'departure' : index === route.airports.length - 1 ? 'destination' : 'stop',
  }))
  const estimate = (stops: readonly JourneyCoordinate[], phase: JourneySegment['phase']) => {
    for (let index = 0; index < stops.length - 1; index += 1) {
      const points = geodesicJourneyArc(stops[index]!, stops[index + 1]!)
      if (!points) {
        limitations.push('An ambiguous near-antipodal estimated section is omitted.')
        continue
      }
      segments.push({ phase, certainty: 'estimated', points, source: route.source.name })
    }
  }
  if (legs.length !== 1) {
    limitations.push(legs.length === 0
      ? 'The standing itinerary no longer fits this position. Estimated sections are unavailable.'
      : 'The current itinerary leg is ambiguous. Only received track sections are shown.')
  } else {
    const currentLeg = legs[0]!
    const firstReceived = segments[0]?.points[0]
    if (firstReceived) {
      const firstLeg = flightRouteLegIndices(route.airports, firstReceived)
      if (firstLeg.length === 1 && firstLeg[0]! <= currentLeg) {
        estimate([...route.airports.slice(0, firstLeg[0]! + 1), firstReceived], 'past')
      } else {
        limitations.push('The section before the first received position is unknown.')
      }
    } else {
      estimate([...route.airports.slice(0, currentLeg + 1), aircraft.position], 'past')
      limitations.push('No earlier received track is available; departure-to-current is estimated.')
    }
    estimate([aircraft.position, ...route.airports.slice(currentLeg + 1)], 'remaining')
  }
  return freezeSnapshot(
    aircraft, revision, capturedAt, segments, endpoints, limitations,
    [{ name: aircraft.provider }, { name: route.source.name, url: route.source.websiteUrl }],
  )
}
