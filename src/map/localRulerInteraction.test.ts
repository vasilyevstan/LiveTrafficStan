import type { ProjectionSpecification } from 'maplibre-gl'
import { describe, expect, it, vi } from 'vitest'
import type { MapProjectionPreference } from '../domain/preferences'
import { EMPTY_LOCAL_RULER, reduceLocalRuler, type LocalRulerAvailability, type LocalRulerState } from '../domain/localRuler'
import { createLocalRulerInteraction, isRulerPlacementTap, rulerCenterIsUsable } from './localRulerInteraction'

const setup = (doubleClick = true, styleReady = true) => {
  let state: LocalRulerState = EMPTY_LOCAL_RULER
  let projection: MapProjectionPreference = 'flat'
  let disabled = false, centerUsable = true, moving = false, pitch = 0, styled = styleReady
  const listeners = new Map<string, Set<() => void>>()
  const map = {
    getStyle: () => styled ? { version: 8 } : undefined,
    getProjection: vi.fn((): ProjectionSpecification => ({ type: 'mercator' })),
    getPitch: () => pitch,
    getCanvas: () => ({ clientWidth: 800, clientHeight: 600 }),
    getCenter: () => ({ lat: 59.01, lng: 24.01 }),
    isMoving: () => moving,
    getBounds: () => ({ getNorth: () => 59.03, getSouth: () => 58.97, getEast: () => 24.04, getWest: () => 23.96 }),
    project: () => ({ x: 0, y: 0 }),
    unproject: vi.fn(([x, y]: [number, number]) => ({ lat: 59 + (300 - y) / 10_000, lng: 24 + (x - 400) / 10_000 })),
    doubleClickZoom: {
      isEnabled: () => doubleClick,
      enable: vi.fn(() => { doubleClick = true }),
      disable: vi.fn(() => { doubleClick = false }),
    },
    on: vi.fn((type: string, listener: () => void) => {
      const group = listeners.get(type) ?? new Set()
      group.add(listener)
      listeners.set(type, group)
    }),
    off: vi.fn((type: string, listener: () => void) => { listeners.get(type)?.delete(listener) }),
  }
  const onPoint = vi.fn(point => { state = reduceLocalRuler(state, { type: 'place', point }) })
  const onAvailability = vi.fn((availability: LocalRulerAvailability) => {
    if (availability === 'unsupported') state = reduceLocalRuler(state, { type: 'unsupported' })
    if (availability === 'available') state = reduceLocalRuler(state, { type: 'supported' })
  })
  const onCancel = vi.fn(() => { state = reduceLocalRuler(state, { type: 'cancel' }) })
  const interaction = createLocalRulerInteraction({
    map, read: () => state, projection: () => projection,
    limits: () => ({ coordinatePrecision: 3, maximumRadiusKm: 100 }),
    disabled: () => disabled, centerUsable: () => centerUsable,
    onPoint, onAvailability, onCancel,
  })
  return {
    map, interaction, listeners, onPoint, onAvailability, onCancel,
    state: () => state,
    action: (action: Parameters<typeof reduceLocalRuler>[1]) => { state = reduceLocalRuler(state, action); interaction.sync() },
    emit: (type: string) => listeners.get(type)?.forEach(listener => listener()),
    configure: (next: { projection?: MapProjectionPreference; disabled?: boolean; centerUsable?: boolean; moving?: boolean; pitch?: number; styled?: boolean }) => {
      if (next.projection !== undefined) projection = next.projection
      if (next.disabled !== undefined) disabled = next.disabled
      if (next.centerUsable !== undefined) centerUsable = next.centerUsable
      if (next.moving !== undefined) moving = next.moving
      if (next.pitch !== undefined) pitch = next.pitch
      if (next.styled !== undefined) styled = next.styled
    },
  }
}

describe('actual ruler input ownership', () => {
  it('requires an explicit placement session and uses the actual canvas center, not a padded camera target', () => {
    const fixture = setup()
    expect(fixture.interaction.center()).toBe(false)
    fixture.action({ type: 'start' })
    expect(fixture.map.doubleClickZoom.isEnabled()).toBe(false)
    expect(fixture.interaction.center()).toBe(true)
    expect(fixture.map.unproject).toHaveBeenLastCalledWith([400, 300])
    expect(fixture.state().points).toEqual([{ latitude: 59, longitude: 24 }])
    expect(fixture.interaction.place([500, 300])).toBe(true)
    expect(fixture.state().points).toHaveLength(2)
    expect(fixture.interaction.center()).toBe(false)
    fixture.action({ type: 'done' })
    expect(fixture.state().phase).toBe('retained')
    expect(fixture.map.doubleClickZoom.isEnabled()).toBe(true)
  })

  it.each([true, false])('restores the exact prior double-click state %s on cancel, completion and dispose', enabled => {
    for (const exit of ['cancel', 'done', 'dispose'] as const) {
      const fixture = setup(enabled)
      fixture.action({ type: 'start' })
      fixture.interaction.center()
      fixture.interaction.place([500, 300])
      if (exit === 'dispose') fixture.interaction.dispose()
      else fixture.action({ type: exit })
      expect(fixture.map.doubleClickZoom.isEnabled()).toBe(enabled)
      fixture.interaction.dispose()
    }
  })

  it('blocks in-flight movement without discarding a valid first point or adding placement', () => {
    const fixture = setup()
    fixture.action({ type: 'start' })
    fixture.interaction.center()
    fixture.configure({ moving: true })
    fixture.emit('movestart')
    expect(fixture.onAvailability).toHaveBeenLastCalledWith('moving')
    expect(fixture.interaction.center()).toBe(false)
    fixture.emit('move')
    expect(fixture.state().points).toHaveLength(1)
    expect(fixture.onPoint).toHaveBeenCalledOnce()
    fixture.configure({ moving: false })
    fixture.emit('moveend')
    expect(fixture.interaction.place([500, 300])).toBe(true)
  })

  it('clears unsupported live geometry during a gesture, then restarts empty without reviving points', () => {
    const fixture = setup()
    fixture.action({ type: 'start' })
    fixture.interaction.center()
    fixture.configure({ pitch: 20, moving: true })
    fixture.emit('move')
    expect(fixture.state()).toMatchObject({ phase: 'placing', points: [], problem: 'geometry' })
    expect(fixture.interaction.center()).toBe(false)
    fixture.configure({ pitch: 0, moving: false })
    fixture.emit('moveend')
    expect(fixture.state().points).toEqual([])
    expect(fixture.interaction.center()).toBe(true)
    expect(fixture.state().points).toHaveLength(1)
  })

  it('rechecks actual center occlusion and live geometry at placement, not only a settled React report', () => {
    const fixture = setup()
    fixture.action({ type: 'start' })
    fixture.configure({ centerUsable: false })
    expect(fixture.interaction.center()).toBe(false)
    expect(fixture.onAvailability).toHaveBeenLastCalledWith('obscured')
    fixture.configure({ centerUsable: true, pitch: 1 })
    expect(fixture.interaction.place([500, 300])).toBe(false)
    expect(fixture.onAvailability).toHaveBeenLastCalledWith('unsupported')
    expect(fixture.onPoint).not.toHaveBeenCalled()
  })

  it('preserves points through transient style loading and never reads an unstyled projection', () => {
    const fixture = setup(true, false)
    fixture.map.getProjection.mockImplementation(() => { throw new Error('Unstyled projection') })
    expect(fixture.interaction.refresh()).toBe('updating')
    expect(fixture.map.getProjection).not.toHaveBeenCalled()
    fixture.configure({ styled: true })
    fixture.map.getProjection.mockReturnValue({ type: 'mercator' })
    fixture.action({ type: 'start' })
    fixture.interaction.center()
    fixture.configure({ styled: false })
    fixture.emit('style.load')
    expect(fixture.state().points).toHaveLength(1)
    expect(fixture.interaction.center()).toBe(false)
    fixture.configure({ styled: true })
    fixture.emit('style.load')
    expect(fixture.state().points).toHaveLength(1)
    expect(fixture.interaction.place([500, 300])).toBe(true)
  })

  it.each([[NaN, 200], [Infinity, 0], [-1, 300], [801, 300], [400, 601]])(
    'reports invalid/outside pixels %j/%j through the same invalid-point boundary',
    (x, y) => {
      const fixture = setup()
      fixture.action({ type: 'start' })
      expect(fixture.interaction.place([x, y])).toBe(false)
      expect(fixture.state()).toMatchObject({ points: [], problem: 'points' })
    },
  )

  it('clears a retained result for Auto, HISTORY/map disable and unsafe projection transitions', () => {
    for (const options of [{ projection: 'auto' as const }, { disabled: true }, { pitch: 1 }]) {
      const fixture = setup()
      fixture.action({ type: 'start' })
      fixture.interaction.center()
      fixture.interaction.place([500, 300])
      fixture.action({ type: 'done' })
      fixture.configure(options)
      fixture.emit('projectiontransition')
      expect(fixture.state()).toMatchObject({ phase: 'idle', points: [] })
    }
  })

  it('defers fullscreen and already-owned Escape, and cancels only active ordinary canvas Escape', () => {
    const fixture = setup()
    fixture.action({ type: 'start' })
    const event = { key: 'Escape', isComposing: false, defaultPrevented: false, preventDefault: vi.fn(), stopPropagation: vi.fn() }
    expect(fixture.interaction.escape(event, true)).toBe(false)
    expect(fixture.interaction.escape({ ...event, defaultPrevented: true }, false)).toBe(false)
    expect(fixture.interaction.escape({ ...event, isComposing: true }, false)).toBe(false)
    expect(fixture.interaction.escape({ ...event, key: 'Enter' }, false)).toBe(false)
    expect(fixture.onCancel).not.toHaveBeenCalled()
    expect(fixture.interaction.escape(event, false)).toBe(true)
    expect(fixture.onCancel).toHaveBeenCalledOnce()
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.stopPropagation).toHaveBeenCalledOnce()
    fixture.action({ type: 'start' })
    fixture.action({ type: 'cancel' })
    expect(fixture.interaction.escape(event, false)).toBe(false)
  })

  it('cleans up one listener set and fences captured late listeners and all commands after dispose', () => {
    const fixture = setup()
    fixture.action({ type: 'start' })
    fixture.interaction.center()
    const late = [...fixture.listeners.values()].flatMap(listeners => [...listeners])
    fixture.interaction.dispose()
    fixture.interaction.dispose()
    const updates = fixture.onAvailability.mock.calls.length, points = fixture.onPoint.mock.calls.length
    fixture.configure({ pitch: 20 })
    late.forEach(callback => callback())
    expect(fixture.interaction.center()).toBe(false)
    expect(fixture.interaction.place([500, 300])).toBe(false)
    expect(fixture.interaction.refresh()).toBe('unsupported')
    expect([...fixture.listeners.values()].every(listeners => listeners.size === 0)).toBe(true)
    expect(fixture.map.on).toHaveBeenCalledTimes(6)
    expect(fixture.map.off).toHaveBeenCalledTimes(6)
    expect(fixture.onAvailability).toHaveBeenCalledTimes(updates)
    expect(fixture.onPoint).toHaveBeenCalledTimes(points)
  })
})

describe('genuine tap and usable full-canvas center', () => {
  const event = { isTrusted: true, isPrimary: true, button: 0, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false }
  const gesture = { originRevision: 1, revision: 1, pointerCount: 1, moved: false, multiple: false }
  it('rejects synthetic, modified, secondary, stale, drag and multi-pointer releases', () => {
    expect(isRulerPlacementTap(event, gesture)).toBe(true)
    for (const change of [
      { isTrusted: false }, { isPrimary: false }, { button: 1 },
      { altKey: true }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true },
    ]) expect(isRulerPlacementTap({ ...event, ...change }, gesture)).toBe(false)
    for (const change of [
      { originRevision: undefined }, { originRevision: 0 }, { pointerCount: 0 },
      { pointerCount: 2 }, { moved: true }, { multiple: true },
    ]) expect(isRulerPlacementTap(event, { ...gesture, ...change })).toBe(false)
  })

  it('checks the actual 120px center square against visual cropping and pointer-intercepting surfaces', () => {
    const canvas = { left: 0, top: 0, width: 800, height: 600 }
    const viewport = { offsetLeft: 0, offsetTop: 0, width: 800, height: 600 }
    const hit = vi.fn(() => true)
    expect(rulerCenterIsUsable(canvas, viewport, hit)).toBe(true)
    expect(hit).toHaveBeenCalledTimes(81)
    expect(hit).toHaveBeenCalledWith(340, 240)
    expect(hit).toHaveBeenCalledWith(460, 360)
    expect(rulerCenterIsUsable(canvas, { ...viewport, offsetLeft: 350 }, hit)).toBe(false)
    expect(rulerCenterIsUsable(canvas, viewport, (x, y) => !(x > 410 && x < 450 && y > 310 && y < 350))).toBe(false)
    expect(rulerCenterIsUsable({ ...canvas, width: NaN }, viewport, hit)).toBe(false)
    expect(rulerCenterIsUsable({ ...canvas, height: 110 }, viewport, hit)).toBe(false)
    expect(rulerCenterIsUsable(canvas, { ...viewport, height: 0 }, hit)).toBe(false)
  })
})
