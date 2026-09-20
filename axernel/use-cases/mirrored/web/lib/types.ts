// Shapes shared by the server routes and the browser. No imports from the SDK
// here: this file is bundled into client components.

export const MODES = ["section", "brand"] as const
export type Mode = (typeof MODES)[number]

export const FRAMEWORKS = ["html", "react", "vue"] as const
export type Framework = (typeof FRAMEWORKS)[number]

export const TERMINAL_STATUSES = ["completed", "failed", "timed_out"] as const
export type RunStatus = "queued" | "preparing" | "running" | "finalizing" | (typeof TERMINAL_STATUSES)[number]

export function isTerminal(status: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status)
}

export type EventType =
  | "run.status"
  | "message.delta"
  | "tool.activity"
  | "harness.status"
  | "stream.error"
  | "stream.end"

/** One Axernel run event as relayed. `data` is the raw OpenCode payload. */
export interface RunEvent {
  sequence?: number
  runId?: string
  timestamp?: string
  type: EventType | (string & {})
  harness?: string
  data?: unknown
}

export interface Mismatch {
  region: string
  reason: string
}

/** The agent's output contract (bootstrap/agent.ts). */
export interface MirrorResult {
  title: string
  summary: string
  chosenSelector: string
  matchScore: number
  passes: number
  tokenCount: number
  fonts: string[]
  mismatches: Mismatch[]
  caveats: string[]
  /** Component file names without extension; each is an item in the registry. Newer agents only. */
  components?: string[]
}

export interface MirrorUsage {
  totalTokens: number | null
  costUsd: number | null
}

export interface MirrorError {
  code?: string
  phase?: string
  message: string
}

/** Artifact names on the run. All optional: a failed mirror may have none. */
export const ARTIFACT_NAMES = ["bundle", "registry", "tokens", "report", "preview", "skin", "original", "rebuild", "diff", "page"] as const
export type ArtifactName = (typeof ARTIFACT_NAMES)[number]

export interface Mirror {
  id: string
  url: string
  mode: Mode
  target: string | null
  framework: Framework
  status: RunStatus
  result: MirrorResult | null
  error: MirrorError | null
  usage: MirrorUsage | null
  /** Which artifact names are downloadable. */
  artifacts: Record<ArtifactName, boolean>
  createdAt: string
}
