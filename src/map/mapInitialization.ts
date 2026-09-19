export type TrafficMapError =
  | {
      kind: 'initialization'
      message: string
    }
  | {
      kind: 'runtime'
      message: string
    }
  | {
      kind: 'basemap'
      message: string
    }

export const MAP_INITIALIZATION_ERROR: TrafficMapError = {
  kind: 'initialization',
  message: 'The map could not start. Check browser graphics support or reload.',
}

export const createMapSafely = <T>(
  createMap: () => T,
  onError: (error: TrafficMapError) => void,
): T | null => {
  try {
    return createMap()
  } catch {
    onError(MAP_INITIALIZATION_ERROR)
    return null
  }
}

export const mapErrorPresentation = (error: TrafficMapError) => ({
  title:
    error.kind === 'initialization'
      ? 'Map unavailable'
      : error.kind === 'basemap'
        ? 'Basemap unavailable'
        : 'Map data issue',
  message: error.message,
})
