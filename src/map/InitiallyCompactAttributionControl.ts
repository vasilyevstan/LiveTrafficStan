import { AttributionControl, type Map } from 'maplibre-gl'

export class InitiallyCompactAttributionControl extends AttributionControl {
  override onAdd(map: Map) {
    const container = super.onAdd(map)
    // Late source credits must not trigger MapLibre's initial expansion.
    container.classList.add('maplibregl-compact')
    container.classList.remove('maplibregl-compact-show')
    container.removeAttribute('open')
    return container
  }
}
