import { useId } from 'react'
import { DetailsPanel } from './DetailsPanel'
import type { ObjectShareReceipt } from '../domain/objectShare'
import { formatTimestamp } from '../domain/format'

export function SharedObjectDetails({
  receipt, message, onClose,
}: { receipt: ObjectShareReceipt; message: string; onClose: () => void }) {
  const titleId = useId()
  const { context } = receipt
  return (
    <DetailsPanel titleId={titleId} closeLabel="Close shared object" onClose={onClose}
      heading={<div><h2 id={titleId} title={context.label}>{context.label}</h2><p className="metadata-status">Shared object</p></div>}>
      <p className="metadata-status" role="status">{message}</p>
      <dl className="details-grid">
        <div className="detail-row"><dt>{context.kind === 'aircraft' ? 'ICAO24' : context.kind === 'vessel' ? 'MMSI' : 'NORAD'}</dt>
          <dd>{context.identifier}</dd></div>
        {context.kind === 'aircraft' && context.registration &&
          <div className="detail-row"><dt>Shared registration</dt><dd>{context.registration}</dd></div>}
        {context.kind === 'vessel' && context.imo &&
          <div className="detail-row"><dt>Shared IMO</dt><dd>{context.imo}</dd></div>}
        {context.kind === 'orbital' &&
          <div className="detail-row"><dt>Shared SATCAT type</dt><dd>{context.objectType}</dd></div>}
        {context.position && <div className="detail-row">
          <dt>{context.kind === 'orbital' ? 'Shared modeled time' : 'Shared report time'}</dt>
          <dd>{formatTimestamp(context.position.at)}</dd>
        </div>}
        <div className="detail-row"><dt>Source</dt>
          <dd>{context.kind === 'vessel' && context.contributors ? context.contributors.join(' / ') : context.source}</dd></div>
        {context.kind === 'vessel' && context.contributors && context.contributors.length > 1 &&
          <div className="detail-row"><dt>Position source</dt><dd>{context.source}</dd></div>}
      </dl>
      <details className="context-details"><summary>About this shared snapshot</summary>
        <p>This snapshot is sender-supplied, not current or provider-verified.
          {context.kind === 'orbital' ? ' The saved point is modeled, not live or an optical view.' : ' The object may have moved or left receiver coverage.'}</p>
        {context.kind === 'orbital' && <p>Originating {context.owner} catalog retrieved {formatTimestamp(context.snapshot.retrievedAt)}.
          Element epoch {formatTimestamp(context.snapshot.elementEpoch)}.</p>}
        <p>Saved preferences, filters and Home stay unchanged. No outside lookup.</p>
      </details>
    </DetailsPanel>
  )
}
