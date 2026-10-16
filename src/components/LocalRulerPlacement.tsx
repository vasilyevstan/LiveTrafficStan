import { useLayoutEffect, useRef, type Ref } from 'react'
import { rulerAvailabilityMessage, type LocalRulerAvailability, type LocalRulerState } from '../domain/localRuler'
import { closeDetailsOnEscape } from './detailsKeyboard'
import { workspaceOwnsFullscreen } from '../app/fullscreen'

export function LocalRulerPlacement({
  state, availability, distance, panelRef, onCenter, onDone, onCancel,
}: {
  state: LocalRulerState
  availability: LocalRulerAvailability
  distance?: string
  panelRef: Ref<HTMLElement>
  onCenter: () => void
  onDone: () => void
  onCancel: () => void
}) {
  const centerButtonRef = useRef<HTMLButtonElement>(null)
  const doneButtonRef = useRef<HTMLButtonElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const centerOwnedFocusRef = useRef(false)
  useLayoutEffect(() => {
    const active = document.activeElement
    if (!centerOwnedFocusRef.current || !centerButtonRef.current?.disabled ||
        active !== centerButtonRef.current && active !== document.body) return
    const target = doneButtonRef.current?.disabled ? cancelButtonRef.current : doneButtonRef.current
    centerOwnedFocusRef.current = false
    target?.focus({ preventScroll: true })
  }, [availability, state.points.length])
  const message = rulerAvailabilityMessage(availability) ??
    (state.problem === 'points' ? 'Choose valid points in the same local area.'
      : state.points.length === 2 ? distance ? `Approximate surface distance: ${distance}` : 'Distance unavailable. Choose points again.'
        : `Set point ${state.points.length + 1} of 2. Tap the map or use center.`)
  return (
    <section ref={panelRef} className="ruler-placement-strip" aria-label="Distance ruler"
      onKeyDown={event => closeDetailsOnEscape(event, onCancel, workspaceOwnsFullscreen(event.currentTarget))}
    >
      <p id="ruler-placement-status" role="status">{message}</p>
      <div className="control-options ruler-placement-actions">
        <button ref={centerButtonRef} type="button" aria-label="Set point at map center"
          aria-describedby="ruler-placement-status"
          disabled={availability !== 'available' || state.points.length === 2}
          onFocus={() => { centerOwnedFocusRef.current = true }}
          onBlur={event => {
            if (event.relatedTarget && event.relatedTarget !== document.body) centerOwnedFocusRef.current = false
          }}
          onClick={onCenter}
        >SET AT CENTER</button>
        <button ref={doneButtonRef} type="button" disabled={state.points.length !== 2 || !distance} onClick={onDone}>DONE</button>
        <button ref={cancelButtonRef} type="button" onClick={onCancel}>CANCEL</button>
      </div>
    </section>
  )
}
