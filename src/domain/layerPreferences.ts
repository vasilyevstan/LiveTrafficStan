export interface LayerPreferences {
  aircraftVisible: boolean
  vesselsVisible: boolean
  portsVisible: boolean
  airportsVisible: boolean
  clusteringEnabled: boolean
  weatherVisible: boolean
  orbitalObjectsVisible: boolean
  starlinkVisible: boolean
}

export const DEFAULT_LAYER_PREFERENCES: LayerPreferences = {
  aircraftVisible: true,
  vesselsVisible: true,
  portsVisible: false,
  airportsVisible: false,
  clusteringEnabled: false,
  weatherVisible: false,
  orbitalObjectsVisible: false,
  starlinkVisible: false,
}

export const updateLayerPreference = <
  Key extends keyof LayerPreferences,
>(
  preferences: LayerPreferences,
  key: Key,
  value: LayerPreferences[Key],
): LayerPreferences => ({
  ...preferences,
  [key]: value,
})
