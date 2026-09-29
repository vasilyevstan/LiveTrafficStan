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
          <p className="eyebrow">Selected port</p>
          <h2 id="selected-port-title">{port.name}</h2>
        </div>
        <button type="button" className="close-button" onClick={onClose}>
          Close
        </button>
      </div>

      <p className="metadata-status">
        Generalized, incomplete context; points may be up to 20 miles off. No
        facilities, status, berth, calls, destination, or ETA inferred.
      </p>
      <p className="metadata-attribution">
        <a href={source.repositoryUrl}>{source.name}</a> {source.tag} ·{' '}
        <a href={source.termsUrl}>{source.licenseName}</a> ·{' '}
        {source.outputVersion}.
      </p>
    </aside>
  )
}
