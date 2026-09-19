import { describe, expect, it } from 'vitest'
import { LocationCameraIntent } from './locationCameraIntent'

describe('LocationCameraIntent', () => {
  it('allows automatic location until the user establishes an explicit view intent', () => {
    const intent = new LocationCameraIntent()

    expect(intent.consumeLocationResult()).toBe(true)
    expect(intent.consumeLocationResult()).toBe(true)

    intent.beginExplicitViewIntent()
    expect(intent.consumeLocationResult()).toBe(false)
  })

  it('allows an explicit Use Location result unless a later view intent wins', () => {
    const intent = new LocationCameraIntent()

    intent.beginExplicitViewIntent()
    intent.requestLocationNavigation()
    expect(intent.consumeLocationResult()).toBe(true)
    expect(intent.consumeLocationResult()).toBe(false)

    intent.requestLocationNavigation()
    intent.beginExplicitViewIntent()
    expect(intent.consumeLocationResult()).toBe(false)
  })

  it('cancels a failed explicit location request without restoring automatic navigation', () => {
    const intent = new LocationCameraIntent()

    intent.requestLocationNavigation()
    intent.cancelRequestedLocationNavigation()

    expect(intent.consumeLocationResult()).toBe(false)
  })
})
