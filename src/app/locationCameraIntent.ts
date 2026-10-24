export class LocationCameraIntent {
  private automaticNavigationAllowed = true
  private requestedNavigationPending = false
  private viewRevision = 0

  beginExplicitViewIntent() {
    this.automaticNavigationAllowed = false
    this.requestedNavigationPending = false
    return ++this.viewRevision
  }

  requestLocationNavigation() {
    this.automaticNavigationAllowed = false
    this.requestedNavigationPending = true
    this.viewRevision += 1
  }

  isCurrent(revision: number) {
    return revision === this.viewRevision
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
