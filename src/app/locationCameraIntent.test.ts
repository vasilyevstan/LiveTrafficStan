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
  it('reserves a one-shot view intent without committing navigation and fences A-B-A results', () => {
    const intent = new LocationCameraIntent()
    const firstA = intent.beginExplicitViewIntent()
    expect(intent.isCurrent(firstA)).toBe(true)
    expect(intent.consumeLocationResult()).toBe(false)
    expect(intent.isCurrent(firstA)).toBe(true)
    intent.beginExplicitViewIntent()
    const secondA = intent.beginExplicitViewIntent()
    expect(intent.isCurrent(firstA)).toBe(false)
    expect(intent.isCurrent(secondA)).toBe(true)
    intent.beginExplicitViewIntent()
    expect(intent.isCurrent(secondA)).toBe(false)
  })
  it('lets a newer Use Location invalidate a pending ship result, not the other way around', () => {
    const intent = new LocationCameraIntent()
    const locate = intent.beginExplicitViewIntent()
    intent.requestLocationNavigation()
    expect(intent.isCurrent(locate)).toBe(false)
    expect(intent.consumeLocationResult()).toBe(true)
    const nextLocate = intent.beginExplicitViewIntent()
    intent.cancelRequestedLocationNavigation()
    expect(intent.isCurrent(nextLocate)).toBe(true)
    expect(intent.consumeLocationResult()).toBe(false)
  })
})
