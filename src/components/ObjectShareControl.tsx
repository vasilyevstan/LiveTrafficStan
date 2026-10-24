import { useEffect, useId, useRef, useState } from 'react'
import { requestObjectShare, ObjectShareRequestError } from '../app/objectShareRequest'
import { OBJECT_SHARE_CONFIG as config } from '../config/objectShareConfig'
import type { ObjectShareContext } from '../domain/objectShare'

interface Props {
  identityKey: string
  capture: () => ObjectShareContext
  now: number
}

function ShareControl({ capture, now }: Props) {
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
    if (pendingRef.current ||
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
        if (!controller.signal.aborted) setFeedback('Object link copied. It lasts 24 hours from creation.')
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
  return (
    <div className="object-share">
      <div className="journey-actions">
        <button type="button" onClick={() => void share()}
          disabled={pending || !ready && now < cooldownUntil}>
          {pending ? 'Creating link...' : ready ? 'Copy object link' : 'Share object'}
        </button>
      </div>
      {feedback ? <p className="metadata-status" role="status">{feedback}</p> :
        <p className="metadata-status">Public identity and dated position. Link lasts 24 hours.</p>}
      {displayLink && <label className="object-share__url" htmlFor={inputId}>Object link
        <input id={inputId} readOnly value={displayLink.url} onFocus={event => event.currentTarget.select()} />
      </label>}
    </div>
  )
}

export function ObjectShareControl(props: Props) {
  return <ShareControl key={props.identityKey} {...props} />
}
