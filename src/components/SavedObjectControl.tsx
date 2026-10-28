import { useContext, useState } from 'react'
import { createPortal } from 'react-dom'
import type {
  SavedObject,
  SavedObjectsMutationResult,
} from '../domain/savedObjects'
import {
  savedObjectKey,
} from '../domain/savedObjects'
import {
  DetailsPanelFeedbackContext,
  MobileInspectorContext,
} from './mobileWorkspace'

interface Props {
  entry: SavedObject
  saved: boolean
  onSave: (entry: SavedObject) => SavedObjectsMutationResult
  onRemove: (key: string) => SavedObjectsMutationResult
}

export function SavedObjectControl({
  entry,
  saved,
  onSave,
  onRemove,
}: Props) {
  const presentation = useContext(MobileInspectorContext)
  const feedbackTarget = useContext(DetailsPanelFeedbackContext)
  const [feedback, setFeedback] = useState<string>()
  const toggle = () => {
    if (
      (presentation?.mobile || presentation?.forceCompact) &&
      presentation.compact
    ) {
      presentation.onExpand()
    }
    const result = saved
      ? onRemove(savedObjectKey(entry))
      : onSave(entry)
    setFeedback(
      result.ok
        ? saved
          ? 'Removed from Saved.'
          : 'Saved on this browser profile. Anyone using this profile can see the list.'
        : result.message,
    )
  }
  const feedbackContent = feedback && (
    <p
      className={`metadata-status${feedback.includes('not') || feedback.includes('unavailable') || feedback.includes('limit') ? ' metadata-status--error' : ''}`}
      role="status"
    >
      {feedback}
    </p>
  )
  return (
    <div className="saved-object-control">
      <button
        type="button"
        className="close-button details-panel__save"
        aria-label={saved ? `Remove ${entry.savedLabel} from Saved` : `Save ${entry.savedLabel}`}
        aria-pressed={saved}
        title={saved ? 'Remove from Saved' : 'Save on this browser profile'}
        onClick={toggle}
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill={saved ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M6 3h12v18l-6-4-6 4V3Z" />
        </svg>
      </button>
      {feedbackTarget
        ? createPortal(feedbackContent, feedbackTarget)
        : feedbackTarget === undefined
          ? feedbackContent
          : null}
    </div>
  )
}

