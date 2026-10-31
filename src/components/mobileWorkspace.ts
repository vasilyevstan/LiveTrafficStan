import { createContext, type ReactNode } from 'react'

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
  suspended?: boolean
  notice?: ReactNode
}

export const inspectorStartsExpanded = (mobile: boolean, captured: boolean, fromResult: boolean) =>
  !captured && (!mobile || fromResult)

export const trafficPausePlacement = (
  mobile: boolean,
  activeTask: MobileWorkspaceTask | null,
  expandedInspector: boolean,
  providerDetailsOpen = false,
): 'map' | 'task' | 'inspector' | 'providers' =>
  !mobile ? 'map' : activeTask ? 'task' : providerDetailsOpen ? 'providers' :
    expandedInspector ? 'inspector' : 'map'

export const MOBILE_DISCLOSURES = '.live-status__disclosure, .maplibregl-ctrl-attrib'

export const closeMobileDisclosures = (root: ParentNode | null, except?: HTMLDetailsElement) => {
  root?.querySelectorAll<HTMLDetailsElement>(MOBILE_DISCLOSURES).forEach(disclosure => {
    if (disclosure === except) return
    disclosure.open = false
    disclosure.classList.remove('maplibregl-compact-show')
  })
}

export const MobileInspectorContext =
  createContext<MobileInspectorPresentation | undefined>(undefined)

export const DetailsPanelFeedbackContext =
  createContext<HTMLElement | null | undefined>(undefined)
