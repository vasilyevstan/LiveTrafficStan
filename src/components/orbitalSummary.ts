import type { OrbitalControllerState } from '../domain/orbital'

interface OrbitalSummaryOptions {
  visible: boolean
  historyActive: boolean
  state: OrbitalControllerState
  predictionHorizonMs: number
}

export const formatOrbitalSummary = ({
  visible,
  historyActive,
  state,
  predictionHorizonMs,
}: OrbitalSummaryOptions) => {
  if (!visible) return undefined
  if (historyActive || state.phase === 'paused-history') {
    return 'ORBITS · HIDDEN IN HISTORY'
  }
  if (state.phase === 'disabled') return 'ORBITS · STARTING'
  if (state.phase === 'loading') return 'ORBITS · LOADING'
  if (state.phase === 'unavailable') return 'ORBITS · UNAVAILABLE'
  if (state.phase === 'clock-invalid') {
    return 'ORBITS · CHECK DEVICE CLOCK'
  }
  if (state.phase === 'empty') return 'ORBITS · NO SAFE POSITIONS'
  if (state.phase === 'offline' && state.positions.length === 0) {
    return 'ORBITS · OFFLINE'
  }

  const prediction = state.prediction
  if (prediction.mode === 'world') {
    return `ORBITS · ${prediction.inViewCount} VISIBLE`
  }
  if (prediction.mode === 'local') {
    const crossings = prediction.futureCrossingCount
    return `ORBITS · ${prediction.inViewCount} IN VIEW · ${crossings} ${
      crossings === 1 ? 'PASS' : 'PASSES'
    } ≤${Math.round(predictionHorizonMs / 60_000)}M`
  }
  if (state.positions.length > 0) {
    return `ORBITS · ${state.positions.length} MODELED`
  }
  return 'ORBITS · VIEW UNAVAILABLE'
}
