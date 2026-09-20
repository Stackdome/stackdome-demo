import type { RunStatus } from "@/lib/types"

/** One accent per state: sun while waiting, sky while walking, grass when
 *  done, clay when the trail closed. */
export function statusTone(status: RunStatus): "sun" | "sky" | "grass" | "clay" {
  if (status === "completed") return "grass"
  if (status === "failed" || status === "timed_out") return "clay"
  return status === "queued" ? "sun" : "sky"
}

const WORDS: Record<RunStatus, string> = {
  queued: "waiting",
  preparing: "setting up",
  running: "walking",
  finalizing: "wrapping up",
  completed: "done",
  failed: "trail closed",
  timed_out: "ran out of time",
}

export const statusWord = (status: RunStatus): string => WORDS[status] ?? status
