import { parseSource, splitTreePath } from "./parseSource"
import { DURATIONS, type MaxSeconds } from "./types"

const MAX_INSTRUCTION = 2000

/** A valid POST body. `treePath` is a tree link's branch-and-folder, still unsplit. */
export interface WalkRequest {
  source: string
  kind: "repo" | "pr"
  treePath?: string
  instruction?: string
  maxSeconds: MaxSeconds
}

/** Validates the form's POST body; the error is a sentence for the user. */
export function parseWalkRequest(body: unknown): WalkRequest | { error: string } {
  const fields = (body ?? {}) as { url?: unknown; instruction?: unknown; maxSeconds?: unknown }
  if (typeof fields.url !== "string") return { error: "Paste a GitHub repo or pull request link." }

  const parsed = parseSource(fields.url)
  if ("error" in parsed) return parsed

  const maxSeconds = fields.maxSeconds ?? 60
  if (!DURATIONS.includes(maxSeconds as MaxSeconds)) return { error: "Pick 30, 60 or 90 seconds." }

  const instruction = typeof fields.instruction === "string" ? fields.instruction.trim() : ""
  if (instruction.length > MAX_INSTRUCTION) return { error: `Keep the instruction under ${MAX_INSTRUCTION} characters.` }

  return {
    source: parsed.source,
    kind: parsed.kind,
    ...(parsed.treePath ? { treePath: parsed.treePath } : {}),
    ...(instruction ? { instruction } : {}),
    maxSeconds: maxSeconds as MaxSeconds,
  }
}

/** Settles a tree link's branch and folder against the repo's branch names. */
export function placeInRepo(request: WalkRequest, branches: string[]): { ref?: string; subdir?: string } {
  return request.treePath ? splitTreePath(request.treePath, branches) : {}
}
