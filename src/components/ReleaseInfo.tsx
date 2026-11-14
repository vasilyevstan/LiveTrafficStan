import {
  formatReleaseTimestamp,
  type ReleaseInfo as ReleaseInfoValue,
} from '../domain/releaseInfo'

export function ReleaseInfo({ info }: { info: ReleaseInfoValue }) {
  const shortSha = info.sha.slice(0, 7)
  return (
    <aside
      className="release-info"
      aria-label="Release information"
      title={`Release v${info.version} at ${info.sha}`}
    >
      <span className="release-info__version">
        v{info.version} · {shortSha}
      </span>
      <time dateTime={info.timestamp}>
        {formatReleaseTimestamp(info.timestamp)}
      </time>
    </aside>
  )
}
