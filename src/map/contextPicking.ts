export interface ContextPick {
  kind: 'weather' | 'airport' | 'port'
  id: string
}

interface ContextPickSources {
  exactWeather: () => string | null | undefined
  exactAirport: () => string | null | undefined
  exactPort: () => string | null | undefined
  nearbyWeather: () => string | null | undefined
  nearbyAirport: () => string | null | undefined
  nearbyPort: () => string | null | undefined
}

export const pickContextFeature = (
  sources: ContextPickSources,
  touchFallbackAllowed: boolean,
): ContextPick | null => {
  const exactWeather = sources.exactWeather()
  if (exactWeather) return { kind: 'weather', id: exactWeather }

  const exactAirport = sources.exactAirport()
  if (exactAirport) return { kind: 'airport', id: exactAirport }

  const exactPort = sources.exactPort()
  if (exactPort) return { kind: 'port', id: exactPort }
  if (!touchFallbackAllowed) return null

  const nearbyWeather = sources.nearbyWeather()
  if (nearbyWeather) return { kind: 'weather', id: nearbyWeather }

  const nearbyAirport = sources.nearbyAirport()
  if (nearbyAirport) return { kind: 'airport', id: nearbyAirport }

  const nearbyPort = sources.nearbyPort()
  return nearbyPort ? { kind: 'port', id: nearbyPort } : null
}
