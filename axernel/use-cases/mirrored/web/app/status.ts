import type { RunStatus } from "@/lib/types"

const WORDS: Record<RunStatus, string> = {
  queued: "waiting",
  preparing: "setting up",
  running: "mirroring",
  finalizing: "packing up",
  completed: "done",
  failed: "broke",
  timed_out: "ran out of time",
}

export const statusWord = (status: RunStatus): string => WORDS[status] ?? status
