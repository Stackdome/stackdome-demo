// Shapes shared by the server routes and the browser. No imports from the SDK
// here: this file is bundled into client components.

export const DURATIONS = [30, 60, 90] as const
export type MaxSeconds = (typeof DURATIONS)[number]

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

export interface Scene {
  scene: string
  narration: string
  startSec: number
}

export interface WalkResult {
  title: string
  summary: string
  understoodFrom: string[]
  scenes: Scene[]
  app: { startCommand: string; port: number }
  durationSec: number
  caveats: string[]
}

export interface WalkUsage {
  totalTokens: number | null
  costUsd: number | null
}

export interface WalkError {
  code?: string
  phase?: string
  message: string
}

export interface Walkthrough {
  id: string
  source: string
  subdir: string | null
  instruction: string | null
  maxSeconds: MaxSeconds
  kind: "repo" | "pr"
  status: RunStatus
  result: WalkResult | null
  error: WalkError | null
  usage: WalkUsage | null
  /** Which artifact names are downloadable. */
  artifacts: { walkthrough: boolean; captions: boolean; clean: boolean }
  createdAt: string
}
