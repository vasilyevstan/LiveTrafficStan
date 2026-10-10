import type { Port, PortSource } from '../domain/ports'
import { DetailsPanel } from './DetailsPanel'

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
    <DetailsPanel
      titleId="selected-port-title"
      closeLabel="Close port details"
      onClose={onClose}
      heading={
        <div>
          <p className="eyebrow">Selected port</p>
          <h2 id="selected-port-title" title={port.name}>{port.name}</h2>
        </div>
      }
    >
      <p className="metadata-status">Generalized location; not a navigational port record.</p>
      <details className="context-details">
        <summary>Port source &amp; limits</summary>
        <p className="metadata-status">{port.name}</p>
      <p className="metadata-status">
        Generalized, incomplete context; points may be up to 20 miles off. No
        facilities, status, berth, calls, destination, or ETA inferred.
      </p>
      <p className="metadata-attribution">
        <a href={source.repositoryUrl}>{source.name}</a> {source.tag} ·{' '}
        <a href={source.termsUrl}>{source.licenseName}</a> ·{' '}
        {source.outputVersion}.
      </p>
      </details>
    </DetailsPanel>
  )
}
