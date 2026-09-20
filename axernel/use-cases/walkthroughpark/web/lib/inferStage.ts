import { toolPartOf } from "./toFeedLine"
import type { RunEvent } from "./types"

export const STAGES = ["reading", "planning", "booting", "recording", "rendering"] as const
export type TrailStage = (typeof STAGES)[number]
export type Stage = TrailStage | "done" | "failed"

const INSTALL = /\b(npm|pnpm|yarn|bun)\s+(i|ci|install|add)\b|\bpip3?\s+install\b|\buv\s+(sync|pip)\b|\bbundle\s+install\b/
const SERVE =
  /\b(npm|pnpm|yarn|bun)\s+(run\s+)?(dev|start|serve|preview)\b|\b(vite|next|nuxt|astro)(\s+(dev|start|preview))?\s*(&|$|\s--)|\bflask\s+run\b|\buvicorn\b|\bmanage\.py\s+runserver\b|\brails\s+s(erver)?\b|\bhttp\.server\b/
const RENDER_OUTPUT = /\b(burn|burning|verify|verifying|ffmpeg|loudnorm)\b/i
const PLAN_FILE = /\.(scenes\.json|demo\.ts)$/
const READ_TOOLS = new Set(["read", "glob", "grep", "list", "webfetch"])

/** What one event says about the stage, or null when it says nothing. */
function stageOf(event: RunEvent): TrailStage | null {
  const part = toolPartOf(event)
  if (!part) return null
  const tool = part.tool.toLowerCase()
  const command = typeof part.input.command === "string" ? part.input.command : ""
  const filePath = typeof part.input.filePath === "string" ? part.input.filePath : ""

  if (command.includes("wtp-render")) {
    // The render is over once wtp-render has returned, or once its output
    // has reached the steps that follow the recording.
    return part.status === "completed" || RENDER_OUTPUT.test(part.output) ? "rendering" : "recording"
  }
  if (command) return INSTALL.test(command) || SERVE.test(command) ? "booting" : null
  if ((tool === "write" || tool === "edit") && PLAN_FILE.test(filePath)) return "planning"
  if (tool.startsWith("github") || READ_TOOLS.has(tool)) return "reading"
  return null
}

function terminalOf(event: RunEvent): "done" | "failed" | null {
  if (event.type !== "run.status") return null
  const status = (event.data as { status?: unknown } | null | undefined)?.status
  if (status === "completed") return "done"
  if (status === "failed" || status === "timed_out") return "failed"
  return null
}

/** Where on the trail the run is. The stage never moves backwards, and an
 *  event that says nothing clear leaves it where it was. */
export function inferStage(events: readonly RunEvent[]): Stage {
  let rank = 0
  for (const event of events) {
    try {
      const terminal = terminalOf(event)
      if (terminal) return terminal
      const stage = stageOf(event)
      if (stage) rank = Math.max(rank, STAGES.indexOf(stage))
    } catch {
      // An unreadable event says nothing about the stage.
    }
  }
  return STAGES[rank] ?? "reading"
}
