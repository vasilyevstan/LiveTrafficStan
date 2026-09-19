export interface ContextPick {
  kind: 'airport' | 'port'
  id: string
}

interface ContextPickSources {
  exactAirport: () => string | null | undefined
  exactPort: () => string | null | undefined
  nearbyAirport: () => string | null | undefined
  nearbyPort: () => string | null | undefined
}

export const pickContextFeature = (
  sources: ContextPickSources,
  touchFallbackAllowed: boolean,
): ContextPick | null => {
  const exactAirport = sources.exactAirport()
  if (exactAirport) return { kind: 'airport', id: exactAirport }

  const exactPort = sources.exactPort()
  if (exactPort) return { kind: 'port', id: exactPort }
  if (!touchFallbackAllowed) return null

  const nearbyAirport = sources.nearbyAirport()
  if (nearbyAirport) return { kind: 'airport', id: nearbyAirport }

  const nearbyPort = sources.nearbyPort()
  return nearbyPort ? { kind: 'port', id: nearbyPort } : null
}
