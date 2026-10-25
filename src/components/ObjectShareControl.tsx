import { useContext, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { requestObjectShare, ObjectShareRequestError } from '../app/objectShareRequest'
import { OBJECT_SHARE_CONFIG as config } from '../config/objectShareConfig'
import type { ObjectShareContext } from '../domain/objectShare'
import { DetailsPanelFeedbackContext, MobileInspectorContext } from './mobileWorkspace'

interface Props {
  identityKey: string
  capture: () => ObjectShareContext
  now: number
  viewFromHere?: boolean
  disabled?: boolean
}

function ShareControl({ capture, now, viewFromHere = false, disabled = false }: Props) {
  const presentation = useContext(MobileInspectorContext)
  const feedbackTarget = useContext(DetailsPanelFeedbackContext)
  const inputId = useId()
  const pendingRef = useRef<AbortController | undefined>(undefined)
  const linkRef = useRef<{ url: string; deadline: number } | undefined>(undefined)
  const cooldownRef = useRef(0)
  const [pending, setPending] = useState(false)
  const [feedback, setFeedback] = useState<string>()
  const [displayLink, setDisplayLink] = useState<{ url: string; expiresAt: number }>()
  const [cooldownUntil, setCooldownUntil] = useState(0)
  useEffect(() => () => pendingRef.current?.abort(), [])

  const share = async () => {
    const cached = linkRef.current
    const monotonicNow = performance.now()
    if (disabled || pendingRef.current ||
      (!cached || monotonicNow >= cached.deadline) && monotonicNow < cooldownRef.current) return
    const controller = new AbortController()
    pendingRef.current = controller
    setPending(true)
    setFeedback(undefined)
    try {
      let link = linkRef.current
      if (!link || performance.now() >= link.deadline) {
        cooldownRef.current = performance.now() + config.creationCooldownMs
        setCooldownUntil(Date.now() + config.creationCooldownMs)
        const receipt = await requestObjectShare('create', capture(), controller.signal)
        if (controller.signal.aborted) return
        link = {
          url: `${window.location.origin}/${receipt.token}`,
          deadline: performance.now() + receipt.expiresAt - receipt.serverNow,
        }
        linkRef.current = link
        setDisplayLink({ url: link.url, expiresAt: Date.now() + receipt.expiresAt - receipt.serverNow })
      }
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
        await navigator.clipboard.writeText(link.url)
        if (!controller.signal.aborted) setFeedback(`${viewFromHere ? 'View' : 'Object'} link copied. It lasts 24 hours from creation.`)
      } catch {
        if (!controller.signal.aborted) setFeedback('Link ready. Select and copy it below.')
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        if (error instanceof ObjectShareRequestError) {
          const delay = Math.max(config.creationCooldownMs, error.retryAfterMs)
          cooldownRef.current = performance.now() + delay
          setCooldownUntil(Date.now() + delay)
        }
        setFeedback(error instanceof Error ? error.message : 'The object link could not be created.')
      }
    } finally {
      if (pendingRef.current === controller) {
        pendingRef.current = undefined
        if (!controller.signal.aborted) setPending(false)
      }
    }
  }
  const ready = displayLink && now < displayLink.expiresAt
  const label = pending ? 'Creating link...' : ready
    ? viewFromHere ? 'Copy view link' : 'Copy object link'
    : viewFromHere ? 'Share view from here' : 'Share object'
  const feedbackContent = (feedback || displayLink) && <div className="object-share__feedback">
    {feedback && <p className="metadata-status" role="status">{feedback}</p>}
    {displayLink && <label className="object-share__url" htmlFor={inputId}>{viewFromHere ? 'View link' : 'Object link'}
      <input id={inputId} readOnly value={displayLink.url} onFocus={event => event.currentTarget.select()} />
    </label>}
  </div>
  return (
    <div className="object-share">
      <button type="button" className="close-button details-panel__share" onClick={() => {
        if ((presentation?.mobile || presentation?.forceCompact) && presentation?.compact) presentation.onExpand()
        void share()
      }}
        aria-label={label} aria-busy={pending}
        title={viewFromHere
          ? `${label}. Opens this satellite's current modeled view; link lasts 24 hours.`
          : `${label}. Public identity and dated position; link lasts 24 hours.`}
        disabled={disabled || pending || !ready && now < cooldownUntil}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="M12 16V3m-4 4 4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
        </svg>
      </button>
      {feedbackTarget ? createPortal(feedbackContent, feedbackTarget)
        : feedbackTarget === undefined ? feedbackContent : null}
    </div>
  )
}

export function ObjectShareControl(props: Props) {
  return <ShareControl key={props.identityKey} {...props} />
}
