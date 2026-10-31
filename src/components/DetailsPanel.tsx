import { useContext, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { closeDetailsOnEscape } from './detailsKeyboard'
import { workspaceOwnsFullscreen } from '../app/fullscreen'
import { DetailsPanelFeedbackContext, MobileInspectorContext } from './mobileWorkspace'

interface DetailsPanelProps {
  titleId: string
  closeLabel: string
  onClose: () => void
  heading: ReactNode
  headerAction?: ReactNode
  children: ReactNode
  className?: string
  panelRef?: Ref<HTMLDivElement>
}

export function DetailsPanel({
  titleId,
  closeLabel,
  onClose,
  heading,
  headerAction,
  children,
  className,
  panelRef,
}: DetailsPanelProps) {
  const presentation = useContext(MobileInspectorContext)
  const compact = Boolean((presentation?.mobile || presentation?.forceCompact) && presentation?.compact)
  const suspended = Boolean(presentation?.mobile && presentation.suspended)
  const bodyId = useId()
  const bodyRef = useRef<HTMLDivElement>(null)
  const [feedbackTarget, setFeedbackTarget] = useState<HTMLDivElement | null>(null)
  const presentationButtonRef = useRef<HTMLButtonElement>(null)
  const scrollTopRef = useRef(0)
  const identityRef = useRef(presentation?.identity)
  const lastBodyFocusRef = useRef<HTMLElement | null>(null)
  useImperativeHandle<HTMLDivElement | null, HTMLDivElement | null>(panelRef, () => bodyRef.current, [])

  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body) return
    if (identityRef.current !== presentation?.identity) {
      identityRef.current = presentation?.identity
      scrollTopRef.current = 0
      lastBodyFocusRef.current = null
    }
    if (compact && !suspended) {
      if (body.contains(document.activeElement) ||
        document.activeElement === document.body && lastBodyFocusRef.current !== null) {
        presentationButtonRef.current?.focus({ preventScroll: true })
      }
    } else {
      body.scrollTop = scrollTopRef.current
    }
  }, [compact, suspended, presentation?.identity])

  return (
    <aside
      className={`details-panel${headerAction ? ' details-panel--action' : ''}${className ? ` ${className}` : ''}`}
      aria-labelledby={titleId}
      hidden={suspended}
      inert={suspended || undefined}
      data-compact={compact || undefined}
      data-force-compact={presentation?.forceCompact || undefined}
      onKeyDown={(event) =>
        closeDetailsOnEscape(event, onClose, workspaceOwnsFullscreen(event.currentTarget))
      }
      onFocusCapture={(event) => {
        if (event.target instanceof HTMLElement && bodyRef.current?.contains(event.target)) {
          lastBodyFocusRef.current = event.target
        }
      }}
      onBlurCapture={(event) => {
        if (event.relatedTarget instanceof Node && event.relatedTarget !== document.body &&
          !bodyRef.current?.contains(event.relatedTarget)) {
          lastBodyFocusRef.current = null
        }
      }}
    >
      <div className="details-panel__heading">{heading}</div>
      {headerAction && (
        <div className="details-panel__header-action" onClickCapture={() => {
          scrollTopRef.current = 0
          if (bodyRef.current) bodyRef.current.scrollTop = 0
        }}>
          <DetailsPanelFeedbackContext.Provider value={feedbackTarget}>
            {headerAction}
          </DetailsPanelFeedbackContext.Provider>
        </div>
      )}
      {(presentation?.mobile || presentation?.forceCompact) && (
        <button
          ref={presentationButtonRef}
          type="button"
          className="details-panel__presentation"
          aria-expanded={!compact}
          aria-controls={bodyId}
          onClick={compact ? presentation.onExpand : presentation.onCollapse}
        >
          {compact ? 'Details' : presentation.returnToTask ? 'Back' : 'Collapse'}
        </button>
      )}
      <button
        type="button"
        className="close-button details-panel__close"
        aria-label={closeLabel}
        onClick={onClose}
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>
      <div
        ref={bodyRef}
        id={bodyId}
        className="details-panel__body"
        hidden={compact}
        inert={compact || undefined}
        onScroll={(event) => {
          if (!compact && !event.currentTarget.hidden) scrollTopRef.current = event.currentTarget.scrollTop
        }}
      >
        {headerAction && <div ref={setFeedbackTarget} className="details-panel__action-feedback" />}
        {children}
        {!compact && presentation?.notice}
      </div>
    </aside>
  )
}
