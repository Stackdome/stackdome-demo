import { toolPartOf } from "./toFeedLine"
import type { RunEvent } from "./types"

export const STAGES = ["look", "measure", "name", "rebuild", "reflect"] as const
export type TrailStage = (typeof STAGES)[number]
export type Stage = TrailStage | "done" | "failed"

// The files mir-measure writes, which the agent then reads in slices.
const MEASURED_FILE = /\b(dom|counts|fonts|assets)\.json\b/
const TOKENS_FILE = /(^|\/)tokens\.json$/
const COMPONENT_FILE = /(^|\/)component\/[^/]+$/

/** What one event says about the stage, or null when it says nothing. */
function stageOf(event: RunEvent): TrailStage | null {
  const part = toolPartOf(event)
  if (!part) return null
  const tool = part.tool.toLowerCase()
  const command = typeof part.input.command === "string" ? part.input.command : ""
  const filePath = typeof part.input.filePath === "string" ? part.input.filePath : ""

  if (command.includes("mir-reflect")) return "reflect"
  // The first mir-measure lists the page's sections; the second, with a selector, measures one.
  if (command.includes("mir-measure")) return command.includes("--selector") ? "measure" : "look"
  if (command) return MEASURED_FILE.test(command) ? "measure" : null
  if (tool === "write" || tool === "edit") {
    if (TOKENS_FILE.test(filePath)) return "name"
    if (COMPONENT_FILE.test(filePath)) return "rebuild"
  }
  if (tool === "read" && MEASURED_FILE.test(filePath)) return "measure"
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
  return STAGES[rank] ?? "look"
}
