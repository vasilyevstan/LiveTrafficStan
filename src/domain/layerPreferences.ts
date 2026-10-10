export interface LayerPreferences {
  aircraftVisible: boolean
  vesselsVisible: boolean
  portsVisible: boolean
  airportsVisible: boolean
  clusteringEnabled: boolean
  weatherVisible: boolean
  depthsVisible: boolean
  orbitalObjectsVisible: boolean
}

export const DEFAULT_LAYER_PREFERENCES: LayerPreferences = {
  aircraftVisible: true,
  vesselsVisible: true,
  portsVisible: false,
  airportsVisible: false,
  clusteringEnabled: false,
  weatherVisible: false,
  depthsVisible: true,
  orbitalObjectsVisible: false,
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
