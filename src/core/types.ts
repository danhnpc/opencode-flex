/** Shared shapes. Kept free of Node and framework imports so both processes can evaluate them. */

export interface SessionSummary {
  /** `${source}:${localId}` — source-prefixed so more adapters can be added later. */
  id: string
  source: string
  title: string
  directory: string
  project: string
  createdAt: number
  updatedAt: number
  status: string
  size: number
  path: string
}

export interface TranscriptTurn {
  role: "user" | "assistant"
  text: string
  timestamp: number
}

export interface Transcript {
  sessionId: string
  source: string
  directory: string
  createdAt: number
  updatedAt: number
  turns: TranscriptTurn[]
}

/** Contract every session source implements. Adding a new AI tool = one new adapter. */
export interface SourceAdapter {
  readonly id: string
  home(): string
  list(): Promise<SessionSummary[]>
  read(localId: string): Promise<Transcript>
}
