import type { ReactNode, Ref } from 'react'
import { closeDetailsOnEscape } from './detailsKeyboard'

interface DetailsPanelProps {
  titleId: string
  closeLabel: string
  onClose: () => void
  children: ReactNode
  className?: string
  panelRef?: Ref<HTMLElement>
}

export function DetailsPanel({
  titleId,
  closeLabel,
  onClose,
  children,
  className,
  panelRef,
}: DetailsPanelProps) {
  return (
    <aside
      ref={panelRef}
      className={`details-panel${className ? ` ${className}` : ''}`}
      aria-labelledby={titleId}
      onKeyDown={(event) => closeDetailsOnEscape(event, onClose)}
    >
      <div className="details-panel__close-anchor">
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
      </div>
      {children}
    </aside>
  )
}
