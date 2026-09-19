import type { Port, PortSource } from '../domain/ports'

interface PortDetailsProps {
  port: Port
  source: PortSource
  onClose: () => void
}

export function PortDetails({
  port,
  source,
  onClose,
}: PortDetailsProps) {
  return (
    <aside className="details-panel" aria-labelledby="selected-port-title">
      <div className="details-panel__heading">
        <div>
          <p className="eyebrow">Selected port context</p>
          <h2 id="selected-port-title">{port.name}</h2>
        </div>
        <button type="button" className="close-button" onClick={onClose}>
          Close
        </button>
      </div>

      <p className="metadata-status">
        Generalized Natural Earth context only. The global layer is incomplete,
        and some source points can be approximate by as much as 20 miles.
      </p>
      <p className="metadata-status">
        No facility, operational status, berth, vessel call, destination, or ETA
        relationship is inferred.
      </p>
      <p className="metadata-attribution">
        <a href={source.repositoryUrl}>{source.name}</a> {source.tag} ·{' '}
        <a href={source.termsUrl}>{source.licenseName}</a> · output{' '}
        {source.outputVersion}.
      </p>
    </aside>
  )
}
