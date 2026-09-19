export interface Port {
  id: string
  name: string
  rank: number
  longitude: number
  latitude: number
}

export interface PortSource {
  name: string
  repositoryUrl: string
  tag: string
  commit: string
  publishedAt: string
  termsUrl: string
  documentationUrl: string
  licenseName: string
  outputVersion: string
}

export interface PortDataset {
  ports: readonly Port[]
  source: PortSource
}

export type PortsViewState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ready'; dataset: PortDataset }
  | { phase: 'error'; message: string }
