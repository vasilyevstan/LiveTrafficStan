import { useEffect, useState } from 'react'
import type { OrbitalEnrichmentView } from '../domain/orbitalEnrichment'
import {
  OrbitalEnrichmentImageError,
  type OrbitalEnrichmentImageErrorReason,
  type OrbitalEnrichmentImageLoader,
} from './OrbitalEnrichmentImageLoader'

export type OrbitalEnrichmentImageState =
  | { phase: 'unavailable' }
  | { phase: 'loading'; identityKey: string }
  | {
      phase: 'available'
      identityKey: string
      url: string
    }
  | {
      phase: 'error'
      identityKey: string
      reason: OrbitalEnrichmentImageErrorReason
    }

const isAbortError = (error: unknown) =>
  (error instanceof DOMException || error instanceof Error) &&
  error.name === 'AbortError'

export const useOrbitalEnrichmentImage = (
  enrichment: OrbitalEnrichmentView | undefined,
  loader: OrbitalEnrichmentImageLoader,
): OrbitalEnrichmentImageState => {
  const [state, setState] = useState<OrbitalEnrichmentImageState>({
    phase: 'unavailable',
  })
  const identityKey = enrichment?.identityKey
  const image = enrichment?.image

  useEffect(() => {
    if (!identityKey || !image) {
      setState({ phase: 'unavailable' })
      return
    }

    const cached = loader.peek(image)
    if (cached?.phase === 'available') {
      setState({
        phase: 'available',
        identityKey,
        url: cached.url,
      })
      return
    }
    if (cached?.phase === 'error') {
      setState({
        phase: 'error',
        identityKey,
        reason: cached.error.reason,
      })
      return
    }

    let active = true
    setState({ phase: 'loading', identityKey })
    void loader.load(image).then(
      (url) => {
        if (!active) return
        setState({ phase: 'available', identityKey, url })
      },
      (error: unknown) => {
        if (!active || isAbortError(error)) return
        setState({
          phase: 'error',
          identityKey,
          reason:
            error instanceof OrbitalEnrichmentImageError
              ? error.reason
              : 'network',
        })
      },
    )

    return () => {
      active = false
      loader.cancel(image)
    }
  }, [identityKey, image, loader])

  if (!identityKey) return { phase: 'unavailable' }
  if (state.phase === 'unavailable') {
    return { phase: 'loading', identityKey }
  }
  return state.identityKey === identityKey
    ? state
    : { phase: 'loading', identityKey }
}
