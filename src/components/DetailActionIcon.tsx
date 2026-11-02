export type DetailActionIconName =
  | 'hide'
  | 'path'
  | 'pause'
  | 'play'
  | 'return'
  | 'view'

export function DetailActionIcon({ name }: { name: DetailActionIconName }) {
  return (
    <svg
      className="traffic-action-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {name === 'path' && <>
        <circle cx="5" cy="18" r="2" />
        <circle cx="19" cy="6" r="2" />
        <path d="M7 18c0-5 3.5-5 6-6s4-2 4-4" />
      </>}
      {name === 'view' && <>
        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6S2.5 12 2.5 12Z" />
        <circle cx="12" cy="12" r="2.5" />
      </>}
      {name === 'pause' && <>
        <path d="M9 7v10M15 7v10" />
      </>}
      {name === 'play' && <>
        <path d="m9 7 8 5-8 5Z" />
      </>}
      {name === 'return' && <>
        <path d="m9 7-5 5 5 5" />
        <path d="M4 12h9a6 6 0 0 1 6 6" />
      </>}
      {name === 'hide' && <>
        <circle cx="5" cy="18" r="2" />
        <circle cx="19" cy="6" r="2" />
        <path d="M7 18c0-5 3.5-5 6-6s4-2 4-4M4 4l16 16" />
      </>}
    </svg>
  )
}
