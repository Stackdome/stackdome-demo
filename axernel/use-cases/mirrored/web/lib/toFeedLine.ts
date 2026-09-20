import type { RunEvent } from "./types"

export type FeedKind = "note" | "thought" | "tool" | "status" | "error" | "raw"

export interface FeedLine {
  kind: FeedKind
  text: string
  /** Lines sharing a key are one line: a later one replaces the earlier. */
  key?: string
  /** With a key: add `text` to the existing line instead of replacing it. */
  append?: boolean
}

export interface ToolPart {
  tool: string
  status: string
  input: Record<string, unknown>
  output: string
  key: string
}

type Bag = Record<string, unknown>

const bag = (value: unknown): Bag => (typeof value === "object" && value !== null ? (value as Bag) : {})
const str = (value: unknown): string => (typeof value === "string" ? value : "")

/** Axernel relays OpenCode events untouched: the part sits under
 *  `data.properties.part`. A bare `data.part` is accepted too. */
function partOf(event: RunEvent): Bag {
  const data = bag(event.data)
  const part = bag(data.properties).part ?? data.part
  return bag(part)
}

/** The tool call an event carries, or null. Never throws. */
export function toolPartOf(event: RunEvent): ToolPart | null {
  if (event.type !== "tool.activity") return null
  const part = partOf(event)
  const tool = str(part.tool)
  if (!tool) return null
  const state = bag(part.state)
  const output = state.output ?? state.error
  return {
    tool,
    status: str(state.status),
    input: bag(state.input),
    output: typeof output === "string" ? output : output === undefined ? "" : safeJson(output),
    key: `tool:${str(part.messageID)}:${str(part.callID) || str(part.id)}`,
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? ""
  } catch {
    return ""
  }
}

const oneLine = (text: string, max = 140): string => {
  const flat = text.trim().replace(/\s+/g, " ")
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

const TOOL_VERBS: Record<string, string> = {
  bash: "Ran",
  read: "Read",
  write: "Wrote",
  edit: "Edited",
  glob: "Looked for",
  grep: "Searched for",
  list: "Listed",
  webfetch: "Fetched",
  todowrite: "Updated the plan",
}

function toolLine(part: ToolPart): FeedLine {
  const input = part.input
  const subject =
    str(input.command) ||
    str(input.filePath) ||
    str(input.path) ||
    str(input.pattern) ||
    str(input.url) ||
    (Object.values(input).find((value): value is string => typeof value === "string" && value.trim() !== "") ?? "")
  const verb = TOOL_VERBS[part.tool.toLowerCase()] ?? part.tool.replace(/[_-]+/g, " ")
  const mark = part.status === "error" ? " (failed)" : part.status === "completed" ? "" : " …"
  return { kind: "tool", key: part.key, text: oneLine(`${verb} ${subject}`.trim()) + mark }
}

function messageLine(event: RunEvent): FeedLine | null {
  const properties = bag(bag(event.data).properties)
  // `message.part.delta`: an increment to one field of a part.
  if (typeof properties.delta === "string" && !properties.part) {
    if (properties.field !== undefined && properties.field !== "text") return null
    if (!properties.delta) return null
    return {
      kind: "note",
      key: `text:${str(properties.messageID)}:${str(properties.partID)}`,
      text: properties.delta,
      append: true,
    }
  }
  // `message.part.updated`: the whole part as it now stands.
  const part = partOf(event)
  const text = str(part.text)
  if (!text.trim()) return null
  const kind: FeedKind = part.type === "reasoning" ? "thought" : "note"
  return { kind, key: `text:${str(part.messageID)}:${str(part.id)}`, text }
}

function build(event: RunEvent): FeedLine | null {
  switch (event.type) {
    case "message.delta":
      return messageLine(event)
    case "tool.activity": {
      const part = toolPartOf(event)
      return part ? toolLine(part) : { kind: "raw", text: "Tool activity" }
    }
    case "run.status": {
      const status = str(bag(event.data).status)
      return status ? { kind: "status", text: `Run is ${status.replace(/_/g, " ")}` } : null
    }
    case "harness.status": {
      const status = bag(bag(bag(event.data).properties).status)
      if (status.type !== "retry") return null
      return { kind: "status", text: oneLine(`Retrying${status.message ? `: ${str(status.message)}` : ""}`) }
    }
    case "stream.error": {
      const data = bag(event.data)
      return { kind: "error", text: oneLine(str(data.message) || str(bag(data.error).message) || "The event stream hit an error") }
    }
    case "stream.end":
      return null
    default:
      return { kind: "raw", text: str(event.type) || "Unknown event" }
  }
}

/** One short plain line for the field notes, or null when the event has
 *  nothing to say. Never throws: an unreadable payload becomes a raw line. */
export function toFeedLine(event: RunEvent): FeedLine | null {
  try {
    return build(event)
  } catch {
    return { kind: "raw", text: "Unreadable event" }
  }
}
