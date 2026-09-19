export class LocationCameraIntent {
  private automaticNavigationAllowed = true
  private requestedNavigationPending = false

  beginExplicitViewIntent() {
    this.automaticNavigationAllowed = false
    this.requestedNavigationPending = false
  }

  requestLocationNavigation() {
    this.automaticNavigationAllowed = false
    this.requestedNavigationPending = true
  }

  consumeLocationResult() {
    const shouldNavigate =
      this.automaticNavigationAllowed || this.requestedNavigationPending
    this.requestedNavigationPending = false
    return shouldNavigate
  }

  cancelRequestedLocationNavigation() {
    this.requestedNavigationPending = false
  }
}
