import { AttributionControl, type AttributionControlOptions, type Map } from 'maplibre-gl'

export class InitiallyCompactAttributionControl extends AttributionControl {
  private disclosure: HTMLElement | undefined
  private initialized = false
  private userChanged = false
  private readonly initiallyCompact: boolean
  private readonly noteUserChoice = () => { this.userChanged = true }

  constructor(options: AttributionControlOptions, initiallyCompact: boolean) {
    super(options)
    this.initiallyCompact = initiallyCompact
  }

  override onAdd(map: Map) {
    const container = super.onAdd(map)
    this.disclosure = container
    container.querySelector('summary')?.addEventListener('click', this.noteUserChoice)
    if (this.initiallyCompact) this.compactOnce()
    return container
  }

  /** Replaces the custom credits and refreshes a mounted control in place. */
  setCustomAttribution(attribution: readonly string[]) {
    this.options = { ...this.options, customAttribution: [...attribution] }
    if (this.disclosure) this._updateAttributions()
  }

  compactOnce() {
    if (this.initialized || this.userChanged || !this.disclosure) return
    this.initialized = true
    this.disclosure.classList.remove('maplibregl-compact-show')
    this.disclosure.removeAttribute('open')
  }

  override onRemove() {
    this.disclosure?.querySelector('summary')?.removeEventListener('click', this.noteUserChoice)
    this.disclosure = undefined
    super.onRemove()
  }
}
