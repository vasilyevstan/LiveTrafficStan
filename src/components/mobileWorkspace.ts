import { createContext } from 'react'

export type MobileWorkspaceTask =
  | 'layers' | 'find' | 'context' | 'orbits' | 'sources'
  | 'settings' | 'places' | 'in-view'

export interface WorkspaceControlsHandle {
  suspendTask: () => boolean
  resumeTask: () => boolean
  openFind: () => boolean
  center: () => boolean
  openShipFind: () => void
}

export interface MobileInspectorPresentation {
  mobile: boolean
  compact: boolean
  forceCompact?: boolean
  identity: string | null
  returnToTask: boolean
  onExpand: () => void
  onCollapse: () => void
}

export const MobileInspectorContext =
  createContext<MobileInspectorPresentation | undefined>(undefined)

export const DetailsPanelFeedbackContext =
  createContext<HTMLElement | null | undefined>(undefined)
