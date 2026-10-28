import {
  ORBITAL_REFRESH_INTERVAL_MS,
  ORBITAL_TOTAL_REFRESH_TIMEOUT_MS,
  ORBITAL_UPSTREAM_TIMEOUT_MS,
  type OrbitalCatalogEnvironment,
  type OrbitalCatalogFetch,
  type OrbitalPublicationResults,
  type OrbitalRefreshCompletion,
  type OrbitalRefreshCoordinator,
  type OrbitalRefreshOutcome,
  type OrbitalStarlinkRefreshOutcome,
} from './orbitalCatalog.ts'
import { STARLINK_UPSTREAM_TIMEOUT_MS } from './starlinkCatalog.ts'
import {
  SPACE_TRACK_CURATED_KEY,
  SPACE_TRACK_STARLINK_KEY,
  SpaceTrackCatalogDiagnosticError,
  createSpaceTrackCuratedSnapshot,
  createSpaceTrackStarlinkSnapshot,
  serializeSpaceTrackSnapshot,
  spaceTrackCurationReference,
} from './spaceTrackCatalog.ts'
import {
  SpaceTrackApiError,
  fetchSpaceTrackGp,
  loginToSpaceTrack,
} from './spaceTrackClient.ts'
import type { OrbitalChannel } from '../src/domain/orbital.ts'

export interface SpaceTrackRefreshCoordinator extends OrbitalRefreshCoordinator {
  assertCurrent(attemptId: string): Promise<void>
}

export interface SpaceTrackRefreshOptions {
  fetchImpl?: OrbitalCatalogFetch
  now?: () => number
}

export const refreshSpaceTrackCatalog = async (
  environment: OrbitalCatalogEnvironment,
  coordinator: SpaceTrackRefreshCoordinator,
  options: SpaceTrackRefreshOptions = {},
): Promise<OrbitalRefreshOutcome> => {
  if (environment.ORBITAL_CATALOG_ENABLED !== 'true') return { kind: 'disabled' }
  const store = environment.ORBITAL_CATALOG
  const username = environment.SPACE_TRACK_USERNAME
  const password = environment.SPACE_TRACK_PASSWORD
  if (
    !store || !username || username.length > 320 || !password || password.length > 4_096
  ) return { kind: 'unavailable', reason: 'Space-Track protected configuration is unavailable' }
  const now = options.now ?? Date.now
  const startedAtMs = now()
  let reservation
  try {
    reservation = await coordinator.reserve(startedAtMs)
  } catch {
    console.warn('Space-Track producer admission unavailable')
    return { kind: 'unavailable', reason: 'Could not persist the producer start gate' }
  }
  if (reservation.kind !== 'admitted') return reservation
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ORBITAL_TOTAL_REFRESH_TIMEOUT_MS)
  let channel: OrbitalChannel | undefined
  let failureStage = 'snapshot validation failed'
  let completion: OrbitalRefreshCompletion = {
    kind: 'next', nextAllowedAtMs: startedAtMs + ORBITAL_REFRESH_INTERVAL_MS,
  }
  const publicationResults: OrbitalPublicationResults = { curated: 'not-attempted' }
  let starlink: OrbitalStarlinkRefreshOutcome | undefined
  let outcome: OrbitalRefreshOutcome
  const ensureActive = () => {
    if (controller.signal.aborted || now() - startedAtMs >= ORBITAL_TOTAL_REFRESH_TIMEOUT_MS) {
      throw new SpaceTrackApiError('request-timed-out')
    }
  }
  try {
    const session = await loginToSpaceTrack(username, password, {
      fetchImpl: options.fetchImpl, signal: controller.signal, now,
      timeoutMs: ORBITAL_UPSTREAM_TIMEOUT_MS,
    })
    ensureActive()
    if (environment.STARLINK_CATALOG_ENABLED === 'true') {
      const eligibility = await coordinator.reserveStarlink(reservation.attemptId, now())
      if (eligibility.kind === 'admitted') channel = 'starlink'
    }
    channel ??= 'curated'
    const reference = channel === 'curated' ? spaceTrackCurationReference() : undefined
    ensureActive()
    const gp = await fetchSpaceTrackGp(
      session, channel, reference?.records.map((record) => record.noradCatalogId) ?? [],
      {
        fetchImpl: options.fetchImpl, signal: controller.signal, now,
        timeoutMs: channel === 'curated' ? ORBITAL_UPSTREAM_TIMEOUT_MS : STARLINK_UPSTREAM_TIMEOUT_MS,
      },
    )
    completion = {
      kind: 'next',
      nextAllowedAtMs: gp.requiresReview ? Number.MAX_SAFE_INTEGER : Math.max(
        startedAtMs + ORBITAL_REFRESH_INTERVAL_MS, gp.retryAtMs ?? 0,
      ),
    }
    const snapshot = channel === 'curated'
      ? await createSpaceTrackCuratedSnapshot(gp, new Date(now()).toISOString())
      : await createSpaceTrackStarlinkSnapshot(gp, new Date(now()).toISOString())
    ensureActive()
    failureStage = 'attempt ownership check failed'
    await coordinator.assertCurrent(reservation.attemptId)
    ensureActive()
    failureStage = 'snapshot publication failed'
    try {
      await store.put(
        channel === 'curated' ? SPACE_TRACK_CURATED_KEY : SPACE_TRACK_STARLINK_KEY,
        serializeSpaceTrackSnapshot(snapshot),
      )
    } catch {
      if (channel === 'curated') publicationResults.curated = 'rejected'
      else publicationResults.starlink = 'rejected'
      throw new Error('Space-Track snapshot publication failed')
    }
    if (snapshot.channel === 'curated') publicationResults.curated = 'fulfilled'
    else {
      publicationResults.starlink = 'fulfilled'
      starlink = {
        kind: 'published', recordCount: snapshot.recordCount,
        populationCount: snapshot.populationCount, digest: snapshot.sha256,
        publishedAt: snapshot.publishedAt,
      }
    }
    outcome = {
      kind: 'published', recordCount: snapshot.recordCount, sha256: snapshot.sha256,
      retrievedAt: snapshot.retrievedAt, publicationResults,
      ...(starlink ? { starlink } : {}),
      ...(gp.requiresReview ? {
        reason: 'Space-Track retry guidance requires investigation', status: 200,
      } : {}),
    }
  } catch (error) {
    const apiError = error instanceof SpaceTrackApiError ? error : undefined
    const publicApiCodes = [
      'request-timed-out', 'transport-unavailable', 'provider-response-rejected',
      'provider-deferred', 'response-content-type-invalid', 'response-length-invalid',
      'response-oversized', 'response-encoding-invalid', 'response-json-or-integrity-invalid',
    ]
    const diagnostic = error instanceof SpaceTrackCatalogDiagnosticError
      ? error.diagnostic
      : apiError ? publicApiCodes.includes(apiError.code) ? apiError.code : 'request failed'
        : failureStage
    const reason = apiError?.requiresReview
      ? 'Space-Track authentication or retry guidance requires investigation'
      : channel === 'starlink'
        ? `Space-Track Starlink GP ${diagnostic}`
        : channel === 'curated'
          ? `Space-Track curated GP ${diagnostic}`
          : 'Space-Track authentication failed'
    if (channel === 'starlink') {
      starlink = {
        kind: 'failed', reason,
        ...(apiError?.status !== undefined ? { status: apiError.status } : {}),
      }
    }
    const details = {
      reason, publicationResults, ...(starlink ? { starlink } : {}),
    }
    if (apiError?.terminal && apiError.status !== undefined) {
      completion = { kind: 'blocked', status: apiError.status, blockedAtMs: now() }
      outcome = { kind: 'blocked', status: apiError.status, ...details }
    } else {
      const nextAllowedAtMs = apiError?.requiresReview
        ? Number.MAX_SAFE_INTEGER
        : Math.max(
            completion.kind === 'next' ? completion.nextAllowedAtMs : 0,
            startedAtMs + ORBITAL_REFRESH_INTERVAL_MS, apiError?.retryAtMs ?? 0,
          )
      completion = { kind: 'next', nextAllowedAtMs }
      outcome = apiError?.status === 429
        ? { kind: 'rate-limited', nextAllowedAtMs, ...details }
        : apiError?.retryAtMs !== undefined
          ? { kind: 'deferred', status: apiError.status ?? 200, nextAllowedAtMs, ...details }
          : {
              kind: 'failed', ...details,
              ...(apiError?.status !== undefined ? { status: apiError.status } : {}),
            }
    }
    console.warn('Space-Track producer attempt failed', {
      channel: channel ?? 'authentication', code: apiError?.code ?? 'catalog-or-storage-invalid',
      ...(apiError?.status !== undefined ? { status: apiError.status } : {}),
    })
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
  try {
    await coordinator.complete(reservation.attemptId, completion)
  } catch {
    console.warn('Space-Track producer completion persistence unavailable')
    return { kind: 'unavailable', reason: 'Could not persist the producer outcome' }
  }
  try {
    await coordinator.recordOutcome?.(reservation.attemptId, outcome)
  } catch {
    console.warn('Space-Track producer diagnostic persistence unavailable')
  }
  return outcome
}
