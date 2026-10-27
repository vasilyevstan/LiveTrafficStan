import { describe, expect, it, vi } from 'vitest'
import { handleMapActionShortcut, isMapMovementKey, type MapActionShortcut } from './mapShortcuts'

const canvas = new EventTarget()
const keyEvent = (key = 'f') => ({
  key,
  target: canvas,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  repeat: false,
  isComposing: false,
  defaultPrevented: false,
  preventDefault: vi.fn(),
})

describe('map movement intent', () => {
  it.each(['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', '+', '-', '='])(
    'recognizes plain, shifted and repeated %s without consuming browser defaults',
    key => {
      const event = keyEvent(key)
      expect(isMapMovementKey(event)).toBe(true)
      expect(isMapMovementKey({ ...event, shiftKey: true })).toBe(true)
      expect(isMapMovementKey({ ...event, repeat: true })).toBe(true)
      expect(event.preventDefault).not.toHaveBeenCalled()
    },
  )

  it.each(['altKey', 'ctrlKey', 'metaKey', 'isComposing', 'defaultPrevented'] as const)(
    'does not claim movement during %s',
    guard => {
      for (const key of ['+', '-', '=', 'ArrowUp']) {
        const event = { ...keyEvent(key), [guard]: true }
        expect(isMapMovementKey(event)).toBe(false)
        expect(event.preventDefault).not.toHaveBeenCalled()
      }
    },
  )

  it.each(['f', 'c', 'Escape', 'Enter', 'Dead', 'Process'])(
    'leaves %s with its existing owner',
    key => expect(isMapMovementKey(keyEvent(key))).toBe(false),
  )
})

describe('map-focused action shortcuts', () => {
  it.each([
    ['f', 'find'], ['F', 'find'], ['c', 'center'], ['C', 'center'],
  ] as const)('handles %s once through the existing %s action', (key, action) => {
    const event = keyEvent(key)
    const invoke = vi.fn(() => true)
    expect(handleMapActionShortcut(event, canvas, canvas, invoke)).toBe(true)
    expect(invoke).toHaveBeenCalledExactlyOnceWith(action)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(invoke.mock.invocationCallOrder[0]).toBeLessThan(
      event.preventDefault.mock.invocationCallOrder[0],
    )
  })

  it.each([
    'altKey', 'ctrlKey', 'metaKey', 'shiftKey', 'repeat',
    'isComposing', 'defaultPrevented',
  ] as const)('ignores %s without invoking or consuming', (guard) => {
    const event = { ...keyEvent(), [guard]: true }
    const invoke = vi.fn(() => true)
    expect(handleMapActionShortcut(event, canvas, canvas, invoke)).toBe(false)
    expect(invoke).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it.each(['Escape', 'Enter', ' ', 'x', 'ArrowUp', '+', '-', '='])(
    'leaves %s to its existing owner',
    (key) => {
      const event = keyEvent(key)
      const invoke = vi.fn(() => true)
      expect(handleMapActionShortcut(event, canvas, canvas, invoke)).toBe(false)
      expect(invoke).not.toHaveBeenCalled()
      expect(event.preventDefault).not.toHaveBeenCalled()
    },
  )

  it('requires both the original canvas target and current canvas focus', () => {
    const other = new EventTarget()
    const invoke = vi.fn(() => true)
    const event = keyEvent()
    expect(handleMapActionShortcut(event, canvas, other, invoke)).toBe(false)
    expect(handleMapActionShortcut(event, canvas, null, invoke)).toBe(false)
    expect(handleMapActionShortcut({ ...event, target: other }, canvas, canvas, invoke)).toBe(false)
    expect(invoke).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('does not consume a hidden, disabled or otherwise unavailable action', () => {
    const event = keyEvent()
    const invoke = vi.fn(() => false)
    expect(handleMapActionShortcut(event, canvas, canvas, invoke)).toBe(false)
    expect(invoke).toHaveBeenCalledExactlyOnceWith('find')
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('uses the current handle and becomes inert after its removal', () => {
    const first = vi.fn(() => true)
    const next = vi.fn(() => true)
    let current: ((action: MapActionShortcut) => boolean) | undefined = first
    const invoke = (action: MapActionShortcut) => current?.(action) ?? false
    expect(handleMapActionShortcut(keyEvent(), canvas, canvas, invoke)).toBe(true)
    current = next
    expect(handleMapActionShortcut(keyEvent('c'), canvas, canvas, invoke)).toBe(true)
    current = undefined
    const event = keyEvent()
    expect(handleMapActionShortcut(event, canvas, canvas, invoke)).toBe(false)
    expect(handleMapActionShortcut(event, canvas, canvas, undefined)).toBe(false)
    expect(first).toHaveBeenCalledExactlyOnceWith('find')
    expect(next).toHaveBeenCalledExactlyOnceWith('center')
    expect(event.preventDefault).not.toHaveBeenCalled()
  })
})
